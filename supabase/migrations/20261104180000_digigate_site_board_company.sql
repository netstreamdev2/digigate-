-- The control room's site list for one company, so a super user working inside a company sees that company's sites
-- only. Leaving the company out lists every site the caller can see, as before.

begin;

insert into digigate.schema_version (version) values (25);

drop function digigate.site_board(text, integer, integer);

create function digigate.site_board(_search text, _limit integer, _offset integer, _org uuid default null)
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
  where (_search = '' or s.name ilike _search or c.name ilike _search)
    and (_org is null or s.org_id = _org)
  order by coalesce(o.red, 0) desc, coalesce(o.amber, 0) desc, c.name, s.name
  limit least(_limit, 100) offset _offset;
$$;

revoke all on function digigate.site_board(text, integer, integer, uuid) from public;
grant execute on function digigate.site_board(text, integer, integer, uuid) to authenticated;

commit;
