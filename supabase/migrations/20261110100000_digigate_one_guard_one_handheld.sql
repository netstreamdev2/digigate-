-- One guard, one handheld (2026-11-10). A guard was on duty on two handhelds at once: nothing stopped the second one,
-- since each handheld only knew its own shifts. Now:
--
-- 1. Each handheld learns, with every sync, which of the company's guards are on duty on another handheld
--    (onDutyElsewhere in the snapshot), and won't put them on duty again.
-- 2. A supervisor can move the shift: their PIN on the new handheld sends shift_start with moved_from, and the shift
--    it came from ends here as 'moved'. The old handheld finds it in movedShifts at its next sync and signs the guard
--    out. The move is in the audit log, with the supervisor.
-- 3. Two handhelds that were offline can't see each other. When a shift starts for a guard already on duty on another
--    handheld, without a move, the server raises GUARD_ON_TWO_DEVICES (amber) for the control room.
--
-- The check is a trigger on event_details, as for occupant reasons, and never raises: an error there would fail the
-- whole upload and leave the handheld's outbox stuck behind it.

begin;

insert into digigate.schema_version (version) values (37);

alter table digigate.shifts drop constraint shifts_end_reason_check;
alter table digigate.shifts add constraint shifts_end_reason_check check (end_reason in ('ended', 'handover', 'timed-out', 'moved'));

create function digigate.check_shift_start() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _start digigate.events%rowtype;
  _new_shift uuid := digigate.to_uuid(new.payload ->> 'shift_id');
  _moved_from uuid := digigate.to_uuid(new.payload ->> 'moved_from');
  _moved digigate.shifts%rowtype;
  _guard text;
begin
  select * into _start from digigate.events e where e.id = new.event_id;
  if _start.type is distinct from 'shift_start' or new.gate_user_id is null then
    return null;
  end if;
  _guard := (select trim(g.first_name || ' ' || g.last_name) from digigate.gate_users g where g.id = new.gate_user_id);

  if _moved_from is not null then
    update digigate.shifts s
    set ended_at = _start.occurred_at, end_reason = 'moved', erase_after = _start.occurred_at + interval '3 years'
    where s.id = _moved_from and s.gate_user_id = new.gate_user_id and s.org_id = _start.org_id and s.ended_at is null
    returning * into _moved;
    if _moved.id is not null then
      perform digigate.close_left_post(_moved.site_id, _moved.id, _start.occurred_at, new.gate_user_id, 'Shift moved to another handheld');
      perform digigate.write_audit(
        _start.org_id, _start.site_id, _start.device_id, 'gate', 'gate.shift_moved', null,
        coalesce((select trim(g.first_name || ' ' || g.last_name) from digigate.gate_users g
                  where g.id = digigate.to_uuid(new.payload ->> 'moved_by')), 'A supervisor'),
        (select d.name from digigate.devices d where d.id = _start.device_id),
        concat_ws(' ', coalesce(_guard, 'A guard') || '''s shift, from', (select d.name from digigate.devices d where d.id = _moved.device_id)),
        _start.occurred_at
      );
    end if;
    return null;
  end if;

  if exists (
    select 1 from digigate.shifts s
    where s.gate_user_id = new.gate_user_id and s.org_id = _start.org_id and s.device_id <> _start.device_id
      and s.ended_at is null and s.started_at > _start.occurred_at - interval '14 hours'
      and s.id is distinct from _new_shift
  ) then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, raised_at, status, post)
    values (_start.org_id, _start.site_id, 'GUARD_ON_TWO_DEVICES', 'amber', 'server', new.event_id, _start.occurred_at, 'open', new.payload ->> 'post')
    on conflict (event_id, rule_code, source) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function digigate.check_shift_start() from public;

create trigger check_shift_start after insert on digigate.event_details
  for each row when (new.payload ? 'shift_id' and new.payload ? 'period')
  execute function digigate.check_shift_start();

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
