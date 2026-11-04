-- The hotlist and expected visitors.
--
-- The hotlist is the people and cars a company wants stopped: a person by their SA ID number, a car by its plate or VIN.
-- It goes down to every handheld with the rest of the snapshot, so a match stops the boom offline (HOTLIST_MATCH, RED),
-- and the server checks every arriving scan against it too, for a handheld that hadn't synced the newest entries.
--
-- Expected visitors are booked in from the dashboard for a stretch of days, by ID number, by plate, or both. The guard
-- sees who they are when they arrive and the booking is marked as arrived. Hospitals never record who someone is
-- visiting, so a booking has no host.
--
-- An ID number never sits in the database in the clear: it becomes the same person key the handheld makes from the
-- document (a keyed hash with the company's own secret), and only its last four digits are kept to show.

begin;

insert into digigate.schema_version (version) values (23);

-- HMAC-SHA256 from Postgres's own sha256(), so the database makes the person key exactly as the handheld does
-- (apps/gate/src/lib/person-key.ts) without needing pgcrypto.
create function digigate.hmac_sha256(_key bytea, _message bytea) returns bytea
language plpgsql immutable strict set search_path = ''
as $$
declare
  _block bytea := case when length(_key) > 64 then sha256(_key) else _key end;
  _inner bytea := ''::bytea;
  _outer bytea := ''::bytea;
  _byte integer;
begin
  _block := _block || decode(repeat('00', 64 - length(_block)), 'hex');
  for i in 0..63 loop
    _byte := get_byte(_block, i);
    _inner := _inner || set_byte('\x00'::bytea, 0, _byte # 54);
    _outer := _outer || set_byte('\x00'::bytea, 0, _byte # 92);
  end loop;
  return sha256(_outer || sha256(_inner || _message));
end;
$$;
revoke all on function digigate.hmac_sha256(bytea, bytea) from public;

-- A company's person-key secret. A company with no handheld paired yet gets one made now, and its first handheld is
-- handed this one instead of keeping its own (claim_pairing_code keeps whichever came first).
create function digigate.org_person_key(_org uuid) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  insert into digigate.person_keys (org_id, key)
  values (_org, encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'))
  on conflict on constraint person_keys_pkey do nothing;
  return (select k.key from digigate.person_keys k where k.org_id = _org);
end;
$$;
revoke all on function digigate.org_person_key(uuid) from public;

-- The person key for an SA ID number, as a handheld makes it from a licence or smart ID ('02' is the SA ID type).
create function digigate.person_key_for(_org uuid, _id_number text) returns text
language sql security definer set search_path = ''
as $$
  select encode(digigate.hmac_sha256(decode(digigate.org_person_key(_org), 'hex'), convert_to('02:' || _id_number, 'UTF8')), 'hex');
$$;
revoke all on function digigate.person_key_for(uuid, text) from public;

-- The people who run a company's gates day to day: its admins, managers and control room, and super users.
create function digigate.can_watch_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.is_super_user() or (digigate.mfa_passed() and exists (
    select 1 from digigate.profiles p
    where p.id = auth.uid() and p.is_active and p.org_id = _org
      and p.roles && array['admin', 'manager', 'control_room']::digigate.dashboard_role[]
  ));
$$;
revoke all on function digigate.can_watch_org(uuid) from public;
grant execute on function digigate.can_watch_org(uuid) to authenticated;

create function digigate.plate_key(_value text) returns text
language sql immutable set search_path = ''
as $$
  select nullif(regexp_replace(upper(coalesce(_value, '')), '[^A-Z0-9]', '', 'g'), '');
$$;
revoke all on function digigate.plate_key(text) from public;

-- The hotlist ----------------------------------------------------------------------------------------------------------

-- `match_key` is a person key, or the plate or VIN normalised. `reason` is for the dashboard only; the handheld shows
-- `guard_note`, what the company wants the guard to do. No site means every site the company runs.
create table digigate.hotlist (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  -- The site alone, not the site with its company: a client that changes security company takes its site along, and
  -- the old company's entries simply stop reaching it (the snapshot sends a company's own entries only).
  site_id uuid references digigate.sites (id),
  kind text not null check (kind in ('person', 'plate', 'vin')),
  match_key text not null check (match_key <> ''),
  label text not null check (length(label) between 1 and 120),
  id_last_four text check (id_last_four ~ '^[0-9]{4}$'),
  reason text not null check (length(reason) between 1 and 500),
  guard_note text not null check (length(guard_note) between 1 and 200),
  expires_at timestamptz,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid,
  erase_after timestamptz
);
create index hotlist_in_force on digigate.hotlist (org_id, created_at desc) where removed_at is null;
create index hotlist_erase on digigate.hotlist (erase_after);
create unique index hotlist_one_entry on digigate.hotlist (org_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, match_key)
  where removed_at is null;

alter table digigate.hotlist enable row level security;
create policy hotlist_read on digigate.hotlist for select to authenticated
  using (digigate.can_watch_org(org_id) and (site_id is null or site_id = any ((select digigate.visible_site_ids())::uuid[])));
-- Written only through the functions below. The match key is a hash nobody needs to read.
grant select (id, org_id, site_id, kind, label, id_last_four, reason, guard_note, expires_at, created_by_name, created_at, removed_at)
  on digigate.hotlist to authenticated;
grant select, delete on digigate.hotlist to service_role;

-- No site means every site the company runs; no end date means until someone takes it off.
create function digigate.add_hotlist_entry(
  _org uuid, _kind text, _value text, _label text, _reason text, _guard_note text, _site uuid default null, _expires_at timestamptz default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _value_clean text := upper(regexp_replace(coalesce(_value, ''), '\s', '', 'g'));
  _key text;
  _shown text;
  _actor_name text := (select p.full_name from digigate.profiles p where p.id = auth.uid());
  _id uuid;
begin
  if not digigate.can_watch_org(_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _site is not null and not exists (select 1 from digigate.sites s where s.id = _site and s.org_id = _org) then
    raise exception 'site belongs to another company' using errcode = '42501';
  end if;
  if _site is not null and not (_site = any (digigate.visible_site_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _expires_at is not null and _expires_at <= now() then
    raise exception 'already over' using errcode = '22023';
  end if;

  if _kind = 'person' then
    if _value_clean !~ '^[0-9]{13}$' then
      raise exception 'an SA ID number is 13 digits' using errcode = '22023';
    end if;
    _key := digigate.person_key_for(_org, _value_clean);
    _shown := nullif(trim(coalesce(_label, '')), '');
    if _shown is null then
      raise exception 'a person needs a name' using errcode = '22023';
    end if;
  elsif _kind in ('plate', 'vin') then
    _key := digigate.plate_key(_value);
    if _key is null then
      raise exception 'nothing to match' using errcode = '22023';
    end if;
    _shown := upper(trim(_value));
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;

  insert into digigate.hotlist (org_id, site_id, kind, match_key, label, id_last_four, reason, guard_note, expires_at, created_by_name, erase_after)
  values (
    _org, _site, _kind, _key, _shown, case when _kind = 'person' then right(_value_clean, 4) end,
    trim(_reason), trim(_guard_note), _expires_at, _actor_name, _expires_at + interval '3 years'
  )
  returning id into _id;

  -- The log is never erased, so it says what kind of entry, never whose.
  perform digigate.write_audit(_org, _site, null, 'gate', 'hotlist.added', auth.uid(), _actor_name,
    case _kind when 'person' then 'a person' when 'plate' then 'a plate' else 'a VIN' end,
    case when _expires_at is null then 'Until removed' else 'Until ' || to_char(_expires_at at time zone 'Africa/Johannesburg', 'DD Mon YYYY') end);
  return _id;
end;
$$;
revoke all on function digigate.add_hotlist_entry(uuid, text, text, text, text, text, uuid, timestamptz) from public;
grant execute on function digigate.add_hotlist_entry(uuid, text, text, text, text, text, uuid, timestamptz) to authenticated;

create function digigate.remove_hotlist_entry(_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _entry digigate.hotlist;
  _actor_name text := (select p.full_name from digigate.profiles p where p.id = auth.uid());
begin
  select * into _entry from digigate.hotlist h where h.id = _id and h.removed_at is null;
  if _entry.id is null or not digigate.can_watch_org(_entry.org_id)
    or (_entry.site_id is not null and not (_entry.site_id = any (digigate.visible_site_ids()))) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update digigate.hotlist
  set removed_at = now(), removed_by = auth.uid(), erase_after = least(coalesce(erase_after, 'infinity'), now() + interval '3 years')
  where id = _id;
  perform digigate.write_audit(_entry.org_id, _entry.site_id, null, 'gate', 'hotlist.removed', auth.uid(), _actor_name,
    case _entry.kind when 'person' then 'a person' when 'plate' then 'a plate' else 'a VIN' end, null);
end;
$$;
revoke all on function digigate.remove_hotlist_entry(uuid) from public;
grant execute on function digigate.remove_hotlist_entry(uuid) to authenticated;

-- What the rules read, for the server's own re-check of each scan: the entries in force at a site.
create function digigate.hotlist_in_force(_org uuid, _site uuid)
returns table (id uuid, kind text, match_key text, guard_note text)
language sql stable security definer set search_path = ''
as $$
  select h.id, h.kind, h.match_key, h.guard_note
  from digigate.hotlist h
  where h.org_id = _org and (h.site_id is null or h.site_id = _site)
    and h.removed_at is null and (h.expires_at is null or h.expires_at > now())
  order by h.created_at desc
  limit 5000;
$$;
revoke all on function digigate.hotlist_in_force(uuid, uuid) from public;
grant execute on function digigate.hotlist_in_force(uuid, uuid) to service_role;

-- Expected visitors -----------------------------------------------------------------------------------------------------

create table digigate.expected_visitors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  -- Like the hotlist: the site alone, so a client changing security company isn't held up by old bookings.
  site_id uuid not null references digigate.sites (id),
  visitor_name text not null check (length(visitor_name) between 1 and 120),
  person_key text,
  id_last_four text check (id_last_four ~ '^[0-9]{4}$'),
  plate text,
  plate_key text,
  visit_type text,
  note text check (length(note) <= 200),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  arrived_at timestamptz,
  arrived_event uuid,
  erase_after timestamptz not null,
  check (person_key is not null or plate_key is not null),
  check (valid_until > valid_from and valid_until - valid_from <= interval '32 days')
);
create index expected_visitors_site_time on digigate.expected_visitors (site_id, valid_from desc);
create index expected_visitors_erase on digigate.expected_visitors (erase_after);

alter table digigate.expected_visitors enable row level security;
create policy expected_visitors_read on digigate.expected_visitors for select to authenticated
  using (digigate.can_watch_org(org_id) and site_id = any ((select digigate.visible_site_ids())::uuid[]));
grant select (id, org_id, site_id, visitor_name, id_last_four, plate, visit_type, note, valid_from, valid_until, created_by_name, created_at,
  cancelled_at, arrived_at) on digigate.expected_visitors to authenticated;
grant select, delete on digigate.expected_visitors to service_role;

create function digigate.add_expected_visitor(
  _org uuid, _site uuid, _name text, _id_number text, _plate text, _visit_type text, _from timestamptz, _until timestamptz, _note text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _id_clean text := nullif(regexp_replace(coalesce(_id_number, ''), '\s', '', 'g'), '');
  _actor_name text := (select p.full_name from digigate.profiles p where p.id = auth.uid());
  _id uuid;
begin
  if not digigate.can_watch_org(_org) or not exists (select 1 from digigate.sites s where s.id = _site and s.org_id = _org)
    or not (_site = any (digigate.visible_site_ids())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _id_clean is not null and _id_clean !~ '^[0-9]{13}$' then
    raise exception 'an SA ID number is 13 digits' using errcode = '22023';
  end if;
  if _id_clean is null and digigate.plate_key(_plate) is null then
    raise exception 'needs an ID number or a plate' using errcode = '22023';
  end if;
  if _until <= now() then
    raise exception 'already over' using errcode = '22023';
  end if;

  insert into digigate.expected_visitors (org_id, site_id, visitor_name, person_key, id_last_four, plate, plate_key, visit_type, note,
    valid_from, valid_until, created_by_name, erase_after)
  values (
    _org, _site, trim(_name),
    case when _id_clean is not null then digigate.person_key_for(_org, _id_clean) end,
    right(_id_clean, 4),
    nullif(upper(trim(coalesce(_plate, ''))), ''), digigate.plate_key(_plate),
    nullif(trim(coalesce(_visit_type, '')), ''), nullif(trim(coalesce(_note, '')), ''),
    _from, _until, _actor_name, _until + interval '3 years'
  )
  returning id into _id;

  perform digigate.write_audit(_org, _site, null, 'gate', 'expected.added', auth.uid(), _actor_name, 'a visitor',
    to_char(_from at time zone 'Africa/Johannesburg', 'DD Mon') || ' to ' || to_char(_until at time zone 'Africa/Johannesburg', 'DD Mon YYYY'));
  return _id;
end;
$$;
revoke all on function digigate.add_expected_visitor(uuid, uuid, text, text, text, text, timestamptz, timestamptz, text) from public;
grant execute on function digigate.add_expected_visitor(uuid, uuid, text, text, text, text, timestamptz, timestamptz, text) to authenticated;

create function digigate.cancel_expected_visitor(_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _booking digigate.expected_visitors;
  _actor_name text := (select p.full_name from digigate.profiles p where p.id = auth.uid());
begin
  select * into _booking from digigate.expected_visitors v where v.id = _id and v.cancelled_at is null;
  if _booking.id is null or not digigate.can_watch_org(_booking.org_id) or not (_booking.site_id = any (digigate.visible_site_ids())) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update digigate.expected_visitors set cancelled_at = now(), cancelled_by = auth.uid() where id = _id;
  perform digigate.write_audit(_booking.org_id, _booking.site_id, null, 'gate', 'expected.cancelled', auth.uid(), _actor_name, 'a visitor', null);
end;
$$;
revoke all on function digigate.cancel_expected_visitor(uuid) from public;
grant execute on function digigate.cancel_expected_visitor(uuid) to authenticated;

-- An entry the handheld matched to a booking marks it as arrived, once, at the booking's own site.
create function digigate.mark_expected_arrival() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update digigate.expected_visitors v
  set arrived_at = (select e.occurred_at from digigate.events e where e.id = new.event_id), arrived_event = new.event_id
  where v.id = digigate.to_uuid(new.payload ->> 'expected_visitor_id')
    and v.org_id = new.org_id and v.site_id = new.site_id and v.arrived_at is null;
  return null;
end;
$$;
revoke all on function digigate.mark_expected_arrival() from public;

create trigger event_details_expected_arrival after insert on digigate.event_details
  for each row when (new.payload ? 'expected_visitor_id') execute function digigate.mark_expected_arrival();

-- The handheld's snapshot, now with the hotlist and the bookings it needs offline --------------------------------------

create or replace function digigate.device_snapshot(_device_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with device as (
    select d.org_id, d.site_id from digigate.devices d where d.id = _device_id and d.revoked_at is null
  ),
  open_visits as (
    select v.id, v.kind, v.visit_type, v.entered_at, v.occupants_in
    from digigate.visits v
    join device on device.site_id = v.site_id and device.org_id = v.org_id
    where v.exited_at is null
    order by v.entered_at desc
    limit 5000
  )
  select jsonb_build_object(
    'siteName', (select s.name from digigate.sites s join device on device.site_id = s.id),
    'shiftPeriods', (select s.shift_periods from digigate.sites s join device on device.site_id = s.id),
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
        'radiusM', o.radius_m
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
        'until', (extract(epoch from b.valid_until) * 1000)::bigint
      ))
      from device
      cross join lateral (
        select * from digigate.expected_visitors b
        where b.site_id = device.site_id and b.org_id = device.org_id and b.cancelled_at is null
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

-- The control room's popup also says which hotlist entry stopped a check, and why, inside the 365 days in full.
create or replace function digigate.check_detail(_event uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'type', e.type,
    'occurredAt', e.occurred_at,
    'outcome', e.outcome,
    'ruleCodes', to_jsonb(e.rule_codes),
    'detailsErased', d.event_id is null,
    'inFull', shown.in_full,
    'visitType', d.payload ->> 'visit_type',
    'enteredAt', v.entered_at,
    'exitedAt', v.exited_at,
    'post', (
      select s.post from digigate.shifts s
      where s.device_id = e.device_id and s.started_at <= e.occurred_at
      order by s.started_at desc
      limit 1
    ),
    'guard', case when (select digigate.viewer_client()) is null then (
      select trim(g.first_name || ' ' || g.last_name) from digigate.gate_users g where g.id = d.gate_user_id
    ) end,
    'person', jsonb_build_object(
      'name', case when shown.in_full then shown.person_name else digigate.mask(shown.person_name) end,
      'licenceExpiresOn', case when shown.in_full then coalesce(d.payload -> 'driver' ->> 'licence_expires_on', d.payload -> 'person' ->> 'licence_expires_on') end,
      'vehicleCodes', case when shown.in_full then coalesce(d.payload -> 'driver' -> 'vehicle_codes', d.payload -> 'person' -> 'vehicle_codes') end,
      'typed', coalesce(d.payload -> 'driver' ->> 'manual', d.payload -> 'person' ->> 'manual') = 'true'
    ),
    'vehicle', case when d.payload -> 'vehicle' is not null then jsonb_build_object(
      'plate', case when shown.in_full then d.payload -> 'vehicle' ->> 'plate' else digigate.mask(d.payload -> 'vehicle' ->> 'plate') end,
      'make', d.payload -> 'vehicle' ->> 'make',
      'model', d.payload -> 'vehicle' ->> 'model',
      'colour', d.payload -> 'vehicle' ->> 'colour',
      'description', d.payload -> 'vehicle' ->> 'description',
      'discExpiresOn', d.payload -> 'vehicle' ->> 'disc_expires_on',
      'typed', d.payload -> 'vehicle' ->> 'manual' = 'true'
    ) end,
    'typedPlate', case when shown.in_full then d.payload ->> 'typed_plate' else digigate.mask(d.payload ->> 'typed_plate') end,
    'occupants', d.payload -> 'occupants',
    'hasLicencePhoto', shown.in_full and d.licence_photo_path is not null,
    'hotlist', case when shown.in_full then (
      select jsonb_build_object('label', h.label, 'reason', h.reason, 'guardNote', h.guard_note, 'removed', h.removed_at is not null)
      from digigate.hotlist h
      where h.org_id = e.org_id and h.id = (
        select digigate.to_uuid(hit ->> 'hotlist_entry_id')
        from jsonb_array_elements(case when jsonb_typeof(d.payload -> 'hits') = 'array' then d.payload -> 'hits' else '[]'::jsonb end) hit
        where hit ->> 'code' = 'HOTLIST_MATCH'
        limit 1
      )
    ) end
  )
  from digigate.events e
  left join digigate.event_details d on d.event_id = e.id
  left join digigate.visits v on v.id = e.visit_id
  cross join lateral (
    select
      coalesce(v.exited_at, e.occurred_at) > now() - interval '365 days' as in_full,
      nullif(trim(concat_ws(' ',
        coalesce(d.payload -> 'driver' ->> 'initials', d.payload -> 'person' ->> 'names', d.payload -> 'person' ->> 'initials'),
        coalesce(d.payload -> 'driver' ->> 'surname', d.payload -> 'person' ->> 'surname')
      )), '') as person_name
  ) as shown
  where e.id = _event
    and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()));
$$;

commit;
