-- DigiGate's database, in its own Supabase project.
--
-- Everything lives in the digigate schema rather than public. Supabase can grant new objects in public to every API
-- role by default; here nothing is reachable unless it's granted below, and every table has row level security on.

begin;

create schema digigate;
revoke all on schema digigate from public;
grant usage on schema digigate to authenticated, service_role;

create table digigate.schema_version (
  version integer primary key,
  applied_at timestamptz not null default now()
);
insert into digigate.schema_version (version) values (1);

-- Tenancy --------------------------------------------------------------------------------------------------------------

create table digigate.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Site type supplies the defaults, in code. `overrides` holds only what this site changes.
create table digigate.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  name text not null,
  site_type text not null check (site_type in ('hospital', 'estate')),
  overrides jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id)
);
create index sites_org on digigate.sites (org_id);

-- People who sign in to the dashboard, with email and MFA. Guards are not here: they work the gate app only.
create type digigate.dashboard_role as enum ('super_user', 'admin', 'manager', 'control_room', 'supervisor');

create table digigate.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references digigate.organisations (id),
  full_name text not null,
  roles digigate.dashboard_role[] not null check (cardinality(roles) > 0),
  site_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (org_id is not null or 'super_user' = any (roles))
);
create index profiles_org on digigate.profiles (org_id);

-- People who work the gate: employee number and a 6-digit PIN, no email and no login account. Devices hold these hashes
-- to work offline. `pin` is the record the gate app verifies: pbkdf2-sha256, iterations, salt, hash.
create table digigate.gate_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  site_ids uuid[] not null default '{}',
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  role text not null check (role in ('guard', 'supervisor')),
  pin jsonb not null,
  pin_set_at timestamptz not null default now(),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, employee_number)
);

-- A place a guard can be posted. Lanes decide what the gate app offers there; the location and radius are the geofence.
create table digigate.posts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  site_id uuid not null,
  code text not null,
  label text not null,
  lanes text[] not null check (cardinality(lanes) > 0 and lanes <@ array['vehicle', 'pedestrian']),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_m integer not null default 50 check (radius_m > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id, code),
  foreign key (site_id, org_id) references digigate.sites (id, org_id),
  check ((latitude is null) = (longitude is null))
);

-- Devices are not login accounts. Each holds a secret token, kept here only as a SHA-256 hash.
create table digigate.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  site_id uuid not null,
  name text not null,
  token_hash text not null unique,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (site_id, org_id) references digigate.sites (id, org_id)
);
create index devices_site on digigate.devices (site_id);

-- One-time codes shown as a QR in the dashboard. The code itself is never stored.
create table digigate.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  site_id uuid not null,
  device_name text not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  foreign key (site_id, org_id) references digigate.sites (id, org_id)
);

-- What happened at the gate --------------------------------------------------------------------------------------------
--
-- People's data is erased 3 years after a visit's exit, but audit events can never change. So each thing is split in
-- two when it arrives: a permanent row with nothing that identifies anyone, and a `_details` row that can be erased.

-- `id` is made on the device, so an upload retried after a timeout is still one event.
create table digigate.events (
  id uuid primary key,
  org_id uuid not null,
  site_id uuid not null references digigate.sites (id),
  device_id uuid not null references digigate.devices (id),
  type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  outcome text check (outcome in ('clear', 'warning', 'blocked')),
  rule_codes text[] not null default '{}',
  visit_id uuid,
  shift_id uuid
);
create index events_site_time on digigate.events (site_id, occurred_at desc);
create index events_visit on digigate.events (visit_id);

-- `erase_after` stays null while the visit is open: the clock starts at its exit.
create table digigate.event_details (
  event_id uuid primary key references digigate.events (id),
  org_id uuid not null,
  site_id uuid not null,
  gate_user_id uuid,
  visit_id uuid,
  payload jsonb not null,
  erase_after timestamptz
);
create index event_details_erase on digigate.event_details (erase_after);
create index event_details_visit on digigate.event_details (visit_id);

create table digigate.visits (
  id uuid primary key,
  org_id uuid not null,
  site_id uuid not null references digigate.sites (id),
  post text,
  kind text not null check (kind in ('vehicle', 'pedestrian')),
  visit_type text not null,
  entered_at timestamptz not null,
  exited_at timestamptz,
  occupants_in integer,
  occupants_out integer
);
create index visits_on_site on digigate.visits (site_id) where exited_at is null;
create index visits_site_time on digigate.visits (site_id, entered_at desc);

create table digigate.visit_details (
  visit_id uuid primary key references digigate.visits (id),
  org_id uuid not null,
  site_id uuid not null,
  person_key text not null,
  person_name text not null,
  vin text,
  plate text,
  disc_number text,
  vehicle_description text,
  erase_after timestamptz
);
create index visit_details_person on digigate.visit_details (person_key);
create index visit_details_vin on digigate.visit_details (vin);
create index visit_details_plate on digigate.visit_details (plate);
create index visit_details_erase on digigate.visit_details (erase_after);

-- Rule hits. `source` says who caught it: the device, or the server re-running the rules across every device.
create table digigate.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  site_id uuid not null references digigate.sites (id),
  rule_code text not null,
  severity text not null check (severity in ('red', 'amber', 'info')),
  source text not null check (source in ('device', 'server')),
  event_id uuid references digigate.events (id),
  visit_id uuid,
  raised_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  unique (event_id, rule_code, source)
);
create index alerts_open on digigate.alerts (site_id, raised_at desc) where status = 'open';

create table digigate.shifts (
  id uuid primary key,
  org_id uuid not null,
  site_id uuid not null references digigate.sites (id),
  device_id uuid not null references digigate.devices (id),
  gate_user_id uuid,
  post text not null,
  period text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  end_reason text check (end_reason in ('ended', 'handover', 'timed-out')),
  erase_after timestamptz
);
create index shifts_on_duty on digigate.shifts (site_id) where ended_at is null;
create index shifts_gate_user on digigate.shifts (gate_user_id);

-- The numbers behind the KPI charts. Counted as visits arrive, so they outlive the erasure of the people in them.
-- Sex and age band come from scanned documents only: passengers are a head count, so they never appear here.
create table digigate.daily_counts (
  site_id uuid not null references digigate.sites (id),
  org_id uuid not null,
  day date not null,
  kind text not null check (kind in ('vehicle', 'pedestrian')),
  visit_type text not null,
  sex text not null default 'unknown',
  age_band text not null default 'unknown',
  visits integer not null default 0,
  primary key (site_id, day, kind, visit_type, sex, age_band)
);

-- Who may see what -----------------------------------------------------------------------------------------------------

-- Every role must pass MFA before it sees any gate data.
create function digigate.mfa_passed() returns boolean
language sql stable set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create function digigate.is_super_user() returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.mfa_passed() and exists (
    select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active and 'super_user' = any (p.roles)
  );
$$;

-- Super users and the organisation's admins. Nobody else changes how an organisation is set up.
create function digigate.can_manage_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.is_super_user() or (digigate.mfa_passed() and exists (
    select 1 from digigate.profiles p
    where p.id = auth.uid() and p.is_active and p.org_id = _org and 'admin' = any (p.roles)
  ));
$$;

-- Super users see every site, admins their organisation's, everyone else the sites assigned to them.
create function digigate.visible_site_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not digigate.mfa_passed() or p.id is null then array[]::uuid[]
    when 'super_user' = any (p.roles) then array(select s.id from digigate.sites s)
    when 'admin' = any (p.roles) then array(select s.id from digigate.sites s where s.org_id = p.org_id)
    else p.site_ids
  end
  from (select 1) as one
  left join digigate.profiles p on p.id = auth.uid() and p.is_active;
$$;

create function digigate.in_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.mfa_passed() and exists (select 1 from digigate.profiles p where p.id = auth.uid() and p.is_active and p.org_id = _org);
$$;

revoke all on function digigate.mfa_passed() from public;
revoke all on function digigate.is_super_user() from public;
revoke all on function digigate.can_manage_org(uuid) from public;
revoke all on function digigate.visible_site_ids() from public;
revoke all on function digigate.in_org(uuid) from public;
grant execute on function digigate.mfa_passed() to authenticated;
grant execute on function digigate.is_super_user() to authenticated;
grant execute on function digigate.can_manage_org(uuid) to authenticated;
grant execute on function digigate.visible_site_ids() to authenticated;
grant execute on function digigate.in_org(uuid) to authenticated;

alter table digigate.schema_version enable row level security;
alter table digigate.organisations enable row level security;
alter table digigate.sites enable row level security;
alter table digigate.profiles enable row level security;
alter table digigate.gate_users enable row level security;
alter table digigate.posts enable row level security;
alter table digigate.devices enable row level security;
alter table digigate.pairing_codes enable row level security;
alter table digigate.events enable row level security;
alter table digigate.event_details enable row level security;
alter table digigate.visits enable row level security;
alter table digigate.visit_details enable row level security;
alter table digigate.alerts enable row level security;
alter table digigate.shifts enable row level security;
alter table digigate.daily_counts enable row level security;

create policy organisations_read on digigate.organisations for select to authenticated
  using ((select digigate.is_super_user()) or digigate.in_org(id));
create policy organisations_add on digigate.organisations for insert to authenticated
  with check ((select digigate.is_super_user()));
create policy organisations_change on digigate.organisations for update to authenticated
  using ((select digigate.is_super_user()))
  with check ((select digigate.is_super_user()));

create policy sites_read on digigate.sites for select to authenticated
  using (id = any ((select digigate.visible_site_ids())::uuid[]));
create policy sites_add on digigate.sites for insert to authenticated
  with check (digigate.can_manage_org(org_id));
create policy sites_change on digigate.sites for update to authenticated
  using (digigate.can_manage_org(org_id))
  with check (digigate.can_manage_org(org_id));

-- A profile can be read by its owner even before MFA, so the dashboard knows who to ask. It's written only by the
-- dashboard's server code, which is where roles are handed out: nobody can raise their own.
create policy profiles_read on digigate.profiles for select to authenticated
  using (id = auth.uid() or digigate.can_manage_org(org_id) or (select digigate.is_super_user()));

create policy gate_users_read on digigate.gate_users for select to authenticated
  using (digigate.can_manage_org(org_id));
create policy gate_users_add on digigate.gate_users for insert to authenticated
  with check (digigate.can_manage_org(org_id));
create policy gate_users_change on digigate.gate_users for update to authenticated
  using (digigate.can_manage_org(org_id))
  with check (digigate.can_manage_org(org_id));

create policy posts_read on digigate.posts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));
create policy posts_add on digigate.posts for insert to authenticated
  with check (digigate.can_manage_org(org_id));
create policy posts_change on digigate.posts for update to authenticated
  using (digigate.can_manage_org(org_id))
  with check (digigate.can_manage_org(org_id));

create policy devices_read on digigate.devices for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));
create policy devices_change on digigate.devices for update to authenticated
  using (digigate.can_manage_org(org_id))
  with check (digigate.can_manage_org(org_id));

create policy pairing_codes_add on digigate.pairing_codes for insert to authenticated
  with check (digigate.can_manage_org(org_id));

create policy events_read on digigate.events for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));

create policy alerts_read on digigate.alerts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));
create policy alerts_resolve on digigate.alerts for update to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]))
  with check (site_id = any ((select digigate.visible_site_ids())::uuid[]));

create policy shifts_read on digigate.shifts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));

create policy daily_counts_read on digigate.daily_counts for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[]));

-- schema_version, visits, event_details and visit_details have no policies: dashboards read visits through
-- digigate.visit_records, and everything else is written by the Edge Functions.

-- Column grants keep secrets out of reach even for rows a user may see: no token_hash, no PIN hash.
grant select on digigate.organisations to authenticated;
grant insert (name, slug) on digigate.organisations to authenticated;
grant update (name, is_active) on digigate.organisations to authenticated;
grant select on digigate.sites to authenticated;
grant insert (org_id, name, site_type, overrides) on digigate.sites to authenticated;
grant update (name, site_type, overrides, is_active, updated_at) on digigate.sites to authenticated;
grant select on digigate.profiles to authenticated;
grant select (id, org_id, site_ids, employee_number, first_name, last_name, role, pin_set_at, is_active, created_at) on digigate.gate_users to authenticated;
grant insert (org_id, site_ids, employee_number, first_name, last_name, role, pin) on digigate.gate_users to authenticated;
grant update (site_ids, first_name, last_name, role, pin, pin_set_at, is_active) on digigate.gate_users to authenticated;
grant select on digigate.posts to authenticated;
grant insert (org_id, site_id, code, label, lanes, latitude, longitude, radius_m) on digigate.posts to authenticated;
grant update (label, lanes, latitude, longitude, radius_m, is_active) on digigate.posts to authenticated;
grant select (id, org_id, site_id, name, paired_at, last_seen_at, revoked_at, revoked_by) on digigate.devices to authenticated;
grant update (name, revoked_at, revoked_by) on digigate.devices to authenticated;
grant insert (org_id, site_id, device_name, code_hash, expires_at) on digigate.pairing_codes to authenticated;
grant select on digigate.events to authenticated;
grant select on digigate.alerts to authenticated;
grant update (status, resolved_at, resolved_by, resolution) on digigate.alerts to authenticated;
grant select on digigate.shifts to authenticated;
grant select on digigate.daily_counts to authenticated;

-- The dashboard's server code and the Edge Functions. Nobody but the table owner can delete from a details table: only
-- the erasure function will.
grant select on digigate.schema_version to service_role;
grant select, insert, update on digigate.organisations to service_role;
grant select, insert, update on digigate.sites to service_role;
grant select, insert, update, delete on digigate.profiles to service_role;
grant select, insert, update on digigate.gate_users to service_role;
grant select, insert, update on digigate.posts to service_role;
grant select, insert, update on digigate.devices to service_role;
grant select, insert, update on digigate.pairing_codes to service_role;
grant select, insert on digigate.events to service_role;
grant select, insert on digigate.event_details to service_role;
grant update (erase_after) on digigate.event_details to service_role;
grant select, insert, update on digigate.visits to service_role;
grant select, insert on digigate.visit_details to service_role;
grant update (erase_after) on digigate.visit_details to service_role;
grant select, insert, update on digigate.alerts to service_role;
grant select, insert, update on digigate.shifts to service_role;
grant select, insert, update on digigate.daily_counts to service_role;

-- Events are append-only for everyone, even a key that bypasses row security.
create function digigate.forbid_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'digigate.events is append-only';
end;
$$;

create trigger events_append_only before update or delete on digigate.events
  for each row execute function digigate.forbid_change();
create trigger events_no_truncate before truncate on digigate.events
  for each statement execute function digigate.forbid_change();

-- Dashboard reads ------------------------------------------------------------------------------------------------------

-- ******989: only the last three characters.
create function digigate.mask(_value text) returns text
language sql immutable set search_path = ''
as $$
  select case when _value is null then null else repeat('*', greatest(length(_value) - 3, 3)) || right(_value, 3) end;
$$;
revoke all on function digigate.mask(text) from public;
grant execute on function digigate.mask(text) to authenticated;

-- A year in full, then masked. `details_erased` lets the dashboard say a record is gone: after 3 years an empty search
-- proves nothing about whether someone was here. This view runs as its owner, so its own WHERE is the access check.
create view digigate.visit_records as
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

grant select on digigate.visit_records to authenticated;

commit;
