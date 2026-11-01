-- What the control room reads: which site needs attention first, who is at each gate, and every check with the person
-- and car it was about, including a car still waiting at the boom, which has no visit yet.

begin;

insert into digigate.schema_version (version) values (7);

create index events_device_time on digigate.events (device_id, occurred_at desc);
create index shifts_device_time on digigate.shifts (device_id, started_at desc);

-- The access check now runs once per query, not once per row: a super user's list of sites is thousands long.
create or replace view digigate.visit_records as
with shown as (
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
)
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
from shown;

-- Every check at a gate, on the same terms as visit_records: a year in full, then masked, and gone with its details
-- after 3 years. Only these fields leave the payload. Like visit_records it runs as its owner, so its WHERE is the
-- access check. The post comes from the shift the device was on when the check happened.
create view digigate.check_records as
with shown as (
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
)
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
from shown;

-- The sites someone looks after, trouble first, one page at a time. Runs as the caller, so row security decides which
-- sites and alerts they get. A shift nobody ended stops counting after 14 hours, the gate app's own limit.
create function digigate.site_board(_search text, _limit integer, _offset integer)
returns table (site_id uuid, site_name text, client_name text, red bigint, amber bigint, on_site bigint, on_duty bigint, total bigint)
language sql stable set search_path = ''
as $$
  with open_alerts as (
    select a.site_id, count(*) filter (where a.severity = 'red') as red, count(*) filter (where a.severity = 'amber') as amber
    from digigate.alerts a
    where a.status = 'open'
    group by a.site_id
  )
  select
    s.id,
    s.name,
    c.name,
    coalesce(o.red, 0),
    coalesce(o.amber, 0),
    (select count(*) from digigate.visit_records r where r.site_id = s.id and r.exited_at is null),
    (select count(*) from digigate.shifts x where x.site_id = s.id and x.ended_at is null and x.started_at > now() - interval '14 hours'),
    count(*) over ()
  from digigate.sites s
  join digigate.clients c on c.id = s.client_id
  left join open_alerts o on o.site_id = s.id
  where _search = '' or s.name ilike _search or c.name ilike _search
  order by coalesce(o.red, 0) desc, coalesce(o.amber, 0) desc, c.name, s.name
  limit least(_limit, 100) offset _offset;
$$;

-- Each post at a site and who is on it. The guard list is closed to the control room, so this runs as its owner and
-- gives out one name per post, for sites the caller can see, from their own company's shifts. A client's view-only
-- login learns a gate is staffed, not by whom.
create function digigate.gate_board(_site uuid)
returns table (post text, label text, lanes text[], period text, on_duty_since timestamptz, guard text, device text, device_seen_at timestamptz, last_check_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select
    p.code,
    p.label,
    p.lanes,
    s.period,
    s.started_at,
    case when digigate.viewer_client() is null then trim(g.first_name || ' ' || g.last_name) end,
    d.name,
    d.last_seen_at,
    (
      select e.occurred_at from digigate.events e
      where e.device_id = s.device_id and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
      order by e.occurred_at desc
      limit 1
    )
  from digigate.posts p
  left join lateral (
    select x.period, x.started_at, x.gate_user_id, x.device_id
    from digigate.shifts x
    where x.site_id = p.site_id and x.post = p.code and x.ended_at is null and x.started_at > now() - interval '14 hours'
      and (digigate.viewer_org() is null or x.org_id = digigate.viewer_org())
    order by x.started_at desc
    limit 1
  ) s on true
  left join digigate.gate_users g on g.id = s.gate_user_id
  left join digigate.devices d on d.id = s.device_id
  where p.site_id = _site and p.is_active and _site = any (digigate.visible_site_ids())
  order by p.created_at;
$$;

grant select on digigate.check_records to authenticated;

revoke all on function digigate.site_board(text, integer, integer) from public;
revoke all on function digigate.gate_board(uuid) from public;
grant execute on function digigate.site_board(text, integer, integer) to authenticated;
grant execute on function digigate.gate_board(uuid) to authenticated;

commit;
