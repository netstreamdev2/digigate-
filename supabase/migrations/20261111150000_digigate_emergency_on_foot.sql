-- Emergencies are checked like anyone else: the guard says what kind, then scans the licence or ID as always (the
-- user's decision of 2026-11-11; nobody comes in unscanned). A walk-in can be an emergency too, such as police on
-- foot, so EMERGENCY_ENTRY is now raised for pedestrian entries as well as vehicles.

begin;

insert into digigate.schema_version (version) values (43);

create or replace function digigate.check_emergency_entry() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  _event digigate.events;
begin
  select e.* into _event from digigate.events e where e.id = new.event_id;
  if _event.type in ('vehicle_entry', 'pedestrian_entry') and jsonb_typeof(new.payload -> 'emergency') = 'object' then
    insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
    values (new.org_id, new.site_id, 'EMERGENCY_ENTRY', 'amber', 'device', new.event_id, new.visit_id, _event.occurred_at, 'open')
    on conflict (event_id, rule_code, source) do nothing;
  end if;
  return null;
end;
$$;
revoke all on function digigate.check_emergency_entry() from public;

commit;
