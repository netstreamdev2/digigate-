-- What the DigiGate Edge Functions call. Each runs as one transaction, so a dropped connection can't leave half an
-- upload saved, and only the service role can execute them.

begin;

insert into digigate.schema_version (version) values (2);

-- The secret behind person keys. An organisation's devices share one, so a person matches at every gate. No policies
-- and no grants: only the definer functions below can reach it.
create table digigate.person_keys (
  org_id uuid primary key,
  key text not null,
  created_at timestamptz not null default now()
);
alter table digigate.person_keys enable row level security;

-- A device's id fields can't be allowed to fail a whole batch, or one bad value would block its outbox for good.
create function digigate.to_uuid(_value text) returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when _value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _value::uuid
  end;
$$;

-- A code works once. Returns nothing when it's wrong, used or expired. `_new_person_key` is used only if this is the
-- organisation's first device; every later device gets the same key.
create function digigate.claim_pairing_code(_code_hash text, _token_hash text, _new_person_key text)
returns table (device_id uuid, org_id uuid, site_id uuid, person_key text)
language plpgsql security definer set search_path = ''
as $$
declare
  _code digigate.pairing_codes;
begin
  update digigate.pairing_codes c
  set used_at = now()
  where c.code_hash = _code_hash and c.used_at is null and c.expires_at > now()
  returning c.* into _code;
  if _code.id is null then
    return;
  end if;

  insert into digigate.person_keys as k (org_id, key) values (_code.org_id, _new_person_key)
  on conflict on constraint person_keys_pkey do nothing;

  return query
    with paired as (
      insert into digigate.devices (org_id, site_id, name, token_hash)
      values (_code.org_id, _code.site_id, _code.device_name, _token_hash)
      returning devices.id, devices.org_id, devices.site_id
    )
    select paired.id, paired.org_id, paired.site_id, k.key
    from paired
    join digigate.person_keys k on k.org_id = paired.org_id;
end;
$$;

-- The device behind a token, or nothing once it's revoked.
create function digigate.device_for_token(_token_hash text) returns uuid
language sql volatile security definer set search_path = ''
as $$
  update digigate.devices
  set last_seen_at = now()
  where token_hash = _token_hash and revoked_at is null
  returning id;
$$;

-- A checked person or vehicle that was let through: an entry opens its visit, an exit closes it and starts the
-- 3-year clock on everything recorded about the visit.
create function digigate.apply_passage(_org uuid, _site uuid, _device uuid, _type text, _payload jsonb, _at timestamptz)
returns void
language plpgsql set search_path = ''
as $$
declare
  _visit uuid := digigate.to_uuid(_payload ->> 'visit_id');
  _kind text := case when _type like 'vehicle%' then 'vehicle' else 'pedestrian' end;
  _person jsonb := coalesce(_payload -> 'driver', _payload -> 'person', '{}');
  _vehicle jsonb := _payload -> 'vehicle';
  _visit_type text := coalesce(_payload ->> 'visit_type', 'visitor');
  _demographics jsonb := coalesce(_person -> 'demographics', '{}');
begin
  if _visit is null then
    return;
  end if;

  if _type like '%_exit' then
    update digigate.visits
    set exited_at = _at, occupants_out = (_payload ->> 'occupants')::integer
    where id = _visit and exited_at is null;
    update digigate.visit_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    update digigate.event_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    return;
  end if;

  insert into digigate.visits (id, org_id, site_id, post, kind, visit_type, entered_at, occupants_in)
  values (
    _visit, _org, _site,
    (select s.post from digigate.shifts s where s.device_id = _device and s.ended_at is null order by s.started_at desc limit 1),
    _kind, _visit_type, _at, (_payload ->> 'occupants')::integer
  )
  on conflict (id) do nothing;

  insert into digigate.visit_details (visit_id, org_id, site_id, person_key, person_name, vin, plate, disc_number, vehicle_description)
  values (
    _visit, _org, _site,
    _person ->> 'person_key',
    trim(concat_ws(' ', coalesce(_person ->> 'names', _person ->> 'initials'), _person ->> 'surname')),
    _vehicle ->> 'vin',
    _vehicle ->> 'plate',
    _vehicle ->> 'disc_number',
    case when _vehicle is not null
      then concat_ws(' · ', concat_ws(' ', _vehicle ->> 'make', _vehicle ->> 'model'), _vehicle ->> 'colour')
    end
  )
  on conflict (visit_id) do nothing;

  insert into digigate.daily_counts (site_id, org_id, day, kind, visit_type, sex, age_band, visits)
  values (
    _site, _org, (_at at time zone 'Africa/Johannesburg')::date, _kind, _visit_type,
    coalesce(_demographics ->> 'sex', 'unknown'), coalesce(_demographics ->> 'age_band', 'unknown'), 1
  )
  on conflict (site_id, day, kind, visit_type, sex, age_band)
  do update set visits = digigate.daily_counts.visits + 1;
end;
$$;

-- Uploads a batch from one device, oldest first, and returns the ids it now holds. Retries are safe: an event it
-- already has changes nothing. Permanent facts go to events; everything naming a person goes to the details tables.
create function digigate.ingest_events(_device_id uuid, _events jsonb) returns uuid[]
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
  _site uuid;
  _item jsonb;
  _id uuid;
  _type text;
  _at timestamptz;
  _payload jsonb;
  _visit uuid;
  _gate_user uuid;
  _check uuid;
  _checked jsonb;
  _checked_type text;
  _rows integer;
  _accepted uuid[] := array[]::uuid[];
begin
  select d.org_id, d.site_id into _org, _site from digigate.devices d where d.id = _device_id and d.revoked_at is null;
  if _org is null then
    raise exception 'This device is not allowed to upload.';
  end if;

  for _item in select value from jsonb_array_elements(_events) order by value ->> 'id' loop
    _id := (_item ->> 'id')::uuid;
    _type := _item ->> 'type';
    _at := to_timestamp((_item ->> 'occurredAt')::double precision / 1000);
    _payload := coalesce(_item -> 'payload', '{}');
    _visit := digigate.to_uuid(_payload ->> 'visit_id');
    _gate_user := digigate.to_uuid(_item ->> 'gateUserId');

    insert into digigate.events (id, org_id, site_id, device_id, type, occurred_at, outcome, rule_codes, visit_id, shift_id)
    values (
      _id, _org, _site, _device_id, _type, _at, _payload ->> 'outcome',
      array(select hit ->> 'code' from jsonb_array_elements(coalesce(_payload -> 'hits', '[]')) hit),
      _visit, digigate.to_uuid(_payload ->> 'shift_id')
    )
    on conflict (id) do nothing;
    get diagnostics _rows = row_count;
    _accepted := _accepted || _id;
    continue when _rows = 0;

    -- Anything tied to a visit waits for its exit to start the clock; the rest starts now.
    insert into digigate.event_details (event_id, org_id, site_id, gate_user_id, visit_id, payload, erase_after)
    values (_id, _org, _site, _gate_user, _visit, _payload, case when _visit is null then _at + interval '3 years' end);

    if _type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit') then
      insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
      select _org, _site, hit ->> 'code', hit ->> 'severity', 'device', _id, _visit, _at,
        case when hit ->> 'severity' = 'info' then 'resolved' else 'open' end
      from jsonb_array_elements(coalesce(_payload -> 'hits', '[]')) hit
      on conflict (event_id, rule_code, source) do nothing;

      if _payload ->> 'outcome' = 'clear' then
        perform digigate.apply_passage(_org, _site, _device_id, _type, _payload, _at);
      end if;

    elsif _type in ('alert_ack', 'override', 'turned_away') then
      _check := digigate.to_uuid(_payload ->> 'check_event_id');
      update digigate.alerts
      set status = 'resolved',
        resolved_at = _at,
        resolved_by = coalesce(digigate.to_uuid(_payload ->> 'supervisor_id'), _gate_user),
        resolution = case _type
          when 'alert_ack' then 'Let through by the guard'
          when 'override' then 'Supervisor override: ' || coalesce(_payload ->> 'reason', '')
          else 'Turned away'
        end
      where event_id = _check and status = 'open';

      select e.type, d.payload into _checked_type, _checked
      from digigate.events e
      join digigate.event_details d on d.event_id = e.id
      where e.id = _check;

      if _type = 'turned_away' then
        -- A turned-away entry never gets an exit, so its clock starts now.
        if _checked_type like '%_entry' then
          update digigate.event_details set erase_after = _at + interval '3 years' where visit_id = _visit and erase_after is null;
        end if;
      elsif _checked_type is not null then
        perform digigate.apply_passage(_org, _site, _device_id, _checked_type, _checked, _at);
      end if;

    elsif _type = 'shift_start' then
      insert into digigate.shifts (id, org_id, site_id, device_id, gate_user_id, post, period, started_at)
      values (
        digigate.to_uuid(_payload ->> 'shift_id'), _org, _site, _device_id, _gate_user,
        _payload ->> 'post', _payload ->> 'period', _at
      )
      on conflict (id) do nothing;

    elsif _type = 'shift_end' then
      update digigate.shifts
      set ended_at = _at, end_reason = _payload ->> 'reason', erase_after = _at + interval '3 years'
      where id = digigate.to_uuid(_payload ->> 'shift_id') and ended_at is null;
    end if;
  end loop;

  return _accepted;
end;
$$;

-- What a device needs to run with no connection: the gate users at its site with their PIN hashes, and its posts.
-- A deactivated guard stays in the list so the change reaches the device.
create function digigate.device_snapshot(_device_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with device as (
    select d.org_id, d.site_id from digigate.devices d where d.id = _device_id and d.revoked_at is null
  )
  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id,
        'employeeNumber', g.employee_number,
        'firstName', g.first_name,
        'lastName', g.last_name,
        'role', g.role,
        'pin', g.pin,
        'active', g.is_active
      ))
      from digigate.gate_users g
      join device on device.org_id = g.org_id
      where device.site_id = any (g.site_ids)
    ), '[]'),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object('code', o.code, 'label', o.label, 'lanes', to_jsonb(o.lanes)) order by o.created_at)
      from digigate.posts o
      join device on device.site_id = o.site_id
      where o.is_active
    ), '[]')
  );
$$;

revoke all on function digigate.to_uuid(text) from public;
revoke all on function digigate.claim_pairing_code(text, text, text) from public;
revoke all on function digigate.device_for_token(text) from public;
revoke all on function digigate.apply_passage(uuid, uuid, uuid, text, jsonb, timestamptz) from public;
revoke all on function digigate.ingest_events(uuid, jsonb) from public;
revoke all on function digigate.device_snapshot(uuid) from public;
grant execute on function digigate.claim_pairing_code(text, text, text) to service_role;
grant execute on function digigate.device_for_token(text) to service_role;
grant execute on function digigate.ingest_events(uuid, jsonb) to service_role;
grant execute on function digigate.device_snapshot(uuid) to service_role;

commit;
