-- The launch grace. When a site starts on DigiGate, every car already parked there has no DigiGate entry, and would be
-- stopped as "No entry record" on its way out: a day of false alarms that teaches guards to ignore red. An admin starts
-- the site's launch grace on its setup page; for the next 7 days a car leaving with no entry is asked about instead
-- (ARRIVED_BEFORE_DIGIGATE, amber: the guard checks it and lets it through or turns it away), and then it ends by
-- itself. Nothing else softens: a different driver, a cloned disc or a hotlist hit still stops the car. Starting it,
-- ending it early, and every car let out under it are in the audit log.

begin;

insert into digigate.schema_version (version) values (34);

alter table digigate.sites add column launch_grace_until timestamptz;

-- Starts a site's launch grace for 7 days from now, or restarts it. Only the site's company admins and super users.
create function digigate.start_launch_grace(_site uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
  _until timestamptz := now() + interval '7 days';
begin
  select s.org_id into _org from digigate.sites s where s.id = _site;
  if _org is null or not digigate.can_manage_org(_org) then
    raise exception 'Only an administrator of this company can start its launch grace.';
  end if;
  update digigate.sites set launch_grace_until = _until where id = _site;
  perform digigate.write_audit(_org, _site, null, 'setup', 'site.grace_started', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()),
    (select s.name from digigate.sites s where s.id = _site), 'until ' || to_char(_until at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI'));
  return _until;
end;
$$;

-- Ends it now, before its 7 days are up.
create function digigate.end_launch_grace(_site uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
begin
  select s.org_id into _org from digigate.sites s where s.id = _site and s.launch_grace_until > now();
  if _org is null then
    return;
  end if;
  if not digigate.can_manage_org(_org) then
    raise exception 'Only an administrator of this company can end its launch grace.';
  end if;
  update digigate.sites set launch_grace_until = now() where id = _site;
  perform digigate.write_audit(_org, _site, null, 'setup', 'site.grace_ended', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()),
    (select s.name from digigate.sites s where s.id = _site), 'ended early');
end;
$$;

revoke all on function digigate.start_launch_grace(uuid) from public;
revoke all on function digigate.end_launch_grace(uuid) from public;
grant execute on function digigate.start_launch_grace(uuid) to authenticated;
grant execute on function digigate.end_launch_grace(uuid) to authenticated;

-- Handhelds learn when the site's launch grace ends.
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

commit;
