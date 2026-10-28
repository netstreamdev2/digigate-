-- Tenancy, gate devices, gate users and the append-only gate event log.
-- Every table carries org_id and has RLS on, deny by default; each table's policies sit right after it.
-- anon never needs these tables, so its default grants are revoked throughout.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Organisations, sites, gates -----------------------------------------------------------------

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null,
  site_type text not null check (site_type in ('hospital', 'estate')),
  utc_offset_minutes integer not null default 120,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sites_org_id_idx on public.sites (org_id);

create table public.gates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  name text not null,
  lane text not null check (lane in ('vehicle', 'pedestrian')),
  created_at timestamptz not null default now()
);
create index gates_site_id_idx on public.gates (site_id);

-- Dashboard members: security managers and admins, signed in with Supabase Auth --------------

create table public.org_members (
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('security_manager', 'admin')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_id_idx on public.org_members (user_id);

-- Devices: each paired DT50 has its own auth user, created by the pair-device Edge Function ---

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  gate_id uuid not null references public.gates (id) on delete cascade,
  name text not null,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  paired_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index devices_site_id_idx on public.devices (site_id);

-- One-time pairing codes. Only the SHA-256 of the code is stored, and only the Edge Function reads it.
create table public.device_pairing_codes (
  code_hash text primary key,
  org_id uuid not null references public.organisations (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Helpers for policies. Security definer so they can read devices / org_members without
-- tripping those tables' own policies. They live in the private schema, outside the API.

create or replace function private.member_org_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.org_members where user_id = (select auth.uid());
$$;

create or replace function private.device_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.devices where auth_user_id = (select auth.uid()) and revoked_at is null;
$$;

create or replace function private.device_site_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select site_id from public.devices where auth_user_id = (select auth.uid()) and revoked_at is null;
$$;

create or replace function private.device_org_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from public.devices where auth_user_id = (select auth.uid()) and revoked_at is null;
$$;

grant execute on function private.member_org_ids(), private.device_id(), private.device_site_id(), private.device_org_id()
  to authenticated;

-- Gate users: guards and supervisors. No Supabase Auth account; they sign in on the device with a
-- PIN checked against pin_hash ({ algorithm, iterations, salt, hash }), synced to their site's devices.

create table public.gate_users (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  role text not null check (role in ('guard', 'supervisor')),
  pin_hash jsonb not null check (pin_hash ? 'algorithm' and pin_hash ? 'iterations' and pin_hash ? 'salt' and pin_hash ? 'hash'),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (site_id, employee_number)
);

create trigger gate_users_touch_updated_at
  before update on public.gate_users
  for each row execute function private.touch_updated_at();

-- Gate events: append-only. id is the device's UUIDv7, so a retried upload is one row.
-- gate_user_id deliberately has no foreign key: the log must never reject an event because a
-- user was removed or hasn't synced yet, or the device's outbox would be stuck behind it.

create table public.gate_events (
  id uuid primary key,
  org_id uuid not null references public.organisations (id) on delete cascade,
  site_id uuid not null references public.sites (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  gate_user_id uuid,
  type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
create index gate_events_site_occurred_idx on public.gate_events (site_id, occurred_at desc);

-- received_at is the server's clock, whatever the device sends.
create or replace function private.stamp_received_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.received_at := now();
  return new;
end;
$$;

create trigger gate_events_stamp_received_at
  before insert on public.gate_events
  for each row execute function private.stamp_received_at();

-- Grants -----------------------------------------------------------------------------------------

revoke all on public.organisations, public.sites, public.gates, public.org_members, public.devices,
  public.device_pairing_codes, public.gate_users, public.gate_events from anon;
revoke all on public.device_pairing_codes from authenticated;
revoke update, delete, truncate on public.gate_events from authenticated, service_role;

-- Row level security -----------------------------------------------------------------------------

alter table public.organisations enable row level security;
create policy "Members read their organisations" on public.organisations
  for select to authenticated using (id in (select private.member_org_ids()));
create policy "Devices read their organisation" on public.organisations
  for select to authenticated using (id = (select private.device_org_id()));

alter table public.sites enable row level security;
create policy "Members read their sites" on public.sites
  for select to authenticated using (org_id in (select private.member_org_ids()));
create policy "Devices read their site" on public.sites
  for select to authenticated using (id = (select private.device_site_id()));

alter table public.gates enable row level security;
create policy "Members read their gates" on public.gates
  for select to authenticated using (org_id in (select private.member_org_ids()));
create policy "Devices read their site's gates" on public.gates
  for select to authenticated using (site_id = (select private.device_site_id()));

alter table public.org_members enable row level security;
create policy "Members read their own memberships" on public.org_members
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.devices enable row level security;
create policy "Members read their devices" on public.devices
  for select to authenticated using (org_id in (select private.member_org_ids()));
create policy "Devices read themselves" on public.devices
  for select to authenticated using (auth_user_id = (select auth.uid()) and revoked_at is null);

-- No policies: reachable only with the secret key (the pair-device Edge Function).
alter table public.device_pairing_codes enable row level security;

alter table public.gate_users enable row level security;
create policy "Members read their gate users" on public.gate_users
  for select to authenticated using (org_id in (select private.member_org_ids()));
create policy "Devices read their site's gate users" on public.gate_users
  for select to authenticated using (site_id = (select private.device_site_id()));

alter table public.gate_events enable row level security;
create policy "Members read their gate events" on public.gate_events
  for select to authenticated using (org_id in (select private.member_org_ids()));
create policy "Devices read their own events" on public.gate_events
  for select to authenticated using (device_id = (select private.device_id()));
create policy "Devices add their own events" on public.gate_events
  for insert to authenticated with check (
    device_id = (select private.device_id())
    and site_id = (select private.device_site_id())
    and org_id = (select private.device_org_id())
  );
