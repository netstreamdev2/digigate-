-- Who controls a handheld, and a company that doesn't pay (the user's decisions of 2026-11-12).
--
-- 1. Release is for super users only. Nobody at a site can take a handheld out of DigiGate's control: there is no
--    button on the handheld any more. A super user asks for it from the dashboard; the handheld releases itself at its
--    next sync and says so, which clears the request. Audited both ways.
-- 2. A super user can suspend a company, with a reason. Its dashboard logins then see no sites and can change nothing
--    (visible_site_ids, in_org, can_manage_org), and are shown why; its handhelds stop at their next sync, though what
--    they recorded still uploads; its hosts can't invite. Reinstating brings all of it back.
-- 3. A handheld's details are a super user's to see. A company's own people (admins, managers, the control room, a
--    client's login) see its battery, network and location only: no data use, SIM, bundle, lock state or story.

begin;

insert into digigate.schema_version (version) values (44);

alter table digigate.organisations
  add column suspended_at timestamptz,
  add column suspended_reason text check (char_length(suspended_reason) <= 300),
  add column suspended_by uuid;

alter table digigate.devices
  add column release_requested_at timestamptz,
  add column release_requested_by uuid;

create function digigate.org_suspended(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from digigate.organisations o where o.id = _org and o.suspended_at is not null);
$$;
revoke all on function digigate.org_suspended(uuid) from public;
grant execute on function digigate.org_suspended(uuid) to authenticated, service_role;

-- As before, but a suspended company's sites are visible to nobody except super users.
create or replace function digigate.visible_site_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select case
    when not digigate.mfa_passed() or p.id is null then array[]::uuid[]
    when 'super_user' = any (p.roles) then array(select s.id from digigate.sites s)
    when 'client_viewer' = any (p.roles::text[]) then array(select s.id from digigate.sites s where s.client_id = p.client_id and not digigate.org_suspended(s.org_id))
    when 'admin' = any (p.roles) then array(select s.id from digigate.sites s where s.org_id = p.org_id and not digigate.org_suspended(s.org_id))
    when p.roles::text[] <@ array['host'] then array[]::uuid[]
    else array(select s.id from digigate.sites s where s.org_id = p.org_id and s.id = any (p.site_ids) and not digigate.org_suspended(s.org_id))
  end
  from (select 1) as one
  left join digigate.profiles p on p.id = auth.uid() and p.is_active;
$$;

create or replace function digigate.in_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.mfa_passed() and not digigate.org_suspended(_org) and exists (
    select 1 from digigate.profiles p
    where p.id = auth.uid() and p.is_active and p.org_id = _org and not (p.roles::text[] <@ array['host'])
  );
$$;

create or replace function digigate.can_manage_org(_org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select digigate.is_super_user() or (digigate.mfa_passed() and not digigate.org_suspended(_org) and exists (
    select 1 from digigate.profiles p
    where p.id = auth.uid() and p.is_active and p.org_id = _org and 'admin' = any (p.roles)
  ));
$$;

-- Suspending or reinstating a company: super users only, with a reason, in the audit log.
create function digigate.set_company_suspended(_org uuid, _suspended boolean, _reason text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _name text;
begin
  if not (digigate.is_super_user() and digigate.mfa_passed()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if _suspended and nullif(trim(coalesce(_reason, '')), '') is null then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  update digigate.organisations
  set suspended_at = case when _suspended then coalesce(suspended_at, now()) end,
    suspended_reason = case when _suspended then left(trim(_reason), 300) end,
    suspended_by = case when _suspended then auth.uid() end
  where id = _org
  returning name into _name;
  if _name is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  perform digigate.write_audit(_org, null, null, 'setup', case when _suspended then 'company.suspended' else 'company.reinstated' end, auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), _name, case when _suspended then left(trim(_reason), 300) end);
end;
$$;
revoke all on function digigate.set_company_suspended(uuid, boolean, text) from public;
grant execute on function digigate.set_company_suspended(uuid, boolean, text) to authenticated;

-- Whether the signed-in person's company is suspended, and why, so the dashboard can say so instead of looking empty.
create function digigate.my_company_status() returns table (suspended boolean, reason text, company text)
language sql stable security definer set search_path = ''
as $$
  select o.suspended_at is not null, o.suspended_reason, o.name
  from digigate.profiles p
  left join digigate.clients c on c.id = p.client_id
  join digigate.organisations o on o.id = coalesce(p.org_id, c.org_id)
  where p.id = auth.uid() and p.is_active;
$$;
revoke all on function digigate.my_company_status() from public;
grant execute on function digigate.my_company_status() to authenticated;

-- Releasing a handheld: asked for by a super user, done by the handheld at its next sync.
create function digigate.request_device_release(_device uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _row digigate.devices;
begin
  if not (digigate.is_super_user() and digigate.mfa_passed()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update digigate.devices set release_requested_at = now(), release_requested_by = auth.uid()
  where id = _device and revoked_at is null
  returning * into _row;
  if _row.id is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  perform digigate.write_audit(_row.org_id, _row.site_id, _row.id, 'devices', 'device.release_requested', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), _row.name, null);
end;
$$;
revoke all on function digigate.request_device_release(uuid) from public;
grant execute on function digigate.request_device_release(uuid) to authenticated;

-- As before, and a release the handheld carried out clears the request, so a handheld set up again stays put.
create or replace function digigate.check_handheld_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _event digigate.events;
  _rule text;
begin
  select e.* into _event from digigate.events e where e.id = new.event_id;
  if _event.type = 'handheld_released' then
    _rule := 'HANDHELD_RELEASED';
    perform digigate.audit_gate_event(new.org_id, new.site_id, _event.device_id, new.gate_user_id, 'handheld_released', _event.occurred_at, new.payload);
    if (new.payload ->> 'released')::boolean then
      update digigate.devices set release_requested_at = null, release_requested_by = null where id = _event.device_id;
    end if;
  elsif _event.type = 'device_status' then
    _rule := case new.payload ->> 'status'
      when 'sim_removed' then 'SIM_REMOVED'
      when 'data_off' then 'MOBILE_DATA_OFF'
      when 'airplane_on' then 'AIRPLANE_MODE_ON'
      when 'app_closed' then case when new.payload ->> 'reason' = 'by_user' then 'DIGIGATE_CLOSED' end
    end;
  end if;
  if _rule is not null then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, raised_at, status)
    values (new.org_id, new.site_id, _rule, 'amber', 'device', new.event_id, _event.occurred_at, 'open')
    on conflict (event_id, rule_code, source) do nothing;
  end if;
  return null;
end;
$$;

-- A SIM's number and bundle are a super user's to set, through this only.
revoke update (sim_number, data_bundle_mb, data_renews_day) on digigate.devices from authenticated;

-- Anything left out is cleared.
create function digigate.set_device_plan(_device uuid, _sim_number text default null, _bundle_mb integer default null, _renews_day smallint default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (digigate.is_super_user() and digigate.mfa_passed()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update digigate.devices set sim_number = _sim_number, data_bundle_mb = _bundle_mb, data_renews_day = _renews_day
  where id = _device;
  if not found then
    raise exception 'not found' using errcode = '42501';
  end if;
end;
$$;
revoke all on function digigate.set_device_plan(uuid, text, integer, smallint) from public;
grant execute on function digigate.set_device_plan(uuid, text, integer, smallint) to authenticated;

-- A handheld's health as the viewer may see it: everything for a super user, otherwise battery, network and location.
create function digigate.health_for_viewer(_health jsonb) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select case
    when _health is null then null
    when digigate.is_super_user() then _health
    else jsonb_strip_nulls(jsonb_build_object(
      'battery', _health -> 'battery', 'charging', _health -> 'charging', 'network', _health -> 'network',
      'wifiName', _health -> 'wifiName', 'cellGeneration', _health -> 'cellGeneration', 'cellBars', _health -> 'cellBars',
      'locationAllowed', _health -> 'locationAllowed', 'latitude', _health -> 'latitude', 'longitude', _health -> 'longitude',
      'fixAt', _health -> 'fixAt'
    ))
  end;
$$;
revoke all on function digigate.health_for_viewer(jsonb) from public;

create or replace function digigate.device_board(_search text, _status text, _limit integer, _offset integer, _org uuid default null)
returns table (
  id uuid,
  name text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  org_name text,
  client_name text,
  site_id uuid,
  site_name text,
  post text,
  guard text,
  status text,
  last_check_at timestamptz,
  checks_today bigint,
  total bigint,
  health jsonb,
  health_at timestamptz,
  data_bundle_mb integer,
  data_used_bytes bigint,
  data_whole boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    f.id,
    f.name,
    f.paired_at,
    f.last_seen_at,
    f.org_name,
    f.client_name,
    f.site_id,
    f.site_name,
    f.post,
    f.guard,
    f.status,
    (
      select e.occurred_at from digigate.events e
      where e.device_id = f.id
        and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
        and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
      order by e.occurred_at desc
      limit 1
    ),
    (
      select count(*) from digigate.events e
      where e.device_id = f.id
        and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
        and e.occurred_at >= date_trunc('day', now() at time zone 'Africa/Johannesburg') at time zone 'Africa/Johannesburg'
        and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
    ),
    count(*) over (),
    digigate.health_for_viewer(f.health),
    f.health_at,
    case when digigate.is_super_user() then d.data_bundle_mb end,
    case when digigate.is_super_user() then used.bytes end,
    case when digigate.is_super_user() then used.whole end
  from digigate.fleet(_search, _org) f
  join digigate.devices d on d.id = f.id
  left join lateral (
    select sum(coalesce(x.device_bytes, x.app_bytes))::bigint as bytes, bool_and(x.device_bytes is not null) as whole
    from digigate.device_data_days x
    where x.device_id = f.id
      and x.day >= digigate.data_period_start(d.data_renews_day, (now() at time zone 'Africa/Johannesburg')::date)
  ) used on true
  where _status = '' or f.status = _status
  order by
    case f.status when 'quiet' then 0 when 'offline' then 1 when 'online' then 2 else 3 end,
    f.last_seen_at desc nulls last,
    f.name
  limit least(_limit, 100) offset _offset;
$$;

create or replace function digigate.device_detail(_device uuid)
returns table (
  id uuid,
  name text,
  paired_at timestamptz,
  last_seen_at timestamptz,
  org_id uuid,
  org_name text,
  client_name text,
  site_id uuid,
  site_name text,
  post text,
  guard text,
  status text,
  health jsonb,
  health_at timestamptz,
  sim_number text,
  data_bundle_mb integer,
  data_renews_day smallint,
  data_period_start date,
  can_manage boolean
)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.name, f.paired_at, f.last_seen_at, d.org_id, f.org_name, f.client_name, f.site_id, f.site_name, f.post, f.guard,
    f.status, digigate.health_for_viewer(f.health), f.health_at,
    case when digigate.is_super_user() then d.sim_number end,
    case when digigate.is_super_user() then d.data_bundle_mb end,
    case when digigate.is_super_user() then d.data_renews_day end,
    digigate.data_period_start(d.data_renews_day, (now() at time zone 'Africa/Johannesburg')::date),
    digigate.is_super_user() and digigate.mfa_passed() and d.revoked_at is null
  from digigate.fleet('', null) f
  join digigate.devices d on d.id = f.id
  where f.id = _device;
$$;

create or replace function digigate.device_data(_device uuid, _days integer)
returns table (day date, device_bytes bigint, app_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select x.day, x.device_bytes, x.app_bytes
  from digigate.device_data_days x
  where x.device_id = _device
    and digigate.is_super_user() and digigate.mfa_passed()
    and x.day > (now() at time zone 'Africa/Johannesburg')::date - least(greatest(_days, 1), 90)
  order by x.day;
$$;

create or replace function digigate.device_story(_device uuid, _limit integer, _before timestamptz default null)
returns table (at timestamptz, kind text, battery integer, reason text, actor text)
language sql stable security definer set search_path = ''
as $$
  select e.occurred_at,
    case e.type when 'handheld_released' then case when (x.payload ->> 'released')::boolean then 'released' else 'release_failed' end
      else x.payload ->> 'status' end,
    case when jsonb_typeof(x.payload -> 'battery') = 'number' then (x.payload ->> 'battery')::numeric::integer end,
    x.payload ->> 'reason',
    case when e.type = 'handheld_released' then coalesce(trim(g.first_name || ' ' || g.last_name), 'DigiGate') end
  from digigate.events e
  join digigate.event_details x on x.event_id = e.id
  left join digigate.gate_users g on g.id = x.gate_user_id
  where e.device_id = _device
    and e.type in ('device_status', 'handheld_released')
    and digigate.is_super_user() and digigate.mfa_passed()
    and (_before is null or e.occurred_at < _before)
  order by e.occurred_at desc
  limit least(greatest(_limit, 1), 100);
$$;

commit;
