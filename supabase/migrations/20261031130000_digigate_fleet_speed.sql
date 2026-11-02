-- The device view took 2.5 seconds for a super user at 4,800 devices: row security checked every row of every table
-- against a list of thousands of sites. These now run as their owner and match devices to that list once, so the cost
-- follows the size of the fleet. Their WHERE and joins are the access check: the same sites and the same company rule as
-- row security, and, as in gate_board, a client's view-only login gets no guard names. Who the viewer is gets worked out
-- once per read, not once per row.

begin;

insert into digigate.schema_version (version) values (10);

create or replace function digigate.fleet(_search text, _org uuid)
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
language sql stable security definer set search_path = ''
as $$
  with visible as (
    select unnest(digigate.visible_site_ids()) as site_id
  ),
  on_duty as (
    select distinct on (x.device_id) x.device_id, x.gate_user_id, x.post
    from digigate.shifts x
    where x.ended_at is null and x.started_at > now() - interval '14 hours'
      and ((select digigate.viewer_org()) is null or x.org_id = (select digigate.viewer_org()))
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
    case when (select digigate.viewer_client()) is null then trim(g.first_name || ' ' || g.last_name) end,
    case
      when d.revoked_at is not null then 'revoked'
      when d.last_seen_at > now() - interval '3 minutes' then 'online'
      when x.device_id is not null then 'quiet'
      else 'offline'
    end
  from visible v
  join digigate.devices d on d.site_id = v.site_id
  join digigate.sites s on s.id = d.site_id
  join digigate.clients c on c.id = s.client_id
  join digigate.organisations o on o.id = d.org_id
  left join on_duty x on x.device_id = d.id and d.revoked_at is null
  left join digigate.posts p on p.site_id = d.site_id and p.code = x.post
  left join digigate.gate_users g on g.id = x.gate_user_id
  where (_org is null or d.org_id = _org)
    and (_search = '' or d.name ilike _search or s.name ilike _search or c.name ilike _search or o.name ilike _search);
$$;

-- The company is now a last, optional setting, so a page with no company filter simply leaves it out.
drop function digigate.device_board(text, uuid, text, integer, integer);
create function digigate.device_board(_search text, _status text, _limit integer, _offset integer, _org uuid default null)
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
    count(*) over ()
  from digigate.fleet(_search, _org) f
  where _status = '' or f.status = _status
  order by
    case f.status when 'quiet' then 0 when 'offline' then 1 when 'online' then 2 else 3 end,
    f.last_seen_at desc nulls last,
    f.name
  limit least(_limit, 100) offset _offset;
$$;

create or replace function digigate.device_summary(_search text, _org uuid default null)
returns table (status text, devices bigint)
language sql stable security definer set search_path = ''
as $$
  select f.status, count(*) from digigate.fleet(_search, _org) f group by f.status;
$$;

-- Only the two functions above call this now, and it takes no account of who may see a page of it on its own.
revoke all on function digigate.device_board(text, text, integer, integer, uuid) from public;
grant execute on function digigate.device_board(text, text, integer, integer, uuid) to authenticated;
revoke execute on function digigate.fleet(text, uuid) from authenticated;

commit;
