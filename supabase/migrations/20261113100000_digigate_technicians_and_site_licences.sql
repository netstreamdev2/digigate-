-- 47: DigiGate technicians and requests for a new site's licence.
-- The new enum is compared as text throughout this migration, including in constraints.
alter type digigate.dashboard_role add value if not exists 'technician';

begin;
insert into digigate.schema_version (version) values (47);

alter table digigate.profiles drop constraint profiles_belongs_somewhere;
alter table digigate.profiles add constraint profiles_belongs_somewhere check (
  org_id is not null or client_id is not null or roles::text[] && array['super_user', 'technician']
);

-- Do not broaden is_super_user: it still protects commercial decisions and device release.
create function digigate.is_digigate_staff() returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.mfa_passed() and exists (
    select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active
      and p.roles::text[] && array['super_user', 'technician']
  );
$$;
revoke all on function digigate.is_digigate_staff() from public;
grant execute on function digigate.is_digigate_staff() to authenticated;

create or replace function digigate.visible_site_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not digigate.mfa_passed() or p.id is null then array[]::uuid[]
    when p.roles::text[] && array['super_user', 'technician'] then array(select s.id from digigate.sites s)
    when 'client_viewer' = any (p.roles::text[]) then array(select s.id from digigate.sites s where s.client_id = p.client_id and not digigate.org_suspended(s.org_id))
    when 'admin' = any (p.roles) then array(select s.id from digigate.sites s where s.org_id = p.org_id and not digigate.org_suspended(s.org_id))
    when p.roles::text[] <@ array['host'] then array[]::uuid[]
    else array(select s.id from digigate.sites s where s.org_id = p.org_id and s.id = any (p.site_ids) and not digigate.org_suspended(s.org_id))
  end
  from (select 1) as one
  left join digigate.profiles p on p.id = auth.uid() and p.is_active;
$$;

create or replace function digigate.viewer_org() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.org_id from digigate.profiles p where p.id = auth.uid() and p.is_active
    and not (p.roles::text[] && array['super_user', 'technician']);
$$;

-- Audited function-by-function against schema 46. Rebind only these existing permission checks, keeping their
-- queries, limits, masking, validation and audit writes intact. Fail if a listed signature/check has drifted.
-- This deliberately excludes transfer_client, set_company_suspended and request_device_release.
do $$
declare
  _signature text;
  _definition text;
begin
  foreach _signature in array array[
    'digigate.can_manage_org(uuid)',
    'digigate.can_watch_org(uuid)',
    'digigate.people_board(text,text,text,boolean,integer,integer,uuid)',
    'digigate.people_counts(text,uuid)',
    'digigate.gate_staff_board(text,text,text,boolean,integer,integer,uuid)',
    'digigate.gate_staff_counts(text,uuid)',
    'digigate.company_board(text,integer,integer)',
    'digigate.report_board(date,text,integer,integer)',
    'digigate.report_day_totals(date)',
    'digigate.set_device_plan(uuid,text,integer,smallint)',
    'digigate.health_for_viewer(jsonb)',
    'digigate.device_board(text,text,integer,integer,uuid)',
    'digigate.device_detail(uuid)',
    'digigate.device_data(uuid,integer)',
    'digigate.device_story(uuid,integer,timestamp with time zone)',
    'digigate.request_device_command(uuid,text,jsonb)'
  ] loop
    select pg_get_functiondef(_signature::regprocedure) into _definition;
    if position('digigate.is_super_user()' in _definition) = 0 then
      raise exception 'Expected permission check missing in %', _signature;
    end if;
    execute replace(_definition, 'digigate.is_super_user()', 'digigate.is_digigate_staff()');
  end loop;
end;
$$;

alter policy organisations_read on digigate.organisations
  using ((select digigate.is_digigate_staff()) or digigate.in_org(id));
alter policy clients_read on digigate.clients
  using ((select digigate.is_digigate_staff()) or digigate.in_org(org_id) or id = (select digigate.viewer_client()));
alter policy alerts_resolve on digigate.alerts
  using ((select digigate.is_digigate_staff()) or (site_id = any ((select digigate.visible_site_ids())::uuid[]) and org_id = (select digigate.viewer_org())))
  with check ((select digigate.is_digigate_staff()) or (site_id = any ((select digigate.visible_site_ids())::uuid[]) and org_id = (select digigate.viewer_org())));
alter policy audit_log_read on digigate.audit_log
  using ((select digigate.is_digigate_staff()) or org_id = (select digigate.admin_org()));
alter policy device_commands_read on digigate.device_commands
  using ((select digigate.is_digigate_staff()));

-- Admins request licences. Only super users create the client/site pair, including through direct table inserts.
alter policy clients_add on digigate.clients with check ((select digigate.is_super_user()));
alter policy sites_add on digigate.sites with check ((select digigate.is_super_user()));

create table digigate.site_licence_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  site_name text not null check (char_length(site_name) between 1 and 120),
  site_type text not null check (site_type in ('hospital', 'estate')),
  note text not null default '' check (char_length(note) <= 500),
  requested_by uuid not null references digigate.profiles (id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'fulfilled', 'declined')),
  resolved_by uuid references digigate.profiles (id),
  resolved_at timestamptz,
  site_id uuid references digigate.sites (id),
  check ((status = 'pending' and resolved_by is null and resolved_at is null and site_id is null)
    or (status = 'declined' and resolved_by is not null and resolved_at is not null and site_id is null)
    or (status = 'fulfilled' and resolved_by is not null and resolved_at is not null and site_id is not null))
);
create unique index site_licence_requests_one_pending on digigate.site_licence_requests (org_id, lower(site_name)) where status = 'pending';
create index site_licence_requests_queue on digigate.site_licence_requests (status, requested_at desc);
create index site_licence_requests_company on digigate.site_licence_requests (org_id, requested_at desc);
alter table digigate.site_licence_requests enable row level security;
create policy site_licence_requests_read on digigate.site_licence_requests for select to authenticated
  using ((select digigate.is_digigate_staff()) or org_id = (select digigate.admin_org()));
grant select on digigate.site_licence_requests to authenticated;

create function digigate.request_site_licence(_org uuid, _name text, _site_type text, _note text default '') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _id uuid;
  _name_clean text := trim(coalesce(_name, ''));
begin
  if not digigate.mfa_passed() or digigate.org_suspended(_org) or not exists (
    select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active and p.org_id = _org and 'admin' = any (p.roles)
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if char_length(_name_clean) not between 1 and 120 or coalesce(_site_type, '') not in ('hospital', 'estate')
    or char_length(coalesce(_note, '')) > 500 then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  insert into digigate.site_licence_requests (org_id, site_name, site_type, note, requested_by)
  values (_org, _name_clean, _site_type, trim(coalesce(_note, '')), auth.uid())
  on conflict (org_id, lower(site_name)) where status = 'pending' do nothing
  returning id into _id;
  if _id is null then
    select r.id into _id from digigate.site_licence_requests r where r.org_id = _org and lower(r.site_name) = lower(_name_clean) and r.status = 'pending';
    if _id is null then
      raise exception 'request changed, try again' using errcode = '40001';
    end if;
  else
    perform digigate.write_audit(_org, null, null, 'setup', 'site_licence.requested', auth.uid(),
      (select p.full_name from digigate.profiles p where p.id = auth.uid()), _id::text, null);
  end if;
  return _id;
end;
$$;
revoke all on function digigate.request_site_licence(uuid, text, text, text) from public;
grant execute on function digigate.request_site_licence(uuid, text, text, text) to authenticated;

create function digigate.decline_site_licence(_request uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
begin
  if not digigate.is_super_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update digigate.site_licence_requests set status = 'declined', resolved_by = auth.uid(), resolved_at = now()
  where id = _request and status = 'pending' returning org_id into _org;
  if not found then
    raise exception 'request not pending' using errcode = '22023';
  end if;
  perform digigate.write_audit(_org, null, null, 'setup', 'site_licence.declined', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), _request::text, null);
end;
$$;
revoke all on function digigate.decline_site_licence(uuid) from public;
grant execute on function digigate.decline_site_licence(uuid) to authenticated;

-- The licence request is optional for a super user creating a site directly. When supplied, lock it and fulfil it
-- in the same transaction as the site and access points: two operators cannot fulfil the same request twice.
create or replace function digigate.create_site(_org uuid, _site jsonb, _access_points jsonb, _client uuid default null) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  _client_id uuid := _client;
  _site_id uuid;
  _point jsonb;
  _request uuid := nullif(_site ->> 'licenceRequestId', '')::uuid;
begin
  if not digigate.is_super_user() then
    raise exception 'A new site needs a DigiGate licence.' using errcode = '42501';
  end if;
  -- Request completion runs through a restricted definer function after the site is created. The advisory lock
  -- serialises two wizards using this request, without granting dashboard users direct UPDATE on the queue.
  if _request is not null then
    perform pg_advisory_xact_lock(hashtextextended(_request::text, 0));
    if not exists (select 1 from digigate.site_licence_requests r where r.id = _request and r.org_id = _org and r.status = 'pending') then
      raise exception 'request not pending' using errcode = '22023';
    end if;
  end if;
  if jsonb_typeof(_access_points) is distinct from 'array' or jsonb_array_length(_access_points) not between 1 and 30 then
    raise exception 'A site needs between 1 and 30 access points.' using errcode = '22023';
  end if;
  if _client_id is null then
    insert into digigate.clients (org_id, name) values (_org, _site ->> 'name') returning id into _client_id;
  else
    if exists (select 1 from digigate.sites s where s.client_id = _client_id) then
      raise exception 'That place is set up already.' using errcode = '23514';
    end if;
    update digigate.clients set name = _site ->> 'name' where id = _client_id and org_id = _org;
    if not found then
      raise exception 'That place is not part of this company.' using errcode = '42501';
    end if;
  end if;
  insert into digigate.sites (org_id, client_id, name, site_type, code, address, latitude, longitude, radius_m, open_parking, parking_spaces)
  values (_org, _client_id, _site ->> 'name', _site ->> 'siteType', nullif(_site ->> 'code', ''), nullif(_site ->> 'address', ''),
    (_site ->> 'latitude')::double precision, (_site ->> 'longitude')::double precision, (_site ->> 'radiusM')::integer,
    coalesce((_site ->> 'openParking')::boolean, true), (_site ->> 'parkingSpaces')::integer)
  returning id into _site_id;
  for _point in select value from jsonb_array_elements(_access_points) loop
    insert into digigate.posts (org_id, site_id, code, label, lanes, latitude, longitude, radius_m, gate_type, booms, manned, cctv_cameras, anpr)
    values (_org, _site_id, digigate.post_code_for(_site_id, _point ->> 'label'), _point ->> 'label',
      array(select jsonb_array_elements_text(_point -> 'lanes')),
      (_point ->> 'latitude')::double precision, (_point ->> 'longitude')::double precision,
      coalesce((_point ->> 'radiusM')::integer, 50), coalesce(_point ->> 'gateType', 'main'),
      array(select jsonb_array_elements_text(coalesce(_point -> 'booms', '[]'))),
      coalesce((_point ->> 'manned')::boolean, true), coalesce((_point ->> 'cctvCameras')::integer, 0), coalesce((_point ->> 'anpr')::boolean, false));
  end loop;
  if _request is not null then
    perform digigate.fulfil_site_licence(_request, _site_id);
  end if;
  return _site_id;
end;
$$;

create function digigate.fulfil_site_licence(_request uuid, _site uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
begin
  if not digigate.is_super_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update digigate.site_licence_requests r set status = 'fulfilled', resolved_by = auth.uid(), resolved_at = now(), site_id = s.id
  from digigate.sites s where r.id = _request and r.status = 'pending' and s.id = _site and s.org_id = r.org_id
  returning r.org_id into _org;
  if not found then
    raise exception 'request not pending or site does not match' using errcode = '22023';
  end if;
  perform digigate.write_audit(_org, _site, null, 'setup', 'site_licence.fulfilled', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), _request::text, null);
end;
$$;
revoke all on function digigate.fulfil_site_licence(uuid, uuid) from public;
grant execute on function digigate.fulfil_site_licence(uuid, uuid) to authenticated;

commit;
