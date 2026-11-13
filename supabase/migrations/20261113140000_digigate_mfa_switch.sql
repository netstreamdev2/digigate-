-- MFA for dashboard sign-in becomes a switch, and it's off (the user's decision, 13 November, go-live day).
--
-- Until now every dashboard account had to pass an authenticator code before it could read anything. That rule lived
-- in digigate.mfa_passed(), which every permission check calls, in the dashboard's page guard, after sign-in, and in
-- the server functions. They all read this one switch now, so turning MFA back on is a single statement:
--
--   update digigate.platform_settings set require_mfa = true;
--
-- With it off, a password alone signs in. Anyone who has already set up an authenticator can still use it.

begin;

insert into digigate.schema_version (version) values (48);

create table digigate.platform_settings (
  only_row boolean primary key default true check (only_row),
  require_mfa boolean not null default false
);
insert into digigate.platform_settings (only_row, require_mfa) values (true, false);

alter table digigate.platform_settings enable row level security;
-- Nobody reads or changes it through the API: only through the functions below and a direct database statement.

create function digigate.mfa_required() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.require_mfa from digigate.platform_settings s where s.only_row), true);
$$;
revoke all on function digigate.mfa_required() from public;
grant execute on function digigate.mfa_required() to authenticated, service_role;

-- As before when MFA is required; with it off, a signed-in session is enough.
create or replace function digigate.mfa_passed() returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' or not digigate.mfa_required();
$$;

commit;
