-- Made-up daily totals for the load-test companies, so the Reports page has companies to compare. One site each for 13
-- months: only anonymous counts, so it takes a few megabytes. Test projects only. load-test-remove.sql takes it all out.

begin;

insert into digigate.daily_activity (site_id, org_id, day, checks, vehicles_in, people_in, exits, stay_minutes, blocked, warnings, overrides, turned_away, acknowledged, hours, rules, visit_types)
select
  site.id,
  site.org_id,
  day.day,
  shape.checks,
  round(shape.checks * 0.28)::integer,
  round(shape.checks * 0.2)::integer,
  round(shape.checks * 0.47)::integer,
  round(shape.checks * 0.47 * 86)::bigint,
  round(shape.checks * 0.008)::integer,
  round(shape.checks * 0.015)::integer,
  round(shape.checks * 0.002)::integer,
  round(shape.checks * 0.006)::integer,
  round(shape.checks * 0.012)::integer,
  array(select round(shape.checks * share)::integer from unnest(array[.003, .002, .002, .002, .004, .016, .08, .11, .08, .058, .063, .075, .074, .069, .063, .069, .087, .098, .075, .046, .029, .021, .014, .008]) as share),
  jsonb_build_object(
    'OCCUPANT_COUNT_DROP', round(shape.checks * 0.009),
    'DISC_EXPIRED', round(shape.checks * 0.008),
    'LICENCE_EXPIRED', round(shape.checks * 0.006),
    'PLATE_DISC_MISMATCH', round(shape.checks * 0.004),
    'DRIVER_VEHICLE_MISMATCH', round(shape.checks * 0.002),
    'UNKNOWN_DRIVER', round(shape.checks * 0.002)
  ),
  jsonb_build_object(
    'visitor', round(shape.checks * 0.29),
    'staff', round(shape.checks * 0.12),
    'delivery', round(shape.checks * 0.04),
    'contractor', round(shape.checks * 0.03)
  )
from (
  select distinct on (s.org_id) s.id, s.org_id
  from digigate.sites s
  join digigate.organisations o on o.id = s.org_id
  where o.slug like 'load-test-%'
  order by s.org_id, s.created_at, s.id
) as site
cross join generate_series((current_date - 400)::timestamp, current_date::timestamp, interval '1 day') as raw_day (value)
cross join lateral (select raw_day.value::date as day) as day
cross join lateral (
  select round(
    (40 + (('x' || left(md5(site.org_id::text), 4))::bit(16)::integer % 460))
    * (case when extract(isodow from day.day) > 5 then 0.62 else 1 end)
    * (1 + 0.18 * sin(extract(doy from day.day) / 29.0))
    * (0.88 + random() * 0.24)
  )::integer as checks
) as shape
on conflict on constraint daily_activity_pkey do nothing;

commit;
