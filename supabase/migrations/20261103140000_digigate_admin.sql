-- The Admin tab: a guard's personal record, and each site's shift times.
--
-- A guard's record (photo, address, ID number, PSIRA, next of kin) is personal information under POPIA. Nobody reads or
-- writes the table directly: it has no grants but the service key's, so everything goes through digigate-people, which
-- checks the caller is the company's administrator or a super user, encrypts the ID number, and logs every view. The
-- list of guards below says only what each record has, never what it says. None of it goes to handhelds.
--
-- Shift times move from the gate app's code into each site, and reach the handheld with its snapshot, with the site's
-- name, so the gate shows the place it is really at.

begin;

insert into digigate.schema_version (version) values (19);

create function digigate.valid_shift_periods(_periods jsonb) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(_periods) = 'array'
    and jsonb_array_length(_periods) between 1 and 6
    and not exists (
      select 1 from jsonb_array_elements(_periods) p
      where jsonb_typeof(p) <> 'object'
        or coalesce(p ->> 'code', '') !~ '^[a-z0-9-]{1,30}$'
        or char_length(trim(coalesce(p ->> 'label', ''))) not between 1 and 30
        or coalesce(p ->> 'start', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(p ->> 'end', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or p ->> 'start' = p ->> 'end'
    )
    and (select count(distinct p ->> 'code') from jsonb_array_elements(_periods) p) = jsonb_array_length(_periods);
$$;

alter table digigate.sites add column shift_periods jsonb not null
  default '[{"code":"day","label":"Day","start":"06:00","end":"18:00"},{"code":"night","label":"Night","start":"18:00","end":"06:00"}]'
  check (digigate.valid_shift_periods(shift_periods));
grant update (shift_periods) on digigate.sites to authenticated;

create table digigate.gate_user_records (
  gate_user_id uuid primary key references digigate.gate_users (id),
  org_id uuid not null references digigate.organisations (id),
  photo_path text,
  phone text check (char_length(phone) <= 20),
  home_address text check (char_length(home_address) <= 300),
  id_type text check (id_type in ('sa_id', 'passport')),
  -- Keyed, so the same number can be found twice in one company without anyone being able to work it back.
  id_number_hmac text,
  -- AES-GCM under a key that lives only in the Edge Function's secrets.
  id_number_cipher text,
  id_number_last4 text check (id_number_last4 ~ '^[A-Z0-9]{4}$'),
  psira_number text check (psira_number ~ '^[0-9]{6,10}$'),
  psira_grade text check (psira_grade in ('A', 'B', 'C', 'D', 'E')),
  next_of_kin_name text check (char_length(next_of_kin_name) <= 80),
  next_of_kin_relationship text check (char_length(next_of_kin_relationship) <= 40),
  next_of_kin_phone text check (char_length(next_of_kin_phone) <= 20),
  updated_at timestamptz not null default now(),
  updated_by uuid references digigate.profiles (id),
  constraint gate_user_records_id_whole check (
    (id_type is null) = (id_number_hmac is null) and (id_number_hmac is null) = (id_number_cipher is null) and (id_number_cipher is null) = (id_number_last4 is null)
  )
);
create unique index gate_user_records_id_once on digigate.gate_user_records (org_id, id_number_hmac) where id_number_hmac is not null;
alter table digigate.gate_user_records enable row level security;
revoke all on digigate.gate_user_records from anon, authenticated;
grant select, insert, update on digigate.gate_user_records to service_role;

-- The company's guards with what their records hold, for administrators and super users only.
create function digigate.guard_board(_org uuid, _search text, _status text, _limit integer, _offset integer)
returns table (
  id uuid, employee_number text, first_name text, last_name text, role text, is_active boolean, sites text,
  has_photo boolean, has_id boolean, has_psira boolean, psira_grade text, has_next_of_kin boolean, has_address boolean, total bigint
)
language sql stable security definer set search_path = ''
as $$
  with listed as (
    select g.*, r.photo_path, r.id_number_hmac, r.psira_number, r.psira_grade, r.next_of_kin_name, r.next_of_kin_phone, r.home_address,
      (r.photo_path is not null and r.id_number_hmac is not null and r.psira_number is not null
        and r.next_of_kin_name is not null and r.next_of_kin_phone is not null and r.home_address is not null) as complete
    from digigate.gate_users g
    left join digigate.gate_user_records r on r.gate_user_id = g.id
    where digigate.can_manage_org(_org) and g.org_id = _org
  )
  select l.id, l.employee_number, l.first_name, l.last_name, l.role, l.is_active,
    (select string_agg(s.name, ', ' order by s.name) from digigate.sites s where s.id = any (l.site_ids)),
    l.photo_path is not null, l.id_number_hmac is not null, l.psira_number is not null, l.psira_grade,
    l.next_of_kin_name is not null and l.next_of_kin_phone is not null, l.home_address is not null,
    count(*) over ()
  from listed l
  where (_search = '' or l.first_name || ' ' || l.last_name ilike _search or l.employee_number ilike _search)
    and (_status = '' or (_status = 'incomplete' and not l.complete) or (_status = 'complete' and l.complete))
  order by l.first_name, l.last_name, l.employee_number
  limit least(_limit, 100) offset _offset;
$$;
revoke all on function digigate.guard_board(uuid, text, text, integer, integer) from public;
grant execute on function digigate.guard_board(uuid, text, text, integer, integer) to authenticated;

-- Guard photos, like selfies, are private with no policy: only the service key behind digigate-people reaches them.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('guard-photos', 'guard-photos', false, 600000, array['image/jpeg'])
    on conflict (id) do nothing;
  end if;
end;
$$;

-- The site's name and shift times go to the handheld with everything else.
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
