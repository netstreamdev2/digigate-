-- The People page: dashboard logins and gate staff, searched and filtered on the server. These run as their owner so a
-- name, a company and a client come back in one read, and because the guard list is closed to row security for most
-- reads. Their WHERE is the access check: a super user sees everyone, an administrator their own company and its clients'
-- view-only logins, and nobody else anyone. Neither ever returns a PIN or a password.

begin;

insert into digigate.schema_version (version) values (12);

create function digigate.people_board(_search text, _role text, _status text, _newest boolean, _limit integer, _offset integer, _org uuid default null)
returns table (
  id uuid,
  full_name text,
  login text,
  role text,
  is_active boolean,
  created_at timestamptz,
  site_count integer,
  company text,
  client text,
  total bigint
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.full_name, p.login, p.roles[1]::text, p.is_active, p.created_at, cardinality(p.site_ids), o.name, c.name, count(*) over ()
  from digigate.profiles p
  left join digigate.clients c on c.id = p.client_id
  left join digigate.organisations o on o.id = coalesce(p.org_id, c.org_id)
  where ((select digigate.is_super_user()) or coalesce(p.org_id, c.org_id) = (select digigate.admin_org()))
    and (_org is null or coalesce(p.org_id, c.org_id) = _org)
    and (_role = '' or _role = any (p.roles::text[]))
    and (_status = '' or p.is_active = (_status = 'active'))
    and (_search = '' or p.full_name ilike _search or p.login ilike _search or o.name ilike _search or c.name ilike _search)
  order by case when _newest then p.created_at end desc nulls last, p.full_name, p.login
  limit least(_limit, 100) offset _offset;
$$;

-- How many logins each role and status holds, for the tabs and tiles. Follows the search and company, not the tab.
create function digigate.people_counts(_search text, _org uuid default null)
returns table (role text, is_active boolean, people bigint)
language sql stable security definer set search_path = ''
as $$
  select p.roles[1]::text, p.is_active, count(*)
  from digigate.profiles p
  left join digigate.clients c on c.id = p.client_id
  left join digigate.organisations o on o.id = coalesce(p.org_id, c.org_id)
  where ((select digigate.is_super_user()) or coalesce(p.org_id, c.org_id) = (select digigate.admin_org()))
    and (_org is null or coalesce(p.org_id, c.org_id) = _org)
    and (_search = '' or p.full_name ilike _search or p.login ilike _search or o.name ilike _search or c.name ilike _search)
  group by 1, 2;
$$;

-- A shift nobody ended stops counting after 14 hours, the gate app's own limit.
create function digigate.gate_staff_board(_search text, _role text, _status text, _newest boolean, _limit integer, _offset integer, _org uuid default null)
returns table (
  id uuid,
  first_name text,
  last_name text,
  employee_number text,
  role text,
  is_active boolean,
  created_at timestamptz,
  site_count integer,
  company text,
  on_duty_at text,
  total bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    g.id,
    g.first_name,
    g.last_name,
    g.employee_number,
    g.role,
    g.is_active,
    g.created_at,
    cardinality(g.site_ids),
    o.name,
    (
      select coalesce(p.label, x.post)
      from digigate.shifts x
      left join digigate.posts p on p.site_id = x.site_id and p.code = x.post
      where x.gate_user_id = g.id and x.ended_at is null and x.started_at > now() - interval '14 hours'
      order by x.started_at desc
      limit 1
    ),
    count(*) over ()
  from digigate.gate_users g
  join digigate.organisations o on o.id = g.org_id
  where ((select digigate.is_super_user()) or g.org_id = (select digigate.admin_org()))
    and (_org is null or g.org_id = _org)
    and (_role = '' or g.role = _role)
    and (_status = '' or g.is_active = (_status = 'active'))
    and (_search = '' or g.first_name ilike _search or g.last_name ilike _search or g.employee_number ilike _search or o.name ilike _search
      or trim(g.first_name || ' ' || g.last_name) ilike _search)
  order by case when _newest then g.created_at end desc nulls last, g.last_name, g.first_name, g.employee_number
  limit least(_limit, 100) offset _offset;
$$;

create function digigate.gate_staff_counts(_search text, _org uuid default null)
returns table (role text, is_active boolean, people bigint, on_duty bigint)
language sql stable security definer set search_path = ''
as $$
  select
    g.role,
    g.is_active,
    count(*),
    count(*) filter (where exists (
      select 1 from digigate.shifts x
      where x.gate_user_id = g.id and x.ended_at is null and x.started_at > now() - interval '14 hours'
    ))
  from digigate.gate_users g
  join digigate.organisations o on o.id = g.org_id
  where ((select digigate.is_super_user()) or g.org_id = (select digigate.admin_org()))
    and (_org is null or g.org_id = _org)
    and (_search = '' or g.first_name ilike _search or g.last_name ilike _search or g.employee_number ilike _search or o.name ilike _search
      or trim(g.first_name || ' ' || g.last_name) ilike _search)
  group by g.role, g.is_active;
$$;

revoke all on function digigate.people_board(text, text, text, boolean, integer, integer, uuid) from public;
revoke all on function digigate.people_counts(text, uuid) from public;
revoke all on function digigate.gate_staff_board(text, text, text, boolean, integer, integer, uuid) from public;
revoke all on function digigate.gate_staff_counts(text, uuid) from public;
grant execute on function digigate.people_board(text, text, text, boolean, integer, integer, uuid) to authenticated;
grant execute on function digigate.people_counts(text, uuid) to authenticated;
grant execute on function digigate.gate_staff_board(text, text, text, boolean, integer, integer, uuid) to authenticated;
grant execute on function digigate.gate_staff_counts(text, uuid) to authenticated;

commit;
