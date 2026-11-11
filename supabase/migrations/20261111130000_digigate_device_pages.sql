-- The Devices page rebuilt for managing handhelds. The list gains each device's data used this bundle period; each
-- device gets a page of its own with its health and SIM, its mobile data by day, and what happened to it (switched
-- off, no signal, SIM out, released, and the rest); and an admin sets the SIM's number and bundle.
--
-- Data use and the SIM's details are the security company's business, so a client's view-only login gets neither.
-- A bundle period starts on the day it renews (the 1st when none is set); a renewal day past the end of a short
-- month falls on its last day.

begin;

insert into digigate.schema_version (version) values (41);

-- Set like the device's name: an admin of its company only (devices_change), and in the audit log.
grant update (sim_number, data_bundle_mb, data_renews_day) on digigate.devices to authenticated;

create function digigate.audit_device_plan() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform digigate.write_audit(new.org_id, new.site_id, new.id, 'devices', 'device.plan_set', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()), new.name,
    concat_ws(' · ',
      case when new.data_bundle_mb is not null then new.data_bundle_mb || ' MB bundle' end,
      case when new.data_renews_day is not null then 'renews on day ' || new.data_renews_day end,
      case when new.sim_number is distinct from old.sim_number then 'SIM number ' || case when new.sim_number is null then 'cleared' else 'set' end end));
  return null;
end;
$$;
revoke all on function digigate.audit_device_plan() from public;
create trigger audit_device_plan after update on digigate.devices
  for each row when (old.sim_number is distinct from new.sim_number or old.data_bundle_mb is distinct from new.data_bundle_mb
    or old.data_renews_day is distinct from new.data_renews_day)
  execute function digigate.audit_device_plan();

create function digigate.data_period_start(_renews_day smallint, _today date) returns date
language sql immutable set search_path = ''
as $$
  with months as (
    select date_trunc('month', _today)::date as this_month, (date_trunc('month', _today) - interval '1 month')::date as last_month
  ),
  days as (
    select this_month, last_month,
      least(coalesce(_renews_day, 1), extract(day from this_month + interval '1 month - 1 day')::int) as this_day,
      least(coalesce(_renews_day, 1), extract(day from this_month - interval '1 day')::int) as last_day
    from months
  )
  select case when _today >= this_month + (this_day - 1) then this_month + (this_day - 1) else last_month + (last_day - 1) end
  from days;
$$;
grant execute on function digigate.data_period_start(smallint, date) to authenticated;

drop function digigate.device_board(text, text, integer, integer, uuid);

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
    f.health,
    f.health_at,
    case when (select digigate.viewer_client()) is null then d.data_bundle_mb end,
    case when (select digigate.viewer_client()) is null then used.bytes end,
    case when (select digigate.viewer_client()) is null then used.whole end
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
revoke all on function digigate.device_board(text, text, integer, integer, uuid) from public;
grant execute on function digigate.device_board(text, text, integer, integer, uuid) to authenticated;

-- One device, if the viewer can see it: what the list shows, plus its SIM and bundle and whether they may change them.
create function digigate.device_detail(_device uuid)
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
    f.status, f.health, f.health_at,
    case when (select digigate.viewer_client()) is null then d.sim_number end,
    case when (select digigate.viewer_client()) is null then d.data_bundle_mb end,
    case when (select digigate.viewer_client()) is null then d.data_renews_day end,
    digigate.data_period_start(d.data_renews_day, (now() at time zone 'Africa/Johannesburg')::date),
    digigate.can_manage_org(d.org_id) and d.revoked_at is null
  from digigate.fleet('', null) f
  join digigate.devices d on d.id = f.id
  where f.id = _device;
$$;
revoke all on function digigate.device_detail(uuid) from public;
grant execute on function digigate.device_detail(uuid) to authenticated;

-- Mobile data by day, oldest first, for up to 90 days. Nothing for a client's login or a device the viewer can't see.
create function digigate.device_data(_device uuid, _days integer)
returns table (day date, device_bytes bigint, app_bytes bigint)
language sql stable security definer set search_path = ''
as $$
  select x.day, x.device_bytes, x.app_bytes
  from digigate.device_data_days x
  where x.device_id = _device
    and x.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and (select digigate.viewer_client()) is null
    and x.day > (now() at time zone 'Africa/Johannesburg')::date - least(greatest(_days, 1), 90)
  order by x.day;
$$;
revoke all on function digigate.device_data(uuid, integer) from public;
grant execute on function digigate.device_data(uuid, integer) to authenticated;

-- What the handheld reported about itself, newest first, a page at a time (before `_before`, when given).
create function digigate.device_story(_device uuid, _limit integer, _before timestamptz default null)
returns table (at timestamptz, kind text, battery integer, reason text, actor text)
language sql stable security definer set search_path = ''
as $$
  select e.occurred_at,
    case e.type when 'handheld_released' then case when (x.payload ->> 'released')::boolean then 'released' else 'release_failed' end
      else x.payload ->> 'status' end,
    case when jsonb_typeof(x.payload -> 'battery') = 'number' then (x.payload ->> 'battery')::numeric::integer end,
    x.payload ->> 'reason',
    case when e.type = 'handheld_released' and (select digigate.viewer_client()) is null then trim(g.first_name || ' ' || g.last_name) end
  from digigate.events e
  join digigate.event_details x on x.event_id = e.id
  left join digigate.gate_users g on g.id = x.gate_user_id
  where e.device_id = _device
    and e.type in ('device_status', 'handheld_released')
    and e.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or e.org_id = (select digigate.viewer_org()))
    and (_before is null or e.occurred_at < _before)
  order by e.occurred_at desc
  limit least(greatest(_limit, 1), 100);
$$;
revoke all on function digigate.device_story(uuid, integer, timestamptz) from public;
grant execute on function digigate.device_story(uuid, integer, timestamptz) to authenticated;

commit;
