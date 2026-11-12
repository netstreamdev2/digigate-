-- Finding whose PIN to reset (migration 45), by employee number or name.
--
-- A company's control room and managers can reset a forgotten PIN but can't read the guard list itself, which is an
-- admin's. This gives them only what finding someone needs: name, employee number, role and company. No records, no
-- PIN hashes, and nobody from a company they don't watch.

begin;

insert into digigate.schema_version (version) values (46);

create function digigate.find_gate_staff(_search text)
returns table (id uuid, first_name text, last_name text, employee_number text, role text, company text)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.first_name, g.last_name, g.employee_number, g.role, o.name
  from digigate.gate_users g
  join digigate.organisations o on o.id = g.org_id
  where g.is_active
    and digigate.can_watch_org(g.org_id)
    and not digigate.org_suspended(g.org_id)
    and char_length(trim(_search)) >= 2
    and (
      g.employee_number like trim(_search) || '%'
      or (g.first_name || ' ' || g.last_name) ilike '%' || replace(replace(replace(trim(_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
  order by g.employee_number = trim(_search) desc, g.first_name, g.last_name
  limit 8;
$$;
revoke all on function digigate.find_gate_staff(text) from public;
grant execute on function digigate.find_gate_staff(text) to authenticated;

commit;
