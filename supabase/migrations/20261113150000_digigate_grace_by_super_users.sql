-- A site's launch grace is started and ended by DigiGate's super users only (the user's decision, 13 November).
-- Until now a company's own admins could start it, and a company could keep softening its own exit checks by starting it
-- again. Its admins and control room still see whether it's running and when it ends; they ask DigiGate to start it.
-- Everything else about the grace is as migration 34 made it.

begin;

insert into digigate.schema_version (version) values (49);

create or replace function digigate.start_launch_grace(_site uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
  _until timestamptz := now() + interval '7 days';
begin
  if not digigate.is_super_user() then
    raise exception 'Only DigiGate can start a launch grace.' using errcode = '42501';
  end if;
  select s.org_id into _org from digigate.sites s where s.id = _site;
  if _org is null then
    raise exception 'not found' using errcode = '42501';
  end if;
  update digigate.sites set launch_grace_until = _until where id = _site;
  perform digigate.write_audit(_org, _site, null, 'setup', 'site.grace_started', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()),
    (select s.name from digigate.sites s where s.id = _site), 'until ' || to_char(_until at time zone 'Africa/Johannesburg', 'DD Mon YYYY HH24:MI'));
  return _until;
end;
$$;

create or replace function digigate.end_launch_grace(_site uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  _org uuid;
begin
  if not digigate.is_super_user() then
    raise exception 'Only DigiGate can end a launch grace.' using errcode = '42501';
  end if;
  select s.org_id into _org from digigate.sites s where s.id = _site and s.launch_grace_until > now();
  if _org is null then
    return;
  end if;
  update digigate.sites set launch_grace_until = now() where id = _site;
  perform digigate.write_audit(_org, _site, null, 'setup', 'site.grace_ended', auth.uid(),
    (select p.full_name from digigate.profiles p where p.id = auth.uid()),
    (select s.name from digigate.sites s where s.id = _site), 'ended early');
end;
$$;

commit;
