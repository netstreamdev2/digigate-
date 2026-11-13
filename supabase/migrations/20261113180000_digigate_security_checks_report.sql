-- The daily Security Checks report (the user's decision, 13 November): every gate check of the day before, with the
-- licence photo, name, full ID number, passengers and plate, emailed to the client's managers as a PDF locked with each
-- person's own password. The password is set once by an admin and given to the manager by phone; it is never emailed.
--
-- ID numbers: from the next handheld update, a check carries the driver's or walker's ID number, and digigate-sync
-- encrypts it before anything is stored (payload -> driver/person -> id_number_sealed, AES-256-GCM, bound to the check).
-- The trigger below is the backstop: a plain ID number is removed before a check's details are written, so a handheld
-- that syncs to an older function still never leaves one in the database. Sealed numbers go with the rest of a check's
-- details when those are erased.
--
-- Report passwords are sealed the same way, by digigate-reports, and only it reads this table.

begin;

insert into digigate.schema_version (version) values (51);

create function digigate.strip_plain_id_numbers() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if jsonb_typeof(new.payload -> 'driver') = 'object' and new.payload -> 'driver' ? 'id_number' then
    new.payload := jsonb_set(new.payload, '{driver}', (new.payload -> 'driver') - 'id_number');
  end if;
  if jsonb_typeof(new.payload -> 'person') = 'object' and new.payload -> 'person' ? 'id_number' then
    new.payload := jsonb_set(new.payload, '{person}', (new.payload -> 'person') - 'id_number');
  end if;
  return new;
end;
$$;
revoke all on function digigate.strip_plain_id_numbers() from public;

create trigger strip_plain_id_numbers before insert or update on digigate.event_details
  for each row execute function digigate.strip_plain_id_numbers();

-- One password per company and email address. Row security with no policy: nobody but the service key reads it.
create table digigate.report_pdf_passwords (
  org_id uuid not null references digigate.organisations (id),
  email text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  sealed text not null,
  set_by uuid,
  set_at timestamptz not null default now(),
  primary key (org_id, email)
);
alter table digigate.report_pdf_passwords enable row level security;
revoke all on digigate.report_pdf_passwords from anon, authenticated;
grant select, insert, update, delete on digigate.report_pdf_passwords to service_role;

-- Which of a company's addresses have a password, and since when, for its admins and DigiGate staff. Never the password.
create function digigate.report_pdf_password_status(_org uuid)
returns table (email text, set_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select p.email, p.set_at from digigate.report_pdf_passwords p
  where p.org_id = _org and digigate.can_manage_org(_org)
  order by p.email;
$$;
revoke all on function digigate.report_pdf_password_status(uuid) from public;
grant execute on function digigate.report_pdf_password_status(uuid) to authenticated;

-- A daily schedule can carry the Security Checks report too. Off unless an admin turns it on.
alter table digigate.report_schedules add column security_checks boolean not null default false;
grant insert (security_checks) on digigate.report_schedules to authenticated;
grant update (security_checks) on digigate.report_schedules to authenticated;

-- One day of a company's gate checks, newest first, for the report. The service key only: it carries sealed ID numbers
-- and where the licence photos are kept. Checks from the old system come too, without photo or ID number.
create function digigate.check_sheet(_org uuid, _client uuid, _day date, _limit integer)
returns table (
  id uuid,
  occurred_at timestamptz,
  type text,
  site text,
  scanned_by text,
  visit_type text,
  outcome text,
  person text,
  id_sealed text,
  person_ref text,
  occupants integer,
  plate text,
  photo_path text,
  total bigint
)
language sql stable security definer set search_path = ''
as $$
  with bounds as (
    select _day::timestamp at time zone 'Africa/Johannesburg' as starts,
      (_day + 1)::timestamp at time zone 'Africa/Johannesburg' as ends
  ),
  ours as (
    select
      e.id,
      e.occurred_at,
      e.type,
      s.name as site,
      nullif(concat_ws(' · ', dv.name, g.employee_number), '') as scanned_by,
      d.payload ->> 'visit_type' as visit_type,
      e.outcome,
      coalesce(nullif(trim(concat_ws(' ',
        coalesce(d.payload -> 'driver' ->> 'initials', d.payload -> 'person' ->> 'names', d.payload -> 'person' ->> 'initials'),
        coalesce(d.payload -> 'driver' ->> 'surname', d.payload -> 'person' ->> 'surname')
      )), ''),
        case when d.payload -> 'emergency' ->> 'note' <> '' then 'Emergency: ' || (d.payload -> 'emergency' ->> 'note') else d.payload -> 'emergency' ->> 'label' end
      ) as person,
      coalesce(d.payload -> 'driver' ->> 'id_number_sealed', d.payload -> 'person' ->> 'id_number_sealed') as id_sealed,
      md5(coalesce(d.payload -> 'driver' ->> 'person_key', d.payload -> 'person' ->> 'person_key')) as person_ref,
      case when d.payload ->> 'occupants' ~ '^\d{1,2}$' then (d.payload ->> 'occupants')::integer end as occupants,
      coalesce(d.payload -> 'vehicle' ->> 'plate', d.payload ->> 'typed_plate') as plate,
      d.licence_photo_path as photo_path
    from digigate.events e
    cross join bounds
    join digigate.sites s on s.id = e.site_id
    left join digigate.event_details d on d.event_id = e.id
    left join digigate.devices dv on dv.id = e.device_id
    left join digigate.gate_users g on g.id = d.gate_user_id
    where e.org_id = _org
      and (_client is null or s.client_id = _client)
      and e.type in ('vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit')
      and e.occurred_at >= bounds.starts and e.occurred_at < bounds.ends
  ),
  theirs as (
    select
      i.id,
      i.occurred_at,
      (case when i.plate is not null or i.make is not null then 'vehicle' else 'pedestrian' end)
        || (case when i.direction = 'in' then '_entry' else '_exit' end),
      s.name,
      i.scanned_by,
      i.visit_type,
      null::text,
      i.person_name,
      null::text,
      md5(i.person_key),
      i.occupants,
      i.plate,
      null::text
    from digigate.imported_checks i
    cross join bounds
    join digigate.sites s on s.id = i.site_id
    where i.org_id = _org
      and (_client is null or s.client_id = _client)
      and i.occurred_at >= bounds.starts and i.occurred_at < bounds.ends
  ),
  every_check as (
    select * from ours
    union all
    select * from theirs
  )
  select *, count(*) over () as total
  from every_check
  order by occurred_at desc
  limit greatest(least(_limit, 5000), 0);
$$;
revoke all on function digigate.check_sheet(uuid, uuid, date, integer) from public;
grant execute on function digigate.check_sheet(uuid, uuid, date, integer) to service_role;

commit;
