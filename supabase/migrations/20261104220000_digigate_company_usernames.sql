-- Usernames that belong to a company, the way an email address belongs to a domain. Each company gets a short code
-- from its name (Fire Security is fire), and its people sign in as name@code: lucy@fire and lucy@lion are two people,
-- and one company's admin never learns that another company has a Lucy. Super users belong to no company and keep
-- their plain usernames. A client's view-only login takes its company's code when it's made.
--
-- Behind each username is a Supabase account whose email is on a private domain: name@code.digigate.local for a
-- company's people, name@digigate.local as before for super users. Moving an existing login to its company's code
-- changes that email and nothing else: the password, the authenticator, the roles and every record stay as they were.

begin;

insert into digigate.schema_version (version) values (28);

alter table digigate.organisations add column code text unique check (code ~ '^[a-z0-9]{2,16}$');

-- The first word of the name, made lowercase and plain, with a number added if another company has it already.
create function digigate.free_company_code(_name text) returns text
language plpgsql stable set search_path = ''
as $$
declare
  _base text := left(regexp_replace(lower(split_part(trim(coalesce(_name, '')), ' ', 1)), '[^a-z0-9]', '', 'g'), 16);
  _candidate text;
  _n integer := 2;
begin
  if length(_base) < 2 then
    _base := left(regexp_replace(lower(coalesce(_name, '')), '[^a-z0-9]', '', 'g'), 16);
  end if;
  if length(_base) < 2 then
    _base := 'company';
  end if;
  _candidate := _base;
  while exists (select 1 from digigate.organisations o where o.code = _candidate) loop
    _candidate := left(_base, 16 - length(_n::text)) || _n;
    _n := _n + 1;
  end loop;
  return _candidate;
end;
$$;
revoke all on function digigate.free_company_code(text) from public;

do $$
declare
  _org record;
begin
  for _org in select id, name from digigate.organisations order by created_at loop
    update digigate.organisations set code = digigate.free_company_code(_org.name) where id = _org.id;
  end loop;
end;
$$;
-- Nobody sends a code when adding a company: it starts empty and the trigger below fills it in.
alter table digigate.organisations alter column code set not null;
alter table digigate.organisations alter column code set default '';

-- A new company gets its code as it's added. It runs as its owner: finding a free code has to see every company's,
-- not only the ones the person adding it can see.
create function digigate.organisation_code() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if coalesce(new.code, '') = '' then
    new.code := digigate.free_company_code(new.name);
  end if;
  return new;
end;
$$;
revoke all on function digigate.organisation_code() from public;
create trigger organisations_code before insert on digigate.organisations
  for each row execute function digigate.organisation_code();

-- Moves every company login still on a plain username to name@code, its account's email with it. Runs again safely:
-- a login already moved, a super user's or a real email address is left as it is. Returns how many moved.
create function digigate.scope_logins() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  _moved integer;
begin
  create temporary table _moving on commit drop as
    select p.id, p.login as old_login, p.login || '@' || o.code as new_login, p.login || '@' || o.code || '.digigate.local' as new_email,
      p.login || '@digigate.local' as old_email
    from digigate.profiles p
    left join digigate.clients c on c.id = p.client_id
    join digigate.organisations o on o.id = coalesce(p.org_id, c.org_id)
    where p.login is not null and p.login !~ '@' and not ('super_user' = any (p.roles));

  update auth.users u set email = m.new_email from _moving m where u.id = m.id and lower(u.email) = m.old_email;
  if to_regclass('auth.identities') is not null then
    execute $sql$
      update auth.identities i set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(m.new_email))
      from _moving m where i.user_id = m.id and i.provider = 'email'
    $sql$;
  end if;
  update digigate.profiles p set login = m.new_login from _moving m where p.id = m.id;
  get diagnostics _moved = row_count;
  return _moved;
end;
$$;
revoke all on function digigate.scope_logins() from public;

select digigate.scope_logins();

commit;
