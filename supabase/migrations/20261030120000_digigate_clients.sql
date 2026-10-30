-- Security companies rent DigiGate, and their clients (a hospital, an estate) hire them. An organisation is the
-- security company; a client owns its sites and its records. If a client changes security company the records stay
-- with the client: the old company loses access, and the new one sees only what it recorded itself.

-- Anything here that names the new role compares it as text: an enum value can't be used in the batch that adds it.
alter type digigate.dashboard_role add value if not exists 'client_viewer';

begin;

insert into digigate.schema_version (version) values (3);

create table digigate.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, org_id)
);
create index clients_org on digigate.clients (org_id);

-- Which security company served each client, and when.
create table digigate.engagements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references digigate.clients (id),
  org_id uuid not null references digigate.organisations (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index engagements_current on digigate.engagements (client_id) where ended_at is null;

create function digigate.record_engagement() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update digigate.engagements set ended_at = now() where client_id = new.id and ended_at is null;
  insert into digigate.engagements (client_id, org_id) values (new.id, new.org_id);
  return new;
end;
$$;
revoke all on function digigate.record_engagement() from public;

create trigger clients_engaged after insert on digigate.clients
  for each row execute function digigate.record_engagement();
create trigger clients_moved after update of org_id on digigate.clients
  for each row when (old.org_id is distinct from new.org_id) execute function digigate.record_engagement();

-- Anything set up before this level existed becomes a client of its own.
alter table digigate.sites add column client_id uuid;
do $$
declare
  _site record;
  _client uuid;
begin
  for _site in select id, org_id, name from digigate.sites loop
    insert into digigate.clients (org_id, name) values (_site.org_id, _site.name) returning id into _client;
    update digigate.sites set client_id = _client where id = _site.id;
  end loop;
end;
$$;
alter table digigate.sites alter column client_id set not null;

-- Moving a client updates its company in one place and that carries down to its sites, posts and devices. Events,
-- visits and alerts are not linked this way on purpose: each keeps the company that recorded it.
alter table digigate.sites
  add constraint sites_client_org_fkey foreign key (client_id, org_id) references digigate.clients (id, org_id) on update cascade;
alter table digigate.posts
  drop constraint posts_site_id_org_id_fkey,
  add constraint posts_site_id_org_id_fkey foreign key (site_id, org_id) references digigate.sites (id, org_id) on update cascade;
alter table digigate.devices
  drop constraint devices_site_id_org_id_fkey,
  add constraint devices_site_id_org_id_fkey foreign key (site_id, org_id) references digigate.sites (id, org_id) on update cascade;
alter table digigate.pairing_codes
  drop constraint pairing_codes_site_id_org_id_fkey,
  add constraint pairing_codes_site_id_org_id_fkey foreign key (site_id, org_id) references digigate.sites (id, org_id) on update cascade;

-- A client viewer belongs to a client, not a security company.
alter table digigate.profiles add column client_id uuid references digigate.clients (id);
alter table digigate.profiles drop constraint profiles_check;
alter table digigate.profiles add constraint profiles_belongs_somewhere
  check (org_id is not null or client_id is not null or 'super_user' = any (roles));

-- Who may see what ------------------------------------------------------------------------------------------------------

-- Super users see every site, client viewers their client's, admins their company's, and everyone else the sites
-- assigned to them that their company still serves: a list left over from a lost client opens nothing.
create or replace function digigate.visible_site_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not digigate.mfa_passed() or p.id is null then array[]::uuid[]
    when 'super_user' = any (p.roles) then array(select s.id from digigate.sites s)
    when 'client_viewer' = any (p.roles::text[]) then array(select s.id from digigate.sites s where s.client_id = p.client_id)
    when 'admin' = any (p.roles) then array(select s.id from digigate.sites s where s.org_id = p.org_id)
    else array(select s.id from digigate.sites s where s.org_id = p.org_id and s.id = any (p.site_ids))
  end
  from (select 1) as one
  left join digigate.profiles p on p.id = auth.uid() and p.is_active;
$$;

-- The company whose records this person may see. Null for super users and client viewers, who see every record at
-- their sites whoever made it. This is what keeps a new company out of its predecessor's history.
create function digigate.viewer_org() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.org_id from digigate.profiles p where p.id = auth.uid() and p.is_active and not ('super_user' = any (p.roles));
$$;

create function digigate.viewer_client() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.client_id from digigate.profiles p where digigate.mfa_passed() and p.id = auth.uid() and p.is_active;
$$;

-- Only a super user moves a client. The old company's handhelds stop at once and its unused pairing codes go.
create function digigate.transfer_client(_client uuid, _new_org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not digigate.is_super_user() then
    raise exception 'Only a super user can move a client.' using errcode = '42501';
  end if;
  update digigate.devices d
  set revoked_at = now(), revoked_by = auth.uid()
  from digigate.sites s
  where s.id = d.site_id and s.client_id = _client and d.revoked_at is null;
  delete from digigate.pairing_codes c using digigate.sites s where s.id = c.site_id and s.client_id = _client;
  update digigate.clients set org_id = _new_org where id = _client;
end;
$$;

revoke all on function digigate.viewer_org() from public;
revoke all on function digigate.viewer_client() from public;
revoke all on function digigate.transfer_client(uuid, uuid) from public;
grant execute on function digigate.viewer_org() to authenticated;
grant execute on function digigate.viewer_client() to authenticated;
grant execute on function digigate.transfer_client(uuid, uuid) to authenticated;

alter table digigate.clients enable row level security;
alter table digigate.engagements enable row level security;

create policy clients_read on digigate.clients for select to authenticated
  using ((select digigate.is_super_user()) or digigate.in_org(org_id) or id = (select digigate.viewer_client()));
create policy clients_add on digigate.clients for insert to authenticated
  with check (digigate.can_manage_org(org_id));
create policy clients_change on digigate.clients for update to authenticated
  using (digigate.can_manage_org(org_id))
  with check (digigate.can_manage_org(org_id));

create policy engagements_read on digigate.engagements for select to authenticated
  using ((select digigate.is_super_user()) or digigate.can_manage_org(org_id) or client_id = (select digigate.viewer_client()));

-- Gate records: the site must be visible, and a security company sees only what it recorded itself.
drop policy events_read on digigate.events;
create policy events_read on digigate.events for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or org_id = (select digigate.viewer_org())));

drop policy shifts_read on digigate.shifts;
create policy shifts_read on digigate.shifts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or org_id = (select digigate.viewer_org())));

drop policy daily_counts_read on digigate.daily_counts;
create policy daily_counts_read on digigate.daily_counts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or org_id = (select digigate.viewer_org())));

drop policy alerts_read on digigate.alerts;
create policy alerts_read on digigate.alerts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or org_id = (select digigate.viewer_org())));

-- Client viewers read; only the security company on the job, or a super user, can close an alert.
drop policy alerts_resolve on digigate.alerts;
create policy alerts_resolve on digigate.alerts for update to authenticated
  using ((select digigate.is_super_user())
    or (site_id = any ((select digigate.visible_site_ids())::uuid[]) and org_id = (select digigate.viewer_org())))
  with check ((select digigate.is_super_user())
    or (site_id = any ((select digigate.visible_site_ids())::uuid[]) and org_id = (select digigate.viewer_org())));

create or replace view digigate.visit_records as
with shown as (
  select
    v.*,
    d.visit_id is null as details_erased,
    d.person_name,
    d.vin,
    d.plate,
    d.disc_number,
    d.vehicle_description,
    coalesce(v.exited_at, v.entered_at) > now() - interval '365 days' as in_full
  from digigate.visits v
  left join digigate.visit_details d on d.visit_id = v.id
  where v.site_id = any (digigate.visible_site_ids())
    and (digigate.viewer_org() is null or v.org_id = digigate.viewer_org())
)
select
  id,
  org_id,
  site_id,
  post,
  kind,
  visit_type,
  entered_at,
  exited_at,
  occupants_in,
  occupants_out,
  details_erased,
  in_full,
  case when in_full then person_name else digigate.mask(person_name) end as person_name,
  case when in_full then vin else digigate.mask(vin) end as vin,
  case when in_full then plate else digigate.mask(plate) end as plate,
  case when in_full then disc_number else digigate.mask(disc_number) end as disc_number,
  case when in_full then vehicle_description else digigate.mask(vehicle_description) end as vehicle_description
from shown;

grant select on digigate.clients to authenticated;
grant insert (org_id, name) on digigate.clients to authenticated;
grant update (name, is_active) on digigate.clients to authenticated;
grant select on digigate.engagements to authenticated;
grant insert (client_id) on digigate.sites to authenticated;
grant select, insert, update on digigate.clients to service_role;
grant select on digigate.engagements to service_role;

commit;
