-- The control room's view of one gate check: the driver, the vehicle, and the photo from the driver's licence.
--
-- The handheld decodes the licence photo after the result is on screen, and now keeps it until sync carries it here, as
-- it does a shift selfie, so the photo never slows a scan. It is personal information: it lives in a private bucket
-- that no policy opens, it is reached through digigate-people with a short link that is logged each time, it follows
-- the rest of the check's details, so after 365 days it is no longer shown, and the erasure job must delete the file
-- with the details.
--
-- Who sees a check is exactly who sees it in the live list: anyone whose dashboard shows that site, each company only
-- what it recorded itself. Site viewers see the driver but never the guard's name.

begin;

insert into digigate.schema_version (version) values (20);

alter table digigate.event_details add column licence_photo_path text;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('licence-photos', 'licence-photos', false, 200000, array['image/bmp'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- Called by digigate-sync once the photo is stored. Only the device that made the check can attach its photo, and
-- only while the check still has its details.
create function digigate.attach_licence_photo(_device uuid, _event uuid, _path text) returns boolean
language sql security definer set search_path = ''
as $$
  with attached as (
    update digigate.event_details d set licence_photo_path = _path
    from digigate.events e
    where e.id = _event and e.device_id = _device and d.event_id = e.id
    returning d.event_id
  )
  select exists (select 1 from attached);
$$;

-- One check in full, for the control room's popup. Older than 365 days, names and plates come masked, as in the list.
create function digigate.check_detail(_event uuid) returns jsonb
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
    'hasLicencePhoto', shown.in_full and d.licence_photo_path is not null
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

-- Where a check's licence photo is kept, for digigate-people to open, asked as the signed-in person so the same
-- visibility applies. Nothing once the check is older than 365 days.
create function digigate.licence_photo_for(_event uuid)
returns table (path text, org_id uuid, site_id uuid, person text)
language sql stable security definer set search_path = ''
as $$
  select d.licence_photo_path, e.org_id, e.site_id,
    digigate.mask(nullif(trim(concat_ws(' ',
      coalesce(d.payload -> 'driver' ->> 'initials', d.payload -> 'person' ->> 'names', d.payload -> 'person' ->> 'initials'),
      coalesce(d.payload -> 'driver' ->> 'surname', d.payload -> 'person' ->> 'surname')
    )), ''))
  from digigate.events e
  join digigate.event_details d on d.event_id = e.id
  left join digigate.visits v on v.id = e.visit_id
  where e.id = _event
    and d.licence_photo_path is not null
    and coalesce(v.exited_at, e.occurred_at) > now() - interval '365 days'
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()));
$$;

revoke all on function digigate.attach_licence_photo(uuid, uuid, text) from public;
revoke all on function digigate.check_detail(uuid) from public;
revoke all on function digigate.licence_photo_for(uuid) from public;
grant execute on function digigate.attach_licence_photo(uuid, uuid, text) to service_role;
grant execute on function digigate.check_detail(uuid) to authenticated;
grant execute on function digigate.licence_photo_for(uuid) to authenticated;

commit;
