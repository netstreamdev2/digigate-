-- The whole fleet of handhelds at a glance: which are working, which have gone quiet with a guard relying on them, and
-- what each one has been doing. These run as the caller, so row security decides whose devices they get.

begin;

insert into digigate.schema_version (version) values (9);

-- Every device with where it is and who is on it. Handhelds sync every minute, so three missed rounds counts as gone
-- quiet, and that only matters when someone is on duty on it: a device with nobody on it is just offline. A shift nobody
-- ended stops counting after 14 hours, the gate app's own limit.
create function digigate.fleet(_search text, _org uuid)
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
  status text
)
language sql stable set search_path = ''
as $$
  with on_duty as (
    select distinct on (x.device_id) x.device_id, x.gate_user_id, x.post
    from digigate.shifts x
    where x.ended_at is null and x.started_at > now() - interval '14 hours'
    order by x.device_id, x.started_at desc
  )
  select
    d.id,
    d.name,
    d.paired_at,
    d.last_seen_at,
    o.name,
    c.name,
    s.id,
    s.name,
    coalesce(p.label, x.post),
    trim(g.first_name || ' ' || g.last_name),
    case
      when d.revoked_at is not null then 'revoked'
      when d.last_seen_at > now() - interval '3 minutes' then 'online'
      when x.device_id is not null then 'quiet'
      else 'offline'
    end
  from digigate.devices d
  join digigate.sites s on s.id = d.site_id
  join digigate.clients c on c.id = s.client_id
  join digigate.organisations o on o.id = d.org_id
  left join on_duty x on x.device_id = d.id and d.revoked_at is null
  left join digigate.posts p on p.site_id = d.site_id and p.code = x.post
  left join digigate.gate_users g on g.id = x.gate_user_id
  where (_org is null or d.org_id = _org)
    and (_search = '' or d.name ilike _search or s.name ilike _search or c.name ilike _search or o.name ilike _search);
$$;

-- One page of the fleet, trouble first. Each row's activity is read only for the page being shown.
create function digigate.device_board(_search text, _org uuid, _status text, _limit integer, _offset integer)
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
  total bigint
)
language sql stable set search_path = ''
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
      where e.device_id = f.id and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
      order by e.occurred_at desc
      limit 1
    ),
    (
      select count(*) from digigate.events e
      where e.device_id = f.id
        and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
        and e.occurred_at >= date_trunc('day', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
    ),
    count(*) over ()
  from digigate.fleet(_search, _org) f
  where _status = '' or f.status = _status
  order by
    case f.status when 'quiet' then 0 when 'offline' then 1 when 'online' then 2 else 3 end,
    f.last_seen_at desc nulls last,
    f.name
  limit least(_limit, 100) offset _offset;
$$;

-- How many devices are in each state, for the headings. Follows the search and company, not the state being viewed.
create function digigate.device_summary(_search text, _org uuid)
returns table (status text, devices bigint)
language sql stable set search_path = ''
as $$
  select f.status, count(*) from digigate.fleet(_search, _org) f group by f.status;
$$;

revoke all on function digigate.fleet(text, uuid) from public;
revoke all on function digigate.device_board(text, uuid, text, integer, integer) from public;
revoke all on function digigate.device_summary(text, uuid) from public;
grant execute on function digigate.fleet(text, uuid) to authenticated;
grant execute on function digigate.device_board(text, uuid, text, integer, integer) to authenticated;
grant execute on function digigate.device_summary(text, uuid) to authenticated;

commit;
