-- A forgotten PIN, and a super user's remote control of a handheld (the user's decisions of 2026-11-12).
--
-- 1. A guard who forgets their PIN gets a new one from the dashboard: from a company admin, manager or control room
--    (who are awake at night, when it happens), or a super user. Only the PIN changes, it's never shown again once
--    handed over, and the audit log says who reset whose. The handheld has it at its next sync, within a minute.
-- 2. A super user can ask a handheld DigiGate owns to lock, restart, or install a newer DigiGate. The handheld is sent
--    the request at its next sync, carries it out once, and reports back with a device_command event, which closes
--    it here. One request of each kind waits per handheld; asking again only renews it. Super users only: a company's
--    own people can't restart or update the handhelds they rent.

begin;

insert into digigate.schema_version (version) values (45);

-- 1. PIN reset

create function digigate.reset_gate_user_pin(_gate_user uuid, _pin jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
begin
  select g.org_id into _org from digigate.gate_users g where g.id = _gate_user and g.is_active;
  if _org is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  if not digigate.can_watch_org(_org) or digigate.org_suspended(_org) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- The same record the dashboard writes when a guard is added: a salted PBKDF2 hash, never the PIN.
  -- A missing field reads as null, which an "or" would let through, so each is named as missing instead.
  if coalesce(jsonb_typeof(_pin), 'missing') <> 'object'
    or _pin ->> 'algorithm' is distinct from 'pbkdf2-sha256'
    or coalesce(jsonb_typeof(_pin -> 'iterations'), 'missing') <> 'number'
    or coalesce(jsonb_typeof(_pin -> 'salt'), 'missing') <> 'string'
    or coalesce(jsonb_typeof(_pin -> 'hash'), 'missing') <> 'string'
    or (select count(*) from jsonb_object_keys(_pin)) <> 4 then
    raise exception 'invalid pin record' using errcode = '22023';
  end if;
  update digigate.gate_users set pin = _pin, pin_set_at = now() where id = _gate_user;
end;
$$;
revoke all on function digigate.reset_gate_user_pin(uuid, jsonb) from public;
grant execute on function digigate.reset_gate_user_pin(uuid, jsonb) to authenticated;

-- As before, and a change of the PIN alone is called what it is: a PIN reset.
create or replace function digigate.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _noun text := tg_argv[0];
  _category text := tg_argv[1];
  _row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  _before jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  _changed text;
  _action text := _noun || '.added';
  _target text;
  _actor uuid := auth.uid();
begin
  if tg_op = 'UPDATE' then
    select string_agg(key, ', ' order by key) into _changed
    from jsonb_object_keys(_row) as key
    where _row -> key is distinct from _before -> key
      and key not in ('last_seen_at', 'next_run_at', 'last_run_at', 'updated_at');
    if _changed is null then
      return new;
    end if;

    _action := _noun || case
      when _before ->> 'revoked_at' is null and _row ->> 'revoked_at' is not null then '.revoked'
      when _noun = 'client' and _before ->> 'org_id' is distinct from _row ->> 'org_id' then '.moved'
      when _row ->> 'is_active' = 'false' and _before ->> 'is_active' = 'true' then '.deactivated'
      when _row ->> 'is_active' = 'true' and _before ->> 'is_active' = 'false' then '.reactivated'
      when _noun = 'gate_user' and _changed in ('pin', 'pin, pin_set_at') then '.pin_reset'
      else '.changed'
    end;
    -- A PIN reset needs no list of what changed.
    if _action = 'gate_user.pin_reset' then
      _changed := null;
    end if;
  elsif tg_op = 'DELETE' then
    _action := _noun || '.deleted';
  end if;

  _target := case tg_table_name
    when 'gate_users' then trim(concat_ws(' ', _row ->> 'first_name', _row ->> 'last_name'))
    when 'posts' then _row ->> 'label'
    when 'pairing_codes' then _row ->> 'device_name'
    else _row ->> 'name'
  end;

  perform digigate.write_audit(
    coalesce((_row ->> 'org_id')::uuid, case when tg_table_name = 'organisations' then (_row ->> 'id')::uuid end),
    coalesce((_row ->> 'site_id')::uuid, case when tg_table_name = 'sites' then (_row ->> 'id')::uuid end),
    case when tg_table_name = 'devices' then (_row ->> 'id')::uuid end,
    _category,
    _action,
    _actor,
    (select p.full_name from digigate.profiles p where p.id = _actor),
    _target,
    _changed
  );
  return null;
end;
$$;
revoke all on function digigate.audit_row() from public;

-- 2. Remote lock, restart and update

create table digigate.device_commands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  device_id uuid not null references digigate.devices (id),
  kind text not null check (kind in ('lock', 'restart', 'update_app')),
  payload jsonb not null default '{}',
  requested_by uuid not null,
  requested_at timestamptz not null default now(),
  done_at timestamptz,
  outcome text check (char_length(outcome) <= 40)
);
create unique index device_commands_one_waiting on digigate.device_commands (device_id, kind) where done_at is null;
create index device_commands_by_device on digigate.device_commands (device_id, requested_at desc);

alter table digigate.device_commands enable row level security;
create policy device_commands_read on digigate.device_commands for select to authenticated
  using (digigate.is_super_user() and digigate.mfa_passed());
grant select on digigate.device_commands to authenticated;
grant select, insert, update on digigate.device_commands to service_role;

-- An update names the new APK: where to download it (https), its version code, and optionally its SHA-256. The
-- handheld refuses anything that isn't DigiGate, isn't newer, or doesn't match; Android refuses one not signed by us.
create function digigate.request_device_command(_device uuid, _kind text, _payload jsonb default '{}') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _row digigate.devices;
  _id uuid;
  _clean jsonb := '{}';
begin
  if not (digigate.is_super_user() and digigate.mfa_passed()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select d.* into _row from digigate.devices d where d.id = _device and d.revoked_at is null;
  if _row.id is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  if _kind not in ('lock', 'restart', 'update_app') then
    raise exception 'unknown command' using errcode = '22023';
  end if;
  if _kind = 'update_app' then
    -- PostgreSQL caps a regex repeat at 255, so the length is checked on its own.
    if coalesce(_payload ->> 'url', '') !~ '^https://[^[:space:]]+\.[^[:space:]]+$'
      or char_length(_payload ->> 'url') > 2000
      or coalesce(jsonb_typeof(_payload -> 'version_code'), 'missing') <> 'number'
      or (_payload ->> 'version_code')::numeric <> trunc((_payload ->> 'version_code')::numeric)
      or (_payload ->> 'version_code')::numeric < 1
      or (_payload ? 'sha256' and coalesce(_payload ->> 'sha256', '') !~ '^[0-9a-fA-F]{64}$') then
      raise exception 'invalid update' using errcode = '22023';
    end if;
    _clean := jsonb_build_object('url', _payload ->> 'url', 'version_code', (_payload ->> 'version_code')::integer)
      || case when _payload ? 'sha256' then jsonb_build_object('sha256', lower(_payload ->> 'sha256')) else '{}' end;
  end if;

  update digigate.device_commands
  set payload = _clean, requested_by = auth.uid(), requested_at = now()
  where device_id = _device and kind = _kind and done_at is null
  returning id into _id;
  if _id is null then
    insert into digigate.device_commands (org_id, device_id, kind, payload, requested_by)
    values (_row.org_id, _device, _kind, _clean, auth.uid())
    returning id into _id;
  end if;

  perform digigate.write_audit(_row.org_id, _row.site_id, _row.id, 'devices', 'device.' || _kind || '_requested', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), _row.name,
    case when _kind = 'update_app' then 'Version ' || (_clean ->> 'version_code') end);
  return _id;
end;
$$;
revoke all on function digigate.request_device_command(uuid, text, jsonb) from public;
grant execute on function digigate.request_device_command(uuid, text, jsonb) to authenticated;

-- As before, and a command the handheld carried out is closed with how it went. A restart says "restarting" first and
-- only speaks again if it couldn't, so the last word is the one kept.
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
  elsif _event.type = 'device_command' then
    -- The handheld says how it went as `result`: a payload's `outcome` is kept on the event as a check's result.
    update digigate.device_commands
    set done_at = coalesce(done_at, _event.occurred_at), outcome = left(new.payload ->> 'result', 40)
    where id = digigate.to_uuid(new.payload ->> 'command_id') and device_id = _event.device_id;
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

-- The trigger only looks at events that could be one of these; a command's report is now one of them.
drop trigger check_handheld_event on digigate.event_details;
create trigger check_handheld_event after insert on digigate.event_details
  for each row when (new.payload ? 'status' or new.payload ? 'released' or new.payload ? 'command_id')
  execute function digigate.check_handheld_event();

commit;
