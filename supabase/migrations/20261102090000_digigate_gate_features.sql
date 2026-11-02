-- What the second gate build adds: a selfie at the start of a shift, a geofence around each post, and a health report
-- from each handheld. A shift's selfie lives in a private Storage bucket that no dashboard login can read: people see it
-- through a short-lived link the digigate-people function hands out, which is logged each time. The erasure job has to
-- delete that file along with the shift. Being away from a post records only leaving, returning and the reason, never a
-- trail. A device's health keeps the latest position and nothing older, and a client's view-only login never gets it.

begin;

insert into digigate.schema_version (version) values (13);

alter table digigate.devices
  add column health jsonb,
  add column health_at timestamptz;

alter table digigate.shifts
  add column selfie text check (selfie in ('taken', 'skipped')),
  add column selfie_path text,
  add column away_until timestamptz,
  add column away_reason text;

-- The post an alert is about, when that isn't a check that already says so.
alter table digigate.alerts add column post text;

-- Only what's listed here is ever stored, whatever a device sends, and a wrongly shaped value is left out, never an error.
create function digigate.record_device_health(_device uuid, _health jsonb) returns void
language sql security definer set search_path = ''
as $$
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
      'fixAt', case when jsonb_typeof(_health -> 'fixAt') = 'number' then (_health ->> 'fixAt')::numeric end
    ))
  where id = _device and revoked_at is null;
$$;

create function digigate.attach_selfie(_device uuid, _shift uuid, _path text) returns void
language sql security definer set search_path = ''
as $$
  update digigate.shifts set selfie_path = _path where id = _shift and device_id = _device;
$$;

-- Devices now carry each post's fence, so the check can run with no connection.
create or replace function digigate.device_snapshot(_device_id uuid) returns jsonb
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
      select jsonb_agg(jsonb_build_object(
        'code', o.code,
        'label', o.label,
        'lanes', to_jsonb(o.lanes),
        'latitude', o.latitude,
        'longitude', o.longitude,
        'radiusM', o.radius_m
      ) order by o.created_at)
      from digigate.posts o
      join device on device.site_id = o.site_id
      where o.is_active
    ), '[]')
  );
$$;

-- A guard leaving their post counts towards the day's rule hits, though it isn't a check.
create or replace function digigate.tally_event(_org uuid, _site uuid, _type text, _at timestamptz, _payload jsonb) returns void
language plpgsql set search_path = ''
as $$
declare
  _day date := (_at at time zone 'Africa/Johannesburg')::date;
  _hour integer := extract(hour from _at at time zone 'Africa/Johannesburg')::integer + 1;
  _checked integer := case when _type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit') then 1 else 0 end;
  _rules jsonb;
begin
  if _checked = 0 and _type not in ('alert_ack', 'override', 'turned_away', 'left_post') then
    return;
  end if;

  if _type = 'left_post' then
    _rules := '{"LEFT_POST": 1}';
  else
    select coalesce(jsonb_object_agg(code, hits), '{}') into _rules
    from (
      select hit ->> 'code' as code, count(*) as hits
      from jsonb_array_elements(coalesce(_payload -> 'hits', '[]')) as hit
      where hit ->> 'code' is not null
      group by 1
    ) as counted;
  end if;

  insert into digigate.daily_activity (site_id, org_id, day) values (_site, _org, _day)
  on conflict on constraint daily_activity_pkey do nothing;

  update digigate.daily_activity a
  set
    checks = a.checks + _checked,
    hours[_hour] = a.hours[_hour] + _checked,
    blocked = a.blocked + case when _checked = 1 and _payload ->> 'outcome' = 'blocked' then 1 else 0 end,
    warnings = a.warnings + case when _checked = 1 and _payload ->> 'outcome' = 'warning' then 1 else 0 end,
    overrides = a.overrides + case when _type = 'override' then 1 else 0 end,
    turned_away = a.turned_away + case when _type = 'turned_away' then 1 else 0 end,
    acknowledged = a.acknowledged + case when _type = 'alert_ack' then 1 else 0 end,
    rules = digigate.add_counts(a.rules, _rules)
  where a.site_id = _site and a.org_id = _org and a.day = _day;
end;
$$;

-- What a guard or supervisor did at a gate. Never the employee number from a failed sign-in, and never an override's
-- reason: that's free text, so it stays in the erasable details. A reason for stepping away comes from the site's fixed
-- list, so it's safe here.
create or replace function digigate.audit_gate_event(_org uuid, _site uuid, _device uuid, _gate_user uuid, _type text, _at timestamptz, _payload jsonb) returns void
language plpgsql set search_path = ''
as $$
declare
  _actor uuid := case when _type = 'override' then coalesce(digigate.to_uuid(_payload ->> 'supervisor_id'), _gate_user) else _gate_user end;
begin
  perform digigate.write_audit(
    _org, _site, _device, 'gate', 'gate.' || _type, null,
    (select trim(g.first_name || ' ' || g.last_name) from digigate.gate_users g where g.id = _actor),
    (select d.name from digigate.devices d where d.id = _device),
    case
      when _type in ('override', 'turned_away', 'alert_ack') then
        (select string_agg(code, ', ') from jsonb_array_elements_text(coalesce(_payload -> 'codes', '[]')) as code)
      when _type in ('shift_start', 'shift_end') then concat_ws(' · ', _payload ->> 'post', _payload ->> 'period', _payload ->> 'reason')
      when _type in ('left_post', 'returned_to_post', 'stepping_away') then concat_ws(' · ', _payload ->> 'post', _payload ->> 'reason')
    end,
    _at
  );
end;
$$;

-- The open "left their post" alert of one shift, closed by the guard coming back, explaining, or going off duty.
create function digigate.close_left_post(_site uuid, _shift uuid, _at timestamptz, _by uuid, _resolution text) returns void
language sql set search_path = ''
as $$
  update digigate.alerts a
  set status = 'resolved', resolved_at = _at, resolved_by = _by, resolution = _resolution
  from digigate.events e
  where a.site_id = _site and a.status = 'open' and a.rule_code = 'LEFT_POST'
    and e.id = a.event_id and e.shift_id = _shift;
$$;

create or replace function digigate.ingest_events(_device_id uuid, _events jsonb) returns uuid[]
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
  _shift uuid;
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
    _shift := digigate.to_uuid(_payload ->> 'shift_id');

    insert into digigate.events (id, org_id, site_id, device_id, type, occurred_at, outcome, rule_codes, visit_id, shift_id)
    values (
      _id, _org, _site, _device_id, _type, _at, _payload ->> 'outcome',
      array(select hit ->> 'code' from jsonb_array_elements(coalesce(_payload -> 'hits', '[]')) hit),
      _visit, _shift
    )
    on conflict (id) do nothing;
    get diagnostics _rows = row_count;
    _accepted := _accepted || _id;
    continue when _rows = 0;

    -- Anything tied to a visit waits for its exit to start the clock; the rest starts now.
    insert into digigate.event_details (event_id, org_id, site_id, gate_user_id, visit_id, payload, erase_after)
    values (_id, _org, _site, _gate_user, _visit, _payload, case when _visit is null then _at + interval '3 years' end);

    perform digigate.tally_event(_org, _site, _type, _at, _payload);
    if _type in ('sign_in', 'sign_in_failed', 'locked_out', 'sign_out', 'shift_start', 'shift_end', 'override', 'turned_away', 'alert_ack', 'left_post', 'returned_to_post', 'stepping_away') then
      perform digigate.audit_gate_event(_org, _site, _device_id, _gate_user, _type, _at, _payload);
    end if;

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
      insert into digigate.shifts (id, org_id, site_id, device_id, gate_user_id, post, period, started_at, selfie)
      values (
        _shift, _org, _site, _device_id, _gate_user,
        _payload ->> 'post', _payload ->> 'period', _at,
        case when _payload ->> 'selfie' in ('taken', 'skipped') then _payload ->> 'selfie' end
      )
      on conflict (id) do nothing;

    elsif _type = 'shift_end' then
      update digigate.shifts
      set ended_at = _at, end_reason = _payload ->> 'reason', erase_after = _at + interval '3 years'
      where id = _shift and ended_at is null;
      perform digigate.close_left_post(_site, _shift, _at, _gate_user, 'Shift ended');

    elsif _type = 'left_post' then
      insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, raised_at, status, post)
      values (_org, _site, 'LEFT_POST', 'amber', 'device', _id, _at, 'open', _payload ->> 'post')
      on conflict (event_id, rule_code, source) do nothing;

    elsif _type = 'returned_to_post' then
      update digigate.shifts set away_until = null, away_reason = null where id = _shift;
      perform digigate.close_left_post(_site, _shift, _at, _gate_user, 'Back at their post');

    elsif _type = 'stepping_away' then
      update digigate.shifts
      set away_until = _at + make_interval(mins => least(60, greatest(1, coalesce((_payload ->> 'minutes')::integer, 10)))),
        away_reason = left(_payload ->> 'reason', 60)
      where id = _shift;
      perform digigate.close_left_post(_site, _shift, _at, _gate_user, 'Stepping away: ' || coalesce(left(_payload ->> 'reason', 60), ''));
    end if;
  end loop;

  return _accepted;
end;
$$;

-- As before, a client's view-only login learns a gate is staffed, not by whom, so it gets no selfie either.
drop function digigate.gate_board(uuid);
create function digigate.gate_board(_site uuid)
returns table (
  post text,
  label text,
  lanes text[],
  period text,
  on_duty_since timestamptz,
  guard text,
  device text,
  device_seen_at timestamptz,
  last_check_at timestamptz,
  shift_id uuid,
  selfie text,
  has_selfie boolean,
  away_until timestamptz,
  away_reason text,
  has_fence boolean
)
language sql stable security definer set search_path = ''
as $$
  select
    p.code,
    p.label,
    p.lanes,
    s.period,
    s.started_at,
    case when digigate.viewer_client() is null then trim(g.first_name || ' ' || g.last_name) end,
    d.name,
    d.last_seen_at,
    (
      select e.occurred_at from digigate.events e
      where e.device_id = s.device_id and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
      order by e.occurred_at desc
      limit 1
    ),
    case when digigate.viewer_client() is null then s.id end,
    case when digigate.viewer_client() is null then s.selfie end,
    case when digigate.viewer_client() is null then s.selfie_path is not null else false end,
    s.away_until,
    s.away_reason,
    p.latitude is not null
  from digigate.posts p
  left join lateral (
    select x.id, x.period, x.started_at, x.gate_user_id, x.device_id, x.selfie, x.selfie_path, x.away_until, x.away_reason
    from digigate.shifts x
    where x.site_id = p.site_id and x.post = p.code and x.ended_at is null and x.started_at > now() - interval '14 hours'
      and (digigate.viewer_org() is null or x.org_id = digigate.viewer_org())
    order by x.started_at desc
    limit 1
  ) s on true
  left join digigate.gate_users g on g.id = s.gate_user_id
  left join digigate.devices d on d.id = s.device_id
  where p.site_id = _site and p.is_active and _site = any (digigate.visible_site_ids())
  order by p.created_at;
$$;

drop function digigate.device_board(text, text, integer, integer, uuid);
drop function digigate.fleet(text, uuid);

create function digigate.fleet(_search text, _org uuid)
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
  health jsonb,
  health_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  with visible as (
    select unnest(digigate.visible_site_ids()) as site_id
  ),
  on_duty as (
    select distinct on (x.device_id) x.device_id, x.gate_user_id, x.post
    from digigate.shifts x
    where x.ended_at is null and x.started_at > now() - interval '14 hours'
      and ((select digigate.viewer_org()) is null or x.org_id = (select digigate.viewer_org()))
    order by x.device_id, x.started_at desc
  )
  select
    d.id,
    d.name,
    d.paired_at,
    d.last_seen_at,
    o.name,
    c.name,
    s.id,
    s.name,
    coalesce(p.label, x.post),
    case when (select digigate.viewer_client()) is null then trim(g.first_name || ' ' || g.last_name) end,
    case
      when d.revoked_at is not null then 'revoked'
      when d.last_seen_at > now() - interval '3 minutes' then 'online'
      when x.device_id is not null then 'quiet'
      else 'offline'
    end,
    case when (select digigate.viewer_client()) is null then d.health else d.health - array['latitude', 'longitude', 'fixAt'] end,
    d.health_at
  from visible v
  join digigate.devices d on d.site_id = v.site_id
  join digigate.sites s on s.id = d.site_id
  join digigate.clients c on c.id = s.client_id
  join digigate.organisations o on o.id = d.org_id
  left join on_duty x on x.device_id = d.id and d.revoked_at is null
  left join digigate.posts p on p.site_id = d.site_id and p.code = x.post
  left join digigate.gate_users g on g.id = x.gate_user_id
  where (_org is null or d.org_id = _org)
    and (_search = '' or d.name ilike _search or s.name ilike _search or c.name ilike _search or o.name ilike _search);
$$;

create function digigate.device_board(_search text, _status text, _limit integer, _offset integer, _org uuid default null)
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
  health_at timestamptz
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
    f.health,
    f.health_at
  from digigate.fleet(_search, _org) f
  where _status = '' or f.status = _status
  order by
    case f.status when 'quiet' then 0 when 'offline' then 1 when 'online' then 2 else 3 end,
    f.last_seen_at desc nulls last,
    f.name
  limit least(_limit, 100) offset _offset;
$$;

-- Selfies are private and no policy opens them: only the service key behind the two Edge Functions reaches this bucket.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('shift-selfies', 'shift-selfies', false, 400000, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end;
$$;

revoke all on function digigate.record_device_health(uuid, jsonb) from public;
revoke all on function digigate.attach_selfie(uuid, uuid, text) from public;
revoke all on function digigate.close_left_post(uuid, uuid, timestamptz, uuid, text) from public;
revoke all on function digigate.gate_board(uuid) from public;
revoke all on function digigate.fleet(text, uuid) from public;
revoke all on function digigate.device_board(text, text, integer, integer, uuid) from public;
grant execute on function digigate.record_device_health(uuid, jsonb) to service_role;
grant execute on function digigate.attach_selfie(uuid, uuid, text) to service_role;
grant execute on function digigate.gate_board(uuid) to authenticated;
grant execute on function digigate.device_board(text, text, integer, integer, uuid) to authenticated;

commit;
