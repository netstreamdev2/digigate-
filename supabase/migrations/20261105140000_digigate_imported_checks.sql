-- Checks brought over from the site's old gate system, kept apart from DigiGate's own. DigiGate's events are its own
-- scans, immutable, with rule results, photos and an audit trail; an old system's rows have none of that, so they live
-- in their own table and show on the Checks page under "Old system", never mixed in.
--
-- They are personal information and kept exactly like DigiGate's checks: seen by whoever sees that site's checks, in
-- full for 365 days and masked after, and erased three years after each check by the nightly job. ID numbers never
-- arrive: the import script turns each into the company's person key on the PC that runs it, so a returning driver is
-- recognised (by the hotlist, by history) without the number itself ever being stored. GPS points and free-text notes
-- from the old system are left out. A client's view-only login sees no guard names, as for DigiGate's own checks.

begin;

insert into digigate.schema_version (version) values (32);

create table digigate.imported_checks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references digigate.organisations (id),
  site_id uuid not null references digigate.sites (id),
  -- Which system it came from, and that system's own id for the check, so an import can be run again safely.
  source text not null check (source in ('old-system')),
  source_ref text not null,
  occurred_at timestamptz not null,
  direction text not null check (direction in ('in', 'out')),
  person_key text,
  person_name text,
  sex text check (sex in ('male', 'female')),
  licence_expires_on date,
  plate text,
  vin text,
  make text,
  model text,
  colour text,
  body text,
  visit_type text,
  occupants integer check (occupants between 1 and 99),
  scanned_by text,
  erase_after timestamptz not null,
  imported_at timestamptz not null default now(),
  unique (org_id, source, source_ref)
);
create index imported_checks_site_time on digigate.imported_checks (site_id, occurred_at desc);
create index imported_checks_person on digigate.imported_checks (person_key);
create index imported_checks_erase on digigate.imported_checks (erase_after);
-- Row security with no policy: nobody reads the table itself, only the view below, which applies the same visibility
-- as DigiGate's own checks.
alter table digigate.imported_checks enable row level security;

create view digigate.imported_check_records as
select
  id,
  org_id,
  site_id,
  source,
  occurred_at,
  direction,
  visit_type,
  occupants,
  in_full,
  case when in_full then person_name else digigate.mask(person_name) end as person_name,
  case when in_full then plate else digigate.mask(plate) end as plate,
  case when in_full then sex end as sex,
  case when in_full then licence_expires_on end as licence_expires_on,
  nullif(concat_ws(' · ', nullif(trim(concat_ws(' ', make, model)), ''), colour), '') as vehicle_description,
  body,
  case when in_full then nullif(lower(concat_ws(' ', make, model, colour, body)), '') end as vehicle_search,
  case when (select digigate.viewer_client()) is null then scanned_by end as scanned_by
from (
  select i.*, i.occurred_at > now() - interval '365 days' as in_full
  from digigate.imported_checks i
  where i.site_id = any ((select digigate.visible_site_ids())::uuid[])
    and ((select digigate.viewer_org()) is null or i.org_id = (select digigate.viewer_org()))
) as shown;
grant select on digigate.imported_check_records to authenticated;

-- One batch of old-system checks for one site, as the import script sends it. Rows already imported are skipped, so a
-- run cut off part-way is simply run again. The import is logged once a batch, in counts.
create function digigate.import_old_checks(_org uuid, _site uuid, _rows jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  _added integer;
begin
  if not exists (select 1 from digigate.sites s where s.id = _site and s.org_id = _org) then
    raise exception 'That site is not one of this company''s.';
  end if;

  insert into digigate.imported_checks (
    org_id, site_id, source, source_ref, occurred_at, direction, person_key, person_name, sex, licence_expires_on,
    plate, vin, make, model, colour, body, visit_type, occupants, scanned_by, erase_after
  )
  select
    _org, _site, 'old-system', r ->> 'ref', (r ->> 'at')::timestamptz, r ->> 'direction',
    nullif(r ->> 'person_key', ''), nullif(r ->> 'name', ''), nullif(r ->> 'sex', ''),
    case when r ->> 'licence_expires_on' ~ '^\d{4}-\d{2}-\d{2}$' then (r ->> 'licence_expires_on')::date end,
    nullif(r ->> 'plate', ''), nullif(r ->> 'vin', ''), nullif(r ->> 'make', ''), nullif(r ->> 'model', ''),
    nullif(r ->> 'colour', ''), nullif(r ->> 'body', ''), nullif(r ->> 'visit_type', ''),
    case when r ->> 'occupants' ~ '^\d{1,2}$' and (r ->> 'occupants')::integer between 1 and 99 then (r ->> 'occupants')::integer end,
    nullif(r ->> 'scanned_by', ''),
    (r ->> 'at')::timestamptz + interval '3 years'
  from jsonb_array_elements(_rows) r
  -- Anything already three years old would only be erased the same night, so it never comes in.
  where (r ->> 'at')::timestamptz > now() - interval '3 years'
  on conflict (org_id, source, source_ref) do nothing;
  get diagnostics _added = row_count;

  if _added > 0 then
    perform digigate.write_audit(_org, _site, null, 'setup', 'import.old_checks', null, 'DigiGate',
      (select s.name from digigate.sites s where s.id = _site), _added || ' checks from the old system');
  end if;
  return _added;
end;
$$;
revoke all on function digigate.import_old_checks(uuid, uuid, jsonb) from public;

-- The erasure job also erases old-system checks three years after each one.
create or replace function digigate.erase_due(_batch integer default 5000) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _checks jsonb;
  _visits jsonb;
  _shifts jsonb;
  _hotlist jsonb;
  _bookings jsonb;
  _photos jsonb;
  _plates jsonb;
  _imported jsonb;
  _org text;
  _line text;
begin
  with due as (
    select d.event_id, d.org_id, d.licence_photo_path, d.plate_photo_path from digigate.event_details d
    where d.erase_after <= now() order by d.erase_after limit _batch
  ),
  queued as (
    insert into digigate.erasure_files (bucket, path)
    select 'licence-photos', due.licence_photo_path from due where due.licence_photo_path is not null
    union all
    select 'plate-photos', due.plate_photo_path from due where due.plate_photo_path is not null
    on conflict do nothing
    returning 1
  ),
  notes as (
    update digigate.alerts a set resolution = null
    where a.event_id in (select due.event_id from due) and a.resolution is not null
    returning 1
  ),
  gone as (
    delete from digigate.event_details d using due where d.event_id = due.event_id returning d.org_id
  )
  select
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from gone group by org_id) c), '{}'),
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from due where licence_photo_path is not null group by org_id) c), '{}'),
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from due where plate_photo_path is not null group by org_id) c), '{}')
  into _checks, _photos, _plates;

  with due as (
    select d.visit_id from digigate.visit_details d where d.erase_after <= now() order by d.erase_after limit _batch
  ),
  gone as (
    delete from digigate.visit_details d using due where d.visit_id = due.visit_id returning d.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _visits from (select org_id, count(*) n from gone group by org_id) c;

  with due as (
    select s.id, s.org_id, s.selfie_path from digigate.shifts s
    where s.ended_at is not null and s.erase_after <= now() order by s.erase_after limit _batch
  ),
  queued as (
    insert into digigate.erasure_files (bucket, path)
    select 'shift-selfies', due.selfie_path from due where due.selfie_path is not null
    on conflict do nothing
    returning 1
  ),
  gone as (
    delete from digigate.shifts s using due where s.id = due.id returning s.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _shifts from (select org_id, count(*) n from gone group by org_id) c;

  with gone as (
    delete from digigate.imported_checks i where i.id in (
      select id from digigate.imported_checks where erase_after <= now() order by erase_after limit _batch
    ) returning i.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _imported from (select org_id, count(*) n from gone group by org_id) c;

  with gone as (
    delete from digigate.hotlist h where h.id in (
      select id from digigate.hotlist where erase_after <= now() order by erase_after limit _batch
    ) returning h.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _hotlist from (select org_id, count(*) n from gone group by org_id) c;

  with gone as (
    delete from digigate.expected_visitors b where b.id in (
      select id from digigate.expected_visitors where erase_after <= now() order by erase_after limit _batch
    ) returning b.org_id
  )
  select coalesce(jsonb_object_agg(org_id, n), '{}') into _bookings from (select org_id, count(*) n from gone group by org_id) c;

  for _org in
    select distinct key from (
      select jsonb_object_keys(_checks) union select jsonb_object_keys(_visits) union select jsonb_object_keys(_shifts)
      union select jsonb_object_keys(_hotlist) union select jsonb_object_keys(_bookings) union select jsonb_object_keys(_imported)
    ) as keys(key)
  loop
    _line := concat_ws(', ',
      case when (_checks ->> _org)::integer > 0 then (_checks ->> _org) || ' checks' end,
      case when (_visits ->> _org)::integer > 0 then (_visits ->> _org) || ' visits' end,
      case when (_photos ->> _org)::integer > 0 then (_photos ->> _org) || ' licence photos' end,
      case when (_plates ->> _org)::integer > 0 then (_plates ->> _org) || ' plate photos' end,
      case when (_shifts ->> _org)::integer > 0 then (_shifts ->> _org) || ' shifts' end,
      case when (_hotlist ->> _org)::integer > 0 then (_hotlist ->> _org) || ' hotlist entries' end,
      case when (_bookings ->> _org)::integer > 0 then (_bookings ->> _org) || ' bookings' end,
      case when (_imported ->> _org)::integer > 0 then (_imported ->> _org) || ' old-system checks' end
    );
    perform digigate.write_audit(_org::uuid, null, null, 'privacy', 'erasure.ran', null, 'DigiGate', 'records over three years old', _line);
  end loop;

  return jsonb_build_object(
    'checks', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_checks)),
    'visits', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_visits)),
    'shifts', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_shifts)),
    'hotlist', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_hotlist)),
    'bookings', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_bookings)),
    'imported', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_imported)),
    'filesQueued', (select count(*) from digigate.erasure_files)
  );
end;
$$;

commit;
