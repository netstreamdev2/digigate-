-- Emergencies, let in first. An ambulance on a call doesn't wait for a licence scan: the guard picks the kind
-- (ambulance, police, fire and rescue, ...) and the plate if there's time, and the visit opens with no driver. So a
-- vehicle visit may now have no person, and is named by its emergency instead; the payload carries
-- `emergency: { kind, label, note }`. Every one raises EMERGENCY_ENTRY (amber) so the control room knows at once, and
-- it closes like any other alert. An emergency driving out with no driver on record is not flagged (packages/core).

begin;

insert into digigate.schema_version (version) values (42);

alter table digigate.visit_details alter column person_key drop not null;

-- As before, except a visit with no person is named by its emergency.
create or replace function digigate.apply_passage(_org uuid, _site uuid, _device uuid, _type text, _payload jsonb, _at timestamptz)
returns void
language plpgsql set search_path = ''
as $$
declare
  _visit uuid := digigate.to_uuid(_payload ->> 'visit_id');
  _kind text := case when _type like 'vehicle%' then 'vehicle' else 'pedestrian' end;
  _person jsonb := coalesce(nullif(_payload -> 'driver', 'null'::jsonb), _payload -> 'person', '{}');
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
    coalesce(
      nullif(trim(concat_ws(' ', coalesce(_person ->> 'names', _person ->> 'initials'), _person ->> 'surname')), ''),
      left(case when _payload -> 'emergency' ->> 'note' <> '' then 'Emergency: ' || (_payload -> 'emergency' ->> 'note') else _payload -> 'emergency' ->> 'label' end, 80),
      ''
    ),
    _vehicle ->> 'vin',
    _vehicle ->> 'plate',
    _vehicle ->> 'disc_number',
    case when _expiry ~ '^\d{4}-\d{2}-\d{2}$' then _expiry::date end,
    case when _vehicle is not null
      then nullif(concat_ws(' · ', nullif(concat_ws(' ', _vehicle ->> 'make', _vehicle ->> 'model'), ''), _vehicle ->> 'colour'), '')
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

-- Every emergency let in is the control room's to know about. Never raises: an error would fail the whole upload.
create function digigate.check_emergency_entry() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _event digigate.events;
begin
  select e.* into _event from digigate.events e where e.id = new.event_id;
  if _event.type = 'vehicle_entry' and jsonb_typeof(new.payload -> 'emergency') = 'object' then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
    values (new.org_id, new.site_id, 'EMERGENCY_ENTRY', 'amber', 'device', new.event_id, new.visit_id, _event.occurred_at, 'open')
    on conflict (event_id, rule_code, source) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function digigate.check_emergency_entry() from public;

create trigger check_emergency_entry after insert on digigate.event_details
  for each row when (new.payload ? 'emergency')
  execute function digigate.check_emergency_entry();

-- The checks list names an emergency the same way.
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
    coalesce(nullif(trim(concat_ws(' ',
      coalesce(d.payload -> 'driver' ->> 'initials', d.payload -> 'person' ->> 'names', d.payload -> 'person' ->> 'initials'),
      coalesce(d.payload -> 'driver' ->> 'surname', d.payload -> 'person' ->> 'surname')
    )), ''),
      -- An emergency let in first has no driver: it's named by its emergency.
      case when d.payload -> 'emergency' ->> 'note' <> '' then 'Emergency: ' || (d.payload -> 'emergency' ->> 'note') else d.payload -> 'emergency' ->> 'label' end
    ) as person_name,
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

commit;
