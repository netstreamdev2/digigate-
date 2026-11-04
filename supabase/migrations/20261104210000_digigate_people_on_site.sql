-- People, not visits. A car with three people in it is three people on site, so "on site now" counts passengers, on the
-- super user's company cards and the control room's site list alike, and matches the handheld's own figure. The cars
-- are counted beside them. The handheld's snapshot also carries the site's car park, for its parking tile.

begin;

insert into digigate.schema_version (version) values (27);

drop function digigate.company_board(text, integer, integer);
create function digigate.company_board(_search text, _limit integer, _offset integer)
returns table (
  id uuid, name text, is_active boolean, logo_path text, brand_color text,
  clients bigint, sites bigint, gate_staff bigint, on_site bigint, cars_on_site bigint, open_alerts bigint, total bigint
)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.is_active,
    o.logo_path,
    o.brand_color,
    (select count(*) from digigate.clients c where c.org_id = o.id),
    (select count(*) from digigate.sites s where s.org_id = o.id),
    (select count(*) from digigate.gate_users g where g.org_id = o.id),
    -- Through each site, so both counts use the partial index on visits still open.
    (select coalesce(sum(case when v.kind = 'vehicle' then greatest(1, coalesce(v.occupants_in, 1)) else 1 end), 0)
      from digigate.visits v join digigate.sites s on s.id = v.site_id where s.org_id = o.id and v.exited_at is null),
    (select count(*) from digigate.visits v join digigate.sites s on s.id = v.site_id
      where s.org_id = o.id and v.exited_at is null and v.kind = 'vehicle'),
    (select count(*) from digigate.alerts a join digigate.sites s on s.id = a.site_id
      where s.org_id = o.id and a.status = 'open' and a.severity = 'red'),
    count(*) over ()
  from digigate.organisations o
  where (select digigate.is_super_user()) and (_search = '' or o.name ilike _search)
  order by o.name
  limit least(_limit, 100) offset _offset;
$$;
revoke all on function digigate.company_board(text, integer, integer) from public;
grant execute on function digigate.company_board(text, integer, integer) to authenticated;

create or replace function digigate.site_board(_search text, _limit integer, _offset integer, _org uuid default null)
returns table (site_id uuid, site_name text, client_name text, red bigint, amber bigint, on_site bigint, on_duty bigint, total bigint)
language sql stable set search_path = ''
as $$
  with open_alerts as (
    select a.site_id, count(*) filter (where a.severity = 'red') as red, count(*) filter (where a.severity = 'amber') as amber
    from digigate.alerts a
    where a.status = 'open'
    group by a.site_id
  )
  select
    s.id,
    s.name,
    c.name,
    coalesce(o.red, 0),
    coalesce(o.amber, 0),
    (select coalesce(sum(case when r.kind = 'vehicle' then greatest(1, coalesce(r.occupants_in, 1)) else 1 end), 0)
      from digigate.visit_records r where r.site_id = s.id and r.exited_at is null),
    (select count(*) from digigate.shifts x where x.site_id = s.id and x.ended_at is null and x.started_at > now() - interval '14 hours'),
    count(*) over ()
  from digigate.sites s
  join digigate.clients c on c.id = s.client_id
  left join open_alerts o on o.site_id = s.id
  where (_search = '' or s.name ilike _search or c.name ilike _search)
    and (_org is null or s.org_id = _org)
  order by coalesce(o.red, 0) desc, coalesce(o.amber, 0) desc, c.name, s.name
  limit least(_limit, 100) offset _offset;
$$;

create or replace function digigate.device_snapshot(_device_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with device as (
    select d.org_id, d.site_id from digigate.devices d where d.id = _device_id and d.revoked_at is null
  ),
  open_visits as (
    select v.id, v.kind, v.visit_type, v.entered_at, v.occupants_in
    from digigate.visits v
    join device on device.site_id = v.site_id and device.org_id = v.org_id
    where v.exited_at is null
    order by v.entered_at desc
    limit 5000
  )
  select jsonb_build_object(
    'siteName', (select s.name from digigate.sites s join device on device.site_id = s.id),
    'shiftPeriods', (select s.shift_periods from digigate.sites s join device on device.site_id = s.id),
    -- The car park, so the guard's home screen can say how many spaces are free.
    'parking', (select jsonb_build_object('open', s.open_parking, 'spaces', s.parking_spaces) from digigate.sites s join device on device.site_id = s.id),
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
    ), '[]'),
    'openVisits', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id,
        'kind', v.kind,
        'visitType', v.visit_type,
        'enteredAt', (extract(epoch from v.entered_at) * 1000)::bigint,
        'occupants', v.occupants_in,
        'personKey', d.person_key,
        'personName', d.person_name,
        'vin', d.vin,
        'plate', d.plate,
        'discNumber', d.disc_number,
        'discExpiresOn', d.disc_expires_on,
        'vehicleDescription', d.vehicle_description
      ))
      from open_visits v
      join digigate.visit_details d on d.visit_id = v.id
    ), '[]'),
    -- An entry that runs out stops matching on the handheld at the same moment, even if it hasn't synced since.
    'hotlist', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'kind', h.kind,
        'key', h.match_key,
        'guardNote', h.guard_note,
        'expiresAt', (extract(epoch from h.expires_at) * 1000)::bigint
      ))
      from device
      cross join lateral (
        select * from digigate.hotlist h
        where h.org_id = device.org_id and (h.site_id is null or h.site_id = device.site_id)
          and h.removed_at is null and (h.expires_at is null or h.expires_at > now())
        order by h.created_at desc
        limit 5000
      ) h
    ), '[]'),
    -- Today's and the next few days' bookings, so a handheld that goes offline still knows who is coming.
    'expectedVisitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id,
        'name', b.visitor_name,
        'personKey', b.person_key,
        'plate', b.plate_key,
        'visitType', b.visit_type,
        'note', b.note,
        'from', (extract(epoch from b.valid_from) * 1000)::bigint,
        'until', (extract(epoch from b.valid_until) * 1000)::bigint
      ))
      from device
      cross join lateral (
        select * from digigate.expected_visitors b
        where b.site_id = device.site_id and b.org_id = device.org_id and b.cancelled_at is null
          and b.valid_until > now() and b.valid_from < now() + interval '3 days'
        order by b.valid_from
        limit 2000
      ) b
    ), '[]'),
    'siteToday', (
      select jsonb_build_object(
        'openAlerts', (
          select count(*) from digigate.alerts a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.status = 'open' and a.severity in ('red', 'amber')
        ),
        'exits', coalesce((
          select a.exits from digigate.daily_activity a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.day = (now() at time zone 'Africa/Johannesburg')::date
        ), 0),
        'stayMinutes', coalesce((
          select a.stay_minutes from digigate.daily_activity a
          where a.site_id = device.site_id and a.org_id = device.org_id and a.day = (now() at time zone 'Africa/Johannesburg')::date
        ), 0)
      )
      from device
    )
  );
$$;

commit;
