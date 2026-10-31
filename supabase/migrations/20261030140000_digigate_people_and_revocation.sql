-- Two things: telling a handheld it has been revoked so it can clear itself, and what the People page needs.

begin;

insert into digigate.schema_version (version) values (5);

-- Only this makes a handheld wipe itself. An unknown token isn't enough: a mistake on the server must never be able to
-- empty the devices at a working gate.
create function digigate.token_is_revoked(_token_hash text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from digigate.devices d where d.token_hash = _token_hash and d.revoked_at is not null);
$$;
revoke all on function digigate.token_is_revoked(text) from public;
grant execute on function digigate.token_is_revoked(text) to service_role;

-- What a person signs in with: a username, or an email for people who have a real one.
alter table digigate.profiles add column login text;
update digigate.profiles p
set login = regexp_replace(u.email, '@digigate\.local$', '')
from auth.users u
where u.id = p.id;
alter table digigate.profiles alter column login set not null;
alter table digigate.profiles add constraint profiles_login_unique unique (login);

-- Admins also see the view-only logins of their company's own clients.
drop policy profiles_read on digigate.profiles;
create policy profiles_read on digigate.profiles for select to authenticated
  using (
    id = auth.uid()
    or digigate.can_manage_org(org_id)
    or (select digigate.is_super_user())
    or exists (select 1 from digigate.clients c where c.id = client_id and digigate.can_manage_org(c.org_id))
  );

commit;
