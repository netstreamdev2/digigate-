-- The super user's list of security companies, with how many clients, sites and gate staff each one runs. Counting gate
-- staff through the API needs the whole row, PIN hash included, which no dashboard login may read, so the list failed
-- outright. Counting here leaves the PIN out of reach, and runs once per company shown rather than under row security
-- for every client and site.

begin;

insert into digigate.schema_version (version) values (14);

create function digigate.company_board(_search text, _limit integer, _offset integer)
returns table (id uuid, name text, is_active boolean, clients bigint, sites bigint, gate_staff bigint, total bigint)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.is_active,
    (select count(*) from digigate.clients c where c.org_id = o.id),
    (select count(*) from digigate.sites s where s.org_id = o.id),
    (select count(*) from digigate.gate_users g where g.org_id = o.id),
    count(*) over ()
  from digigate.organisations o
  where (select digigate.is_super_user()) and (_search = '' or o.name ilike _search)
  order by o.name
  limit least(_limit, 100) offset _offset;
$$;

revoke all on function digigate.company_board(text, integer, integer) from public;
grant execute on function digigate.company_board(text, integer, integer) to authenticated;

commit;
