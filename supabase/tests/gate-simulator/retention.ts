// Keeps the simulator from filling a free database. Its people, cars and raw events are only worth having for a day; the
// anonymous daily totals behind reports stay, because they take almost no room. Everything here goes by the simulator's
// own device ids, so nothing a real handheld recorded is touched.
//
// Events and the audit log refuse every delete, by design. Lifting that for made-up rows on the test project is the one
// exception: it happens inside a transaction, so the guards are back on before anything else can see they were off. This
// lives with the tests and never in a migration, and the simulator refuses to run against any other project.

const uuids = (ids: readonly string[]) => `array[${ids.map((id) => `'${id}'`).join(', ')}]::uuid[]`;

const GUARDS_OFF = `
  alter table digigate.events disable trigger events_append_only;
  alter table digigate.audit_log disable trigger audit_append_only;`;

const GUARDS_ON = `
  alter table digigate.events enable trigger events_append_only;
  alter table digigate.audit_log enable trigger audit_append_only;`;

/** Everything older than the cutoff, except what belongs to a visit still open. */
export function pruneSql(deviceIds: readonly string[], keepHours: number): string {
  const devices = uuids(deviceIds);
  const cutoff = `now() - interval '${keepHours} hours'`;
  return `
    begin;
    ${GUARDS_OFF}
    create temporary table doomed on commit drop as
      select e.id, e.visit_id
      from digigate.events e
      where e.device_id = any (${devices})
        and e.occurred_at < ${cutoff}
        and not exists (select 1 from digigate.visits v where v.id = e.visit_id and v.exited_at is null);
    create temporary table doomed_visits on commit drop as
      select v.id from digigate.visits v where v.id in (select visit_id from doomed) and v.exited_at < ${cutoff};
    delete from digigate.alerts where event_id in (select id from doomed);
    delete from digigate.event_details where event_id in (select id from doomed);
    delete from digigate.events where id in (select id from doomed);
    delete from digigate.visit_details where visit_id in (select id from doomed_visits);
    delete from digigate.visits where id in (select id from doomed_visits);
    delete from digigate.shifts where device_id = any (${devices}) and ended_at < ${cutoff};
    delete from digigate.audit_log where device_id = any (${devices}) and at < ${cutoff};
    ${GUARDS_ON}
    commit;`;
}

/** Every trace of the simulator, totals and devices included. */
export function wipeSql(deviceIds: readonly string[], siteId: string): string {
  const devices = uuids(deviceIds);
  return `
    begin;
    ${GUARDS_OFF}
    create temporary table doomed on commit drop as
      select e.id, e.visit_id from digigate.events e where e.device_id = any (${devices});
    delete from digigate.alerts where event_id in (select id from doomed);
    delete from digigate.event_details where event_id in (select id from doomed);
    delete from digigate.events where id in (select id from doomed);
    delete from digigate.visit_details where visit_id in (select visit_id from doomed);
    delete from digigate.visits where id in (select visit_id from doomed);
    delete from digigate.shifts where device_id = any (${devices});
    delete from digigate.audit_log where device_id = any (${devices});
    delete from digigate.devices where id = any (${devices});
    delete from digigate.pairing_codes where site_id = '${siteId}' and device_name like 'Simulator %';
    delete from digigate.daily_counts where site_id = '${siteId}';
    delete from digigate.daily_activity where site_id = '${siteId}';
    ${GUARDS_ON}
    commit;`;
}

/** Deletes free space for reuse, but only this hands it back, so the project's size actually drops. One table per call. */
export const RECLAIM_TABLES = [
  'events',
  'event_details',
  'visits',
  'visit_details',
  'alerts',
  'shifts',
  'audit_log',
  'daily_activity',
  'daily_counts',
] as const;
