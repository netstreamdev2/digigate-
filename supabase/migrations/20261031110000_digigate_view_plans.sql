-- A view with a WITH clause can't be merged into the query reading it, so ORDER BY and LIMIT never reached the indexes
-- and every page joined a site's entire history. As plain subqueries, a read costs what it returns. Same columns, same
-- access checks, same masking.

begin;

insert into digigate.schema_version (version) values (8);

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
  case when in_full then vehicle_description else digigate.mask(vehicle_description) end as vehicle_description
from (
  select
    v.*,
    d.visit_id is null as details_erased,
    d.person_name,
    d.vin,
    d.plate,
    d.disc_number,
    d.vehicle_description,
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
  case when in_full then vehicle_description else digigate.mask(vehicle_description) end as vehicle_description
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
    coalesce(v.exited_at, e.occurred_at) > now() - interval '365 days' as in_full
  from digigate.events e
  left join digigate.event_details d on d.event_id = e.id
  left join digigate.visits v on v.id = e.visit_id
  where e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
) as shown;

commit;
