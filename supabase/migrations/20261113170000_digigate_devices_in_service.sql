-- The devices page opens on the handhelds in service (the user's decision, 13 November): a revoked test handheld in the
-- main list confused the control room. A revoked handheld keeps its record and its scans, and stays on the Revoked tab.
-- device_board takes a new status, 'in_service', meaning everything but revoked. An empty status still means every
-- handheld, as before. Everything else is as migration 44 made it, with migration 47's change: DigiGate staff
-- (super users and technicians) see the data columns.

begin;

insert into digigate.schema_version (version) values (50);

create or replace function digigate.device_board(_search text, _status text, _limit integer, _offset integer, _org uuid default null)
returns table (
  id uuid,
  name text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  org_name text,
  client_name text,
  site_id uuid,
  site_name text,
  post text,
  guard text,
  status text,
  last_check_at timestamptz,
  checks_today bigint,
  total bigint,
  health jsonb,
  health_at timestamptz,
  data_bundle_mb integer,
  data_used_bytes bigint,
  data_whole boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    f.id,
    f.name,
    f.paired_at,
    f.last_seen_at,
    f.org_name,
    f.client_name,
    f.site_id,
    f.site_name,
    f.post,
    f.guard,
    f.status,
    (
      select e.occurred_at from digigate.events e
      where e.device_id = f.id
        and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
        and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
      order by e.occurred_at desc
      limit 1
    ),
    (
      select count(*) from digigate.events e
      where e.device_id = f.id
        and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
        and e.occurred_at >= date_trunc('day', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
        and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
    ),
    count(*) over (),
    digigate.health_for_viewer(f.health),
    f.health_at,
    case when digigate.is_digigate_staff() then d.data_bundle_mb end,
    case when digigate.is_digigate_staff() then used.bytes end,
    case when digigate.is_digigate_staff() then used.whole end
  from digigate.fleet(_search, _org) f
  join digigate.devices d on d.id = f.id
  left join lateral (
    select sum(coalesce(x.device_bytes, x.app_bytes))::bigint as bytes, bool_and(x.device_bytes is not null) as whole
    from digigate.device_data_days x
    where x.device_id = f.id
      and x.day >= digigate.data_period_start(d.data_renews_day, (now() at time zone 'Africa/Johannesburg')::date)
  ) used on true
  where _status = '' or f.status = _status or (_status = 'in_service' and f.status <> 'revoked')
  order by
    case f.status when 'quiet' then 0 when 'offline' then 1 when 'online' then 2 else 3 end,
    f.last_seen_at desc nulls last,
    f.name
  limit least(_limit, 100) offset _offset;
$$;

commit;
