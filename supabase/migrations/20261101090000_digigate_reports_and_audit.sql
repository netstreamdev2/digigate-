-- Reports and the audit log.
--
-- Reports read one anonymous row per site per day, counted as events arrive. That keeps a yearly report as cheap as a
-- daily one, and because nothing in those rows identifies anyone, they outlive the erasure of the people behind them.
-- The audit log is written by the database itself, so no screen or function can forget to record what it did.

begin;

insert into digigate.schema_version (version) values (11);

-- Daily totals ---------------------------------------------------------------------------------------------------------

-- The company is part of the key: after a client moves, each company keeps only what it recorded itself.
create table digigate.daily_activity (
  site_id uuid not null references digigate.sites (id),
  org_id uuid not null,
  day date not null,
  checks integer not null default 0,
  vehicles_in integer not null default 0,
  people_in integer not null default 0,
  exits integer not null default 0,
  stay_minutes bigint not null default 0,
  blocked integer not null default 0,
  warnings integer not null default 0,
  overrides integer not null default 0,
  turned_away integer not null default 0,
  acknowledged integer not null default 0,
  hours integer[] not null default array_fill(0, array[24]),
  rules jsonb not null default '{}',
  visit_types jsonb not null default '{}',
  primary key (site_id, org_id, day)
);
create index daily_activity_org_day on digigate.daily_activity (org_id, day desc);

alter table digigate.daily_activity enable row level security;
create policy daily_activity_read on digigate.daily_activity for select to authenticated
  using (site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or org_id = (select digigate.viewer_org())));
grant select on digigate.daily_activity to authenticated;
grant select, insert, update on digigate.daily_activity to service_role;

create function digigate.add_counts(_a jsonb, _b jsonb) returns jsonb
language sql immutable set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, total), '{}')
  from (
    select key, sum(value::integer) as total
    from (select * from jsonb_each_text(_a) union all select * from jsonb_each_text(_b)) as both_sides
    group by key
  ) as added;
$$;

-- What a gate check or a guard's decision adds to the day. Only counts: nothing here says who it was.
create function digigate.tally_event(_org uuid, _site uuid, _type text, _at timestamptz, _payload jsonb) returns void
language plpgsql set search_path = ''
as $$
declare
  _day date := (_at at time zone 'Africa/Johannesburg')::date;
  _hour integer := extract(hour from _at at time zone 'Africa/Johannesburg')::integer + 1;
  _checked integer := case when _type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit') then 1 else 0 end;
  _rules jsonb;
begin
  if _checked = 0 and _type not in ('alert_ack', 'override', 'turned_away') then
    return;
  end if;

  select coalesce(jsonb_object_agg(code, hits), '{}') into _rules
  from (
    select hit ->> 'code' as code, count(*) as hits
    from jsonb_array_elements(coalesce(_payload -> 'hits', '[]')) as hit
    where hit ->> 'code' is not null
    group by 1
  ) as counted;

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

-- Someone or something let through: an entry counts towards the day it arrived, a stay towards the day it ended.
create function digigate.tally_passage(_org uuid, _site uuid, _kind text, _visit_type text, _at timestamptz, _entered timestamptz) returns void
language plpgsql set search_path = ''
as $$
declare
  _day date := (_at at time zone 'Africa/Johannesburg')::date;
begin
  insert into digigate.daily_activity (site_id, org_id, day) values (_site, _org, _day)
  on conflict on constraint daily_activity_pkey do nothing;

  if _entered is not null then
    update digigate.daily_activity a
    set exits = a.exits + 1, stay_minutes = a.stay_minutes + greatest(0, (extract(epoch from _at - _entered) / 60)::bigint)
    where a.site_id = _site and a.org_id = _org and a.day = _day;
    return;
  end if;

  update digigate.daily_activity a
  set
    vehicles_in = a.vehicles_in + case when _kind = 'vehicle' then 1 else 0 end,
    people_in = a.people_in + case when _kind = 'pedestrian' then 1 else 0 end,
    visit_types = digigate.add_counts(a.visit_types, jsonb_build_object(_visit_type, 1))
  where a.site_id = _site and a.org_id = _org and a.day = _day;
end;
$$;

create or replace function digigate.apply_passage(_org uuid, _site uuid, _device uuid, _type text, _payload jsonb, _at timestamptz)
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
  _entered timestamptz;
  _closed_type text;
begin
  if _visit is null then
    return;
  end if;

  if _type like '%_exit' then
    update digigate.visits
    set exited_at = _at, occupants_out = (_payload ->> 'occupants')::integer
    where id = _visit and exited_at is null
    returning entered_at, visit_type into _entered, _closed_type;
    update digigate.visit_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    update digigate.event_details set erase_after = _at + interval '3 years' where visit_id = _visit;
    if _entered is not null then
      perform digigate.tally_passage(_org, _site, _kind, _closed_type, _at, _entered);
    end if;
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

  perform digigate.tally_passage(_org, _site, _kind, _visit_type, _at, null);
end;
$$;

-- The audit log --------------------------------------------------------------------------------------------------------

-- Who did what, and when. `detail` holds field names, rule codes and shift facts, never values: a visitor's name, a PIN
-- or an override's free-text reason has no business here, because this table is never erased.
create table digigate.audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  org_id uuid,
  site_id uuid,
  device_id uuid,
  category text not null check (category in ('access', 'people', 'setup', 'devices', 'alerts', 'reports', 'gate')),
  action text not null,
  actor_id uuid,
  actor_name text,
  target text,
  detail text
);
create index audit_log_time on digigate.audit_log (at desc);
create index audit_log_org_time on digigate.audit_log (org_id, at desc);
create index audit_log_device on digigate.audit_log (device_id);

create or replace function digigate.forbid_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  raise exception 'digigate.% is append-only', tg_table_name;
end;
$$;

create trigger audit_append_only before update or delete on digigate.audit_log
  for each row execute function digigate.forbid_change();
create trigger audit_no_truncate before truncate on digigate.audit_log
  for each statement execute function digigate.forbid_change();

-- The company an administrator runs. Null for everyone else.
create function digigate.admin_org() returns uuid
language sql stable security definer set search_path = ''
as $$
  select p.org_id from digigate.profiles p
  where digigate.mfa_passed() and p.id = auth.uid() and p.is_active and 'admin' = any (p.roles);
$$;

alter table digigate.audit_log enable row level security;
create policy audit_log_read on digigate.audit_log for select to authenticated
  using ((select digigate.is_super_user()) or org_id = (select digigate.admin_org()));
grant select on digigate.audit_log to authenticated;
grant select, insert on digigate.audit_log to service_role;

create function digigate.write_audit(
  _org uuid, _site uuid, _device uuid, _category text, _action text, _actor uuid, _actor_name text, _target text, _detail text,
  _at timestamptz default now()
) returns void
language sql security definer set search_path = ''
as $$
  insert into digigate.audit_log (at, org_id, site_id, device_id, category, action, actor_id, actor_name, target, detail)
  values (_at, _org, _site, _device, _category, _action, _actor, _actor_name, _target, _detail);
$$;

-- A dashboard change to something being set up. Takes the noun, the category and which field names the row.
create function digigate.audit_row() returns trigger
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
      else '.changed'
    end;
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

create trigger audit_organisations after insert or update on digigate.organisations
  for each row execute function digigate.audit_row('company', 'setup');
create trigger audit_clients after insert or update on digigate.clients
  for each row execute function digigate.audit_row('client', 'setup');
create trigger audit_sites after insert or update on digigate.sites
  for each row execute function digigate.audit_row('site', 'setup');
create trigger audit_posts after insert or update on digigate.posts
  for each row execute function digigate.audit_row('post', 'setup');
create trigger audit_gate_users after insert or update on digigate.gate_users
  for each row execute function digigate.audit_row('gate_user', 'people');
create trigger audit_pairing_codes after insert on digigate.pairing_codes
  for each row execute function digigate.audit_row('pairing_code', 'devices');
create trigger audit_devices_added after insert on digigate.devices
  for each row execute function digigate.audit_row('device', 'devices');
-- Every sync stamps last_seen_at, so this only wakes for changes someone made.
create trigger audit_devices_changed after update on digigate.devices
  for each row when (old.revoked_at is distinct from new.revoked_at or old.name is distinct from new.name)
  execute function digigate.audit_row('device', 'devices');

-- An alert closed from the dashboard. Ones a guard settled at the gate are in the log already, from the device.
create function digigate.audit_alert_closed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    perform digigate.write_audit(
      new.org_id, new.site_id, null, 'alerts', 'alert.closed', auth.uid(),
      (select p.full_name from digigate.profiles p where p.id = auth.uid()), new.rule_code, null
    );
  end if;
  return null;
end;
$$;
create trigger audit_alerts after update on digigate.alerts
  for each row when (old.status = 'open' and new.status = 'resolved')
  execute function digigate.audit_alert_closed();

-- What a guard or supervisor did at a gate. Never the employee number from a failed sign-in, and never an override's
-- reason: that's free text, so it stays in the erasable details.
create function digigate.audit_gate_event(_org uuid, _site uuid, _device uuid, _gate_user uuid, _type text, _at timestamptz, _payload jsonb) returns void
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
    end,
    _at
  );
end;
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

    perform digigate.tally_event(_org, _site, _type, _at, _payload);
    if _type in ('sign_in', 'sign_in_failed', 'locked_out', 'sign_out', 'shift_start', 'shift_end', 'override', 'turned_away', 'alert_ack') then
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

-- A dashboard sign-in, recorded once MFA has passed. Anyone can only ever record themselves.
create function digigate.note_sign_in() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _profile record;
begin
  if not digigate.mfa_passed() then
    return;
  end if;
  select p.id, p.full_name, coalesce(p.org_id, c.org_id) as org_id into _profile
  from digigate.profiles p
  left join digigate.clients c on c.id = p.client_id
  where p.id = auth.uid();
  if _profile.id is not null then
    perform digigate.write_audit(_profile.org_id, null, null, 'access', 'dashboard.signed_in', _profile.id, _profile.full_name, null, null);
  end if;
end;
$$;

-- Reports --------------------------------------------------------------------------------------------------------------

create table digigate.report_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  client_id uuid references digigate.clients (id),
  name text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  send_at time not null,
  recipients text[] not null check (cardinality(recipients) between 1 and 50),
  cc text[] not null default '{}',
  bcc text[] not null default '{}',
  message text not null default '',
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_run_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index report_schedules_due on digigate.report_schedules (next_run_at) where is_active;
create index report_schedules_org on digigate.report_schedules (org_id);

create table digigate.report_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  client_id uuid references digigate.clients (id),
  schedule_id uuid references digigate.report_schedules (id) on delete set null,
  frequency text not null,
  period_from date not null,
  period_to date not null,
  subject text not null,
  recipients text[] not null,
  cc text[] not null default '{}',
  bcc text[] not null default '{}',
  status text not null check (status in ('sent', 'failed')),
  problem text,
  provider_id text,
  sent_by uuid,
  sent_at timestamptz not null default now()
);
create index report_sends_org_time on digigate.report_sends (org_id, sent_at desc);

alter table digigate.report_schedules enable row level security;
alter table digigate.report_sends enable row level security;

create policy report_schedules_read on digigate.report_schedules for select to authenticated
  using (digigate.can_manage_org(org_id));
create policy report_schedules_add on digigate.report_schedules for insert to authenticated
  with check (digigate.can_manage_org(org_id)
    and (client_id is null or exists (select 1 from digigate.clients c where c.id = client_id and c.org_id = report_schedules.org_id)));
create policy report_schedules_change on digigate.report_schedules for update to authenticated
  using (digigate.can_manage_org(org_id)) with check (digigate.can_manage_org(org_id));
create policy report_schedules_remove on digigate.report_schedules for delete to authenticated
  using (digigate.can_manage_org(org_id));
create policy report_sends_read on digigate.report_sends for select to authenticated
  using (digigate.can_manage_org(org_id));

grant select, delete on digigate.report_schedules to authenticated;
grant insert (org_id, client_id, name, frequency, send_at, recipients, cc, bcc, message) on digigate.report_schedules to authenticated;
grant update (is_active) on digigate.report_schedules to authenticated;
grant select on digigate.report_sends to authenticated;
grant select, update on digigate.report_schedules to service_role;
grant select, insert on digigate.report_sends to service_role;

create trigger audit_report_schedules after insert or update or delete on digigate.report_schedules
  for each row execute function digigate.audit_row('schedule', 'reports');

-- The day, Monday-to-Sunday week, month, quarter or year that holds a date.
create function digigate.report_period(_frequency text, _day date)
returns table (from_day date, to_day date)
language sql immutable set search_path = ''
as $$
  select
    start_day::date,
    (start_day + length - interval '1 day')::date
  from (
    select
      date_trunc(case _frequency when 'daily' then 'day' when 'weekly' then 'week' when 'monthly' then 'month' when 'quarterly' then 'quarter' else 'year' end, _day::timestamp) as start_day,
      case _frequency
        when 'daily' then interval '1 day'
        when 'weekly' then interval '1 week'
        when 'monthly' then interval '1 month'
        when 'quarterly' then interval '3 months'
        else interval '1 year'
      end as length
  ) as period;
$$;

-- When a schedule next sends, on the site clock: each day, each Monday, or the first day of each month, quarter or year.
create function digigate.next_report_run(_frequency text, _send_at time, _after timestamptz) returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  _local timestamp := _after at time zone 'Africa/Johannesburg';
  _start date;
  _end date;
  _next timestamp;
begin
  select from_day, to_day into _start, _end from digigate.report_period(_frequency, _local::date);
  _next := _start + _send_at;
  if _next <= _local then
    _next := (_end + 1) + _send_at;
  end if;
  return _next at time zone 'Africa/Johannesburg';
end;
$$;

create function digigate.schedule_next_run() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.next_run_at := digigate.next_report_run(new.frequency, new.send_at, now());
  return new;
end;
$$;

create trigger report_schedules_next_run before insert or update of frequency, send_at, is_active on digigate.report_schedules
  for each row execute function digigate.schedule_next_run();

-- A moved client's reports stop with its old company, along with its handhelds and pairing codes.
create or replace function digigate.transfer_client(_client uuid, _new_org uuid) returns void
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
  update digigate.report_schedules set is_active = false where client_id = _client;
  update digigate.clients set org_id = _new_org where id = _client;
end;
$$;

-- Everything a report shows for one company, or one of its clients, over the period holding a date, with the period
-- before it to compare against. A period still running is compared with the same number of days of the one before, so
-- the 2nd of a month isn't "95% down". Counts only, so it's safe to attach to an email. No access check of its own: only
-- the report function and report_summary below call it.
create function digigate.report_data(_org uuid, _client uuid, _frequency text, _day date) returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  _from date;
  _to date;
  _prior_from date;
  _prior_to date;
  _today date := (now() at time zone 'Africa/Johannesburg')::date;
  _result jsonb;
begin
  select from_day, to_day into _from, _to from digigate.report_period(_frequency, _day);
  select from_day, to_day into _prior_from, _prior_to from digigate.report_period(_frequency, _from - 1);
  if _to >= _today then
    _prior_to := least(_prior_to, _prior_from + (_today - _from));
  end if;

  with scoped as (
    select a.*, s.name as site_name, s.client_id, c.name as client_name, a.day >= _from as in_period
    from digigate.daily_activity a
    join digigate.sites s on s.id = a.site_id
    join digigate.clients c on c.id = s.client_id
    where a.org_id = _org
      and (a.day between _prior_from and _prior_to or a.day between _from and _to)
      and (_client is null or s.client_id = _client)
  ),
  totals as (
    select
      in_period,
      jsonb_build_object(
        'checks', coalesce(sum(checks), 0),
        'vehicles_in', coalesce(sum(vehicles_in), 0),
        'people_in', coalesce(sum(people_in), 0),
        'exits', coalesce(sum(exits), 0),
        'stay_minutes', coalesce(sum(stay_minutes), 0),
        'blocked', coalesce(sum(blocked), 0),
        'warnings', coalesce(sum(warnings), 0),
        'overrides', coalesce(sum(overrides), 0),
        'turned_away', coalesce(sum(turned_away), 0),
        'acknowledged', coalesce(sum(acknowledged), 0),
        'active_sites', count(distinct site_id) filter (where checks > 0)
      ) as figures
    from scoped
    group by in_period
  )
  select jsonb_build_object(
    'company', (select o.name from digigate.organisations o where o.id = _org),
    'client', (select c.name from digigate.clients c where c.id = _client and c.org_id = _org),
    'frequency', _frequency,
    'from', _from,
    'to', _to,
    'prior_from', _prior_from,
    'prior_to', _prior_to,
    'in_progress', _to >= _today,
    'totals', coalesce((select figures from totals where in_period), '{}'),
    'prior', coalesce((select figures from totals where not in_period), '{}'),
    'days', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'checks', coalesce(t.checks, 0), 'entries', coalesce(t.entries, 0)) order by d.day)
      from (select generate_series(_from::timestamp, _to::timestamp, interval '1 day')::date as day) as d
      left join (
        select day, sum(checks) as checks, sum(vehicles_in + people_in) as entries from scoped where in_period group by day
      ) as t on t.day = d.day
    ),
    'hours', (
      select jsonb_agg(coalesce(t.total, 0) order by h.hour)
      from generate_series(1, 24) as h (hour)
      left join lateral (select sum(s.hours[h.hour]) as total from scoped s where s.in_period) as t on true
    ),
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object('code', key, 'hits', hits) order by hits desc, key)
      from (
        select r.key, sum(r.value::integer) as hits
        from scoped s, jsonb_each_text(s.rules) as r
        where s.in_period
        group by r.key
      ) as counted
    ), '[]'),
    'visit_types', coalesce((
      select jsonb_agg(jsonb_build_object('type', key, 'visits', visits) order by visits desc, key)
      from (
        select v.key, sum(v.value::integer) as visits
        from scoped s, jsonb_each_text(s.visit_types) as v
        where s.in_period
        group by v.key
      ) as counted
    ), '[]'),
    'sites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'site_id', site_id, 'site', site_name, 'client', client_name, 'checks', checks, 'entries', entries,
        'exits', exits, 'blocked', blocked, 'warnings', warnings, 'overrides', overrides
      ) order by checks desc, site_name)
      from (
        select site_id, site_name, client_name, sum(checks) as checks, sum(vehicles_in + people_in) as entries,
          sum(exits) as exits, sum(blocked) as blocked, sum(warnings) as warnings, sum(overrides) as overrides
        from scoped
        where in_period
        group by site_id, site_name, client_name
      ) as per_site
    ), '[]')
  ) into _result;

  return _result;
end;
$$;

create function digigate.report_summary(_org uuid, _frequency text, _day date, _client uuid default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not digigate.can_manage_org(_org) then
    return null;
  end if;
  return digigate.report_data(_org, _client, _frequency, _day);
end;
$$;

-- One line per company for a day, busiest first, with its last 7 days for the trend. Runs as its owner so a super user's
-- read doesn't check every row against thousands of sites; the WHERE is the access check.
create function digigate.report_board(_day date, _search text, _limit integer, _offset integer)
returns table (
  org_id uuid,
  company text,
  sites bigint,
  active_sites bigint,
  checks bigint,
  entries bigint,
  exits bigint,
  blocked bigint,
  warnings bigint,
  overrides bigint,
  trend integer[],
  total bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    o.name,
    (select count(*) from digigate.sites s where s.org_id = o.id),
    coalesce(t.active_sites, 0),
    coalesce(t.checks, 0),
    coalesce(t.entries, 0),
    coalesce(t.exits, 0),
    coalesce(t.blocked, 0),
    coalesce(t.warnings, 0),
    coalesce(t.overrides, 0),
    array(
      select coalesce(sum(a.checks), 0)::integer
      from generate_series((_day - 6)::timestamp, _day::timestamp, interval '1 day') as d (day)
      left join digigate.daily_activity a on a.org_id = o.id and a.day = d.day::date
      group by d.day
      order by d.day
    ),
    count(*) over ()
  from digigate.organisations o
  left join lateral (
    select
      count(*) filter (where a.checks > 0) as active_sites,
      sum(a.checks) as checks,
      sum(a.vehicles_in + a.people_in) as entries,
      sum(a.exits) as exits,
      sum(a.blocked) as blocked,
      sum(a.warnings) as warnings,
      sum(a.overrides) as overrides
    from digigate.daily_activity a
    where a.org_id = o.id and a.day = _day
  ) as t on true
  where ((select digigate.is_super_user()) or o.id = (select digigate.admin_org()))
    and (_search = '' or o.name ilike _search)
  order by coalesce(t.checks, 0) desc, o.name
  limit least(_limit, 100) offset _offset;
$$;

-- The figures across every company this person can see, for a day and the day before it.
create function digigate.report_day_totals(_day date)
returns table (day date, checks bigint, entries bigint, blocked bigint, warnings bigint, companies bigint)
language sql stable security definer set search_path = ''
as $$
  select
    d.day,
    coalesce(sum(a.checks), 0),
    coalesce(sum(a.vehicles_in + a.people_in), 0),
    coalesce(sum(a.blocked), 0),
    coalesce(sum(a.warnings), 0),
    count(distinct a.org_id) filter (where a.checks > 0)
  from (values (_day), (_day - 1)) as d (day)
  left join digigate.daily_activity a
    on a.day = d.day and ((select digigate.is_super_user()) or a.org_id = (select digigate.admin_org()))
  group by d.day
  order by d.day desc;
$$;

-- How many log entries each category holds in a date range. Runs as the caller, so row security decides whose they count.
create function digigate.audit_summary(_from timestamptz, _to timestamptz, _org uuid default null)
returns table (category text, entries bigint)
language sql stable set search_path = ''
as $$
  select a.category, count(*)
  from digigate.audit_log a
  where a.at >= _from and a.at < _to and (_org is null or a.org_id = _org)
  group by a.category;
$$;

-- What's already in the project goes into the totals once. A new project has nothing to do here.
do $$
declare
  _event record;
  _visit record;
begin
  for _event in
    select e.org_id, e.site_id, e.type, e.occurred_at, coalesce(d.payload, '{}') as payload
    from digigate.events e
    left join digigate.event_details d on d.event_id = e.id
  loop
    perform digigate.tally_event(_event.org_id, _event.site_id, _event.type, _event.occurred_at, _event.payload);
  end loop;

  for _visit in select v.org_id, v.site_id, v.kind, v.visit_type, v.entered_at, v.exited_at from digigate.visits v loop
    perform digigate.tally_passage(_visit.org_id, _visit.site_id, _visit.kind, _visit.visit_type, _visit.entered_at, null);
    if _visit.exited_at is not null then
      perform digigate.tally_passage(_visit.org_id, _visit.site_id, _visit.kind, _visit.visit_type, _visit.exited_at, _visit.entered_at);
    end if;
  end loop;
end;
$$;

revoke all on function digigate.add_counts(jsonb, jsonb) from public;
revoke all on function digigate.tally_event(uuid, uuid, text, timestamptz, jsonb) from public;
revoke all on function digigate.tally_passage(uuid, uuid, text, text, timestamptz, timestamptz) from public;
revoke all on function digigate.write_audit(uuid, uuid, uuid, text, text, uuid, text, text, text, timestamptz) from public;
revoke all on function digigate.audit_gate_event(uuid, uuid, uuid, uuid, text, timestamptz, jsonb) from public;
revoke all on function digigate.audit_row() from public;
revoke all on function digigate.audit_alert_closed() from public;
revoke all on function digigate.admin_org() from public;
revoke all on function digigate.note_sign_in() from public;
revoke all on function digigate.report_period(text, date) from public;
revoke all on function digigate.next_report_run(text, time, timestamptz) from public;
revoke all on function digigate.schedule_next_run() from public;
revoke all on function digigate.report_data(uuid, uuid, text, date) from public;
revoke all on function digigate.report_summary(uuid, text, date, uuid) from public;
revoke all on function digigate.report_board(date, text, integer, integer) from public;
revoke all on function digigate.report_day_totals(date) from public;
revoke all on function digigate.audit_summary(timestamptz, timestamptz, uuid) from public;

grant execute on function digigate.admin_org() to authenticated;
grant execute on function digigate.note_sign_in() to authenticated;
grant execute on function digigate.report_period(text, date) to authenticated;
grant execute on function digigate.next_report_run(text, time, timestamptz) to authenticated;
grant execute on function digigate.report_summary(uuid, text, date, uuid) to authenticated;
grant execute on function digigate.report_board(date, text, integer, integer) to authenticated;
grant execute on function digigate.report_day_totals(date) to authenticated;
grant execute on function digigate.audit_summary(timestamptz, timestamptz, uuid) to authenticated;
grant execute on function digigate.write_audit(uuid, uuid, uuid, text, text, uuid, text, text, text, timestamptz) to service_role;
grant execute on function digigate.report_period(text, date) to service_role;
grant execute on function digigate.next_report_run(text, time, timestamptz) to service_role;
grant execute on function digigate.report_data(uuid, uuid, text, date) to service_role;

commit;
