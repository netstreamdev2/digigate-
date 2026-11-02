-- Every handheld at a site now works from the whole site's open visits, not only its own, so a car that came in at the
-- Main Gate is known at the Back Gate. Each sync hands the device the site's open visits, the open alert count and the
-- day's average stay for its home screen. Visits also keep the expiry of the disc they came in with, so a car leaving
-- with a different disc is caught at whichever gate it leaves by. The server re-runs the rules on each check as it
-- arrives (digigate-sync), for anything a handheld couldn't see while it was offline.

begin;

insert into digigate.schema_version (version) values (15);

alter table digigate.visit_details add column disc_expires_on date;

-- Visits still open get the expiry from the entry that opened them. A badly formed date is left out, never an error.
update digigate.visit_details d
set disc_expires_on = (e.payload -> 'vehicle' ->> 'disc_expires_on')::date
from digigate.event_details e
join digigate.events ev on ev.id = e.event_id
where e.visit_id = d.visit_id
  and ev.type = 'vehicle_entry'
  and d.disc_expires_on is null
  and e.payload -> 'vehicle' ->> 'disc_expires_on' ~ '^\d{4}-\d{2}-\d{2}$';

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
  _entered timestamptz;
  _closed_type text;
begin
  if _visit is null then
    return;
  end if;

  if _type like '%_exit' then
    update digigate.visits
    set exited_at = _at, occupants_out = (_payload ->> 'occupants')::integer
    where id = _visit and exited_at is null
    returning entered_at, visit_type into _entered, _closed_type;
    update digigate.visit_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    update digigate.event_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    if _entered is not null then
      perform digigate.tally_passage(_org, _site, _kind, _closed_type, _at, _entered);
    end if;
    return;
  end if;

  insert into digigate.visits (id, org_id, site_id, post, kind, visit_type, entered_at, occupants_in)
  values (
    _visit, _org, _site,
    (select s.post from digigate.shifts s where s.device_id = _device and s.ended_at is null order by s.started_at desc limit 1),
    _kind, _visit_type, _at, (_payload ->> 'occupants')::integer
  )
  on conflict (id) do nothing;

  insert into digigate.visit_details (visit_id, org_id, site_id, person_key, person_name, vin, plate, disc_number, disc_expires_on, vehicle_description)
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
    end
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

-- What a device needs to run with no connection. Open visits are this company's at this site, newest first and capped,
-- so one forgotten visit can't grow the download without end. Names travel with them: the guard's screen says who.
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
