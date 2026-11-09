-- One list of checks, and the old system's checks in the reports (2026-11-09).
--
-- The checks a site's old gate system recorded (migration 32) were shown on their own, under an "Old system" tab. They
-- now sit in the same list as DigiGate's own, in time order, each marked as the old system's: digigate.all_check_records
-- is the two views together. It adds no visibility of its own: each half applies its own rule, so a company only ever
-- sees its own checks at its own sites, old or new, and a super user sees what they already saw.
--
-- They also count in the reports now. Reports read the anonymous day figures (daily_activity, daily_counts), which
-- DigiGate counts as its own checks arrive; an old check now adds to them when it's imported, and the ones already
-- imported are counted once here. An old check adds a scan and its hour, an entry with its visit type and the sex its
-- driver's licence gave, or an exit. The old system never paired its entries and exits, so its exits have no stay: they
-- are counted as untimed_exits too, and the average stay is taken over the timed ones alone, never dragged towards
-- zero. They have no rule results, so blocked, warnings and overrides are DigiGate's alone. Like DigiGate's own counts,
-- these outlive the three-year erasure of the checks themselves.

begin;

insert into digigate.schema_version (version) values (36);

-- Old checks have no lane: one with a plate or a car described was a vehicle, anything else someone on foot.
create function digigate.imported_kind(_plate text, _make text, _model text, _colour text) returns text
language sql immutable set search_path = ''
as $$
  select case when coalesce(_plate, _make, _model, _colour) is not null then 'vehicle' else 'pedestrian' end;
$$;
revoke all on function digigate.imported_kind(text, text, text, text) from public;

-- ── One list ──────────────────────────────────────────────────────────────────────────────────────────────────────────

create view digigate.all_check_records as
select
  id, org_id, site_id, type, occurred_at, outcome, rule_codes, visit_id, visit_entered_at, visit_type, in_full, post,
  person_name, plate, typed_plate, vehicle_description, vehicle_search,
  'digigate'::text as source, null::integer as occupants, null::text as scanned_by
from digigate.check_records
union all
select
  id, org_id, site_id,
  (case when plate is not null or vehicle_description is not null then 'vehicle' else 'pedestrian' end)
    || (case when direction = 'in' then '_entry' else '_exit' end),
  occurred_at, null::text, '{}'::text[], null::uuid, null::timestamptz, visit_type, in_full, null::text,
  person_name, plate, null::text, vehicle_description, vehicle_search,
  'old-system', occupants, scanned_by
from digigate.imported_check_records;
grant select on digigate.all_check_records to authenticated;

-- ── Old checks in the day figures ─────────────────────────────────────────────────────────────────────────────────────

alter table digigate.daily_activity add column untimed_exits integer not null default 0;

create function digigate.tally_imported_check(_check digigate.imported_checks) returns void
language plpgsql set search_path = ''
as $$
declare
  _day date := (_check.occurred_at at time zone 'Africa/Johannesburg')::date;
  _hour integer := extract(hour from _check.occurred_at at time zone 'Africa/Johannesburg')::integer + 1;
  _kind text := digigate.imported_kind(_check.plate, _check.make, _check.model, _check.colour);
  _type text := coalesce(_check.visit_type, 'not_recorded');
  _in boolean := _check.direction = 'in';
begin
  insert into digigate.daily_activity (site_id, org_id, day) values (_check.site_id, _check.org_id, _day)
  on conflict on constraint daily_activity_pkey do nothing;

  update digigate.daily_activity a
  set
    checks = a.checks + 1,
    hours[_hour] = a.hours[_hour] + 1,
    vehicles_in = a.vehicles_in + case when _in and _kind = 'vehicle' then 1 else 0 end,
    people_in = a.people_in + case when _in and _kind = 'pedestrian' then 1 else 0 end,
    visit_types = case when _in then digigate.add_counts(a.visit_types, jsonb_build_object(_type, 1)) else a.visit_types end,
    exits = a.exits + case when _in then 0 else 1 end,
    untimed_exits = a.untimed_exits + case when _in then 0 else 1 end
  where a.site_id = _check.site_id and a.org_id = _check.org_id and a.day = _day;

  if _in then
    insert into digigate.daily_counts (site_id, org_id, day, kind, visit_type, sex, age_band, visits)
    values (_check.site_id, _check.org_id, _day, _kind, _type, coalesce(_check.sex, 'unknown'), 'unknown', 1)
    on conflict (site_id, day, kind, visit_type, sex, age_band)
    do update set visits = digigate.daily_counts.visits + 1;
  end if;
end;
$$;
revoke all on function digigate.tally_imported_check(digigate.imported_checks) from public;

-- The checks already imported, counted once.
select digigate.tally_imported_check(i) from digigate.imported_checks i;

-- Every one imported from now on, as it arrives. A re-run of an import skips rows it already has, and a skipped row
-- fires nothing, so nothing is counted twice.
create function digigate.count_imported_check() returns trigger
language plpgsql set search_path = ''
as $$
begin
  perform digigate.tally_imported_check(new);
  return null;
end;
$$;
revoke all on function digigate.count_imported_check() from public;

create trigger count_imported_check after insert on digigate.imported_checks
  for each row execute function digigate.count_imported_check();

-- ── The average stay leaves out exits with no stay ────────────────────────────────────────────────────────────────────

create or replace function digigate.report_data(_org uuid, _client uuid, _frequency text, _day date) returns jsonb
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
        -- Exits with a known stay: the old system's exits have none, so the average stay leaves them out.
        'timed_exits', coalesce(sum(exits - untimed_exits), 0),
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

commit;
