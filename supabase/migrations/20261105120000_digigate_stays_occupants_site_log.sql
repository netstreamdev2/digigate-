-- Four things the gate now records, and the audit log now tells the whole story of a site.
--
-- 1. Expected stay. At entry the guard records how long the visit should last (the visit type's stay by default:
--    visitor 4 hours, delivery 1 hour, from packages/core, or the site's own in sites.stay_minutes). The visit keeps
--    expected_until, so the dashboard shows the time left and flags a visit running over while it is still on site.
-- 2. Who is in the car. Men, women and anyone the guard couldn't tell, counted at entry and exit (counts only).
-- 3. A different head count at the exit is only noted, never an alarm: OCCUPANT_COUNT_DROP or OCCUPANT_COUNT_RISE, and
--    the guard can say why (a fixed list from the site type: "Dropped off a patient"). The reason arrives as its own
--    occupant_reason event after the check, and is kept with the visit's erasable details.
-- 4. The audit log records every flag and alarm raised at a site, by a handheld or by the server, not only what
--    people did. Like everything in the log it names no one: the rule, the site, the access point and the direction.
--
-- Searches can also describe the car ("white hatchback", "blue Mercedes"): check_records and visit_records gain
-- vehicle_search, the make, model, colour and body type in lower case, inside the 365 days records are shown in full.

begin;

insert into digigate.schema_version (version) values (30);

alter table digigate.visits
  add column expected_until timestamptz,
  add column occupants_in_by_sex jsonb,
  add column occupants_out_by_sex jsonb;
alter table digigate.visit_details
  add column vehicle_body text,
  add column occupant_reason text;
alter table digigate.sites add column stay_minutes jsonb not null default '{}';

-- The body type of cars already on record, from the entry that opened each visit.
update digigate.visit_details d
set vehicle_body = e.payload -> 'vehicle' ->> 'description'
from digigate.event_details e
join digigate.events ev on ev.id = e.event_id
where e.visit_id = d.visit_id and ev.type = 'vehicle_entry' and d.vehicle_body is null;

-- Counts as the handheld sends them, kept only when they're whole numbers.
create function digigate.occupants_by_sex(_value jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select case when jsonb_typeof(_value) = 'object' then jsonb_build_object(
    'male', case when _value ->> 'male' ~ '^\d{1,2}$' then (_value ->> 'male')::integer else 0 end,
    'female', case when _value ->> 'female' ~ '^\d{1,2}$' then (_value ->> 'female')::integer else 0 end,
    'unknown', case when _value ->> 'unknown' ~ '^\d{1,2}$' then (_value ->> 'unknown')::integer else 0 end
  ) end;
$$;

create or replace function digigate.apply_passage(_org uuid, _site uuid, _device uuid, _type text, _payload jsonb, _at timestamptz)
returns void
language plpgsql set search_path = ''
as $$
declare
  _visit uuid := digigate.to_uuid(_payload ->> 'visit_id');
  _kind text := case when _type like 'vehicle%' then 'vehicle' else 'pedestrian' end;
  _person jsonb := coalesce(_payload -> 'driver', _payload -> 'person', '{}');
  _vehicle jsonb := _payload -> 'vehicle';
  _visit_type text := coalesce(_payload ->> 'visit_type', 'visitor');
  _demographics jsonb := coalesce(_person -> 'demographics', '{}');
  _expiry text := _payload -> 'vehicle' ->> 'disc_expires_on';
  _stay text := _payload ->> 'expected_stay_minutes';
  _entered timestamptz;
  _closed_type text;
begin
  if _visit is null then
    return;
  end if;

  if _type like '%_exit' then
    update digigate.visits
    set exited_at = _at, occupants_out = (_payload ->> 'occupants')::integer,
      occupants_out_by_sex = digigate.occupants_by_sex(_payload -> 'occupants_by_sex')
    where id = _visit and exited_at is null
    returning entered_at, visit_type into _entered, _closed_type;
    update digigate.visit_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    update digigate.event_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    if _entered is not null then
      perform digigate.tally_passage(_org, _site, _kind, _closed_type, _at, _entered);
    end if;
    return;
  end if;

  insert into digigate.visits (id, org_id, site_id, post, kind, visit_type, entered_at, occupants_in, expected_until, occupants_in_by_sex)
  values (
    _visit, _org, _site,
    (select s.post from digigate.shifts s where s.device_id = _device and s.ended_at is null order by s.started_at desc limit 1),
    _kind, _visit_type, _at, (_payload ->> 'occupants')::integer,
    -- A stay of up to a week; anything else is no limit, never a guess.
    case when _stay ~ '^\d{1,5}$' and _stay::integer between 1 and 10080 then _at + make_interval(mins => _stay::integer) end,
    digigate.occupants_by_sex(_payload -> 'occupants_by_sex')
  )
  on conflict (id) do nothing;

  insert into digigate.visit_details (visit_id, org_id, site_id, person_key, person_name, vin, plate, disc_number, disc_expires_on, vehicle_description, vehicle_body)
  values (
    _visit, _org, _site,
    _person ->> 'person_key',
    trim(concat_ws(' ', coalesce(_person ->> 'names', _person ->> 'initials'), _person ->> 'surname')),
    _vehicle ->> 'vin',
    _vehicle ->> 'plate',
    _vehicle ->> 'disc_number',
    case when _expiry ~ '^\d{4}-\d{2}-\d{2}$' then _expiry::date end,
    case when _vehicle is not null
      then concat_ws(' · ', concat_ws(' ', _vehicle ->> 'make', _vehicle ->> 'model'), _vehicle ->> 'colour')
    end,
    _vehicle ->> 'description'
  )
  on conflict (visit_id) do nothing;

  insert into digigate.daily_counts (site_id, org_id, day, kind, visit_type, sex, age_band, visits)
  values (
    _site, _org, (_at at time zone 'Africa/Johannesburg')::date, _kind, _visit_type,
    coalesce(_demographics ->> 'sex', 'unknown'), coalesce(_demographics ->> 'age_band', 'unknown'), 1
  )
  on conflict (site_id, day, kind, visit_type, sex, age_band)
  do update set visits = digigate.daily_counts.visits + 1;

  perform digigate.tally_passage(_org, _site, _kind, _visit_type, _at, null);
end;
$$;

-- The guard's reason for a different head count, sent after the check as an occupant_reason event. Only the device
-- that made the check can give it. The reason stays in the visit's erasable details; the log only says that one was given.
create function digigate.note_occupant_reason() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _note digigate.events%rowtype;
  _check uuid := digigate.to_uuid(new.payload ->> 'check_event_id');
  _reason text := left(trim(coalesce(new.payload ->> 'reason', '')), 80);
  _visit uuid;
  _code text := case new.payload ->> 'change' when 'more' then 'OCCUPANT_COUNT_RISE' else 'OCCUPANT_COUNT_DROP' end;
begin
  select * into _note from digigate.events e where e.id = new.event_id;
  if _note.type is distinct from 'occupant_reason' or _check is null or _reason = '' then
    return null;
  end if;
  select c.visit_id into _visit from digigate.events c where c.id = _check and c.device_id = _note.device_id;
  if _visit is null then
    return null;
  end if;

  update digigate.visit_details set occupant_reason = _reason where visit_id = _visit;
  update digigate.alerts set resolution = 'Guard: ' || _reason
  where event_id = _check and rule_code in ('OCCUPANT_COUNT_DROP', 'OCCUPANT_COUNT_RISE');
  perform digigate.write_audit(
    _note.org_id, _note.site_id, _note.device_id, 'gate', 'gate.occupant_reason', null,
    (select trim(g.first_name || ' ' || g.last_name) from digigate.gate_users g where g.id = new.gate_user_id),
    (select d.name from digigate.devices d where d.id = _note.device_id),
    _code, _note.occurred_at
  );
  return null;
end;
$$;
create trigger note_occupant_reason after insert on digigate.event_details
  for each row when (new.payload ? 'check_event_id' and new.payload ? 'reason')
  execute function digigate.note_occupant_reason();

-- Every flag and alarm, as the site's story: which rule, where and which way, raised by which handheld or by the
-- server. Never who: no name or plate goes in the log.
create function digigate.alert_story(_alert digigate.alerts) returns text
language sql stable set search_path = ''
as $$
  select concat_ws(' · ',
    (select s.name from digigate.sites s where s.id = _alert.site_id),
    (
      select p.label from digigate.posts p
      where p.site_id = _alert.site_id and p.code = coalesce(_alert.post, (
        select sh.post from digigate.shifts sh
        where sh.device_id = e.device_id and sh.started_at <= e.occurred_at
        order by sh.started_at desc limit 1
      ))
    ),
    case when e.type like '%_entry' then 'Coming in' when e.type like '%_exit' then 'Going out' end,
    case _alert.severity when 'red' then 'Red' when 'amber' then 'Amber' else 'Noted' end,
    case when _alert.source = 'server' then 'Found by the server' end
  )
  from (select 1) as one
  left join digigate.events e on e.id = _alert.event_id;
$$;

create function digigate.audit_alert_raised() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _device uuid := (select e.device_id from digigate.events e where e.id = new.event_id);
begin
  perform digigate.write_audit(
    new.org_id, new.site_id, _device, 'alerts', 'alert.raised', null,
    case when new.source = 'server' then 'DigiGate' else coalesce((select d.name from digigate.devices d where d.id = _device), 'A handheld') end,
    new.rule_code, digigate.alert_story(new), new.raised_at
  );
  return null;
end;
$$;
create trigger audit_alert_raised after insert on digigate.alerts
  for each row execute function digigate.audit_alert_raised();

-- What was raised before the log kept it, so the site's story starts with its first check.
insert into digigate.audit_log (at, org_id, site_id, device_id, category, action, actor_id, actor_name, target, detail)
select a.raised_at, a.org_id, a.site_id, e.device_id, 'alerts', 'alert.raised', null,
  case when a.source = 'server' then 'DigiGate' else coalesce(d.name, 'A handheld') end,
  a.rule_code, digigate.alert_story(a)
from digigate.alerts a
left join digigate.events e on e.id = a.event_id
left join digigate.devices d on d.id = e.device_id;

create or replace view digigate.visit_records as
select
  id,
  org_id,
  site_id,
  post,
  kind,
  visit_type,
  entered_at,
  exited_at,
  occupants_in,
  occupants_out,
  details_erased,
  in_full,
  case when in_full then person_name else digigate.mask(person_name) end as person_name,
  case when in_full then vin else digigate.mask(vin) end as vin,
  case when in_full then plate else digigate.mask(plate) end as plate,
  case when in_full then disc_number else digigate.mask(disc_number) end as disc_number,
  case when in_full then vehicle_description else digigate.mask(vehicle_description) end as vehicle_description,
  expected_until,
  occupants_in_by_sex,
  occupants_out_by_sex,
  case when in_full then occupant_reason end as occupant_reason,
  case when in_full then lower(concat_ws(' ', vehicle_description, vehicle_body)) end as vehicle_search
from (
  select
    v.*,
    d.visit_id is null as details_erased,
    d.person_name,
    d.vin,
    d.plate,
    d.disc_number,
    d.vehicle_description,
    d.vehicle_body,
    d.occupant_reason,
    coalesce(v.exited_at, v.entered_at) > now() - interval '365 days' as in_full
  from digigate.visits v
  left join digigate.visit_details d on d.visit_id = v.id
  where v.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or v.org_id = (select digigate.viewer_org()))
) as shown;

create or replace view digigate.check_records as
select
  id,
  org_id,
  site_id,
  type,
  occurred_at,
  outcome,
  rule_codes,
  visit_id,
  visit_entered_at,
  visit_type,
  details_erased,
  in_full,
  (
    select s.post from digigate.shifts s
    where s.device_id = shown.device_id and s.started_at <= shown.occurred_at
    order by s.started_at desc
    limit 1
  ) as post,
  case when in_full then person_name else digigate.mask(person_name) end as person_name,
  case when in_full then plate else digigate.mask(plate) end as plate,
  case when in_full then typed_plate else digigate.mask(typed_plate) end as typed_plate,
  case when in_full then vehicle_description else digigate.mask(vehicle_description) end as vehicle_description,
  case when in_full then vehicle_search end as vehicle_search
from (
  select
    e.id,
    e.org_id,
    e.site_id,
    e.device_id,
    e.type,
    e.occurred_at,
    e.outcome,
    e.rule_codes,
    e.visit_id,
    v.entered_at as visit_entered_at,
    d.event_id is null as details_erased,
    d.payload ->> 'visit_type' as visit_type,
    d.payload ->> 'typed_plate' as typed_plate,
    d.payload -> 'vehicle' ->> 'plate' as plate,
    nullif(trim(concat_ws(' ',
      coalesce(d.payload -> 'driver' ->> 'initials', d.payload -> 'person' ->> 'names', d.payload -> 'person' ->> 'initials'),
      coalesce(d.payload -> 'driver' ->> 'surname', d.payload -> 'person' ->> 'surname')
    )), '') as person_name,
    nullif(concat_ws(' · ',
      nullif(trim(concat_ws(' ', d.payload -> 'vehicle' ->> 'make', d.payload -> 'vehicle' ->> 'model')), ''),
      d.payload -> 'vehicle' ->> 'colour'
    ), '') as vehicle_description,
    nullif(lower(concat_ws(' ',
      d.payload -> 'vehicle' ->> 'make', d.payload -> 'vehicle' ->> 'model',
      d.payload -> 'vehicle' ->> 'colour', d.payload -> 'vehicle' ->> 'description'
    )), '') as vehicle_search,
    coalesce(v.exited_at, e.occurred_at) > now() - interval '365 days' as in_full
  from digigate.events e
  left join digigate.event_details d on d.event_id = e.id
  left join digigate.visits v on v.id = e.visit_id
  where e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
) as shown;

-- The control room's popup also shows who was in the car, a changed head count with the guard's reason, and the
-- stay the guard recorded.
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
    'expectedUntil', v.expected_until,
    'expectedStayMinutes', case when d.payload ->> 'expected_stay_minutes' ~ '^\d{1,5}$' then (d.payload ->> 'expected_stay_minutes')::integer end,
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
    'occupantsBySex', digigate.occupants_by_sex(d.payload -> 'occupants_by_sex'),
    'occupantsCameIn', case when e.type = 'vehicle_exit' then v.occupants_in end,
    'occupantsCameInBySex', case when e.type = 'vehicle_exit' then v.occupants_in_by_sex end,
    'occupantReason', case when shown.in_full then vd.occupant_reason end,
    'hasLicencePhoto', shown.in_full and d.licence_photo_path is not null,
    'hasPlatePhoto', shown.in_full and d.plate_photo_path is not null,
    'plateEntry', case when shown.in_full and jsonb_typeof(d.payload -> 'plate_entry') = 'object' then jsonb_build_object(
      'source', d.payload -> 'plate_entry' ->> 'source',
      'photo', d.payload -> 'plate_entry' ->> 'photo' = 'true',
      'readFromPhoto', d.payload -> 'plate_entry' ->> 'read_from_photo',
      'warnedPlate', d.payload -> 'plate_entry' ->> 'warned_plate'
    ) end,
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
  left join digigate.visit_details vd on vd.visit_id = e.visit_id
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

-- The handheld also learns the site's type and its own stay settings, and each open visit's expected stay, so the
-- overstay note works offline at whichever gate the visit leaves by.
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

revoke all on function digigate.note_occupant_reason() from public;
revoke all on function digigate.audit_alert_raised() from public;
revoke all on function digigate.alert_story(digigate.alerts) from public;
revoke all on function digigate.occupants_by_sex(jsonb) from public;

commit;
