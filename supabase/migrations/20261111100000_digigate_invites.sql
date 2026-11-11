-- Visitor invites from the phone app (2026-11-11). Doctors, managers, estate managers and residents invite a visitor
-- from their phone; the visitor shows a QR at the gate; the guard scans it and sees "Expected", then scans their ID or
-- licence as always. An invite is an expected-visitor booking with a QR: no new system, and every rule still runs.
--
-- 1. A new login type, host: someone who may only invite visitors to their own sites. The phone app has no MFA (the
--    user's decision), and every data rule here requires MFA, so a host reaches no gate records. A host who enrolled
--    MFA anyway still reaches none: visible_site_ids and in_org now leave host-only logins out by name.
-- 2. Hosts sign in with a mobile number or an email: profiles.phone, unique, in +27... form.
-- 3. An invite is a booking with invite_hash (a SHA-256 of the QR's code; handhelds only ever see the hash), the code
--    itself (only its creator reads it back, to share the QR again, and it's cleared once used or cancelled), and
--    single_use. The inviter is always recorded (created_by, and the audit log), but at a hospital their name is left
--    off the booking, so neither the guard nor the dashboard's lists can tie a visitor to a doctor.
-- 4. Everything a host does goes through invite_sites, create_invite, my_invites and cancel_invite: security definer,
--    their own invites at their own sites, and nothing else.

begin;

insert into digigate.schema_version (version) values (38);

alter type digigate.dashboard_role add value if not exists 'host';

alter table digigate.profiles add column phone text;
alter table digigate.profiles add constraint profiles_phone_shape check (phone ~ '^\+[0-9]{8,15}$');
create unique index profiles_phone_unique on digigate.profiles (phone) where phone is not null;

-- ── A host-only login is never dashboard staff ────────────────────────────────────────────────────────────────────────
-- Compared as text: a new enum value can't be used as a value until the transaction that added it has committed.

create or replace function digigate.visible_site_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not digigate.mfa_passed() or p.id is null then array[]::uuid[]
    when 'super_user' = any (p.roles) then array(select s.id from digigate.sites s)
    when 'client_viewer' = any (p.roles::text[]) then array(select s.id from digigate.sites s where s.client_id = p.client_id)
    when 'admin' = any (p.roles) then array(select s.id from digigate.sites s where s.org_id = p.org_id)
    when p.roles::text[] <@ array['host'] then array[]::uuid[]
    else array(select s.id from digigate.sites s where s.org_id = p.org_id and s.id = any (p.site_ids))
  end
  from (select 1) as one
  left join digigate.profiles p on p.id = auth.uid() and p.is_active;
$$;

create or replace function digigate.in_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.mfa_passed() and exists (
    select 1 from digigate.profiles p
    where p.id = auth.uid() and p.is_active and p.org_id = _org and not (p.roles::text[] <@ array['host'])
  );
$$;

-- ── Invites ───────────────────────────────────────────────────────────────────────────────────────────────────────────

alter table digigate.expected_visitors
  add column invite_hash text unique,
  add column invite_code text,
  add column single_use boolean not null default false;

-- A booking is matched by ID number or plate; an invite can also be matched by its QR alone.
do $$
declare
  _name text;
begin
  select c.conname into _name from pg_constraint c
  where c.conrelid = 'digigate.expected_visitors'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%person_key IS NOT NULL%plate_key IS NOT NULL%';
  execute format('alter table digigate.expected_visitors drop constraint %I', _name);
end;
$$;
alter table digigate.expected_visitors add constraint expected_visitors_matched_by
  check (person_key is not null or plate_key is not null or invite_hash is not null);

-- The sites a login may invite visitors to: a host's own, an admin's whole company, a manager's or control room's own.
create function digigate.invite_sites() returns table (site_id uuid, site_name text, site_type text, org_id uuid)
language sql stable security definer set search_path = ''
as $$
  select s.id, s.name, s.site_type, s.org_id
  from digigate.profiles p
  join digigate.sites s on s.org_id = p.org_id and s.is_active
  where p.id = auth.uid() and p.is_active
    and p.roles::text[] && array['host', 'admin', 'manager', 'control_room']
    and ('admin' = any (p.roles::text[]) or s.id = any (p.site_ids))
  order by s.name;
$$;
revoke all on function digigate.invite_sites() from public;
grant execute on function digigate.invite_sites() to authenticated;

create function digigate.create_invite(
  _site uuid, _name text, _id_number text, _plate text, _visit_type text, _from timestamptz, _until timestamptz, _note text
) returns table (invite_id uuid, code text)
language plpgsql security definer set search_path = ''
as $$
declare
  _place record;
  _actor text := (select p.full_name from digigate.profiles p where p.id = auth.uid());
  _id_clean text := nullif(regexp_replace(coalesce(_id_number, ''), '\s', '', 'g'), '');
  -- Two random UUIDs, 244 random bits: far beyond guessing, and plain hex for any QR reader.
  _code text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  _new uuid;
begin
  select * into _place from digigate.invite_sites() s where s.site_id = _site;
  if _place.site_id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(trim(coalesce(_name, ''))) not between 1 and 120 then
    raise exception 'the visitor needs a name' using errcode = '22023';
  end if;
  if _id_clean is not null and _id_clean !~ '^[0-9]{13}$' then
    raise exception 'an SA ID number is 13 digits' using errcode = '22023';
  end if;
  if _until <= now() or _until <= _from then
    raise exception 'the dates are over or back to front' using errcode = '22023';
  end if;
  -- A runaway script or a lost phone can't flood the gate with invites.
  if (select count(*) from digigate.expected_visitors v
      where v.created_by = auth.uid() and v.cancelled_at is null and v.valid_until > now()) >= 200 then
    raise exception 'too many open invites' using errcode = '54000';
  end if;

  insert into digigate.expected_visitors (org_id, site_id, visitor_name, person_key, id_last_four, plate, plate_key, visit_type, note,
    valid_from, valid_until, created_by, created_by_name, erase_after, invite_hash, invite_code, single_use)
  values (
    _place.org_id, _site, trim(_name),
    case when _id_clean is not null then digigate.person_key_for(_place.org_id, _id_clean) end,
    right(_id_clean, 4),
    nullif(upper(trim(coalesce(_plate, ''))), ''), digigate.plate_key(_plate),
    nullif(trim(coalesce(_visit_type, '')), ''), nullif(trim(coalesce(_note, '')), ''),
    _from, _until, auth.uid(),
    -- At a hospital, who invited a visitor could say whom they came to see: the name stays off the booking.
    case when _place.site_type = 'hospital' then null else _actor end,
    _until + interval '3 years',
    encode(sha256(convert_to(_code, 'UTF8')), 'hex'), _code, true
  )
  returning id into _new;

  perform digigate.write_audit(_place.org_id, _site, null, 'gate', 'invite.created', auth.uid(), _actor, 'a visitor',
    to_char(_from at time zone 'Africa/Johannesburg', 'DD Mon') || ' to ' || to_char(_until at time zone 'Africa/Johannesburg', 'DD Mon YYYY'));
  return query select _new, _code;
end;
$$;
revoke all on function digigate.create_invite(uuid, text, text, text, text, timestamptz, timestamptz, text) from public;
grant execute on function digigate.create_invite(uuid, text, text, text, text, timestamptz, timestamptz, text) to authenticated;

-- A login's own invites, the last 30 days and everything ahead. The code comes back only while the invite can be used.
create function digigate.my_invites() returns table (
  id uuid, site_id uuid, site_name text, visitor_name text, id_last_four text, plate text, visit_type text, note text,
  valid_from timestamptz, valid_until timestamptz, status text, arrived_at timestamptz, code text
)
language sql stable security definer set search_path = ''
as $$
  select v.id, v.site_id, s.name, v.visitor_name, v.id_last_four, v.plate, v.visit_type, v.note, v.valid_from, v.valid_until,
    case
      when v.cancelled_at is not null then 'cancelled'
      when v.arrived_at is not null then 'used'
      when v.valid_until <= now() then 'expired'
      else 'active'
    end,
    v.arrived_at,
    case when v.cancelled_at is null and v.arrived_at is null and v.valid_until > now() then v.invite_code end
  from digigate.expected_visitors v
  join digigate.sites s on s.id = v.site_id
  where v.created_by = auth.uid() and v.invite_hash is not null and v.valid_until > now() - interval '30 days'
    and exists (select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active)
  order by v.valid_from desc
  limit 200;
$$;
revoke all on function digigate.my_invites() from public;
grant execute on function digigate.my_invites() to authenticated;

create function digigate.cancel_invite(_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _invite digigate.expected_visitors;
begin
  select * into _invite from digigate.expected_visitors v
  where v.id = _id and v.created_by = auth.uid() and v.invite_hash is not null and v.cancelled_at is null
    and exists (select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active);
  if _invite.id is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  update digigate.expected_visitors set cancelled_at = now(), cancelled_by = auth.uid(), invite_code = null where id = _id;
  perform digigate.write_audit(_invite.org_id, _invite.site_id, null, 'gate', 'invite.cancelled', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), 'a visitor', null);
end;
$$;
revoke all on function digigate.cancel_invite(uuid) from public;
grant execute on function digigate.cancel_invite(uuid) to authenticated;

-- An entry matched to a booking marks it arrived, as before; a used invite's code is cleared, since it can't be used again.
create or replace function digigate.mark_expected_arrival() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update digigate.expected_visitors v
  set arrived_at = (select e.occurred_at from digigate.events e where e.id = new.event_id), arrived_event = new.event_id,
    invite_code = case when v.single_use then null else v.invite_code end
  where v.id = digigate.to_uuid(new.payload ->> 'expected_visitor_id')
    and v.org_id = new.org_id and v.site_id = new.site_id and v.arrived_at is null;
  return null;
end;
$$;

create or replace function digigate.device_snapshot(_device_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with device as (
    select d.org_id, d.site_id from digigate.devices d where d.id = _device_id and d.revoked_at is null
  ),
  open_visits as (
    select v.id, v.kind, v.visit_type, v.entered_at, v.occupants_in, v.expected_until
    from digigate.visits v
    join device on device.site_id = v.site_id and device.org_id = v.org_id
    where v.exited_at is null
    order by v.entered_at desc
    limit 5000
  )
  select jsonb_build_object(
    -- Guards on duty on another handheld of the company, so this one won't put them on duty twice. A shift nobody
    -- ended counts for 14 hours, as on the handheld.
    'onDutyElsewhere', coalesce((
      select jsonb_agg(jsonb_build_object(
        'gateUserId', s.gate_user_id,
        'shiftId', s.id,
        'post', coalesce((select o.label from digigate.posts o where o.site_id = s.site_id and o.code = s.post limit 1), s.post),
        'site', (select si.name from digigate.sites si where si.id = s.site_id),
        'device', (select d.name from digigate.devices d where d.id = s.device_id),
        'since', (extract(epoch from s.started_at) * 1000)::bigint
      ))
      from digigate.shifts s
      join device on device.org_id = s.org_id
      where s.ended_at is null and s.device_id <> _device_id and s.gate_user_id is not null
        and s.started_at > now() - interval '14 hours'
    ), '[]'),
    -- This handheld's shifts that a supervisor moved to another one, so it signs the guard out here.
    'movedShifts', coalesce((
      select jsonb_agg(s.id)
      from digigate.shifts s
      where s.device_id = _device_id and s.end_reason = 'moved' and s.ended_at > now() - interval '14 hours'
    ), '[]'),
    'siteName', (select s.name from digigate.sites s join device on device.site_id = s.id),
    'siteType', (select s.site_type from digigate.sites s join device on device.site_id = s.id),
    'stayMinutes', (select s.stay_minutes from digigate.sites s join device on device.site_id = s.id),
    -- The end of the site's launch grace, while it runs, so a handheld offline still knows it, and that it has ended.
    'launchGraceUntil', (select (extract(epoch from s.launch_grace_until) * 1000)::bigint from digigate.sites s join device on device.site_id = s.id),
    'shiftPeriods', (select s.shift_periods from digigate.sites s join device on device.site_id = s.id),
    -- The car park, so the guard's home screen can say how many spaces are free.
    'parking', (select jsonb_build_object('open', s.open_parking, 'spaces', s.parking_spaces) from digigate.sites s join device on device.site_id = s.id),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'employeeNumber', g.employee_number,
        'firstName', g.first_name,
        'lastName', g.last_name,
        'role', g.role,
        'pin', g.pin,
        'active', g.is_active
      ))
      from digigate.gate_users g
      join device on device.org_id = g.org_id
      where device.site_id = any (g.site_ids)
    ), '[]'),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', o.code,
        'label', o.label,
        'lanes', to_jsonb(o.lanes),
        'latitude', o.latitude,
        'longitude', o.longitude,
        'radiusM', o.radius_m,
        'booms', to_jsonb(o.booms)
      ) order by o.created_at)
      from digigate.posts o
      join device on device.site_id = o.site_id
      where o.is_active
    ), '[]'),
    'openVisits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'kind', v.kind,
        'visitType', v.visit_type,
        'enteredAt', (extract(epoch from v.entered_at) * 1000)::bigint,
        'occupants', v.occupants_in,
        'expectedStayMinutes', case when v.expected_until is not null then (extract(epoch from v.expected_until - v.entered_at) / 60)::integer end,
        'personKey', d.person_key,
        'personName', d.person_name,
        'vin', d.vin,
        'plate', d.plate,
        'discNumber', d.disc_number,
        'discExpiresOn', d.disc_expires_on,
        'vehicleDescription', d.vehicle_description
      ))
      from open_visits v
      join digigate.visit_details d on d.visit_id = v.id
    ), '[]'),
    -- An entry that runs out stops matching on the handheld at the same moment, even if it hasn't synced since.
    'hotlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'kind', h.kind,
        'key', h.match_key,
        'guardNote', h.guard_note,
        'expiresAt', (extract(epoch from h.expires_at) * 1000)::bigint
      ))
      from device
      cross join lateral (
        select * from digigate.hotlist h
        where h.org_id = device.org_id and (h.site_id is null or h.site_id = device.site_id)
          and h.removed_at is null and (h.expires_at is null or h.expires_at > now())
        order by h.created_at desc
        limit 5000
      ) h
    ), '[]'),
    -- Today's and the next few days' bookings, so a handheld that goes offline still knows who is coming.
    'expectedVisitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.visitor_name,
        'personKey', b.person_key,
        'plate', b.plate_key,
        'visitType', b.visit_type,
        'note', b.note,
        'from', (extract(epoch from b.valid_from) * 1000)::bigint,
        'until', (extract(epoch from b.valid_until) * 1000)::bigint,
        -- An invite's QR, as its hash: the handheld hashes what it scans and looks it up, even offline.
        'invite', b.invite_hash,
        'singleUse', b.single_use
      ))
      from device
      cross join lateral (
        select * from digigate.expected_visitors b
        where b.site_id = device.site_id and b.org_id = device.org_id and b.cancelled_at is null
          and not (b.single_use and b.arrived_at is not null)
          and b.valid_until > now() and b.valid_from < now() + interval '3 days'
        order by b.valid_from
        limit 2000
      ) b
    ), '[]'),
    'siteToday', (
      select jsonb_build_object(
        'openAlerts', (
          select count(*) from digigate.alerts a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.status = 'open' and a.severity in ('red', 'amber')
        ),
        'exits', coalesce((
          select a.exits from digigate.daily_activity a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.day = (now() at time zone 'Africa/Johannesburg')::date
        ), 0),
        'stayMinutes', coalesce((
          select a.stay_minutes from digigate.daily_activity a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.day = (now() at time zone 'Africa/Johannesburg')::date
        ), 0)
      )
      from device
    )
  );
$$;

commit;
