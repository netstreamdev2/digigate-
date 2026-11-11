-- Gate handhelds under DigiGate's control, their SIM and data, and why one went quiet.
--
-- 1. Health now also says whether DigiGate owns the handheld (device owner: DigiGate is its home screen, other apps
--    hidden but the phone, camera and gallery, hotspot and the settings that take it off the record locked), any step
--    Android refused, and the SIM: in or out, its network, roaming, mobile data on or off. Never its number or serial.
-- 2. Mobile data by the handheld's own day, the whole handheld's (hotspot and every app) and DigiGate's own, kept per
--    device in device_data_days. A day's count only grows, so a late or repeated report never lowers it.
-- 3. Each device gets the SIM's number as an admin types it, and its bundle: size and the day it renews, for "left".
-- 4. The handheld logs what happened to it while it couldn't report (device_status events) and a supervisor releasing
--    it from DigiGate (handheld_released). Those that look like hiding from the record raise an amber alert: the SIM
--    taken out, mobile data or airplane mode switched on or off, DigiGate closed by hand, and a release. A release is
--    also in the audit log, with the supervisor.
-- device_data_days has no grants: the dashboard reads it through the Devices page's functions, which come next.

begin;

insert into digigate.schema_version (version) values (40);

alter table digigate.devices
  add column sim_number text check (sim_number ~ '^\+[0-9]{8,15}$'),
  add column data_bundle_mb integer check (data_bundle_mb between 1 and 1000000),
  add column data_renews_day smallint check (data_renews_day between 1 and 31);

create table digigate.device_data_days (
  device_id uuid not null references digigate.devices (id),
  day date not null,
  org_id uuid not null,
  site_id uuid not null,
  device_bytes bigint check (device_bytes >= 0),
  app_bytes bigint check (app_bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (device_id, day)
);
create index device_data_days_site on digigate.device_data_days (site_id, day);
alter table digigate.device_data_days enable row level security;

create or replace function digigate.record_device_health(_device uuid, _health jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _row digigate.devices;
  _bytes constant numeric := 1e13;
begin
  update digigate.devices
  set health_at = now(),
    health = jsonb_strip_nulls(jsonb_build_object(
      'battery', case when jsonb_typeof(_health -> 'battery') = 'number' then least(100, greatest(0, round((_health ->> 'battery')::numeric))) end,
      'charging', case when jsonb_typeof(_health -> 'charging') = 'boolean' then (_health ->> 'charging')::boolean end,
      'appVersion', case when jsonb_typeof(_health -> 'appVersion') = 'string' then left(_health ->> 'appVersion', 32) end,
      'network', case when _health ->> 'network' in ('wifi', 'cellular', 'none', 'other') then _health ->> 'network' end,
      'wifiName', case when jsonb_typeof(_health -> 'wifiName') = 'string' then left(_health ->> 'wifiName', 64) end,
      'wifiStrength', case when jsonb_typeof(_health -> 'wifiStrength') = 'number' then least(100, greatest(0, round((_health ->> 'wifiStrength')::numeric))) end,
      'cellGeneration', case when _health ->> 'cellGeneration' in ('2g', '3g', '4g', '5g') then _health ->> 'cellGeneration' end,
      'cellBars', case when jsonb_typeof(_health -> 'cellBars') = 'number' then least(4, greatest(0, round((_health ->> 'cellBars')::numeric))) end,
      'locationAllowed', case when jsonb_typeof(_health -> 'locationAllowed') = 'boolean' then (_health ->> 'locationAllowed')::boolean end,
      'latitude', case when jsonb_typeof(_health -> 'latitude') = 'number' and abs((_health ->> 'latitude')::numeric) <= 90 then (_health ->> 'latitude')::numeric end,
      'longitude', case when jsonb_typeof(_health -> 'longitude') = 'number' and abs((_health ->> 'longitude')::numeric) <= 180 then (_health ->> 'longitude')::numeric end,
      'fixAt', case when jsonb_typeof(_health -> 'fixAt') = 'number' then (_health ->> 'fixAt')::numeric end,
      'managed', case when jsonb_typeof(_health -> 'managed') = 'boolean' then (_health ->> 'managed')::boolean end,
      'policyProblems', case when jsonb_typeof(_health -> 'policyProblems') = 'array' then (
        select coalesce(jsonb_agg(left(problem, 60)), '[]'::jsonb)
        from (select problem from jsonb_array_elements_text(_health -> 'policyProblems') problem limit 20) problems
      ) end,
      'simState', case when _health ->> 'simState' in ('absent', 'ready', 'locked', 'faulty', 'unknown') then _health ->> 'simState' end,
      'simOperator', case when jsonb_typeof(_health -> 'simOperator') = 'string' then left(_health ->> 'simOperator', 40) end,
      'networkOperator', case when jsonb_typeof(_health -> 'networkOperator') = 'string' then left(_health ->> 'networkOperator', 40) end,
      'roaming', case when jsonb_typeof(_health -> 'roaming') = 'boolean' then (_health ->> 'roaming')::boolean end,
      'dataEnabled', case when jsonb_typeof(_health -> 'dataEnabled') = 'boolean' then (_health ->> 'dataEnabled')::boolean end
    ))
  where id = _device and revoked_at is null
  returning * into _row;
  if _row.id is null or jsonb_typeof(_health -> 'mobileData') <> 'array' then
    return;
  end if;

  -- Only well-formed days from the last 40, each count a whole number of bytes or left as it was.
  insert into digigate.device_data_days as d (device_id, day, org_id, site_id, device_bytes, app_bytes)
  select _row.id, (item ->> 'day')::date, _row.org_id, _row.site_id,
    case when jsonb_typeof(item -> 'device') = 'number' and (item ->> 'device')::numeric between 0 and _bytes then round((item ->> 'device')::numeric)::bigint end,
    case when jsonb_typeof(item -> 'app') = 'number' and (item ->> 'app')::numeric between 0 and _bytes then round((item ->> 'app')::numeric)::bigint end
  from (select item from jsonb_array_elements(_health -> 'mobileData') item limit 40) items
  where item ->> 'day' ~ '^\d{4}-\d{2}-\d{2}$'
    and (item ->> 'day')::date between current_date - 40 and current_date + 1
  on conflict (device_id, day) do update
  set device_bytes = greatest(d.device_bytes, excluded.device_bytes),
    app_bytes = greatest(d.app_bytes, excluded.app_bytes),
    updated_at = now();
end;
$$;
revoke all on function digigate.record_device_health(uuid, jsonb) from public;
grant execute on function digigate.record_device_health(uuid, jsonb) to service_role;

-- What a handheld reported about itself. Never raises: an error would fail the whole upload and leave the outbox stuck.
create function digigate.check_handheld_event() returns trigger
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
revoke all on function digigate.check_handheld_event() from public;

create trigger check_handheld_event after insert on digigate.event_details
  for each row when (new.payload ? 'status' or new.payload ? 'released')
  execute function digigate.check_handheld_event();

commit;
