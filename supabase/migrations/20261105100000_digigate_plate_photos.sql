-- Photos of number plates. At entry and exit the guard photographs the car's plate, the handheld reads the plate off
-- it, and the guard confirms or types it. The photo is kept with the check, so a plate that didn't match the disc can
-- be looked at later: a guard's slip (S for C) is cleared with proof, and a car carrying someone else's disc is shown
-- for what it is. With it the check now records how the plate was given (event payload plate_entry: off the photo or
-- typed, what the photo read, and the plate as it was when the guard was told it didn't match the disc).
--
-- Plates are personal information, and a photo can show people in or near the car. It is kept exactly like the photo
-- from a driver's licence: a private bucket that no policy opens, reached through digigate-people with a one-minute
-- link that is logged each time, no longer shown after 365 days, and deleted by the erasure job with the check's details.

begin;

insert into digigate.schema_version (version) values (29);

alter table digigate.event_details add column plate_photo_path text;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('plate-photos', 'plate-photos', false, 1000000, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- Called by digigate-sync once the photo is stored. Only the device that made the check can attach its photo, and
-- only while the check still has its details.
create function digigate.attach_plate_photo(_device uuid, _event uuid, _path text) returns boolean
language sql security definer set search_path = ''
as $$
  with attached as (
    update digigate.event_details d set plate_photo_path = _path
    from digigate.events e
    where e.id = _event and e.device_id = _device and d.event_id = e.id and e.type in ('vehicle_entry', 'vehicle_exit')
    returning d.event_id
  )
  select exists (select 1 from attached);
$$;

-- Where a check's plate photo is kept, for digigate-people to open, asked as the signed-in person so the same
-- visibility applies as the live list. Nothing once the check is older than 365 days.
create function digigate.plate_photo_for(_event uuid)
returns table (path text, org_id uuid, site_id uuid, plate text)
language sql stable security definer set search_path = ''
as $$
  select d.plate_photo_path, e.org_id, e.site_id, digigate.mask(coalesce(d.payload ->> 'typed_plate', d.payload -> 'vehicle' ->> 'plate'))
  from digigate.events e
  join digigate.event_details d on d.event_id = e.id
  left join digigate.visits v on v.id = e.visit_id
  where e.id = _event
    and d.plate_photo_path is not null
    and coalesce(v.exited_at, e.occurred_at) > now() - interval '365 days'
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()));
$$;

-- The control room's popup also shows the plate photo and how the plate was given, inside the 365 days in full.
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

-- The erasure job deletes plate photos with the check's details, through the same queue as licence photos.
alter table digigate.erasure_files drop constraint erasure_files_bucket_check;
alter table digigate.erasure_files add constraint erasure_files_bucket_check
  check (bucket in ('licence-photos', 'shift-selfies', 'plate-photos'));

create or replace function digigate.erase_due(_batch integer default 5000) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _checks jsonb;
  _visits jsonb;
  _shifts jsonb;
  _hotlist jsonb;
  _bookings jsonb;
  _photos jsonb;
  _plates jsonb;
  _org text;
  _line text;
begin
  with due as (
    select d.event_id, d.org_id, d.licence_photo_path, d.plate_photo_path from digigate.event_details d
    where d.erase_after <= now() order by d.erase_after limit _batch
  ),
  queued as (
    insert into digigate.erasure_files (bucket, path)
    select 'licence-photos', due.licence_photo_path from due where due.licence_photo_path is not null
    union all
    select 'plate-photos', due.plate_photo_path from due where due.plate_photo_path is not null
    on conflict do nothing
    returning 1
  ),
  notes as (
    update digigate.alerts a set resolution = null
    where a.event_id in (select due.event_id from due) and a.resolution is not null
    returning 1
  ),
  gone as (
    delete from digigate.event_details d using due where d.event_id = due.event_id returning d.org_id
  )
  select
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from gone group by org_id) c), '{}'),
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from due where licence_photo_path is not null group by org_id) c), '{}'),
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from due where plate_photo_path is not null group by org_id) c), '{}')
  into _checks, _photos, _plates;

  with due as (
    select d.visit_id from digigate.visit_details d where d.erase_after <= now() order by d.erase_after limit _batch
  ),
  gone as (
    delete from digigate.visit_details d using due where d.visit_id = due.visit_id returning d.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _visits from (select org_id, count(*) n from gone group by org_id) c;

  with due as (
    select s.id, s.org_id, s.selfie_path from digigate.shifts s
    where s.ended_at is not null and s.erase_after <= now() order by s.erase_after limit _batch
  ),
  queued as (
    insert into digigate.erasure_files (bucket, path)
    select 'shift-selfies', due.selfie_path from due where due.selfie_path is not null
    on conflict do nothing
    returning 1
  ),
  gone as (
    delete from digigate.shifts s using due where s.id = due.id returning s.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _shifts from (select org_id, count(*) n from gone group by org_id) c;

  with gone as (
    delete from digigate.hotlist h where h.id in (
      select id from digigate.hotlist where erase_after <= now() order by erase_after limit _batch
    ) returning h.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _hotlist from (select org_id, count(*) n from gone group by org_id) c;

  with gone as (
    delete from digigate.expected_visitors b where b.id in (
      select id from digigate.expected_visitors where erase_after <= now() order by erase_after limit _batch
    ) returning b.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _bookings from (select org_id, count(*) n from gone group by org_id) c;

  for _org in
    select distinct key from (
      select jsonb_object_keys(_checks) union select jsonb_object_keys(_visits) union select jsonb_object_keys(_shifts)
      union select jsonb_object_keys(_hotlist) union select jsonb_object_keys(_bookings)
    ) as keys(key)
  loop
    _line := concat_ws(', ',
      case when (_checks ->> _org)::integer > 0 then (_checks ->> _org) || ' checks' end,
      case when (_visits ->> _org)::integer > 0 then (_visits ->> _org) || ' visits' end,
      case when (_photos ->> _org)::integer > 0 then (_photos ->> _org) || ' licence photos' end,
      case when (_plates ->> _org)::integer > 0 then (_plates ->> _org) || ' plate photos' end,
      case when (_shifts ->> _org)::integer > 0 then (_shifts ->> _org) || ' shifts' end,
      case when (_hotlist ->> _org)::integer > 0 then (_hotlist ->> _org) || ' hotlist entries' end,
      case when (_bookings ->> _org)::integer > 0 then (_bookings ->> _org) || ' bookings' end
    );
    perform digigate.write_audit(_org::uuid, null, null, 'privacy', 'erasure.ran', null, 'DigiGate', 'records over three years old', _line);
  end loop;

  return jsonb_build_object(
    'checks', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_checks)),
    'visits', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_visits)),
    'shifts', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_shifts)),
    'hotlist', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_hotlist)),
    'bookings', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_bookings)),
    'filesQueued', (select count(*) from digigate.erasure_files)
  );
end;
$$;

revoke all on function digigate.attach_plate_photo(uuid, uuid, text) from public;
revoke all on function digigate.plate_photo_for(uuid) from public;
grant execute on function digigate.attach_plate_photo(uuid, uuid, text) to service_role;
grant execute on function digigate.plate_photo_for(uuid) to authenticated;

commit;
