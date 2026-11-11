-- Visitor invites, part 2: what a handheld can't see on its own.
--
-- A handheld marks a one-visit invite used the moment it lets someone in with it, and only knows about a cancelled
-- invite once it syncs. Two handhelds offline can't see each other, so the server checks each arrival as it comes in:
-- 1. INVITE_REUSED (amber, server): a one-visit invite already arrived on another check. Raised on the later check.
-- 2. INVITE_CANCELLED (amber, server): the host cancelled the invite before the check, and the handheld hadn't synced.
-- The arrival is still recorded either way. Like the other event_details triggers, this never raises: an error would
-- fail the whole upload and leave the handheld's outbox stuck behind it.

begin;

insert into digigate.schema_version (version) values (39);

create or replace function digigate.mark_expected_arrival() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _booking uuid := digigate.to_uuid(new.payload ->> 'expected_visitor_id');
  _at timestamptz;
  _found digigate.expected_visitors;
begin
  if _booking is null then
    return null;
  end if;
  select e.occurred_at into _at from digigate.events e where e.id = new.event_id;
  select v.* into _found from digigate.expected_visitors v
  where v.id = _booking and v.org_id = new.org_id and v.site_id = new.site_id;
  if _found.id is null then
    return null;
  end if;

  if _found.single_use and _found.arrived_at is not null and _found.arrived_event is distinct from new.event_id then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
    values (new.org_id, new.site_id, 'INVITE_REUSED', 'amber', 'server', new.event_id, new.visit_id, _at, 'open')
    on conflict (event_id, rule_code, source) do nothing;
  end if;

  if _found.invite_hash is not null and _found.cancelled_at is not null and _found.cancelled_at <= _at then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
    values (new.org_id, new.site_id, 'INVITE_CANCELLED', 'amber', 'server', new.event_id, new.visit_id, _at, 'open')
    on conflict (event_id, rule_code, source) do nothing;
  end if;

  if _found.arrived_at is null then
    update digigate.expected_visitors v
    set arrived_at = _at, arrived_event = new.event_id,
      invite_code = case when v.single_use then null else v.invite_code end
    where v.id = _booking;
  end if;
  return null;
end;
$$;
revoke all on function digigate.mark_expected_arrival() from public;

commit;
