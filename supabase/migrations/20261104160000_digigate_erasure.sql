-- The erasure job. People's details are kept for three years after a visit ends (masked after the first 365 days, see
-- check_detail), then erased for good. What stays is the bare event, with nothing that identifies anyone, and the
-- anonymous daily counts.
--
-- Every night, digigate.erase_due() deletes what is due, all in the database: each check's and each visit's details,
-- finished shifts with their selfie, hotlist entries and bookings past their time, and the free-text note on alerts
-- about erased checks. Photos live in Storage, which the database can't empty itself, so their paths go onto a queue in
-- the same transaction, and digigate-erasure removes them from Storage a little later. A file it can't remove stays
-- queued for the next night, so nothing is ever left behind untracked.
--
-- Each company's audit log gets one line a night saying how much was erased: counts only, never whose.

begin;

insert into digigate.schema_version (version) values (24);

alter table digigate.audit_log drop constraint audit_log_category_check;
alter table digigate.audit_log add constraint audit_log_category_check
  check (category in ('access', 'people', 'setup', 'devices', 'alerts', 'reports', 'gate', 'privacy'));

-- Files whose records are gone, waiting to be deleted from Storage.
create table digigate.erasure_files (
  bucket text not null check (bucket in ('licence-photos', 'shift-selfies')),
  path text not null,
  queued_at timestamptz not null default now(),
  primary key (bucket, path)
);
alter table digigate.erasure_files enable row level security;
grant select, delete on digigate.erasure_files to service_role;

-- `_batch` caps each kind per run, so a backlog spreads over a few nights instead of one long lock.
create function digigate.erase_due(_batch integer default 5000) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _checks jsonb;
  _visits jsonb;
  _shifts jsonb;
  _hotlist jsonb;
  _bookings jsonb;
  _photos jsonb;
  _org text;
  _line text;
begin
  with due as (
    select d.event_id, d.org_id, d.licence_photo_path from digigate.event_details d
    where d.erase_after <= now() order by d.erase_after limit _batch
  ),
  queued as (
    insert into digigate.erasure_files (bucket, path)
    select 'licence-photos', due.licence_photo_path from due where due.licence_photo_path is not null
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
    coalesce((select jsonb_object_agg(org_id, n) from (select org_id, count(*) n from due where licence_photo_path is not null group by org_id) c), '{}')
  into _checks, _photos;

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
      union select jsonb_object_keys(_hotlist) union select jsonb_object_keys(_bookings)
    ) as keys(key)
  loop
    _line := concat_ws(', ',
      case when (_checks ->> _org)::integer > 0 then (_checks ->> _org) || ' checks' end,
      case when (_visits ->> _org)::integer > 0 then (_visits ->> _org) || ' visits' end,
      case when (_photos ->> _org)::integer > 0 then (_photos ->> _org) || ' licence photos' end,
      case when (_shifts ->> _org)::integer > 0 then (_shifts ->> _org) || ' shifts' end,
      case when (_hotlist ->> _org)::integer > 0 then (_hotlist ->> _org) || ' hotlist entries' end,
      case when (_bookings ->> _org)::integer > 0 then (_bookings ->> _org) || ' bookings' end
    );
    perform digigate.write_audit(_org::uuid, null, null, 'privacy', 'erasure.ran', null, 'DigiGate', 'records over three years old', _line);
  end loop;

  return jsonb_build_object(
    'checks', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_checks)),
    'visits', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_visits)),
    'shifts', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_shifts)),
    'hotlist', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_hotlist)),
    'bookings', (select coalesce(sum(value::integer), 0) from jsonb_each_text(_bookings)),
    'filesQueued', (select count(*) from digigate.erasure_files)
  );
end;
$$;
revoke all on function digigate.erase_due(integer) from public;
grant execute on function digigate.erase_due(integer) to service_role;

-- Storage has removed these, so they leave the queue.
create function digigate.erasure_files_done(_bucket text, _paths text[]) returns void
language sql security definer set search_path = ''
as $$
  delete from digigate.erasure_files where bucket = _bucket and path = any (_paths);
$$;
revoke all on function digigate.erasure_files_done(text, text[]) from public;
grant execute on function digigate.erasure_files_done(text, text[]) to service_role;

-- digigate-erasure is called by the schedule below and no one else: the caller must know a secret kept in Vault.
create function digigate.erasure_token_ok(_token text) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if to_regclass('vault.decrypted_secrets') is null or coalesce(_token, '') = '' then
    return false;
  end if;
  return exists (select 1 from vault.decrypted_secrets s where s.name = 'digigate_erasure_token' and s.decrypted_secret = _token);
end;
$$;
revoke all on function digigate.erasure_token_ok(text) from public;
grant execute on function digigate.erasure_token_ok(text) to service_role;

-- The schedule, where the database has pg_cron, pg_net and Vault (Supabase does; the test database doesn't).
-- 23:30 and 23:45 UTC are 01:30 and 01:45 in South Africa, the quietest hours at a gate. The second job needs the
-- project's own address in Vault as digigate_project_url (see the project notes): each project has its own.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'supabase_vault') then
    if not exists (select 1 from vault.secrets where name = 'digigate_erasure_token') then
      perform vault.create_secret(
        encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'),
        'digigate_erasure_token',
        'Lets the nightly schedule call the digigate-erasure function'
      );
    end if;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') and exists (select 1 from pg_extension where extname = 'pg_net') then
    perform cron.schedule('digigate-erase-due', '30 23 * * *', 'select digigate.erase_due(5000)');
    perform cron.schedule('digigate-erase-files', '45 23 * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'digigate_project_url') || '/functions/v1/digigate-erasure',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-erasure-token', (select decrypted_secret from vault.decrypted_secrets where name = 'digigate_erasure_token')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'digigate_project_url')
    $job$);
  end if;
end;
$$;

commit;
