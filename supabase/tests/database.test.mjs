// Runs every migration on a real Postgres engine (PGlite), then proves who can reach what and walks whole gate stories
// through digigate.ingest_events the way the Edge Functions do. Run from the repo root: pnpm test:db
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { canCreateRole, canManage, canManagePerson, isStaff, isSuper } from '../functions/_shared/account-access.ts';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = new PGlite();

// What Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
`);
for (const file of readdirSync(migrations).sort()) {
  try {
    await db.exec(readFileSync(join(migrations, file), 'utf8'));
  } catch (error) {
    console.log(`MIGRATION FAILED (${file}):`, error.message);
    process.exit(1);
  }
}
// Production runs with MFA off (migration 48). These tests check every rule with it on, as the stricter case; the
// switch itself is tested at the end.
await db.exec('update digigate.platform_settings set require_mfa = true');

let passed = 0;
const failures = [];
const check = (name, ok) => (ok ? passed++ : failures.push(name));
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const count = async (sql) => (await one(`select count(*)::int c from ${sql}`)).c;

async function as(role, profile, aal, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify({ sub: profile, aal })}', false); set role ${role};`);
  try {
    return { rows: (await db.query(sql, params)).rows, error: null };
  } catch (error) {
    return { rows: [], error: error.message };
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  }
}
const service = (sql, params) => as('service_role', '', '', sql, params);

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ORG_A = u(1), ORG_B = u(2), SITE_A = u(3), SITE_A2 = u(4), SITE_B = u(5), CLIENT_A = u(6), CLIENT_B = u(7), CLIENT_A2 = u(8), CLIENT_SPARE = u(9);
const SUPER = u(10), ADMIN_A = u(11), ROOM_A = u(12), SUP_A2 = u(13), ADMIN_B = u(14), OFF = u(15), NOBODY = u(16);
const GUARD = u(20), SUPERVISOR = u(21), ELSEWHERE = u(22), GONE = u(23);
const PIN = `'{"algorithm":"pbkdf2-sha256","iterations":20000,"salt":"a","hash":"b"}'`;

await db.exec(`
  insert into auth.users (id) values ('${SUPER}'), ('${ADMIN_A}'), ('${ROOM_A}'), ('${SUP_A2}'), ('${ADMIN_B}'), ('${OFF}'), ('${NOBODY}');
  insert into digigate.organisations (id, name, slug) values ('${ORG_A}','A','a'), ('${ORG_B}','B','b');
  insert into digigate.clients (id, org_id, name) values ('${CLIENT_A}','${ORG_A}','Hospital A'), ('${CLIENT_A2}','${ORG_A}','Hospital A2'), ('${CLIENT_SPARE}','${ORG_A}','Not set up'), ('${CLIENT_B}','${ORG_B}','B1');
  insert into digigate.sites (id, org_id, client_id, name, site_type) values
    ('${SITE_A}','${ORG_A}','${CLIENT_A}','A1','hospital'), ('${SITE_A2}','${ORG_A}','${CLIENT_A2}','A2','hospital'), ('${SITE_B}','${ORG_B}','${CLIENT_B}','B1','estate');
  insert into digigate.profiles (id, org_id, full_name, login, roles, site_ids, is_active) values
    ('${SUPER}', null, 'Super', 'super', '{super_user}', '{}', true),
    ('${ADMIN_A}', '${ORG_A}', 'Admin A', 'admin-a', '{admin}', '{}', true),
    ('${ROOM_A}', '${ORG_A}', 'Room', 'room', '{control_room}', '{${SITE_A}}', true),
    ('${SUP_A2}', '${ORG_A}', 'Sup', 'sup', '{supervisor}', '{${SITE_A2}}', true),
    ('${ADMIN_B}', '${ORG_B}', 'Admin B', 'admin-b', '{admin}', '{}', true),
    ('${OFF}', '${ORG_A}', 'Left', 'left', '{admin}', '{}', false);
  insert into digigate.gate_users (id, org_id, site_ids, employee_number, first_name, last_name, role, pin, is_active) values
    ('${GUARD}','${ORG_A}','{${SITE_A}}','1001','Thabo','Khumalo','guard',${PIN},true),
    ('${SUPERVISOR}','${ORG_A}','{${SITE_A},${SITE_A2}}','2001','Kagiso','Mokoena','supervisor',${PIN},true),
    ('${ELSEWHERE}','${ORG_A}','{${SITE_A2}}','1002','Other','Site','guard',${PIN},true),
    ('${GONE}','${ORG_A}','{${SITE_A}}','1003','Left','Company','guard',${PIN},false);
  insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','back-gate','Back Gate','{vehicle}');
`);

// Row security everywhere, and nothing for anon.
check('row security is on for every table', (await db.query(`select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'digigate' and c.relkind = 'r' and not c.relrowsecurity`)).rows.length === 0);
check('anon cannot reach the schema', (await as('anon', '', '', 'select * from digigate.organisations')).error);

// Organisations and setup.
check('admin cannot create an organisation', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.organisations (name, slug) values ('X','x')`)).error);
check('super user without MFA cannot', (await as('authenticated', SUPER, 'aal1', `insert into digigate.organisations (name, slug) values ('X','x')`)).error);
check('super user with MFA can', !(await as('authenticated', SUPER, 'aal2', `insert into digigate.organisations (name, slug) values ('X','x')`)).error);
check('admin sees only their organisation', (await as('authenticated', ADMIN_A, 'aal2', 'select id from digigate.organisations')).rows.length === 1);
check('admin cannot add a client without a licence', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Unlicensed')`)).error);
check('super user adds a client', !(await as('authenticated', SUPER, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Second client')`)).error);
check('a new client starts an engagement', (await count(`digigate.engagements e join digigate.clients c on c.id = e.client_id where c.name = 'Second client' and e.ended_at is null`)) === 1);
check('admin of another organisation cannot add one', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Sneaky')`)).error);
// The dashboard reads a new row straight back, which row security has to allow at the moment it's created.
check('super user adds a site and reads it back', (await as('authenticated', SUPER, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}','New') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'New', 'hospital' from c returning id`)).rows.length === 1);
check('super user adds a site and reads it back', (await as('authenticated', SUPER, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}','New by super') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'New by super', 'hospital' from c returning id`)).rows.length === 1);
check('super user adds a client and reads it back', (await as('authenticated', SUPER, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Read back') returning id`)).rows.length === 1);
check('super user adds a company and reads it back', (await as('authenticated', SUPER, 'aal2', `insert into digigate.organisations (name, slug) values ('Read back','read-back') returning id`)).rows.length === 1);
check('a site cannot go under another company\'s client', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_B}','Wrong','hospital')`)).error);
check('admin of another organisation cannot add a site', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_SPARE}','New2','hospital')`)).error);
check('deactivated admin cannot', (await as('authenticated', OFF, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_SPARE}','New3','hospital')`)).error);
check('admin cannot add a site directly to an existing client without a licence', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_SPARE}','Unlicensed','hospital')`)).error);
check('admin adds a post', !(await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','main','Main','{vehicle,pedestrian}')`)).error);
check('a post cannot point at another organisation', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_B}','x','X','{vehicle}')`)).error);
check('control room cannot change posts', (await as('authenticated', ROOM_A, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','y','Y','{vehicle}')`)).error);
check('bad lane refused', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','z','Z','{helicopter}')`)).error);

// Roles and profiles.
check('nobody can raise their own role', (await as('authenticated', ADMIN_A, 'aal2', `update digigate.profiles set roles = '{super_user}' where id = '${ADMIN_A}'`)).error);
check('nobody can add themselves', (await as('authenticated', NOBODY, 'aal2', `insert into digigate.profiles (id, org_id, full_name, roles) values ('${NOBODY}','${ORG_A}','Me','{admin}')`)).error);
check('own profile reads before MFA', (await as('authenticated', ADMIN_A, 'aal1', 'select id from digigate.profiles')).rows.length === 1);
check('other profiles stay hidden before MFA', (await as('authenticated', ROOM_A, 'aal1', 'select id from digigate.profiles')).rows.length === 1);

// Gate users and PINs.
check('admin adds a guard', !(await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.gate_users (org_id, site_ids, employee_number, first_name, last_name, role, pin) values ('${ORG_A}','{${SITE_A}}','1009','New','Guard','guard',${PIN})`)).error);
check('employee numbers are unique in an organisation', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.gate_users (org_id, site_ids, employee_number, first_name, last_name, role, pin) values ('${ORG_A}','{}','1001','Dup','Licate','guard',${PIN})`)).error);
check('PIN hash cannot be read back', (await as('authenticated', ADMIN_A, 'aal2', 'select pin from digigate.gate_users')).error);
check('guard list without the PIN works', (await as('authenticated', ADMIN_A, 'aal2', 'select employee_number from digigate.gate_users')).rows.length === 5);
check('other organisation sees no guards', (await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.gate_users')).rows.length === 0);
check('control room cannot see the guard list', (await as('authenticated', ROOM_A, 'aal2', 'select id from digigate.gate_users')).rows.length === 0);
await db.exec(`delete from digigate.gate_users where employee_number = '1009'`);

// Pairing.
await db.exec(`insert into digigate.pairing_codes (org_id, site_id, device_name, code_hash, expires_at, created_by) values
  ('${ORG_A}','${SITE_A}','DT50','good',now() + interval '10 minutes','${ADMIN_A}'),
  ('${ORG_A}','${SITE_A}','Second','second',now() + interval '10 minutes','${ADMIN_A}'),
  ('${ORG_A}','${SITE_A}','DT50','old',now() - interval '1 minute','${ADMIN_A}');`);
check('admin creates a pairing code', !(await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.pairing_codes (org_id, site_id, device_name, code_hash, expires_at) values ('${ORG_A}','${SITE_A}','D','h',now())`)).error);
check('pairing codes cannot be read back', (await as('authenticated', ADMIN_A, 'aal2', 'select code_hash from digigate.pairing_codes')).error);
const claim = (code, token, key = 'first-key') => service('select * from digigate.claim_pairing_code($1, $2, $3)', [code, token, key]);
check('expired code is refused', (await claim('old', 't0')).rows.length === 0);
check('wrong code is refused', (await claim('nope', 't0')).rows.length === 0);
const paired = await claim('good', 't1');
check('good code pairs a device', paired.rows.length === 1 && paired.rows[0].site_id === SITE_A);
check('a code works only once', (await claim('good', 't2')).rows.length === 0);
check('the first device sets the person key', paired.rows[0].person_key === 'first-key');
const second = await claim('second', 't3', 'different-key');
check('every later device gets the same key', second.rows[0]?.person_key === 'first-key');
const keys = await one(`select has_table_privilege('authenticated', 'digigate.person_keys', 'select') a, has_table_privilege('service_role', 'digigate.person_keys', 'select') b`);
check('nobody can read person keys directly', !keys.a && !keys.b);
const DEVICE = paired.rows[0].device_id;
check('token finds the device', (await service('select digigate.device_for_token($1) as id', ['t1'])).rows[0].id === DEVICE);
check('last seen is stamped', (await one(`select last_seen_at from digigate.devices where id = '${DEVICE}'`)).last_seen_at !== null);
check('unknown token finds nothing', (await service('select digigate.device_for_token($1) as id', ['zz'])).rows[0].id === null);
check('device list without the token works', (await as('authenticated', ADMIN_A, 'aal2', 'select id, name from digigate.devices')).rows.length === 2);
check('device token hash is out of reach', (await as('authenticated', ADMIN_A, 'aal2', 'select token_hash from digigate.devices')).error);
check('admin cannot forge a device', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.devices (org_id, site_id, name, token_hash) values ('${ORG_A}','${SITE_A}','x','y')`)).error);

// What a device downloads.
const snapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s;
const byNumber = Object.fromEntries(snapshot.users.map((user) => [user.employeeNumber, user]));
check('guard at this site is included', byNumber['1001']?.firstName === 'Thabo' && byNumber['1001'].lastName === 'Khumalo');
check('supervisor keeps the role', byNumber['2001']?.role === 'supervisor');
check('guard at another site is left out', !byNumber['1002']);
check('deactivated guard stays, inactive', byNumber['1003']?.active === false);
check('gate PIN travels', byNumber['1001']?.pin?.algorithm === 'pbkdf2-sha256');
check('posts travel with their lanes', snapshot.posts.length === 2 && snapshot.posts[0].code === 'back-gate' && snapshot.posts[0].lanes[0] === 'vehicle');

// Gate stories, exactly as a device uploads them.
let clock = Date.parse('2026-10-30T08:00:00Z');
let serial = 100;
const event = (type, payload, gateUserId = GUARD) => {
  clock += 60_000;
  return { id: u(++serial), type, occurredAt: clock, gateUserId, payload };
};
const ingest = (events) => service('select digigate.ingest_events($1, $2::jsonb) as ids', [DEVICE, JSON.stringify(events)]);
const driver = { person_key: 'key-a', initials: 'T', surname: 'KHUMALO', demographics: { sex: 'male', age_band: '35-44' } };
const vehicle = { vin: 'TESTVIN0000000001', plate: 'TT00TTGP', disc_number: 'D1', make: 'TOYOTA', model: 'COROLLA', colour: 'White' };
const SHIFT = u(50);

await ingest([event('shift_start', { shift_id: SHIFT, post: 'back-gate', period: 'day' })]);
check('shift recorded with the guard', (await one('select gate_user_id from digigate.shifts')).gate_user_id === GUARD);

const V1 = u(60);
const entry = event('vehicle_entry', { visit_id: V1, outcome: 'clear', hits: [], vehicle, typed_plate: 'TT00TTGP', driver, occupants: 3, visit_type: 'visitor' });
const uploaded = await ingest([entry]);
check('upload returns its ids', uploaded.rows[0]?.ids?.[0] === entry.id);
check('clear entry opens the visit, at the post on duty', (await one(`select post from digigate.visits where id = '${V1}'`))?.post === 'back-gate');
const details = await one(`select person_name, plate, vehicle_description, erase_after from digigate.visit_details where visit_id = '${V1}'`);
check('details hold the person', details.person_name === 'T KHUMALO' && details.plate === 'TT00TTGP');
check('vehicle description is built', details.vehicle_description === 'TOYOTA COROLLA · White');
check('open visit has no erasure date yet', details.erase_after === null);
const permanent = await one(`select to_jsonb(e) j from digigate.events e where id = '${entry.id}'`);
check('the permanent row names nobody', !/KHUMALO|TT00TTGP|TESTVIN|key-a/.test(JSON.stringify(permanent.j)));
check('the payload is in the erasable part', (await one(`select payload from digigate.event_details where event_id = '${entry.id}'`)).payload.driver.surname === 'KHUMALO');
check('counted for the KPI charts', (await one('select age_band from digigate.daily_counts')).age_band === '35-44');

await ingest([entry]);
check('a retried upload changes nothing', (await count(`digigate.events where id = '${entry.id}'`)) === 1 && (await one('select sum(visits)::int s from digigate.daily_counts')).s === 1);

const exit = event('vehicle_exit', { visit_id: V1, outcome: 'clear', hits: [], vehicle, typed_plate: 'TT00TTGP', driver, occupants: 2, exit_checks: { ignition_restart: 'done', boot_check: 'not-needed' } });
await ingest([exit]);
const closed = await one(`select exited_at, occupants_out from digigate.visits where id = '${V1}'`);
check('clear exit closes the visit', closed.exited_at !== null && closed.occupants_out === 2);
const expected = new Date(clock);
expected.setUTCFullYear(expected.getUTCFullYear() + 3);
check('erasure is 3 years after the exit', new Date((await one(`select erase_after from digigate.visit_details where visit_id = '${V1}'`)).erase_after).getTime() === expected.getTime());
check('the visit events get the same date', (await count(`digigate.event_details where visit_id = '${V1}' and erase_after is null`)) === 0);

const V2 = u(61);
const warned = event('vehicle_entry', { visit_id: V2, outcome: 'warning', hits: [{ code: 'DISC_EXPIRED', severity: 'amber', related_visit_id: null }], vehicle, driver, occupants: 1, visit_type: 'delivery' });
await ingest([warned]);
check('a warning opens no visit yet', (await count(`digigate.visits where id = '${V2}'`)) === 0);
check('it raises an open alert', (await one(`select status from digigate.alerts where visit_id = '${V2}'`)).status === 'open');
await ingest([event('alert_ack', { check_event_id: warned.id, visit_id: V2, direction: 'entry', codes: ['DISC_EXPIRED'] })]);
check('acknowledging opens the visit', (await count(`digigate.visits where id = '${V2}' and visit_type = 'delivery'`)) === 1);
check('and resolves the alert', (await one(`select resolved_by from digigate.alerts where visit_id = '${V2}'`)).resolved_by === GUARD);

const blocked = event('vehicle_exit', { visit_id: V2, outcome: 'blocked', hits: [{ code: 'IGNITION_RESTART_FAILED', severity: 'red', related_visit_id: null }], vehicle, driver, occupants: 1 });
await ingest([blocked]);
check('a blocked exit keeps the visit open', (await one(`select exited_at from digigate.visits where id = '${V2}'`)).exited_at === null);
await ingest([event('override', { check_event_id: blocked.id, visit_id: V2, direction: 'exit', codes: ['IGNITION_RESTART_FAILED'], supervisor_id: SUPERVISOR, reason: 'Flat battery, jump-started' })]);
check('the override closes it', (await one(`select exited_at from digigate.visits where id = '${V2}'`)).exited_at !== null);
const overridden = await one(`select resolved_by, resolution from digigate.alerts where rule_code = 'IGNITION_RESTART_FAILED'`);
check('the supervisor is on the alert, with the reason', overridden.resolved_by === SUPERVISOR && overridden.resolution.includes('Flat battery'));

const V3 = u(62);
const refused = event('pedestrian_entry', { visit_id: V3, outcome: 'warning', hits: [{ code: 'PEDESTRIAN_DUPLICATE_ENTRY', severity: 'amber', related_visit_id: null }], person: { person_key: 'key-b', document: 'smart-id', names: 'ZANELE', surname: 'DLAMINI', manual: false }, visit_type: 'visitor' });
await ingest([refused]);
await ingest([event('turned_away', { check_event_id: refused.id, visit_id: V3, direction: 'entry', codes: ['PEDESTRIAN_DUPLICATE_ENTRY'] })]);
check('turned away opens no visit', (await count(`digigate.visits where id = '${V3}'`)) === 0);
check('its clock starts at once', (await count(`digigate.event_details where visit_id = '${V3}' and erase_after is null`)) === 0);

const V4 = u(63);
await ingest([event('pedestrian_entry', { visit_id: V4, outcome: 'clear', hits: [{ code: 'UNFAMILIAR_VEHICLE', severity: 'info', related_visit_id: null }], person: { person_key: 'key-c', document: 'green-id-book', names: 'SIPHO', surname: 'NDLOVU', manual: true }, visit_type: 'visitor' })]);
check('walk-in name is built', (await one(`select person_name from digigate.visit_details where visit_id = '${V4}'`)).person_name === 'SIPHO NDLOVU');
check('an info alert needs no decision', (await one(`select status from digigate.alerts where visit_id = '${V4}'`)).status === 'resolved');

const failed = event('sign_in_failed', { employee_number: '1001', attempt: 1 }, null);
const odd = event('lock', { reason: 'idle', visit_id: 'not-a-uuid' }, 'demo-guard');
check('one odd value does not block the batch', (await ingest([failed, odd])).rows[0]?.ids?.length === 2);
check('employee number stays out of the permanent row', !JSON.stringify((await one(`select to_jsonb(e) j from digigate.events e where id = '${failed.id}'`)).j).includes('1001'));
check('an event with no visit starts its clock now', (await one(`select erase_after from digigate.event_details where event_id = '${failed.id}'`)).erase_after !== null);
await ingest([event('shift_end', { shift_id: SHIFT, reason: 'ended' })]);
const shift = await one('select end_reason, erase_after from digigate.shifts');
check('shift closed with its reason and erasure date', shift.end_reason === 'ended' && shift.erase_after !== null);

const before = await count('digigate.events');
const bad = await ingest([event('lock', {}), { id: 'broken', type: 'lock', occurredAt: clock, payload: {} }]);
check('a batch that cannot land leaves nothing behind', bad.error && (await count('digigate.events')) === before);

// Reading it back from the dashboard.
const OLD = u(64);
await db.exec(`
  insert into digigate.visits (id, org_id, site_id, kind, visit_type, entered_at, exited_at) values ('${OLD}','${ORG_A}','${SITE_A}','vehicle','visitor',now() - interval '500 days',now() - interval '499 days');
  insert into digigate.visit_details (visit_id, org_id, site_id, person_key, person_name, plate) values ('${OLD}','${ORG_A}','${SITE_A}','key','OLD PERSON','CA123456');
`);
const visits = (profile, aal) => as('authenticated', profile, aal, 'select * from digigate.visit_records');
const total = await count('digigate.visits');
check('admin with MFA sees the visits', (await visits(ADMIN_A, 'aal2')).rows.length === total);
check('control room at the site sees them', (await visits(ROOM_A, 'aal2')).rows.length === total);
check('super user sees them', (await visits(SUPER, 'aal2')).rows.length === total);
check('no MFA sees nothing', (await visits(ADMIN_A, 'aal1')).rows.length === 0);
check('someone with no profile sees nothing', (await visits(NOBODY, 'aal2')).rows.length === 0);
check('deactivated user sees nothing', (await visits(OFF, 'aal2')).rows.length === 0);
check('supervisor at another site sees nothing', (await visits(SUP_A2, 'aal2')).rows.length === 0);
check('other organisation sees nothing', (await visits(ADMIN_B, 'aal2')).rows.length === 0);
check('anon has no way in', (await as('anon', '', '', 'select * from digigate.visit_records')).error);
const rows = (await visits(ADMIN_A, 'aal2')).rows;
const recent = rows.find((row) => row.id === V1);
const old = rows.find((row) => row.id === OLD);
check('this year is in full', recent.person_name === 'T KHUMALO' && recent.plate === 'TT00TTGP');
check('older than a year is masked', old.person_name === '*******SON' && old.plate === '*****456');
check('person key is never shown', !('person_key' in recent));
check('dashboard cannot read visit details directly', (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.visit_details')).error);
check('dashboard cannot read event details', (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.event_details')).error);

// The control room.
const OLD_CHECK = u(65);
await db.exec(`
  insert into digigate.events (id, org_id, site_id, device_id, type, occurred_at, visit_id) values ('${OLD_CHECK}','${ORG_A}','${SITE_A}','${DEVICE}','vehicle_entry',now() - interval '500 days','${OLD}');
  insert into digigate.event_details (event_id, org_id, site_id, visit_id, payload) values ('${OLD_CHECK}','${ORG_A}','${SITE_A}','${OLD}','{"driver":{"initials":"O","surname":"PERSON"},"vehicle":{"plate":"CA123456"}}');
`);
const SHIFT_NOW = u(51);
const V5 = u(66);
await ingest([event('shift_start', { shift_id: SHIFT_NOW, post: 'back-gate', period: 'day' })]);
await db.exec(`update digigate.shifts set started_at = now() - interval '1 hour' where id = '${SHIFT_NOW}'`);
const waiting = event('vehicle_entry', { visit_id: V5, outcome: 'blocked', hits: [{ code: 'PLATE_DISC_MISMATCH', severity: 'red', related_visit_id: null }], vehicle, typed_plate: 'TT00TTGX', driver, occupants: 1, visit_type: 'visitor' });
await ingest([waiting]);

const checks = (profile, aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.check_records');
const checkRows = (await checks(ROOM_A)).rows;
const carWaiting = checkRows.find((row) => row.id === waiting.id);
check('a car waiting at the boom has no visit but can still be named', carWaiting.person_name === 'T KHUMALO' && carWaiting.plate === 'TT00TTGP' && (await count(`digigate.visits where id = '${V5}'`)) === 0);
check('what the guard typed is shown beside the disc', carWaiting.typed_plate === 'TT00TTGX');
check('the check knows its car and its gate', carWaiting.vehicle_description === 'TOYOTA COROLLA · White' && carWaiting.post === 'back-gate');
check('a walk-in is named in full', checkRows.find((row) => row.id === refused.id).person_name === 'ZANELE DLAMINI');
check('only gate checks are listed', !checkRows.some((row) => row.id === failed.id));
check('neither the key nor the payload comes out', !('person_key' in carWaiting) && !('payload' in carWaiting));
const oldCheck = checkRows.find((row) => row.id === OLD_CHECK);
check('a check older than a year is masked', oldCheck.person_name === '*****SON' && oldCheck.plate === '*****456');
check('no MFA sees no checks', (await checks(ADMIN_A, 'aal1')).rows.length === 0);
check('a site they were not given sees no checks', (await checks(SUP_A2)).rows.length === 0);
check('another company sees no checks', (await checks(ADMIN_B)).rows.length === 0);
check('anon cannot read checks', (await as('anon', '', '', 'select * from digigate.check_records')).error);

const board = (profile, search = '', aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.site_board($1, 25, 0)', [search]);
const adminBoard = (await board(ADMIN_A)).rows;
const companySites = await count(`digigate.sites where org_id = '${ORG_A}'`);
check('the board lists the company\'s sites, trouble first', adminBoard.length === companySites && adminBoard[0].site_id === SITE_A && Number(adminBoard[0].red) === 1);
check('it counts who is inside and on duty', Number(adminBoard[0].on_site) === 1 && Number(adminBoard[0].on_duty) === 1);
check('and how many sites there are in all', Number(adminBoard[0].total) === companySites);
check('the board can be searched', (await board(ADMIN_A, '%A2%')).rows.length === 1);
check('a control room user sees only their sites', (await board(ROOM_A)).rows.length === 1);
check('another company sees its own alone', (await board(ADMIN_B)).rows.every((row) => row.site_id === SITE_B));
check('no MFA sees an empty board', (await board(ADMIN_A, '', 'aal1')).rows.length === 0);
check('anon cannot call the board', (await as('anon', '', '', `select * from digigate.site_board('', 25, 0)`)).error);
const boardFor = (profile, org) => as('authenticated', profile, 'aal2', 'select * from digigate.site_board($1, 25, 0, $2)', ['', org]);
check('a super user inside one company sees that company\x27s sites only', (await boardFor(SUPER, ORG_A)).rows.length === companySites && (await boardFor(SUPER, ORG_A)).rows.every((row) => row.site_id !== SITE_B));
check('naming another company shows an admin nothing of it', (await boardFor(ADMIN_A, ORG_B)).rows.length === 0);

const gates = (profile, site = SITE_A, aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.gate_board($1)', [site]);
const gateRows = (await gates(ROOM_A)).rows;
const backGate = gateRows.find((row) => row.post === 'back-gate');
check('the control room sees every post', gateRows.length === 2);
check('and who is on duty, though the guard list is closed to it', backGate.guard === 'Thabo Khumalo' && backGate.period === 'day');
check('the post nobody is on stays empty', gateRows.find((row) => row.post !== 'back-gate').guard === null);
check('the last check is shown', backGate.last_check_at !== null);
check('another site gets no gates', (await gates(SUP_A2)).rows.length === 0);
check('another company gets no gates', (await gates(ADMIN_B)).rows.length === 0);
check('no MFA gets no gates', (await gates(ROOM_A, SITE_A, 'aal1')).rows.length === 0);
check('anon cannot call the gates', (await as('anon', '', '', `select * from digigate.gate_board('${SITE_A}')`)).error);
await db.exec(`update digigate.shifts set started_at = now() - interval '15 hours' where id = '${SHIFT_NOW}'`);
check('a shift left open past the limit is not on duty', (await gates(ROOM_A)).rows.every((row) => row.guard === null));
await db.exec(`update digigate.shifts set started_at = now() - interval '1 hour' where id = '${SHIFT_NOW}'`);

// The device view.
const SECOND_DEVICE = second.rows[0].device_id;
const fleet = (profile, search = '', status = '', org = null, aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.device_board($1, $2, 25, 0, $3::uuid)', [search, status, org]);
const fleetRow = async (id) => (await fleet(ADMIN_A)).rows.find((row) => row.id === id);
await db.exec(`update digigate.devices set last_seen_at = now() where id = '${DEVICE}'`);
const online = await fleetRow(DEVICE);
check('a device seen just now is online', online.status === 'online');
check('it shows where it is and who is on it', online.site_name === 'A1' && online.client_name === 'Hospital A' && online.guard === 'Thabo Khumalo' && online.post !== null);
check('it shows its activity', online.last_check_at !== null);
await db.exec(`update digigate.devices set last_seen_at = now() - interval '10 minutes' where id = '${DEVICE}'`);
check('a quiet device with a guard on it is not responding', (await fleetRow(DEVICE)).status === 'quiet');
check('and comes first', (await fleet(ADMIN_A)).rows[0].id === DEVICE);
check('a device that never connected is only offline', (await fleetRow(SECOND_DEVICE)).status === 'offline' && (await fleetRow(SECOND_DEVICE)).last_seen_at === null);
await db.exec(`update digigate.shifts set started_at = now() - interval '15 hours' where id = '${SHIFT_NOW}'`);
check('a shift past the limit leaves it only offline', (await fleetRow(DEVICE)).status === 'offline');
await db.exec(`update digigate.shifts set started_at = now() - interval '1 hour' where id = '${SHIFT_NOW}'`);
check('the fleet can be filtered by state', (await fleet(ADMIN_A, '', 'quiet')).rows.length === 1 && (await fleet(ADMIN_A, '', 'online')).rows.length === 0);
check('searched by device', (await fleet(ADMIN_A, '%second%')).rows.length === 1);
check('searched by client', (await fleet(ADMIN_A, '%hospital a%')).rows.length === 2);
check('and narrowed to a company', (await fleet(SUPER, '', '', ORG_B)).rows.length === 0 && (await fleet(SUPER, '', '', ORG_A)).rows.length === 2);
check('the total is on every row', Number((await fleet(ADMIN_A)).rows[0].total) === 2);
await db.exec(`update digigate.devices set revoked_at = now() where id = '${SECOND_DEVICE}'`);
check('in service leaves a revoked handheld out', (await fleet(ADMIN_A, '', 'in_service')).rows.map((row) => row.id).join() === DEVICE);
check('the revoked tab still has it', (await fleet(ADMIN_A, '', 'revoked')).rows.map((row) => row.id).join() === SECOND_DEVICE);
check('and every state together still has both', (await fleet(ADMIN_A)).rows.length === 2);
await db.exec(`update digigate.devices set revoked_at = null where id = '${SECOND_DEVICE}'`);
const summary = Object.fromEntries((await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.device_summary('')`)).rows.map((row) => [row.status, Number(row.devices)]));
check('the summary counts each state', summary.quiet === 1 && summary.offline === 1);
check('the token hash never comes out', !('token_hash' in online));
check('another company sees no devices', (await fleet(ADMIN_B)).rows.length === 0);
check('a site they were not given shows no devices', (await fleet(SUP_A2)).rows.length === 0);
check('no MFA sees no devices', (await fleet(ADMIN_A, '', '', null, 'aal1')).rows.length === 0);
check('anon cannot call the fleet', (await as('anon', '', '', `select * from digigate.device_board('', '', 25, 0)`)).error);
check('anon cannot call the summary', (await as('anon', '', '', `select * from digigate.device_summary('')`)).error);
check('a deactivated user sees no devices', (await fleet(OFF)).rows.length === 0);
check('someone with no profile sees no devices', (await fleet(NOBODY)).rows.length === 0);
check('nobody can call the inner list directly', (await as('authenticated', SUPER, 'aal2', `select * from digigate.fleet('', null)`)).error);

// Daily totals for reports.
const OCT_30 = '2026-10-30';
const activity = await one(`select * from digigate.daily_activity where site_id = '${SITE_A}' and day = '${OCT_30}'`);
check('every gate check is counted once, retries included', activity.checks === 7);
check('blocked and warning checks are counted', activity.blocked === 2 && activity.warnings === 2);
check('decisions are counted', activity.overrides === 1 && activity.turned_away === 1 && activity.acknowledged === 1);
check('entries count only those let in', activity.vehicles_in === 2 && activity.people_in === 1);
check('exits and stays are counted', activity.exits === 2 && Number(activity.stay_minutes) > 0);
check('the hours add up to the checks', activity.hours.length === 24 && activity.hours.reduce((sum, value) => sum + value, 0) === 7);
check('checks land in the hour on the site clock', activity.hours[10] > 0);
check('rules are counted by code', activity.rules.DISC_EXPIRED === 1 && activity.rules.PLATE_DISC_MISMATCH === 1);
check('visit types are counted', activity.visit_types.visitor === 2 && activity.visit_types.delivery === 1);
check('the totals name nobody', !/KHUMALO|DLAMINI|TT00TTGP|TESTVIN|key-a/.test(JSON.stringify(activity)));
check('totals are closed to dashboard writes', (await as('authenticated', ADMIN_A, 'aal2', 'update digigate.daily_activity set checks = 0')).error);
check('another company sees no totals', (await as('authenticated', ADMIN_B, 'aal2', 'select * from digigate.daily_activity')).rows.length === 0);
check('no MFA sees no totals', (await as('authenticated', ADMIN_A, 'aal1', 'select * from digigate.daily_activity')).rows.length === 0);

// Report periods and when schedules run.
const period = async (frequency, day) => {
  const row = await one(`select from_day::text, to_day::text from digigate.report_period('${frequency}', '${day}')`);
  return `${row.from_day} ${row.to_day}`;
};
check('a daily period is that day', (await period('daily', OCT_30)) === '2026-10-30 2026-10-30');
check('a week runs Monday to Sunday', (await period('weekly', OCT_30)) === '2026-10-26 2026-11-01');
check('a month runs to its last day', (await period('monthly', '2026-02-10')) === '2026-02-01 2026-02-28');
check('a quarter is three months', (await period('quarterly', OCT_30)) === '2026-10-01 2026-12-31');
check('a year is the calendar year', (await period('yearly', OCT_30)) === '2026-01-01 2026-12-31');
const nextRun = async (frequency, at, after) => (await one(`select to_char(digigate.next_report_run('${frequency}', '${at}', '${after}') at time zone 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') r`)).r;
check('a daily report still to come today runs today', (await nextRun('daily', '18:00', '2026-10-30T10:00:00Z')) === '2026-10-30 18:00');
check('one already past runs tomorrow', (await nextRun('daily', '07:00', '2026-10-30T10:00:00Z')) === '2026-10-31 07:00');
check('a weekly report runs on Monday', (await nextRun('weekly', '07:00', '2026-10-30T10:00:00Z')) === '2026-11-02 07:00');
check('a monthly report runs on the 1st', (await nextRun('monthly', '07:00', '2026-10-30T10:00:00Z')) === '2026-11-01 07:00');
check('a quarterly report runs on the first day of the quarter', (await nextRun('quarterly', '07:00', '2026-10-30T10:00:00Z')) === '2027-01-01 07:00');
check('a yearly report runs on 1 January', (await nextRun('yearly', '07:00', '2026-10-30T10:00:00Z')) === '2027-01-01 07:00');

// Reading reports.
const reportOf = (profile, client = null, aal = 'aal2') => as('authenticated', profile, aal, 'select digigate.report_summary($1, $2, $3, $4::uuid) as r', [ORG_A, 'monthly', OCT_30, client]);
const report = (await reportOf(ADMIN_A)).rows[0].r;
check('a report covers its period', report.from === '2026-10-01' && report.to === '2026-10-31' && report.days.length === 31);
check('and the one before it', report.prior_from === '2026-09-01' && report.prior_to === '2026-09-30');
check('a report totals the period', report.totals.checks === 7 && report.totals.blocked === 2 && report.totals.active_sites === 1);
check('a report names its company', report.company === 'A');
check('a report has its hours, rules, types and sites', report.hours.length === 24 && report.rules.length > 0 && report.visit_types[0].type === 'visitor' && report.sites[0].client === 'Hospital A');
check('a report holds no person or vehicle', !/KHUMALO|DLAMINI|TT00TTGP|TESTVIN|key-a|person_key/.test(JSON.stringify(report)));
check('a client report narrows to that client', (await reportOf(ADMIN_A, CLIENT_A)).rows[0].r.client === 'Hospital A');
check('a client with nothing is empty, not an error', (await reportOf(ADMIN_A, CLIENT_B)).rows[0].r.totals.checks === undefined);
check('a super user can read any company report', (await reportOf(SUPER)).rows[0].r.totals.checks === 7);
check('another company gets nothing', (await reportOf(ADMIN_B)).rows[0].r === null);
check('a control room login gets nothing', (await reportOf(ROOM_A)).rows[0].r === null);
check('no MFA gets nothing', (await reportOf(ADMIN_A, null, 'aal1')).rows[0].r === null);
check('anon cannot read a report', (await as('anon', '', '', `select digigate.report_summary('${ORG_A}', 'daily', '${OCT_30}')`)).error);
check('nobody can call the inner report directly', (await as('authenticated', SUPER, 'aal2', `select digigate.report_data('${ORG_A}', null, 'daily', '${OCT_30}')`)).error);
const today = (await one(`select (now() at time zone 'Africa/Johannesburg')::date::text as d`)).d;
const finished = (await service(`select digigate.report_data('${ORG_A}', null, 'monthly', '${OCT_30}') as r`)).rows[0].r;
check('a finished period is marked finished', finished.in_progress === false && finished.prior_to === '2026-09-30');
const running = (await service(`select digigate.report_data('${ORG_A}', null, 'yearly', '${today}') as r`)).rows[0].r;
const daysSoFar = Math.round((Date.parse(today) - Date.parse(running.from)) / 86_400_000);
const compareEnd = new Date(Date.parse(running.prior_from) + daysSoFar * 86_400_000).toISOString().slice(0, 10);
check('a period still running is marked', running.in_progress === true);
check('and compares with the same days of the one before', running.prior_to === compareEnd);
const reportBoard = (profile, search = '', aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.report_board($1, $2, 25, 0)', [OCT_30, search]);
const superBoard = (await reportBoard(SUPER)).rows;
check('the report board shows every company, busiest first', superBoard.length === (await count('digigate.organisations')) && superBoard[0].org_id === ORG_A && Number(superBoard[0].checks) === 7);
check('with a week of trend', superBoard[0].trend.length === 7 && superBoard[0].trend[6] === 7);
check('and can be searched', (await reportBoard(SUPER, '%zz-no-such-company%')).rows.length === 0 && (await reportBoard(SUPER, 'A')).rows.length === 1);
check('an admin sees only their company', (await reportBoard(ADMIN_A)).rows.length === 1);
check('a control room login sees no companies', (await reportBoard(ROOM_A)).rows.length === 0);
check('no MFA sees no companies', (await reportBoard(SUPER, '', 'aal1')).rows.length === 0);
check('anon cannot read the report board', (await as('anon', '', '', `select * from digigate.report_board('${OCT_30}', '', 25, 0)`)).error);
const dayTotals = (await as('authenticated', SUPER, 'aal2', `select * from digigate.report_day_totals('${OCT_30}')`)).rows;
check('the day totals come with the day before', dayTotals.length === 2 && Number(dayTotals[0].checks) === 7 && Number(dayTotals[1].checks) === 0);
check('another company stays out of the day totals', Number((await as('authenticated', ADMIN_B, 'aal2', `select * from digigate.report_day_totals('${OCT_30}')`)).rows[0].checks) === 0);

// Report schedules and sends.
const addSchedule = (profile, org = ORG_A, client = 'null', recipients = "'{a@example.com}'") => as('authenticated', profile, 'aal2', `insert into digigate.report_schedules (org_id, client_id, name, frequency, send_at, recipients) values ('${org}', ${client}, 'Daily', 'daily', '07:00', ${recipients}) returning id, next_run_at`);
const schedule = await addSchedule(ADMIN_A);
check('an admin can automate a report, and it knows when it runs next', schedule.rows.length === 1 && schedule.rows[0].next_run_at !== null);
check('a schedule needs someone to send to', (await addSchedule(ADMIN_A, ORG_A, 'null', "'{}'")).error);
check('it can be paused', (await as('authenticated', ADMIN_A, 'aal2', `update digigate.report_schedules set is_active = false where id = '${schedule.rows[0].id}' returning id`)).rows.length === 1);
check('its run times cannot be set by hand', (await as('authenticated', ADMIN_A, 'aal2', 'update digigate.report_schedules set next_run_at = now()')).error);
check('another admin cannot add one for this company', (await addSchedule(ADMIN_B)).error);
check('nor point one at the client of another company', (await addSchedule(ADMIN_A, ORG_A, `'${CLIENT_B}'`)).error);
check('another company cannot see it', (await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.report_schedules')).rows.length === 0);
check('nor can a control room login', (await as('authenticated', ROOM_A, 'aal2', 'select id from digigate.report_schedules')).rows.length === 0);
check('the send history cannot be written from the dashboard', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.report_sends (org_id, frequency, period_from, period_to, subject, recipients, status) values ('${ORG_A}', 'daily', now(), now(), 's', '{a}', 'sent')`)).error);

// The audit log.
const auditFor = (where) => one(`select * from digigate.audit_log where ${where} order by at desc limit 1`);
await as('authenticated', SUPER, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}', 'Audited Site') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'Audited Site', 'hospital' from c`);
const added = await auditFor(`action = 'site.added' and target = 'Audited Site'`);
check('a dashboard change is logged with who did it', added?.actor_id === SUPER && added.category === 'setup' && added.org_id === ORG_A);
check('the audit names them', added?.actor_name?.length > 0);
const seenBefore = await count(`digigate.audit_log where device_id = '${DEVICE}'`);
await service('select digigate.device_for_token($1) as id', ['t1']);
check('a device checking in adds nothing to the log', (await count(`digigate.audit_log where device_id = '${DEVICE}'`)) === seenBefore);
const overrideLog = await auditFor(`action = 'gate.override'`);
check('a gate override is logged under the supervisor', overrideLog?.actor_name?.length > 0 && overrideLog.detail === 'IGNITION_RESTART_FAILED');
check('but never its free-text reason', !JSON.stringify(overrideLog).includes('Flat battery'));
const failedLog = await auditFor(`action = 'gate.sign_in_failed'`);
check('a failed sign-in is logged without the employee number', failedLog !== undefined && !JSON.stringify(failedLog).includes('1001'));
check('a shift is logged with its post', (await auditFor(`action = 'gate.shift_start'`))?.detail?.includes('back-gate'));
await as('authenticated', ADMIN_A, 'aal2', 'select digigate.note_sign_in()');
check('a dashboard sign-in is logged', (await auditFor(`action = 'dashboard.signed_in'`))?.actor_id === ADMIN_A);
await as('authenticated', ADMIN_A, 'aal1', 'select digigate.note_sign_in()');
check('but not before MFA', (await count(`digigate.audit_log where action = 'dashboard.signed_in'`)) === 1);
const unchanged = await as('authenticated', ADMIN_A, 'aal2', `update digigate.gate_users set first_name = 'Thabo' where employee_number = '1001' returning id`);
check('saving no real change logs nothing', unchanged.rows.length === 1 && (await count(`digigate.audit_log where action = 'gate_user.changed'`)) === 0);
const auditRows = (profile, aal = 'aal2') => as('authenticated', profile, aal, 'select id, org_id from digigate.audit_log');
check('an admin reads the log of their company', (await auditRows(ADMIN_A)).rows.length > 0 && (await auditRows(ADMIN_A)).rows.every((row) => row.org_id === ORG_A));
check('another company sees none of it', (await auditRows(ADMIN_B)).rows.every((row) => row.org_id === ORG_B));
check('a super user reads every company', (await auditRows(SUPER)).rows.length >= (await auditRows(ADMIN_A)).rows.length);
check('a control room login reads none', (await auditRows(ROOM_A)).rows.length === 0);
check('no MFA reads none', (await auditRows(SUPER, 'aal1')).rows.length === 0);
check('anon cannot read the log', (await as('anon', '', '', 'select * from digigate.audit_log')).error);
check('nobody can write to the log directly', (await as('authenticated', SUPER, 'aal2', `insert into digigate.audit_log (category, action) values ('setup', 'x')`)).error);
check('nobody can change the log', (await service(`update digigate.audit_log set action = 'x'`)).error);
check('nobody can delete from the log', (await service('delete from digigate.audit_log')).error);
const auditCounts = (profile) => as('authenticated', profile, 'aal2', `select * from digigate.audit_summary(now() - interval '10 years', now() + interval '1 day')`);
check('the log counts its categories', (await auditCounts(SUPER)).rows.some((row) => row.category === 'gate' && Number(row.entries) > 0));
check('a control room login counts nothing', (await auditCounts(ROOM_A)).rows.length === 0);
let auditOwnerBlocked = false;
try {
  await db.exec('delete from digigate.audit_log');
} catch {
  auditOwnerBlocked = true;
}
check('not even the owner', auditOwnerBlocked);

// The People page.
const logins = (profile, { search = '', role = '', status = '', newest = false, org = null } = {}, aal = 'aal2') =>
  as('authenticated', profile, aal, 'select * from digigate.people_board($1, $2, $3, $4, 25, 0, $5::uuid)', [search, role, status, newest, org]);
const staff = (profile, { search = '', role = '', status = '', org = null } = {}, aal = 'aal2') =>
  as('authenticated', profile, aal, 'select * from digigate.gate_staff_board($1, $2, $3, false, 25, 0, $4::uuid)', [search, role, status, org]);

const everyone = (await logins(SUPER)).rows;
check('a super user sees every login', everyone.length === (await count('digigate.profiles')));
check('with its role and company', everyone.some((row) => row.id === ADMIN_A && row.role === 'admin' && row.company === 'A'));
check('the total is on every row', Number(everyone[0].total) === everyone.length);
check('no password or PIN comes back', !everyone.some((row) => 'pin' in row || 'password' in row));
const ownLogins = (await logins(ADMIN_A)).rows;
check('an admin sees only their company', ownLogins.length > 0 && ownLogins.every((row) => row.company === 'A'));
check('and never a super user', !ownLogins.some((row) => row.role === 'super_user'));
check('another company sees none of them', !(await logins(ADMIN_B)).rows.some((row) => row.company === 'A'));
check('a control room login sees nobody', (await logins(ROOM_A)).rows.length === 0);
check('no MFA sees nobody', (await logins(SUPER, {}, 'aal1')).rows.length === 0);
check('someone with no profile sees nobody', (await logins(NOBODY)).rows.length === 0);
check('anon cannot read logins', (await as('anon', '', '', `select * from digigate.people_board('', '', '', false, 25, 0)`)).error);
check('logins filter by role', (await logins(SUPER, { role: 'admin' })).rows.every((row) => row.role === 'admin'));
check('and by status', (await logins(SUPER, { status: 'inactive' })).rows.every((row) => row.is_active === false));
check('and by company', (await logins(SUPER, { org: ORG_B })).rows.every((row) => row.company === 'B'));
check('a search finds a login by company', (await logins(SUPER, { search: 'B' })).rows.some((row) => row.company === 'B'));
check('a search that matches nothing finds nobody', (await logins(SUPER, { search: '%zz-nobody%' })).rows.length === 0);
const loginCounts = (await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.people_counts('')`)).rows;
check('the counts add up to the list', loginCounts.reduce((sum, row) => sum + Number(row.people), 0) === ownLogins.length);
check('a control room login counts nobody', (await as('authenticated', ROOM_A, 'aal2', `select * from digigate.people_counts('')`)).rows.length === 0);

const ownStaff = (await staff(ADMIN_A)).rows;
check('an admin sees their gate staff', ownStaff.length > 0 && ownStaff.every((row) => row.company === 'A'));
check('the PIN never comes back', !ownStaff.some((row) => 'pin' in row));
check('another company sees none of them', !(await staff(ADMIN_B)).rows.some((row) => row.company === 'A'));
check('a super user sees every company', (await staff(SUPER)).rows.length >= ownStaff.length);
check('a control room login sees no staff', (await staff(ROOM_A)).rows.length === 0);
check('no MFA sees no staff', (await staff(SUPER, {}, 'aal1')).rows.length === 0);
check('anon cannot read staff', (await as('anon', '', '', `select * from digigate.gate_staff_board('', '', '', false, 25, 0)`)).error);
check('staff are found by employee number', (await staff(ADMIN_A, { search: '1001' })).rows.length === 1);
check('and by full name', (await staff(ADMIN_A, { search: '%Thabo Khumalo%' })).rows.length === 1);
check('and filtered by role', (await staff(ADMIN_A, { role: 'supervisor' })).rows.every((row) => row.role === 'supervisor'));
check('and by status', (await staff(ADMIN_A, { status: 'inactive' })).rows.every((row) => row.is_active === false));
check('someone on a shift shows where', ownStaff.find((row) => row.employee_number === '1001')?.on_duty_at !== null);
check('someone off shift shows nowhere', ownStaff.find((row) => row.employee_number === '2001')?.on_duty_at === null);
const staffCounts = (await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.gate_staff_counts('')`)).rows;
check('the staff counts add up', staffCounts.reduce((sum, row) => sum + Number(row.people), 0) === ownStaff.length);
check('and count who is on duty', staffCounts.reduce((sum, row) => sum + Number(row.on_duty), 0) === 1);

// A guard leaving their post, the fence that says so, and the handheld's own health.
const GATE_SHIFT = u(90);
const FENCED_DEVICE_EVENTS = (type, payload) => event(type, { shift_id: GATE_SHIFT, post: 'back-gate', ...payload });
await ingest([event('shift_start', { shift_id: GATE_SHIFT, post: 'back-gate', period: 'night', selfie: 'taken' })]);
const fencedShift = async () => one('select * from digigate.shifts where id = $1', [GATE_SHIFT]);
check('a shift keeps whether a selfie was taken', (await fencedShift()).selfie === 'taken');
await ingest([event('shift_start', { shift_id: u(91), post: 'back-gate', period: 'night', selfie: 'nonsense' })]);
check('a wrong selfie state is left out, and never stops the upload', (await one('select selfie from digigate.shifts where id = $1', [u(91)])).selfie === null);
await ingest([event('shift_end', { shift_id: u(91), post: 'back-gate', period: 'night', reason: 'ended' })]);

const leftAlert = async (id) => one(`select * from digigate.alerts where event_id = '${id}' and rule_code = 'LEFT_POST'`);
const rulesToday = async (day) => (await one('select rules from digigate.daily_activity where site_id = $1 and day = $2', [SITE_A, day])).rules;
const firstLeft = FENCED_DEVICE_EVENTS('left_post', {});
const leftDay = new Date(firstLeft.occurredAt).toISOString().slice(0, 10);
const leftBefore = (await rulesToday(leftDay)).LEFT_POST ?? 0;
await ingest([firstLeft]);
const raised = await leftAlert(firstLeft.id);
check('leaving a post raises an amber alert', raised?.severity === 'amber' && raised?.status === 'open' && raised?.post === 'back-gate');
check('it holds no position', !JSON.stringify((await one('select payload from digigate.event_details where event_id = $1', [firstLeft.id])).payload).match(/latitude|longitude/));
check('it counts in the day\'s rule hits', (await rulesToday(leftDay)).LEFT_POST === leftBefore + 1);
check('it is logged', (await auditFor(`action = 'gate.left_post'`))?.detail === 'back-gate');
await ingest([firstLeft]);
check('sending it twice raises one alert', (await count(`digigate.alerts where event_id = '${firstLeft.id}'`)) === 1);
await ingest([FENCED_DEVICE_EVENTS('returned_to_post', {})]);
const cleared = await leftAlert(firstLeft.id);
check('coming back closes it', cleared.status === 'resolved' && cleared.resolution === 'Back at their post' && cleared.resolved_by === GUARD);

const secondLeft = FENCED_DEVICE_EVENTS('left_post', {});
await ingest([secondLeft]);
await ingest([FENCED_DEVICE_EVENTS('stepping_away', { reason: 'Toilet break', minutes: 10 })]);
const away = await fencedShift();
check('stepping away records why and until when', away.away_reason === 'Toilet break' && new Date(away.away_until).getTime() > Date.parse(raised.raised_at));
check('and explains an alert already raised', (await leftAlert(secondLeft.id)).resolution === 'Stepping away: Toilet break');
check('its reason is logged', (await auditFor(`action = 'gate.stepping_away'`))?.detail === 'back-gate · Toilet break');
await ingest([FENCED_DEVICE_EVENTS('stepping_away', { reason: 'Patrol', minutes: 9000 })]);
const capped = await fencedShift();
const lastAway = await one(`select occurred_at from digigate.events where shift_id = '${GATE_SHIFT}' and type = 'stepping_away' order by occurred_at desc limit 1`);
check('a device cannot claim more than an hour', new Date(capped.away_until).getTime() - new Date(lastAway.occurred_at).getTime() === 3_600_000);
await ingest([FENCED_DEVICE_EVENTS('returned_to_post', {})]);
check('being back clears the away state', (await fencedShift()).away_until === null && (await fencedShift()).away_reason === null);

await ingest([FENCED_DEVICE_EVENTS('stepping_away', { reason: 'Patrol', minutes: 10 })]);
const atBoard = async (profile) => (await as('authenticated', profile, 'aal2', 'select * from digigate.gate_board($1)', [SITE_A])).rows.find((row) => row.post === 'back-gate');
await db.exec(`update digigate.shifts set started_at = now() - interval '1 hour' where id = '${GATE_SHIFT}'`);
await db.exec(`update digigate.shifts set selfie_path = null where id = '${GATE_SHIFT}'`);
const boardRow = await atBoard(ROOM_A);
check('the control room sees the shift\'s selfie state', boardRow.shift_id === GATE_SHIFT && boardRow.selfie === 'taken' && boardRow.has_selfie === false);
check('and that the guard stepped away', boardRow.away_reason === 'Patrol' && boardRow.away_until !== null);
check('a post with no location has no fence', boardRow.has_fence === false);
check('anon cannot attach a selfie', (await as('anon', '', '', `select digigate.attach_selfie('${DEVICE}', '${GATE_SHIFT}', 'x')`)).error);
check('nor can a dashboard login', (await as('authenticated', ROOM_A, 'aal2', `select digigate.attach_selfie('${DEVICE}', '${GATE_SHIFT}', 'x')`)).error);
await service(`select digigate.attach_selfie('${u(999)}', '${GATE_SHIFT}', 'wrong-device.jpg')`);
check('another device cannot put a photo on this shift', (await fencedShift()).selfie_path === null);
await service(`select digigate.attach_selfie('${DEVICE}', '${GATE_SHIFT}', 'org/site/shift.jpg')`);
check('the device on the shift can', (await fencedShift()).selfie_path === 'org/site/shift.jpg');
check('the board then knows there is a photo', (await atBoard(ROOM_A)).has_selfie === true);

await db.exec(`update digigate.posts set latitude = -33.9, longitude = 18.4, radius_m = 75 where site_id = '${SITE_A}' and code = 'back-gate'`);
const fencedPost = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.posts.find((post) => post.code === 'back-gate');
check('a device receives its post\'s fence', fencedPost.latitude === -33.9 && fencedPost.longitude === 18.4 && fencedPost.radiusM === 75);
check('the board then shows a fence', (await atBoard(ROOM_A)).has_fence === true);

const health = (value) => service('select digigate.record_device_health($1, $2::jsonb)', [DEVICE, JSON.stringify(value)]);
await health({ battery: 87.4, charging: false, appVersion: '1.0.0', network: 'wifi', wifiName: 'Gatehouse', wifiStrength: 150, cellGeneration: '4g', cellBars: 3, locationAllowed: true, latitude: -33.9, longitude: 18.4, fixAt: 1_790_000_000_000, secret: 'dropped', surname: 'dropped' });
const stored = await one('select health, health_at from digigate.devices where id = $1', [DEVICE]);
check('a health report is stored', stored.health.battery === 87 && stored.health.charging === false && stored.health.wifiName === 'Gatehouse' && stored.health.cellBars === 3 && stored.health_at !== null);
check('numbers are held to their range', stored.health.wifiStrength === 100);
check('anything not on the list is dropped', stored.health.secret === undefined && stored.health.surname === undefined);
await health({ battery: 'full', network: 'carrier-pigeon', latitude: 200, cellBars: 'lots' });
const junk = (await one('select health from digigate.devices where id = $1', [DEVICE])).health;
check('wrongly shaped values are left out, not an error', Object.keys(junk).length === 0);
const auditedBefore = await count(`digigate.audit_log where device_id = '${DEVICE}'`);
await health({ battery: 50, latitude: -33.1, longitude: 18.1, fixAt: 1 });
await health({ battery: 49, latitude: -33.2, longitude: 18.2, fixAt: 2 });
check('a new position replaces the last, so no trail builds up', (await one('select health from digigate.devices where id = $1', [DEVICE])).health.latitude === -33.2);
check('health reports add nothing to the audit log', (await count(`digigate.audit_log where device_id = '${DEVICE}'`)) === auditedBefore);
check('anon cannot report health', (await as('anon', '', '', `select digigate.record_device_health('${DEVICE}', '{}')`)).error);
check('nor can a dashboard login', (await as('authenticated', ADMIN_A, 'aal2', `select digigate.record_device_health('${DEVICE}', '{}')`)).error);
await db.exec(`update digigate.devices set last_seen_at = now() where id = '${DEVICE}'`);
const fleetHealth = await fleetRow(DEVICE);
check('the device view shows health', fleetHealth.health.battery === 49 && fleetHealth.health_at !== null);
check('and the position, for the company', fleetHealth.health.latitude === -33.2);
check('the fleet function stays closed to logins', (await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.fleet('', null)`)).error);
check('health columns are not readable directly', (await as('authenticated', ADMIN_A, 'aal2', 'select health from digigate.devices')).error);

await ingest([FENCED_DEVICE_EVENTS('left_post', {})]);
const endsOpen = await one(`select event_id from digigate.alerts where rule_code = 'LEFT_POST' and status = 'open' order by raised_at desc limit 1`);
await ingest([FENCED_DEVICE_EVENTS('shift_end', { period: 'night', reason: 'ended' })]);
check('going off duty closes it too', (await leftAlert(endsOpen.event_id)).resolution === 'Shift ended');

// The super user's list of companies.
const companyBoard = (profile, search = '', aal = 'aal2') => as('authenticated', profile, aal, 'select * from digigate.company_board($1, 25, 0)', [search]);
const superCompanies = (await companyBoard(SUPER)).rows;
const companyA = superCompanies.find((row) => row.id === ORG_A);
const realA = await one(`select (select count(*)::int from digigate.clients where org_id = '${ORG_A}') as clients, (select count(*)::int from digigate.sites where org_id = '${ORG_A}') as sites, (select count(*)::int from digigate.gate_users where org_id = '${ORG_A}') as staff`);
check('a super user sees every company', superCompanies.length === (await count('digigate.organisations')) && Number(superCompanies[0].total) === superCompanies.length);
check('with its clients, sites and gate staff counted', Number(companyA.clients) === realA.clients && Number(companyA.sites) === realA.sites && Number(companyA.gate_staff) === realA.staff && realA.staff > 0);
check('in name order', superCompanies.every((row, index) => index === 0 || superCompanies[index - 1].name <= row.name));
check('search narrows it', (await companyBoard(SUPER, 'B')).rows.every((row) => row.name.includes('B')));
check('an admin gets nothing from it', (await companyBoard(ADMIN_A)).rows.length === 0);
check('a super user without MFA gets nothing', (await companyBoard(SUPER, '', 'aal1')).rows.length === 0);
check('anon cannot call it', (await as('anon', '', '', `select * from digigate.company_board('', 25, 0)`)).error);
check('and the PIN stays out of reach', (await as('authenticated', SUPER, 'aal2', 'select pin from digigate.gate_users')).error);

// Every gate at a site works from the whole site's open visits.
const SHARED_VISIT = u(120), ODD_EXPIRY_VISIT = u(121), OTHER_SITE_VISIT = u(122);
const sharedCar = { ...vehicle, vin: 'TESTVIN0000000120', plate: 'TT12TTGP', disc_number: 'D120', disc_expires_on: '2027-03-31' };
await ingest([event('vehicle_entry', { visit_id: SHARED_VISIT, outcome: 'clear', hits: [], vehicle: sharedCar, driver, occupants: 2, visit_type: 'visitor' })]);
check('a visit keeps the expiry of the disc it came in with', (await one('select disc_expires_on::text as d from digigate.visit_details where visit_id = $1', [SHARED_VISIT])).d === '2027-03-31');
await ingest([event('vehicle_entry', { visit_id: ODD_EXPIRY_VISIT, outcome: 'clear', hits: [], vehicle: { ...sharedCar, vin: 'TESTVIN0000000121', disc_expires_on: 'soon' }, driver, occupants: 1, visit_type: 'visitor' })]);
check('a badly formed expiry is left out, never an error', (await one('select disc_expires_on from digigate.visit_details where visit_id = $1', [ODD_EXPIRY_VISIT])).disc_expires_on === null);
await db.exec(`
  insert into digigate.visits (id, org_id, site_id, kind, visit_type, entered_at) values ('${OTHER_SITE_VISIT}', '${ORG_A}', '${SITE_A2}', 'pedestrian', 'visitor', now());
  insert into digigate.visit_details (visit_id, org_id, site_id, person_key, person_name) values ('${OTHER_SITE_VISIT}', '${ORG_A}', '${SITE_A2}', 'key-elsewhere', 'Someone Elsewhere');
`);
const sharedSnapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s;
const sharedRow = sharedSnapshot.openVisits.find((visit) => visit.id === SHARED_VISIT);
check('a device receives the site\'s open visits', sharedRow?.kind === 'vehicle' && sharedRow.vin === sharedCar.vin && sharedRow.plate === sharedCar.plate && sharedRow.discNumber === 'D120');
check('with what the rules need', sharedRow?.personKey === 'key-a' && sharedRow.discExpiresOn === '2027-03-31' && sharedRow.occupants === 2 && typeof sharedRow.enteredAt === 'number');
check('and what the guard sees', sharedRow?.personName === 'T KHUMALO' && sharedRow.vehicleDescription === 'TOYOTA COROLLA · White');
check('but nothing from another site', !sharedSnapshot.openVisits.some((visit) => visit.id === OTHER_SITE_VISIT));
check('and the site\'s figures for the home screen', typeof sharedSnapshot.siteToday.openAlerts === 'number' && typeof sharedSnapshot.siteToday.exits === 'number' && typeof sharedSnapshot.siteToday.stayMinutes === 'number');
await ingest([event('vehicle_exit', { visit_id: SHARED_VISIT, outcome: 'clear', hits: [], vehicle: sharedCar, driver, occupants: 2 })]);
check('a visit that has ended leaves the list', !(await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.openVisits.some((visit) => visit.id === SHARED_VISIT));
check('a revoked device gets no visits', (await service('select digigate.device_snapshot($1) as s', [u(999)])).rows[0].s.openVisits.length === 0);
// The visit at the other site was only there to prove it stays out; the later company-change checks count visits.
await db.exec(`delete from digigate.visit_details where visit_id = '${OTHER_SITE_VISIT}'; delete from digigate.visits where id = '${OTHER_SITE_VISIT}';`);

// A site and its access points, created together by the site wizard.
const newSite = (profile, site, points, org = ORG_A, client = null) =>
  as('authenticated', profile, 'aal2', 'select digigate.create_site($1, $2::jsonb, $3::jsonb, $4) as id', [org, JSON.stringify(site), JSON.stringify(points), client]);
const wizardSite = { name: 'Riverside Wing', siteType: 'hospital', code: 'RVW', address: '12 Riverside Road, Durban', latitude: -29.85, longitude: 31.02, radiusM: 400, openParking: false, parkingSpaces: 120 };
const wizardPoints = [
  { label: 'Main Gate', gateType: 'main', lanes: ['vehicle'], booms: ['automatic', 'automatic', 'manual', 'automatic'], manned: true, cctvCameras: 4, anpr: true, latitude: -29.851, longitude: 31.021, radiusM: 50 },
  { label: 'Main Gate', gateType: 'pedestrian', lanes: ['pedestrian'], booms: [], manned: false, cctvCameras: 0, anpr: false },
];
check('an admin must request a licence instead of using the site wizard', (await newSite(ADMIN_A, wizardSite, wizardPoints)).error);
const created = await newSite(SUPER, wizardSite, wizardPoints);
const createdId = created.rows[0]?.id;
check('a super user creates a site with its access points in one go', Boolean(createdId) && !created.error);
const createdRow = await one('select * from digigate.sites where id = $1', [createdId]);
check('the site keeps its code, address, geofence and parking', createdRow.code === 'RVW' && createdRow.address === '12 Riverside Road, Durban' && createdRow.radius_m === 400 && createdRow.open_parking === false && createdRow.parking_spaces === 120);
const createdPoints = (await db.query('select * from digigate.posts where site_id = $1 order by created_at, code', [createdId])).rows;
check('every access point is there, with its booms, cameras and staffing', createdPoints.length === 2 && createdPoints[0].booms.length === 4 && createdPoints[0].booms.filter((boom) => boom === 'manual').length === 1 && createdPoints[0].anpr === true && createdPoints[1].manned === false);
check('two access points with one name still get their own codes', new Set(createdPoints.map((point) => point.code)).size === 2 && createdPoints.some((point) => point.code === 'main-gate-2'));
check('the site comes with a client of the same name', (await one('select c.name from digigate.clients c where c.id = $1', [createdRow.client_id])).name === 'Riverside Wing');
check('which is logged once, as the site', (await count(`digigate.audit_log where target = 'Riverside Wing'`)) === 1);
check('a client has one site only', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${createdRow.client_id}','Second','hospital')`)).error);
await as('authenticated', ADMIN_A, 'aal2', `update digigate.sites set name = 'Riverside Hospital' where id = '${createdId}'`);
check('renaming the site renames its client', (await one('select name from digigate.clients where id = $1', [createdRow.client_id])).name === 'Riverside Hospital');
check('a pedestrian gate has no booms', createdPoints.find((point) => point.gate_type === 'pedestrian').booms.length === 0);

const sitesBefore = await count('digigate.sites');
check('the control room cannot create a site', (await newSite(ROOM_A, { ...wizardSite, code: 'CRM' }, wizardPoints)).error);
check('another company cannot create one in this company', (await newSite(ADMIN_B, { ...wizardSite, code: 'OTH' }, wizardPoints)).error);
check('a site needs at least one access point', (await newSite(SUPER, { ...wizardSite, code: 'NOP' }, [])).error);
check('an unknown kind of boom is refused', (await newSite(SUPER, { ...wizardSite, code: 'BAD' }, [{ ...wizardPoints[0], booms: ['flying'] }])).error);
check('ANPR needs at least one camera', (await newSite(SUPER, { ...wizardSite, code: 'ANP' }, [{ ...wizardPoints[0], cctvCameras: 0 }])).error);
check('a site code is used once in a company', (await newSite(SUPER, wizardSite, wizardPoints)).error);
check('a refused site leaves nothing half made', (await count('digigate.sites')) === sitesBefore);
check('managed parking needs a number of spaces', (await newSite(SUPER, { ...wizardSite, code: 'PRK', parkingSpaces: null }, wizardPoints)).error);
check('a place set up already cannot get a second site', (await newSite(SUPER, { ...wizardSite, code: 'TWO' }, wizardPoints, ORG_A, CLIENT_A)).error);
check('a place in another company cannot be finished from here', (await newSite(SUPER, { ...wizardSite, code: 'OTB' }, wizardPoints, ORG_A, CLIENT_B)).error);
const adopted = await newSite(SUPER, { ...wizardSite, name: 'Spare Hospital', code: 'SPR' }, wizardPoints, ORG_A, CLIENT_SPARE);
check('a place with no site yet is finished by the wizard', !adopted.error && (await one('select client_id from digigate.sites where id = $1', [adopted.rows[0]?.id])).client_id === CLIENT_SPARE);
check('and is renamed after the site', (await one('select name from digigate.clients where id = $1', [CLIENT_SPARE])).name === 'Spare Hospital');
check('anon cannot create a site', (await as('anon', '', '', `select digigate.create_site('${ORG_A}', '{}', '[]')`)).error);

// The later company-change checks count this client's sites, so the wizard's site goes again.
await db.exec(`delete from digigate.posts where site_id in ('${createdId}', '${adopted.rows[0]?.id}'); delete from digigate.sites where id in ('${createdId}', '${adopted.rows[0]?.id}');`);

// One check in full, for the control room's popup, and the licence photo the handheld sends after it.
const attach = (device, eventId) => service('select digigate.attach_licence_photo($1, $2, $3) as ok', [device, eventId, `a/b/${eventId}.bmp`]);
check('the device that made a check attaches its licence photo', (await attach(DEVICE, entry.id)).rows[0].ok === true);
check('no other device can', (await attach(SECOND_DEVICE, entry.id)).rows[0].ok === false);
check('the dashboard cannot attach one', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.attach_licence_photo($1, $2, $3)', [DEVICE, entry.id, 'x.bmp'])).error);
const detailFor = async (profile, eventId) => (await as('authenticated', profile, 'aal2', 'select digigate.check_detail($1) as d', [eventId])).rows[0]?.d ?? null;
const shown = await detailFor(ADMIN_A, entry.id);
check('the control room sees the driver and the car', shown?.person.name === 'T KHUMALO' && shown.vehicle.plate === 'TT00TTGP' && shown.vehicle.make === 'TOYOTA' && shown.typedPlate === 'TT00TTGP');
check('and that there is a licence photo', shown?.hasLicencePhoto === true && shown.inFull === true);
check('and who scanned it', shown?.guard === 'Thabo Khumalo' && shown.occupants === 3);
check('a control room login for the site sees it too', (await detailFor(ROOM_A, entry.id))?.person.name === 'T KHUMALO');
check('another company sees nothing', (await detailFor(ADMIN_B, entry.id)) === null);
check('nor does anyone without MFA', (await as('authenticated', ADMIN_A, 'aal1', 'select digigate.check_detail($1) as d', [entry.id])).rows[0]?.d == null);
const agedDetail = await detailFor(ADMIN_A, OLD_CHECK);
check('after 365 days the driver is masked, with no photo', agedDetail !== null && agedDetail.inFull === false && agedDetail.person.name !== null && !agedDetail.person.name.includes('KHUMALO') && agedDetail.hasLicencePhoto === false);
const photoFor = async (profile, eventId) => (await as('authenticated', profile, 'aal2', 'select * from digigate.licence_photo_for($1)', [eventId])).rows;
const photoRow = (await photoFor(ROOM_A, entry.id))[0];
check('the photo is found for whoever may see the check', photoRow?.path === `a/b/${entry.id}.bmp` && photoRow.org_id === ORG_A);
check('named only masked in the log', photoRow !== undefined && photoRow.person !== 'T KHUMALO');
check('but not for another company', (await photoFor(ADMIN_B, entry.id)).length === 0);

// The photo of the car's number plate, and how the guard gave the plate.
const attachPlate = (device, eventId) => service('select digigate.attach_plate_photo($1, $2, $3) as ok', [device, eventId, `a/b/${eventId}.jpg`]);
check('the device that made a vehicle check attaches its plate photo', (await attachPlate(DEVICE, entry.id)).rows[0].ok === true);
check('no other device can attach one', (await attachPlate(SECOND_DEVICE, entry.id)).rows[0].ok === false);
check('nor can the dashboard', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.attach_plate_photo($1, $2, $3)', [DEVICE, entry.id, 'x.jpg'])).error);
await db.exec(`update digigate.event_details set payload = payload || '{"plate_entry": {"source": "typed", "photo": true, "read_from_photo": "TT00TTGP", "warned_plate": "TS00TTGP"}}' where event_id = '${entry.id}'`);
const withPlate = await detailFor(ADMIN_A, entry.id);
check('the control room sees there is a plate photo', withPlate?.hasPlatePhoto === true);
check('and how the guard gave the plate', withPlate?.plateEntry?.source === 'typed' && withPlate.plateEntry.photo === true && withPlate.plateEntry.readFromPhoto === 'TT00TTGP' && withPlate.plateEntry.warnedPlate === 'TS00TTGP');
check('after 365 days there is no plate photo and no plate entry', agedDetail?.hasPlatePhoto === false && agedDetail.plateEntry === null);
const plateFor = async (profile, eventId) => (await as('authenticated', profile, 'aal2', 'select * from digigate.plate_photo_for($1)', [eventId])).rows;
const plateRow = (await plateFor(ROOM_A, entry.id))[0];
check('the plate photo is found for whoever may see the check', plateRow?.path === `a/b/${entry.id}.jpg` && plateRow.org_id === ORG_A);
check('with the plate only masked, for the log', plateRow !== undefined && plateRow.plate !== 'TT00TTGP');
check('but not for another company either', (await plateFor(ADMIN_B, entry.id)).length === 0);
for (const fn of ['attach_plate_photo(uuid, uuid, text)']) {
  check(`dashboard users cannot call ${fn}`, !(await one(`select has_function_privilege('authenticated', 'digigate.${fn}', 'execute') a`)).a);
}

// An access point's location, set on the handheld by a supervisor standing at it.
const backGateNow = () => one(`select latitude, longitude, radius_m from digigate.posts where site_id = '${SITE_A}' and code = 'back-gate'`);
const locate = (gateUserId, payload) => ingest([event('post_location_set', payload, gateUserId)]);
const beforeLocating = await backGateNow();
await locate(GUARD, { post: 'back-gate', latitude: -29.61, longitude: 30.31, radius_m: 60, accuracy_m: 6 });
check('a guard alone cannot move an access point', (await backGateNow()).latitude === beforeLocating.latitude);
await locate(SUPERVISOR, { post: 'back-gate', latitude: -29.61, longitude: 30.31, radius_m: 5000, accuracy_m: 6 });
check('nor can a geofence be set beyond the limits', (await backGateNow()).latitude === beforeLocating.latitude);
await locate(SUPERVISOR, { post: 'back-gate', latitude: 'here', longitude: 30.31, radius_m: 60, accuracy_m: 6 });
check('nonsense coordinates change nothing, and fail nothing', (await backGateNow()).latitude === beforeLocating.latitude);
const locatedResult = await locate(SUPERVISOR, { post: 'back-gate', latitude: -29.61, longitude: 30.31, radius_m: 60, accuracy_m: 6 });
const relocated = await backGateNow();
check('a supervisor sets it from the device', !locatedResult.error && relocated.latitude === -29.61 && relocated.longitude === 30.31 && relocated.radius_m === 60);
const locatedLog = await one(`select actor_id, actor_name, target, category from digigate.audit_log where action = 'gate.post_located' order by at desc limit 1`);
check('logged under the supervisor who confirmed it', locatedLog?.actor_name === 'Kagiso Mokoena' && locatedLog.target === 'Back Gate' && locatedLog.category === 'gate');
await locate(SUPERVISOR, { post: 'no-such-gate', latitude: -29.7, longitude: 30.4, radius_m: 60, accuracy_m: 6 });
check('an access point the site does not have is left alone', (await backGateNow()).latitude === -29.61);
const snapshotFence = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.posts.find((post) => post.code === 'back-gate');
check('and the handheld gets the new location back', snapshotFence?.latitude === -29.61 && snapshotFence.radiusM === 60);
await db.exec(`update digigate.posts set latitude = ${beforeLocating.latitude ?? 'null'}, longitude = ${beforeLocating.longitude ?? 'null'}, radius_m = ${beforeLocating.radius_m} where site_id = '${SITE_A}' and code = 'back-gate'`);

// The Admin tab: each site's shift times, and guards' personal records.
const shiftsOf = async (site) => (await one('select shift_periods from digigate.sites where id = $1', [site])).shift_periods;
check('a site starts with day and night shifts', (await shiftsOf(SITE_A)).map((period) => period.code).join() === 'day,night');
const setShifts = (profile, periods) => as('authenticated', profile, 'aal2', 'update digigate.sites set shift_periods = $1::jsonb where id = $2 returning id', [JSON.stringify(periods), SITE_A]);
const threeShifts = [{ code: 'early', label: 'Early', start: '05:00', end: '08:00' }, { code: 'day', label: 'Day', start: '08:00', end: '18:00' }, { code: 'night', label: 'Night', start: '18:00', end: '05:00' }];
check('an admin sets the site\x27s shift times', (await setShifts(ADMIN_A, threeShifts)).rows.length === 1 && (await shiftsOf(SITE_A)).length === 3);
check('the control room cannot', (await setShifts(ROOM_A, [threeShifts[0]])).rows.length === 0 && (await shiftsOf(SITE_A)).length === 3);
check('nor another company', (await setShifts(ADMIN_B, [threeShifts[0]])).rows.length === 0);
check('a time that is not HH:MM is refused', (await setShifts(ADMIN_A, [{ ...threeShifts[0], start: '5am' }])).error);
check('a shift that starts when it ends is refused', (await setShifts(ADMIN_A, [{ ...threeShifts[0], end: '05:00' }])).error);
check('two shifts with one code are refused', (await setShifts(ADMIN_A, [threeShifts[0], threeShifts[0]])).error);
check('a site needs a shift', (await setShifts(ADMIN_A, [])).error);
check('and no more than six', (await setShifts(ADMIN_A, Array.from({ length: 7 }, (_, index) => ({ ...threeShifts[0], code: `s${index}` })))).error);
const adminSnapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s;
check('the handheld gets the site\x27s shifts', adminSnapshot.shiftPeriods.map((period) => period.code).join() === 'early,day,night');
check('and its name', adminSnapshot.siteName === 'A1');

const recordsDenied = async (profile) =>
  (await as('authenticated', profile, 'aal2', 'select * from digigate.gate_user_records')).error &&
  (await as('authenticated', profile, 'aal2', `insert into digigate.gate_user_records (gate_user_id, org_id) values ('${GUARD}', '${ORG_A}')`)).error;
check('nobody reads guard records directly, not even an admin', await recordsDenied(ADMIN_A));
check('nor a super user', await recordsDenied(SUPER));
await service(`insert into digigate.gate_user_records (gate_user_id, org_id, photo_path, home_address, id_type, id_number_hmac, id_number_cipher, id_number_last4, psira_number, psira_grade, next_of_kin_name, next_of_kin_phone)
  values ('${GUARD}', '${ORG_A}', 'a/b.jpg', '14 Example Street', 'sa_id', 'h1', 'c1', '9087', '1234567', 'C', 'Nomsa', '0821234567')`);
check('an ID number is stored whole or not at all', (await service(`insert into digigate.gate_user_records (gate_user_id, org_id, id_type) values ('${SUPERVISOR}', '${ORG_A}', 'sa_id')`)).error);
check('one ID number belongs to one guard in a company', (await service(`insert into digigate.gate_user_records (gate_user_id, org_id, id_type, id_number_hmac, id_number_cipher, id_number_last4) values ('${SUPERVISOR}', '${ORG_A}', 'sa_id', 'h1', 'c2', '9087')`)).error);
const guardList = (profile, status = '', search = '') => as('authenticated', profile, 'aal2', 'select * from digigate.guard_board($1, $2, $3, 25, 0)', [ORG_A, search, status]);
const boardRows = (await guardList(ADMIN_A)).rows;
const thabo = boardRows.find((row) => row.id === GUARD);
check('an admin lists the company\x27s guards', boardRows.length === 4 && Number(boardRows[0].total) === 4);
check('with what each record holds', thabo?.has_photo === true && thabo.has_id === true && thabo.psira_grade === 'C' && thabo.has_next_of_kin === true && thabo.has_address === true);
check('but none of what it says', thabo !== undefined && !('home_address' in thabo) && !('id_number_last4' in thabo) && !('pin' in thabo));
check('complete records are found', (await guardList(ADMIN_A, 'complete')).rows.map((row) => row.id).join() === GUARD);
check('and the ones still to fill in', (await guardList(ADMIN_A, 'incomplete')).rows.length === 3);
check('searched by name', (await guardList(ADMIN_A, '', '%khumalo%')).rows.length === 1);
check('a super user lists them too', (await guardList(SUPER)).rows.length === 4);
check('the control room gets none', (await guardList(ROOM_A)).rows.length === 0);
check('nor another company\x27s admin', (await guardList(ADMIN_B)).rows.length === 0);
check('nor anyone without MFA', (await as('authenticated', ADMIN_A, 'aal1', 'select * from digigate.guard_board($1, \x27\x27, \x27\x27, 25, 0)', [ORG_A])).rows.length === 0);
await setShifts(ADMIN_A, [{ code: 'day', label: 'Day', start: '06:00', end: '18:00' }, { code: 'night', label: 'Night', start: '18:00', end: '06:00' }]);

// A company's logo and colour.
const brand = (profile, org, path, colour) => as('authenticated', profile, 'aal2', 'select digigate.set_company_brand($1, $2, $3)', [org, path, colour]);
const LOGO = ORG_A + '/logo-1730700000000.webp';
check('an admin sets their company\x27s logo and colour', !(await brand(ADMIN_A, ORG_A, LOGO, '#1A7F5A')).error);
const branded = await one('select logo_path, brand_color from digigate.organisations where id = $1', [ORG_A]);
check('the colour is kept in lower case', branded.logo_path === LOGO && branded.brand_color === '#1a7f5a');
check('the change is in the audit log', (await count(`digigate.audit_log where action = 'company.changed' and org_id = '${ORG_A}' and detail = 'brand_color, logo_path'`)) === 1);
check('another company\x27s admin cannot', (await brand(ADMIN_B, ORG_A, '', '#000000')).error);
check('nor the control room', (await brand(ROOM_A, ORG_A, '', '#000000')).error);
check('nor without MFA', (await as('authenticated', ADMIN_A, 'aal1', 'select digigate.set_company_brand($1, $2, $3)', [ORG_A, '', ''])).error);
check('a logo from another company\x27s folder is refused', (await brand(ADMIN_A, ORG_A, ORG_B + '/logo-1.webp', '')).error);
check('a logo that is not one of ours is refused', (await brand(ADMIN_A, ORG_A, ORG_A + '/../evil.svg', '')).error);
check('so is a colour that is not a colour', (await brand(ADMIN_A, ORG_A, LOGO, 'red')).error);
const brandBoard = (await as('authenticated', SUPER, 'aal2', `select * from digigate.company_board('', 25, 0)`)).rows;
const boardA = brandBoard.find((row) => row.id === ORG_A);
check('the super user\x27s companies carry their look', boardA?.logo_path === LOGO && boardA.brand_color === '#1a7f5a');
check('and how each is doing now', Number(boardA?.on_site) >= 0 && Number(boardA?.open_alerts) >= 0 && 'sites' in (boardA ?? {}));
const peopleInside = (await one(`select coalesce(sum(case when v.kind = 'vehicle' then greatest(1, coalesce(v.occupants_in, 1)) else 1 end), 0)::int n, count(*) filter (where v.kind = 'vehicle')::int cars from digigate.visits v join digigate.sites s on s.id = v.site_id where s.org_id = '${ORG_A}' and v.exited_at is null`));
check('on site counts people, passengers included, with the cars beside them', Number(boardA?.on_site) === peopleInside.n && Number(boardA?.cars_on_site) === peopleInside.cars && peopleInside.n > peopleInside.cars);
const parkingSnapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.parking;
check('the handheld gets the site\x27s car park', parkingSnapshot !== null && typeof parkingSnapshot.open === 'boolean' && 'spaces' in parkingSnapshot);
check('an admin gets no company board', (await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.company_board('', 25, 0)`)).rows.length === 0);
check('an empty value clears the look', !(await brand(SUPER, ORG_A, '', '')).error && (await one('select logo_path, brand_color from digigate.organisations where id = $1', [ORG_A])).brand_color === null);

// Person keys made in the database match the handheld's.
const { createHmac } = await import('node:crypto');
const sqlHmac = async (keyHex, message) => (await one(`select encode(digigate.hmac_sha256(decode($1, 'hex'), convert_to($2, 'UTF8')), 'hex') as h`, [keyHex, message])).h;
const nodeHmac = (keyHex, message) => createHmac('sha256', Buffer.from(keyHex, 'hex')).update(message).digest('hex');
const shortKey = 'ab'.repeat(32);
const longKey = 'cd'.repeat(80);
check('the database\x27s HMAC is the standard one', (await sqlHmac(shortKey, '02:8001015009087')) === nodeHmac(shortKey, '02:8001015009087'));
check('also for a key longer than a block', (await sqlHmac(longKey, 'any message at all')) === nodeHmac(longKey, 'any message at all'));
// A handheld's key is 32 random bytes in hex; the pairing tests above used a short stand-in.
await db.exec(`update digigate.person_keys set key = '${'5a'.repeat(32)}' where org_id = '${ORG_A}'`);
const orgKey = (await one('select key from digigate.person_keys where org_id = $1', [ORG_A])).key;
check('a person key from an ID number is the one a handheld makes', (await one('select digigate.person_key_for($1, $2) as k', [ORG_A, '8001015009087'])).k === nodeHmac(orgKey, '02:8001015009087'));
const ORG_C = u(900);
await db.exec(`insert into digigate.organisations (id, name, slug) values ('${ORG_C}', 'C', 'c'); insert into digigate.clients (id, org_id, name) values ('${u(901)}', '${ORG_C}', 'C1'); insert into digigate.sites (id, org_id, client_id, name, site_type) values ('${u(902)}', '${ORG_C}', '${u(901)}', 'C1', 'hospital');`);
const madeKey = (await one('select digigate.org_person_key($1) as k', [ORG_C])).k;
check('a company with no handheld yet gets a key of its own', /^[0-9a-f]{64}$/.test(madeKey));
check('asked again, it is the same key', (await one('select digigate.org_person_key($1) as k', [ORG_C])).k === madeKey);
await db.exec(`insert into digigate.pairing_codes (org_id, site_id, device_name, code_hash, expires_at, created_by) values ('${ORG_C}', '${u(902)}', 'C DT50', 'c-code', now() + interval '10 minutes', '${SUPER}')`);
check('its first handheld is given that key, not its own', (await service('select * from digigate.claim_pairing_code($1, $2, $3)', ['c-code', 'c-token', 'ee'.repeat(32)])).rows[0]?.person_key === madeKey);
for (const fn of ['hmac_sha256(bytea, bytea)', 'org_person_key(uuid)', 'person_key_for(uuid, text)', 'hotlist_in_force(uuid, uuid)']) {
  check(`dashboard users cannot call ${fn}`, !(await one(`select has_function_privilege('authenticated', 'digigate.${fn}', 'execute') a`)).a);
}

// The hotlist.
const addHot = (profile, site, kind, value, label, expires = null) =>
  as('authenticated', profile, 'aal2', 'select digigate.add_hotlist_entry($1, $2, $3, $4, $5, $6, $7, $8) as id', [ORG_A, kind, value, label, 'Reported stolen, SAPS case 12/11/2026', 'Keep the boom down and call the supervisor', site, expires]);
const wantedPerson = await addHot(ADMIN_A, null, 'person', '8001015009087', 'Sipho Ndlovu');
check('an admin hotlists a person by ID number', !wantedPerson.error);
const HOT_PERSON = wantedPerson.rows[0]?.id;
const hotRow = await one('select * from digigate.hotlist where id = $1', [HOT_PERSON]);
check('only the last four digits are kept', hotRow.id_last_four === '9087' && !JSON.stringify(hotRow).includes('8001015009087'));
check('the person is kept by the key a handheld makes', hotRow.match_key === nodeHmac(orgKey, '02:8001015009087'));
const wantedPlate = await addHot(ROOM_A, SITE_A, 'plate', 'ca 123-456', '');
check('the control room hotlists a plate at its own site', !wantedPlate.error);
const HOT_PLATE = wantedPlate.rows[0]?.id;
check('the plate is kept as it reads and as it matches', (await one('select label, match_key from digigate.hotlist where id = $1', [HOT_PLATE])).match_key === 'CA123456');
check('but not at a site it does not watch', (await addHot(ROOM_A, SITE_A2, 'plate', 'CA 999', '')).error);
check('the same plate twice is refused', (await addHot(ADMIN_A, SITE_A, 'plate', 'CA123456', '')).error);
check('another company cannot hotlist for this one', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.add_hotlist_entry($1, $2, $3, $4, $5, $6)', [ORG_A, 'plate', 'XX 1', '', 'r', 'n'])).error);
check('a dashboard supervisor cannot either', (await addHot(SUP_A2, null, 'plate', 'SUP 1', '')).error);
check('an ID number that is not 13 digits is refused', (await addHot(ADMIN_A, null, 'person', '80010150', 'Short')).error);
check('a person needs a name', (await addHot(ADMIN_A, null, 'person', '8202025009081', ' ')).error);
check('an empty plate is refused', (await addHot(ADMIN_A, null, 'plate', ' - ', '')).error);
check('an end date already past is refused', (await addHot(ADMIN_A, null, 'vin', 'TESTVINPAST', '', new Date(Date.now() - 60_000).toISOString())).error);
const HOT_VIN = (await addHot(ADMIN_A, SITE_A2, 'vin', 'TESTVIN0000000009', '')).rows[0]?.id;
const HOT_SOON = (await addHot(ADMIN_A, null, 'vin', 'TESTVINSOON', '', new Date(Date.now() + 3_600_000).toISOString())).rows[0]?.id;
check('an entry with an end date is erased three years after it', (await one(`select erase_after = expires_at + interval '3 years' as ok from digigate.hotlist where id = $1`, [HOT_SOON])).ok === true);
const roomList = (await as('authenticated', ROOM_A, 'aal2', 'select id, label, reason from digigate.hotlist')).rows.map((row) => row.id);
check('the control room sees the company-wide entries and its own site\x27s', roomList.includes(HOT_PERSON) && roomList.includes(HOT_PLATE) && !roomList.includes(HOT_VIN));
check('nobody reads the match keys', (await as('authenticated', ADMIN_A, 'aal2', 'select match_key from digigate.hotlist')).error);
check('another company sees none of it', (await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.hotlist')).rows.length === 0);
check('nobody writes to it directly', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.hotlist (org_id, kind, match_key, label, reason, guard_note) values ('${ORG_A}', 'plate', 'X', 'X', 'r', 'n')`)).error);
const hotSnapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.hotlist;
const snapIds = hotSnapshot.map((entry) => entry.id);
check('the handheld gets the entries for its site', snapIds.includes(HOT_PERSON) && snapIds.includes(HOT_PLATE) && snapIds.includes(HOT_SOON) && !snapIds.includes(HOT_VIN));
const snapPerson = hotSnapshot.find((entry) => entry.id === HOT_PERSON);
check('with the key to match and what to tell the guard, never the reason', snapPerson?.key === hotRow.match_key && snapPerson.guardNote.length > 0 && !('reason' in snapPerson) && !JSON.stringify(hotSnapshot).includes('SAPS'));
check('and when an entry runs out', typeof hotSnapshot.find((entry) => entry.id === HOT_SOON)?.expiresAt === 'number');
check('the server re-checks against the same entries', (await service('select id from digigate.hotlist_in_force($1, $2)', [ORG_A, SITE_A])).rows.length === snapIds.length);
const hotAudit = (await service(`select target, detail from digigate.audit_log where action = 'hotlist.added' and org_id = '${ORG_A}'`)).rows;
check('each entry is logged, saying what kind and never whose', hotAudit.length === 4 && hotAudit.every((row) => ['a person', 'a plate', 'a VIN'].includes(row.target)) && !JSON.stringify(hotAudit).includes('Ndlovu'));

const hotCheck = event('vehicle_entry', {
  visit_id: null, outcome: 'blocked', hits: [{ code: 'HOTLIST_MATCH', severity: 'red', related_visit_id: null, hotlist_entry_id: HOT_PLATE }],
  vehicle: { ...vehicle, plate: 'CA123456' }, typed_plate: 'CA123456', driver, occupants: 1, visit_type: 'visitor',
});
await ingest([hotCheck]);
check('a hotlist match raises a red alert', (await count(`digigate.alerts where event_id = '${hotCheck.id}' and rule_code = 'HOTLIST_MATCH' and severity = 'red'`)) === 1);
const hotDetail = (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.check_detail($1) as d', [hotCheck.id])).rows[0]?.d;
check('the control room sees which entry stopped it, and why', hotDetail?.hotlist?.reason === 'Reported stolen, SAPS case 12/11/2026' && hotDetail.hotlist.label === 'CA 123-456');

check('the control room takes a plate off', !(await as('authenticated', ROOM_A, 'aal2', 'select digigate.remove_hotlist_entry($1)', [HOT_PLATE])).error);
check('then it reaches no handheld', !(await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.hotlist.some((entry) => entry.id === HOT_PLATE));
check('and is erased three years on', (await one(`select erase_after > now() + interval '1094 days' as ok from digigate.hotlist where id = $1`, [HOT_PLATE])).ok === true);
check('the control room cannot take off an entry for a site it does not watch', (await as('authenticated', ROOM_A, 'aal2', 'select digigate.remove_hotlist_entry($1)', [HOT_VIN])).error);
check('nor another company', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.remove_hotlist_entry($1)', [HOT_PERSON])).error);
check('nor take one off twice', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.remove_hotlist_entry($1)', [HOT_PLATE])).error);

// Expected visitors.
const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
const book = (profile, site, name, idNumber, plate, from = new Date(Date.now() - 3_600_000).toISOString(), until = tomorrow) =>
  as('authenticated', profile, 'aal2', 'select digigate.add_expected_visitor($1, $2, $3, $4, $5, $6, $7, $8, $9) as id', [ORG_A, site, name, idNumber, plate, 'contractor', from, until, 'Fixing the lifts']);
const bookedIn = await book(ADMIN_A, SITE_A, 'Lerato Dlamini', '9002025009083', 'nd 456-789');
check('an admin books a visitor in', !bookedIn.error);
const BOOKING = bookedIn.rows[0]?.id;
const bookedRow = await one('select * from digigate.expected_visitors where id = $1', [BOOKING]);
check('kept by key and last four digits, never the ID number', bookedRow.person_key === nodeHmac(orgKey, '02:9002025009083') && bookedRow.id_last_four === '9083' && !JSON.stringify(bookedRow).includes('9002025009083'));
check('with the plate as it matches', bookedRow.plate_key === 'ND456789');
check('erased three years after the booking ends', (await one(`select erase_after = valid_until + interval '3 years' as ok from digigate.expected_visitors where id = $1`, [BOOKING])).ok === true);
check('the control room books one at its own site', !(await book(ROOM_A, SITE_A, 'Plate only', '', 'GP 1')).error);
check('but not at a site it does not watch', (await book(ROOM_A, SITE_A2, 'Elsewhere', '', 'GP 2')).error);
check('a booking needs an ID number or a plate', (await book(ADMIN_A, SITE_A, 'Nobody', '', ' ')).error);
check('a booking is at most a month', (await book(ADMIN_A, SITE_A, 'Long', '', 'GP 3', new Date().toISOString(), new Date(Date.now() + 40 * 86_400_000).toISOString())).error);
check('a booking already over is refused', (await book(ADMIN_A, SITE_A, 'Late', '', 'GP 4', new Date(Date.now() - 7_200_000).toISOString(), new Date(Date.now() - 3_600_000).toISOString())).error);
check('another company cannot book here', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.add_expected_visitor($1, $2, $3, $4, $5, null, now(), now() + interval \x271 day\x27, null)', [ORG_A, SITE_A, 'X', '', 'X1'])).error);
const LATER = (await book(ADMIN_A, SITE_A, 'Next week', '', 'GP 5', new Date(Date.now() + 7 * 86_400_000).toISOString(), new Date(Date.now() + 8 * 86_400_000).toISOString())).rows[0]?.id;
const OTHER_SITE = (await book(ADMIN_A, SITE_A2, 'Other site', '', 'GP 6')).rows[0]?.id;
const expectedSnap = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.expectedVisitors;
const expectedIds = expectedSnap.map((booking) => booking.id);
check('the handheld gets today\x27s bookings for its site', expectedIds.includes(BOOKING) && !expectedIds.includes(OTHER_SITE));
check('not the ones a week away', !expectedIds.includes(LATER));
const snapBooking = expectedSnap.find((booking) => booking.id === BOOKING);
check('with the key, the plate, the name and the window', snapBooking?.personKey === bookedRow.person_key && snapBooking.plate === 'ND456789' && snapBooking.name === 'Lerato Dlamini' && snapBooking.until > snapBooking.from);
check('the control room sees its bookings', (await as('authenticated', ROOM_A, 'aal2', 'select id from digigate.expected_visitors')).rows.length === 3);
check('but no keys', (await as('authenticated', ADMIN_A, 'aal2', 'select person_key from digigate.expected_visitors')).error);

const arrival = event('pedestrian_entry', {
  visit_id: u(910), outcome: 'clear', hits: [], expected_visitor_id: BOOKING,
  person: { person_key: bookedRow.person_key, names: 'LERATO', surname: 'DLAMINI' }, visit_type: 'contractor',
});
const wrongSite = event('pedestrian_entry', {
  visit_id: u(911), outcome: 'clear', hits: [], expected_visitor_id: OTHER_SITE,
  person: { person_key: 'key-other', names: 'OTHER', surname: 'SITE' }, visit_type: 'visitor',
});
await ingest([arrival, wrongSite]);
check('an entry the handheld matched marks the booking arrived', (await one('select arrived_at, arrived_event from digigate.expected_visitors where id = $1', [BOOKING])).arrived_event === arrival.id);
check('a booking at another site is not marked by this gate', (await one('select arrived_at from digigate.expected_visitors where id = $1', [OTHER_SITE])).arrived_at === null);
check('a booking is cancelled', !(await as('authenticated', ADMIN_A, 'aal2', 'select digigate.cancel_expected_visitor($1)', [LATER])).error);
check('and not twice', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.cancel_expected_visitor($1)', [LATER])).error);
check('nor by another company', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.cancel_expected_visitor($1)', [BOOKING])).error);
check('bookings are logged without names', (await count(`digigate.audit_log where action in ('expected.added', 'expected.cancelled') and target = 'a visitor'`)) === 5);

// Append-only and erasure.
const change = async (sql) => (await service(sql)).error;
check('service role cannot change an event', await change(`update digigate.events set type = 'x'`));
check('service role cannot delete an event', await change('delete from digigate.events'));
check('service role cannot truncate events', await change('truncate digigate.events cascade'));
let ownerBlocked = false;
try {
  await db.exec(`delete from digigate.events where id = '${entry.id}'`);
} catch {
  ownerBlocked = true;
}
check('not even the owner can delete an event', ownerBlocked);
check('service role cannot delete details', await change('delete from digigate.visit_details'));
await db.exec(`delete from digigate.visit_details where visit_id = '${OLD}'`);
const erased = (await visits(ADMIN_A, 'aal2')).rows.find((row) => row.id === OLD);
check('an erased visit stays as a bare row, marked erased', erased?.details_erased === true && erased.person_name === null);

// Expected stay, who is in the car, a changed head count with the guard's reason, and the site's story in the log.
const STAY_VISIT = u(970);
const OPEN_STAY = u(971);
const stayCar = { ...vehicle, vin: 'TESTVIN0000000970', plate: 'ST00AYGP', disc_number: 'D970', description: 'Hatch back / Luikrug' };
const stayEntry = event('vehicle_entry', {
  visit_id: STAY_VISIT, outcome: 'clear', hits: [], vehicle: stayCar, typed_plate: 'ST00AYGP', driver, occupants: 3,
  occupants_by_sex: { male: 1, female: 2, unknown: 0 }, visit_type: 'visitor', expected_stay_minutes: 240,
});
await ingest([
  stayEntry,
  event('pedestrian_entry', { visit_id: OPEN_STAY, outcome: 'clear', hits: [], person: { person_key: 'key-stay', names: 'Lindiwe', surname: 'Mokoena' }, visit_type: 'staff', expected_stay_minutes: null }),
]);
const stayMinutes = async (visitId) => (await one(`select extract(epoch from expected_until - entered_at) / 60 as m from digigate.visits where id = '${visitId}'`)).m;
check('the visit keeps how long it should last', Number(await stayMinutes(STAY_VISIT)) === 240);
check('a visit with no limit has no end time', (await stayMinutes(OPEN_STAY)) === null);
const cameIn = (await one(`select occupants_in_by_sex from digigate.visits where id = '${STAY_VISIT}'`)).occupants_in_by_sex;
check('and who was in the car, as counts', cameIn.male === 1 && cameIn.female === 2 && cameIn.unknown === 0);
const stayRecord = (await as('authenticated', ADMIN_A, 'aal2', `select vehicle_search, expected_until from digigate.visit_records where id = '${STAY_VISIT}'`)).rows[0];
check('the car can be searched by colour and body', stayRecord?.vehicle_search.includes('white') && stayRecord.vehicle_search.includes('hatch back'));
check('and the dashboard sees when it is due out', stayRecord?.expected_until !== null);
const stayCheck = (await as('authenticated', ADMIN_A, 'aal2', `select vehicle_search from digigate.check_records where id = '${stayEntry.id}'`)).rows[0];
check('checks can be searched the same way', stayCheck?.vehicle_search.includes('toyota') && stayCheck.vehicle_search.includes('luikrug'));
const staySnapshot = (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s;
check('the handheld learns the expected stay of every open visit', staySnapshot.openVisits.find((visit) => visit.id === STAY_VISIT)?.expectedStayMinutes === 240);
check('and the site type and its own stay settings', staySnapshot.siteType === 'hospital' && JSON.stringify(staySnapshot.stayMinutes) === '{}');
check('and the booms at each access point, so a gate with none gets the right words', staySnapshot.posts.length > 0 && staySnapshot.posts.every((post) => Array.isArray(post.booms)));

const stayExit = event('vehicle_exit', {
  visit_id: STAY_VISIT, outcome: 'clear', hits: [{ code: 'OCCUPANT_COUNT_DROP', severity: 'info', related_visit_id: STAY_VISIT }], vehicle: stayCar,
  typed_plate: 'ST00AYGP', driver, occupants: 2, occupants_by_sex: { male: 1, female: 1, unknown: 0 },
  exit_checks: { ignition_restart: 'done', boot_check: 'not-needed' },
});
await ingest([stayExit]);
const headCount = await one(`select severity, status, resolution from digigate.alerts where event_id = '${stayExit.id}'`);
check('fewer people leaving is only noted, never left open', headCount.severity === 'info' && headCount.status === 'resolved');
check('the visit keeps who left in it', (await one(`select occupants_out_by_sex from digigate.visits where id = '${STAY_VISIT}'`)).occupants_out_by_sex.female === 1);
await service('select digigate.ingest_events($1, $2::jsonb)', [SECOND_DEVICE, JSON.stringify([event('occupant_reason', { check_event_id: stayExit.id, visit_id: STAY_VISIT, change: 'fewer', reason: 'Someone left on foot' })])]);
check('another handheld cannot give the reason', (await one(`select occupant_reason from digigate.visit_details where visit_id = '${STAY_VISIT}'`)).occupant_reason === null);
await ingest([event('occupant_reason', { check_event_id: stayExit.id, visit_id: STAY_VISIT, change: 'fewer', reason: 'Dropped off a patient' })]);
check("the guard's reason is kept with the visit's details", (await one(`select occupant_reason from digigate.visit_details where visit_id = '${STAY_VISIT}'`)).occupant_reason === 'Dropped off a patient');
check('and goes on the note', (await one(`select resolution from digigate.alerts where event_id = '${stayExit.id}'`)).resolution === 'Guard: Dropped off a patient');
const reasonLog = (await service(`select actor_name, target, detail from digigate.audit_log where action = 'gate.occupant_reason'`)).rows;
check('the log says a reason was given, by whom, but not what it was', reasonLog.length === 1 && reasonLog[0].actor_name === 'Thabo Khumalo' && reasonLog[0].detail === 'OCCUPANT_COUNT_DROP' && !JSON.stringify(reasonLog).includes('patient'));
const headCountDetail = await detailFor(ADMIN_A, stayExit.id);
check('the control room sees the head count change and why', headCountDetail?.occupantsCameIn === 3 && headCountDetail.occupants === 2 && headCountDetail.occupantReason === 'Dropped off a patient');
check('with who came in and who left', headCountDetail?.occupantsCameInBySex.female === 2 && headCountDetail.occupantsBySex.female === 1);

const siteStory = (await service(`select actor_name, target, detail from digigate.audit_log where action = 'alert.raised' and target = 'OCCUPANT_COUNT_DROP' order by at desc limit 1`)).rows[0];
check('every flag goes in the site log, from the handheld that raised it', siteStory?.actor_name !== null && siteStory.detail.includes('Going out') && siteStory.detail.includes('Noted'));
check('naming no one', !/KHUMALO|ST00AYGP|TESTVIN|Mokoena/.test(JSON.stringify(siteStory)));
check('the site log counts as alerts for the admin', (await as('authenticated', ADMIN_A, 'aal2', `select id from digigate.audit_log where action = 'alert.raised'`)).rows.length > 0);
await as('authenticated', ADMIN_A, 'aal2', `update digigate.sites set stay_minutes = '{"visitor": 120, "delivery": null}' where id = '${SITE_A}'`);
check('an admin sets the site\x27s own stays', (await one(`select stay_minutes from digigate.sites where id = '${SITE_A}'`)).stay_minutes.visitor === 120);
check('which the handheld then learns', (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.stayMinutes.visitor === 120);
check('the stays must be a list by visit type', (await as('authenticated', ADMIN_A, 'aal2', `update digigate.sites set stay_minutes = '[1]' where id = '${SITE_A}'`)).error);
await as('authenticated', ROOM_A, 'aal2', `update digigate.sites set stay_minutes = '{"visitor": 30}' where id = '${SITE_A}'`);
check('the control room cannot change them', (await one(`select stay_minutes from digigate.sites where id = '${SITE_A}'`)).stay_minutes.visitor === 120);
await db.exec(`update digigate.sites set stay_minutes = '{}' where id = '${SITE_A}'`);
// The launch grace: 7 days from when a super user starts it, then it ends by itself (migration 49).
check('the control room cannot start a launch grace', (await as('authenticated', ROOM_A, 'aal2', 'select digigate.start_launch_grace($1)', [SITE_A])).error);
check('nor can another company', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.start_launch_grace($1)', [SITE_A])).error);
check('nor the site\'s own admin: only DigiGate starts it', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.start_launch_grace($1)', [SITE_A])).error);
const graceStarted = await as('authenticated', SUPER, 'aal2', 'select digigate.start_launch_grace($1) as until', [SITE_A]);
check('a super user starts it', !graceStarted.error);
const graceDays = Number((await one(`select extract(epoch from launch_grace_until - now()) / 86400 as d from digigate.sites where id = '${SITE_A}'`)).d);
check('and it runs for 7 days', graceDays > 6.99 && graceDays <= 7);
check('the handheld learns when it ends', (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.launchGraceUntil > Date.now());
check('starting it is in the log, with when it ends', (await one(`select count(*)::int n from digigate.audit_log where action = 'site.grace_started' and detail like 'until %'`)).n === 1);
check('the site\'s admin cannot end it either', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.end_launch_grace($1)', [SITE_A])).error);
await as('authenticated', SUPER, 'aal2', 'select digigate.end_launch_grace($1)', [SITE_A]);
check('a super user can end it early', (await one(`select launch_grace_until <= now() as ended from digigate.sites where id = '${SITE_A}'`)).ended === true);
check('and that is in the log too', (await one(`select count(*)::int n from digigate.audit_log where action = 'site.grace_ended'`)).n === 1);
await as('authenticated', SUPER, 'aal2', 'select digigate.end_launch_grace($1)', [SITE_A]);
check('ending one that has ended does nothing more', (await one(`select count(*)::int n from digigate.audit_log where action = 'site.grace_ended'`)).n === 1);
await db.exec(`update digigate.sites set launch_grace_until = null where id = '${SITE_A}'`);
check('dashboard users cannot write the log themselves', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.audit_log (category, action) values ('alerts', 'alert.raised')`)).error);

// The nightly erasure: three years after a visit ends, its people's details go for good.
const PAST = "now() - interval '1 day'";
const ENDED_SHIFT = u(920);
const arrivalVisit = u(910);
await db.exec(`
  update digigate.event_details set erase_after = ${PAST}, licence_photo_path = '${ORG_A}/${SITE_A}/${hotCheck.id}.bmp', plate_photo_path = '${ORG_A}/${SITE_A}/${hotCheck.id}.jpg' where event_id = '${hotCheck.id}';
  update digigate.alerts set status = 'resolved', resolution = 'Spoke to Sipho Ndlovu at the gate' where event_id = '${hotCheck.id}';
  update digigate.visit_details set erase_after = ${PAST} where visit_id = '${arrivalVisit}';
  insert into digigate.shifts (id, org_id, site_id, device_id, gate_user_id, post, period, started_at, ended_at, end_reason, erase_after, selfie, selfie_path)
    values ('${ENDED_SHIFT}', '${ORG_A}', '${SITE_A}', '${DEVICE}', '${GUARD}', 'back-gate', 'day', now() - interval '3 years 2 days', now() - interval '3 years 1 day', 'ended', ${PAST}, 'taken', '${ORG_A}/${SITE_A}/${ENDED_SHIFT}.jpg');
  update digigate.hotlist set erase_after = ${PAST} where id = '${HOT_PLATE}';
  update digigate.expected_visitors set erase_after = ${PAST} where id = '${LATER}';
`);
const detailsBefore = await count('digigate.event_details');
check('nobody signed in can run the erasure', (await as('authenticated', SUPER, 'aal2', 'select digigate.erase_due(10)')).error);
for (const fn of ['erase_due(integer)', 'erasure_files_done(text, text[])', 'erasure_token_ok(text)']) {
  check(`dashboard users cannot call ${fn}`, !(await one(`select has_function_privilege('authenticated', 'digigate.${fn}', 'execute') a`)).a);
}
const erasedNow = (await service('select digigate.erase_due(5000) as r')).rows[0]?.r;
check('the job reports what it erased', erasedNow?.checks === 1 && erasedNow.visits === 1 && erasedNow.shifts === 1 && erasedNow.hotlist === 1 && erasedNow.bookings === 1);
check('only what was due goes', (await count('digigate.event_details')) === detailsBefore - 1);
check('the check itself stays, with nothing in it about anyone', (await count(`digigate.events where id = '${hotCheck.id}'`)) === 1 && (await count(`digigate.event_details where event_id = '${hotCheck.id}'`)) === 0);
check('the visit stays as a bare row', (await count(`digigate.visits where id = '${arrivalVisit}'`)) === 1 && (await count(`digigate.visit_details where visit_id = '${arrivalVisit}'`)) === 0);
check('a note written about the check goes with it', (await one('select resolution from digigate.alerts where event_id = $1', [hotCheck.id])).resolution === null);
check('the ended shift goes, its selfie with it', (await count(`digigate.shifts where id = '${ENDED_SHIFT}'`)) === 0);
check('an open shift stays', (await count(`digigate.shifts where id = '${SHIFT}'`)) === 1);
check('the hotlist entry and the booking are gone', (await count(`digigate.hotlist where id = '${HOT_PLATE}'`)) === 0 && (await count(`digigate.expected_visitors where id = '${LATER}'`)) === 0);
check('entries still in force are untouched', (await count(`digigate.hotlist where id = '${HOT_PERSON}'`)) === 1);
const queuedFiles = (await service('select bucket, path from digigate.erasure_files order by bucket')).rows;
check('the licence photo, plate photo and selfie wait to be removed from storage', queuedFiles.map((row) => row.bucket).join() === 'licence-photos,plate-photos,shift-selfies');
const erasureLog = (await service(`select org_id, actor_name, target, detail from digigate.audit_log where action = 'erasure.ran'`)).rows;
check('the company\x27s log says what was erased, in counts', erasureLog.length === 1 && erasureLog[0].org_id === ORG_A && erasureLog[0].detail === '1 checks, 1 visits, 1 licence photos, 1 plate photos, 1 shifts, 1 hotlist entries, 1 bookings');
check('and never whose', !JSON.stringify(erasureLog).includes('Ndlovu') && !JSON.stringify(erasureLog).includes('Dlamini'));
check('the admin sees it in their log', (await as('authenticated', ADMIN_A, 'aal2', `select id from digigate.audit_log where action = 'erasure.ran'`)).rows.length === 1);
check('another company does not', (await as('authenticated', ADMIN_B, 'aal2', `select id from digigate.audit_log where action = 'erasure.ran'`)).rows.length === 0);
const quietNight = (await service('select digigate.erase_due(5000) as r')).rows[0]?.r;
check('a night with nothing due erases nothing and logs nothing', quietNight?.checks === 0 && (await count(`digigate.audit_log where action = 'erasure.ran'`)) === 1);
await service('select digigate.erasure_files_done($1, $2)', ['licence-photos', [queuedFiles[0]?.path]]);
check('a file storage has removed leaves the queue', (await count('digigate.erasure_files')) === 2);
check('without the secret, nobody may trigger the storage clean-up', (await service('select digigate.erasure_token_ok($1) as ok', ['guess'])).rows[0]?.ok === false);

// Checks brought over from a site's old gate system: kept apart, seen like DigiGate's own, erased on time.
const oldRows = [
  { ref: 'OLD-1', at: new Date(Date.now() - 2 * 86_400_000).toISOString(), direction: 'in', person_key: 'key-old', name: 'N MOKOENA', sex: 'female', plate: 'OLD123GP', vin: 'OLDVIN0000000001', make: 'TOYOTA', model: 'HILUX', colour: 'White', body: 'Pick-up / Bakkie', visit_type: 'visitor', occupants: '2', scanned_by: 'Sipho Dube' },
  { ref: 'OLD-2', at: new Date(Date.now() - 86_400_000).toISOString(), direction: 'out', person_key: 'key-old', name: 'N MOKOENA', plate: 'OLD123GP', make: 'TOYOTA', colour: 'White', body: 'Pick-up / Bakkie', occupants: '0' },
  { ref: 'OLD-3', at: new Date(Date.now() - 4 * 365 * 86_400_000).toISOString(), direction: 'in', name: 'TOO OLD', plate: 'OLD999GP' },
];
// The import runs as the database owner, from the terminal of whoever brings the old data over.
const importOld = (rows, site = SITE_A) =>
  db.query('select digigate.import_old_checks($1, $2, $3::jsonb) as n', [ORG_A, site, JSON.stringify(rows)]).then((result) => ({ rows: result.rows, error: null }), (cause) => ({ rows: [], error: cause.message }));
check('an import adds the old checks, but none already three years old', (await importOld(oldRows)).rows[0]?.n === 2);
check('running it again adds nothing', (await importOld(oldRows)).rows[0]?.n === 0);
check('nor can it put checks at another company\'s site', (await importOld([{ ...oldRows[0], ref: 'OLD-X' }], u(902))).error);
check('a count of nobody is kept as unknown', (await one(`select occupants from digigate.imported_checks where source_ref = 'OLD-2'`)).occupants === null);
check('the import is logged once, in counts', (await one(`select count(*)::int n, max(detail) d from digigate.audit_log where action = 'import.old_checks'`)).d === '2 checks from the old system');
const oldSeen = (await as('authenticated', ADMIN_A, 'aal2', 'select person_name, plate, vehicle_search, scanned_by from digigate.imported_check_records order by occurred_at')).rows;
check('the company sees its old checks', oldSeen.length === 2 && oldSeen[0].person_name === 'N MOKOENA' && oldSeen[0].scanned_by === 'Sipho Dube');
check('and can search them by the car', oldSeen[0].vehicle_search.includes('white') && oldSeen[0].vehicle_search.includes('bakkie'));
check('another company sees none of them', (await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.imported_check_records')).rows.length === 0);
check('nobody reads the table itself', (await as('authenticated', ADMIN_A, 'aal2', 'select id from digigate.imported_checks')).rows.length === 0);
check('neither the dashboard nor the service key can import', !(await one(`select has_function_privilege('service_role', 'digigate.import_old_checks(uuid, uuid, jsonb)', 'execute') a`)).a && !(await one(`select has_function_privilege('authenticated', 'digigate.import_old_checks(uuid, uuid, jsonb)', 'execute') a`)).a);

// One list: DigiGate's checks and the old system's together, each company seeing only its own.
const oneList = (profile) => as('authenticated', profile, 'aal2', `select type, source, person_name, occupants, scanned_by from digigate.all_check_records where source = 'old-system' order by occurred_at`);
const listedOld = (await oneList(ADMIN_A)).rows;
check('the old checks are in the one list of checks', listedOld.length === 2 && listedOld[0].person_name === 'N MOKOENA' && listedOld[0].scanned_by === 'Sipho Dube');
check('with a car, an old check is a vehicle entry or exit', listedOld[0].type === 'vehicle_entry' && listedOld[1].type === 'vehicle_exit');
check('DigiGate\x27s own checks are in the same list', (await as('authenticated', ADMIN_A, 'aal2', `select id from digigate.all_check_records where source = 'digigate'`)).rows.length > 0);
check('another company sees none of the old checks in it', (await oneList(ADMIN_B)).rows.length === 0);

// The old checks count in the day figures the reports read, once each.
const dayOf = async (at) => (await one(`select ($1::timestamptz at time zone 'Africa/Johannesburg')::date::text as d`, [at])).d;
const OLD_IN_DAY = await dayOf(oldRows[0].at), OLD_OUT_DAY = await dayOf(oldRows[1].at);
const oldOutDay = await one(`select exits, untimed_exits from digigate.daily_activity where site_id = $1 and day = $2`, [SITE_A, OLD_OUT_DAY]);
check('an old exit counts as an exit with no stay', oldOutDay?.exits >= 1 && oldOutDay?.untimed_exits === 1);
check('importing it again counted nothing twice', oldOutDay?.untimed_exits === 1);
const oldInCounted = await one(`select visits from digigate.daily_counts where site_id = $1 and day = $2 and kind = 'vehicle' and visit_type = 'visitor' and sex = 'female' and age_band = 'unknown'`, [SITE_A, OLD_IN_DAY]);
check('an old entry counts by its visit type and the driver\x27s sex', (oldInCounted?.visits ?? 0) >= 1);
const oldReport = (await service(`select digigate.report_data('${ORG_A}', null, 'daily', '${OLD_OUT_DAY}') as r`)).rows[0].r;
check('the report leaves exits with no stay out of the average', oldReport.totals.timed_exits === oldReport.totals.exits - 1);
await db.exec(`update digigate.imported_checks set erase_after = now() - interval '1 day' where source_ref = 'OLD-1'`);
const oldErased = (await service('select digigate.erase_due(5000) as r')).rows[0]?.r;
check('the nightly job erases an old check when its three years are up', oldErased?.imported === 1 && (await count(`digigate.imported_checks where source_ref = 'OLD-1'`)) === 0);
check('and says so in the log, in counts', (await one(`select detail from digigate.audit_log where action = 'erasure.ran' order by at desc limit 1`)).detail === '1 old-system checks');

// One guard, one handheld: another handheld knows who is on duty, a supervisor can move a shift, and a guard on duty
// on two handhelds that couldn't see each other raises an alert.
const minutesAgo = (minutes) => Date.now() - minutes * 60_000;
const shiftEvent = (id, minutes, payload) => ({ id: u(id), type: 'shift_start', occurredAt: minutesAgo(minutes), gateUserId: ELSEWHERE, payload: { post: 'back-gate', period: 'day', ...payload } });
const onDevice = (device, events) => service('select digigate.ingest_events($1, $2::jsonb) as ids', [device, JSON.stringify(events)]);
const snapshotOf = async (device) => (await service('select digigate.device_snapshot($1) as s', [device])).rows[0].s;
const FIRST_SHIFT = u(7001), SECOND_SHIFT = u(7003), MOVED_SHIFT = u(7005);
await onDevice(DEVICE, [shiftEvent(7002, 30, { shift_id: FIRST_SHIFT })]);
check('another handheld knows the guard is on duty', (await snapshotOf(SECOND_DEVICE)).onDutyElsewhere.some((row) => row.gateUserId === ELSEWHERE && row.shiftId === FIRST_SHIFT && row.post === 'Back Gate'));
check('a handheld does not list its own shift as elsewhere', !(await snapshotOf(DEVICE)).onDutyElsewhere.some((row) => row.shiftId === FIRST_SHIFT));
await onDevice(SECOND_DEVICE, [shiftEvent(7004, 20, { shift_id: SECOND_SHIFT })]);
const twoDevices = await one(`select severity, source, status from digigate.alerts where event_id = '${u(7004)}' and rule_code = 'GUARD_ON_TWO_DEVICES'`);
check('a guard on duty on two handhelds raises an amber alert', twoDevices?.severity === 'amber' && twoDevices.source === 'server' && twoDevices.status === 'open');
await onDevice(SECOND_DEVICE, [{ id: u(7006), type: 'shift_end', occurredAt: minutesAgo(15), gateUserId: ELSEWHERE, payload: { shift_id: SECOND_SHIFT, reason: 'ended' } }]);
await onDevice(SECOND_DEVICE, [shiftEvent(7007, 10, { shift_id: MOVED_SHIFT, moved_from: FIRST_SHIFT, moved_by: SUPERVISOR })]);
check('a supervisor moving the shift ends the one it came from', (await one(`select end_reason from digigate.shifts where id = '${FIRST_SHIFT}'`)).end_reason === 'moved');
check('and raises no alert, since it was approved', (await count(`digigate.alerts where event_id = '${u(7007)}'`)) === 0);
check('the old handheld learns its shift moved', (await snapshotOf(DEVICE)).movedShifts.includes(FIRST_SHIFT));
check('the move is logged with the supervisor', (await one(`select actor_name, detail from digigate.audit_log where action = 'gate.shift_moved' order by at desc limit 1`))?.actor_name === 'Kagiso Mokoena');
const otherOpen = await one(`select id from digigate.shifts where gate_user_id <> '${ELSEWHERE}' and ended_at is null and device_id = '${DEVICE}' limit 1`);
if (otherOpen) {
  await onDevice(SECOND_DEVICE, [shiftEvent(7008, 5, { shift_id: u(7009), moved_from: otherOpen.id, moved_by: SUPERVISOR })]);
  check('a move can only end that same guard\x27s shift', (await one(`select ended_at from digigate.shifts where id = '${otherOpen.id}'`)).ended_at === null);
}
await onDevice(SECOND_DEVICE, [{ id: u(7010), type: 'shift_end', occurredAt: minutesAgo(1), gateUserId: ELSEWHERE, payload: { shift_id: MOVED_SHIFT, reason: 'ended' } }]);
await onDevice(SECOND_DEVICE, [{ id: u(7011), type: 'shift_end', occurredAt: minutesAgo(1), gateUserId: ELSEWHERE, payload: { shift_id: u(7009), reason: 'ended' } }]);

// Visitor invites from the phone app: hosts with no MFA, their own invites at their own sites, and nothing else.
const HOST_A = u(7101), HOST_B = u(7102), HOST_OFF = u(7103);
await db.exec(`
  insert into auth.users (id) values ('${HOST_A}'), ('${HOST_B}'), ('${HOST_OFF}');
  insert into digigate.profiles (id, org_id, full_name, login, roles, site_ids, is_active, phone) values
    ('${HOST_A}', '${ORG_A}', 'Dr Naidoo', 'host-a', '{host}', '{${SITE_A}}', true, '+27821234567'),
    ('${HOST_B}', '${ORG_B}', 'Resident B', 'host-b', '{host}', '{${SITE_B}}', true, '+27831234567'),
    ('${HOST_OFF}', '${ORG_A}', 'Left Host', 'host-off', '{host}', '{${SITE_A}}', false, null);
`);
const hostAs = (profile, sql, aal = 'aal1') => as('authenticated', profile, aal, sql);
check('a host signs in without MFA and reaches no gate records', (await hostAs(HOST_A, 'select id from digigate.check_records')).rows.length === 0 && (await hostAs(HOST_A, 'select id from digigate.sites')).rows.length === 0);
check('nor does a host who enrolled MFA', (await hostAs(HOST_A, 'select id from digigate.check_records', 'aal2')).rows.length === 0
  && (await hostAs(HOST_A, 'select id from digigate.visit_records', 'aal2')).rows.length === 0
  && (await hostAs(HOST_A, 'select id from digigate.organisations', 'aal2')).rows.length === 0
  && (await hostAs(HOST_A, 'select id from digigate.sites', 'aal2')).rows.length === 0);
const hostSites = (await hostAs(HOST_A, 'select site_id from digigate.invite_sites()')).rows;
check('a host may invite to their own site only', hostSites.length === 1 && hostSites[0].site_id === SITE_A);
const inviteAs = (profile, site, name, from = 'now()', until = "now() + interval '1 day'", idNumber = null) =>
  hostAs(profile, `select * from digigate.create_invite('${site}', '${name}', ${idNumber ? `'${idNumber}'` : 'null'}, null, 'visitor', ${from}, ${until}, 'Meeting')`);
const INVITE = (await inviteAs(HOST_A, SITE_A, 'Lerato Dube')).rows[0];
check('a host invites a visitor, without MFA', /^[0-9a-f]{64}$/.test(INVITE?.code ?? ''));
const inviteRow = await one(`select invite_hash, created_by, created_by_name, single_use from digigate.expected_visitors where id = '${INVITE.invite_id}'`);
check('the gate only ever gets a hash of the QR', inviteRow.invite_hash === createHash('sha256').update(INVITE.code).digest('hex'));
check('an invite is good for one visit', inviteRow.single_use === true);
check('at a hospital the inviter is recorded, but not named on the booking', inviteRow.created_by === HOST_A && inviteRow.created_by_name === null);
const ESTATE_INVITE = (await inviteAs(HOST_B, SITE_B, 'Sipho Zulu')).rows[0];
check('at an estate the host is named', (await one(`select created_by_name from digigate.expected_visitors where id = '${ESTATE_INVITE.invite_id}'`)).created_by_name === 'Resident B');
check('a host cannot invite to another of the company\x27s sites', (await inviteAs(HOST_A, SITE_A2, 'Someone')).error);
check('nor to another company\x27s', (await inviteAs(HOST_A, SITE_B, 'Someone')).error);
check('a deactivated host cannot invite', (await inviteAs(HOST_OFF, SITE_A, 'Someone')).error);
check('an ID number must be 13 digits', (await inviteAs(HOST_A, SITE_A, 'Someone', 'now()', "now() + interval '1 day'", '12345')).error);
check('an invite cannot be over already', (await inviteAs(HOST_A, SITE_A, 'Someone', "now() - interval '2 days'", "now() - interval '1 day'")).error);
const mine = async (profile) => (await hostAs(profile, 'select id, status, code from digigate.my_invites()')).rows;
check('a host sees their invite, with its QR to share again', (await mine(HOST_A)).some((row) => row.id === INVITE.invite_id && row.code === INVITE.code && row.status === 'active'));
check('nobody else sees it', !(await mine(HOST_B)).some((row) => row.id === INVITE.invite_id));
check('the dashboard can never read an invite\x27s code', (await as('authenticated', ADMIN_A, 'aal2', 'select invite_code from digigate.expected_visitors')).error);
const invitedOnDevice = (await snapshotOf(DEVICE)).expectedVisitors.find((row) => row.id === INVITE.invite_id);
check('the handheld gets the invite as a hash, for one visit', invitedOnDevice?.invite === inviteRow.invite_hash && invitedOnDevice.singleUse === true && !JSON.stringify(invitedOnDevice).includes(INVITE.code));
const INVITE_VISIT = u(7110);
const invitedPerson = { person_key: 'key-invited', document: 'smart-id', names: 'LERATO', surname: 'DUBE', manual: false };
await onDevice(DEVICE, [{ id: u(7111), type: 'pedestrian_entry', occurredAt: minutesAgo(2), gateUserId: GUARD, payload: { visit_id: INVITE_VISIT, outcome: 'clear', hits: [], person: invitedPerson, visit_type: 'visitor', expected_visitor_id: INVITE.invite_id } }]);
check('using an invite marks it used and clears its code', (await mine(HOST_A)).some((row) => row.id === INVITE.invite_id && row.status === 'used' && row.code === null));
check('a used invite is no longer sent to handhelds', !(await snapshotOf(DEVICE)).expectedVisitors.some((row) => row.id === INVITE.invite_id));
await onDevice(DEVICE, [{ id: u(7112), type: 'pedestrian_exit', occurredAt: minutesAgo(1), gateUserId: GUARD, payload: { visit_id: INVITE_VISIT, outcome: 'clear', hits: [], person: invitedPerson } }]);
const TO_CANCEL = (await inviteAs(HOST_A, SITE_A, 'Thandi Mokoena')).rows[0];
check('another host cannot cancel it', (await hostAs(HOST_B, `select digigate.cancel_invite('${TO_CANCEL.invite_id}')`)).error);
await hostAs(HOST_A, `select digigate.cancel_invite('${TO_CANCEL.invite_id}')`);
check('a host cancels their invite, and its code goes with it', (await mine(HOST_A)).some((row) => row.id === TO_CANCEL.invite_id && row.status === 'cancelled' && row.code === null));
check('the first visit on an invite raises nothing', (await count(`digigate.alerts where event_id = '${u(7111)}'`)) === 0);
// Two handhelds offline can't see each other: the second to let a one-visit invite in is caught when it syncs.
await onDevice(SECOND_DEVICE, [{ id: u(7113), type: 'pedestrian_entry', occurredAt: minutesAgo(1), gateUserId: GUARD, payload: { visit_id: u(7114), outcome: 'clear', hits: [], person: invitedPerson, visit_type: 'visitor', expected_visitor_id: INVITE.invite_id } }]);
const reused = await one(`select severity, source, status, visit_id from digigate.alerts where event_id = '${u(7113)}' and rule_code = 'INVITE_REUSED'`);
check('a one-visit invite let in twice raises an amber alert on the second check', reused?.severity === 'amber' && reused.source === 'server' && reused.status === 'open' && reused.visit_id === u(7114));
check('and the first arrival stands', (await one(`select arrived_event from digigate.expected_visitors where id = '${INVITE.invite_id}'`)).arrived_event === u(7111));
// A handheld that hadn't synced since the host cancelled still lets the visitor in, and the control room is told.
await db.query(`update digigate.expected_visitors set cancelled_at = now() - interval '10 minutes' where id = '${TO_CANCEL.invite_id}'`);
await onDevice(DEVICE, [{ id: u(7115), type: 'pedestrian_entry', occurredAt: minutesAgo(1), gateUserId: GUARD, payload: { visit_id: u(7116), outcome: 'clear', hits: [], person: { ...invitedPerson, person_key: 'key-cancelled' }, visit_type: 'visitor', expected_visitor_id: TO_CANCEL.invite_id } }]);
const cancelledUsed = await one(`select severity, source from digigate.alerts where event_id = '${u(7115)}' and rule_code = 'INVITE_CANCELLED'`);
check('an invite used after it was cancelled raises an amber alert', cancelledUsed?.severity === 'amber' && cancelledUsed.source === 'server');
check('and is not counted as reused', (await count(`digigate.alerts where event_id = '${u(7115)}' and rule_code = 'INVITE_REUSED'`)) === 0);
const LATE_CANCEL = (await inviteAs(HOST_A, SITE_A, 'Ayanda Khumalo')).rows[0];
await hostAs(HOST_A, `select digigate.cancel_invite('${LATE_CANCEL.invite_id}')`);
await onDevice(DEVICE, [{ id: u(7117), type: 'pedestrian_entry', occurredAt: minutesAgo(30), gateUserId: GUARD, payload: { visit_id: u(7118), outcome: 'clear', hits: [], person: { ...invitedPerson, person_key: 'key-late-cancel' }, visit_type: 'visitor', expected_visitor_id: LATE_CANCEL.invite_id } }]);
check('a visitor who came in before the host cancelled raises nothing', (await count(`digigate.alerts where event_id = '${u(7117)}'`)) === 0);

// Handhelds under DigiGate's control: their SIM, their data by day, and why one went quiet.
const dataToday = (await one(`select to_char(current_date, 'YYYY-MM-DD') as d`)).d;
const dataYesterday = (await one(`select to_char(current_date - 1, 'YYYY-MM-DD') as d`)).d;
await health({ managed: true, policyProblems: ['no_config_tethering'], simState: 'ready', simOperator: 'Vodacom', networkOperator: 'Vodacom', roaming: false, dataEnabled: true,
  mobileData: [{ day: dataToday, device: 52_000_000, app: 4_000_000 }, { day: dataYesterday, device: 310_000_000, app: 9_000_000 }, { day: '2001-01-01', device: 1, app: 1 }, { day: 'soon', device: 1, app: 1 }] });
const managedHealth = (await one('select health from digigate.devices where id = $1', [DEVICE])).health;
check('health says the handheld is DigiGate\'s, and its SIM', managedHealth.managed === true && managedHealth.policyProblems[0] === 'no_config_tethering' && managedHealth.simState === 'ready' && managedHealth.simOperator === 'Vodacom' && managedHealth.dataEnabled === true);
const dataDays = (await db.query(`select to_char(day, 'YYYY-MM-DD') as day, device_bytes, app_bytes from digigate.device_data_days where device_id = $1 order by day`, [DEVICE])).rows;
check('mobile data is kept by day', dataDays.length === 2 && dataDays[1].day === dataToday && Number(dataDays[1].device_bytes) === 52_000_000 && Number(dataDays[0].app_bytes) === 9_000_000);
await health({ mobileData: [{ day: dataToday, device: 40_000_000, app: 5_000_000 }] });
const todayAgain = await one(`select device_bytes, app_bytes from digigate.device_data_days where device_id = $1 and day = current_date`, [DEVICE]);
check('a day\'s count only grows, whatever order reports arrive in', Number(todayAgain.device_bytes) === 52_000_000 && Number(todayAgain.app_bytes) === 5_000_000);
check('no login reads data use directly', (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.device_data_days')).error);
check('a SIM number is kept in +27 form', await db.query(`update digigate.devices set sim_number = '0821234567' where id = '${DEVICE}'`).then(() => false, () => true));
const deviceEvent = (id, type, payload, gateUserId = null) => ({ id: u(id), type, occurredAt: minutesAgo(5), gateUserId, payload });
await onDevice(DEVICE, [
  deviceEvent(7201, 'device_status', { status: 'sim_removed', battery: 60, reason: null }),
  deviceEvent(7202, 'device_status', { status: 'data_off', battery: 60, reason: null }),
  deviceEvent(7203, 'device_status', { status: 'app_closed', battery: null, reason: 'by_user' }),
  deviceEvent(7204, 'device_status', { status: 'app_closed', battery: null, reason: 'crash' }),
  deviceEvent(7205, 'device_status', { status: 'switched_off', battery: 4, reason: null }),
  deviceEvent(7206, 'handheld_released', { released: true, problems: [] }, SUPERVISOR),
]);
const handheldAlert = async (id) => (await one(`select rule_code, severity, source from digigate.alerts where event_id = '${u(id)}'`)) ?? null;
check('a SIM taken out raises an amber alert', (await handheldAlert(7201))?.rule_code === 'SIM_REMOVED' && (await handheldAlert(7201))?.severity === 'amber');
check('so does mobile data switched off', (await handheldAlert(7202))?.rule_code === 'MOBILE_DATA_OFF');
check('and DigiGate closed by hand', (await handheldAlert(7203))?.rule_code === 'DIGIGATE_CLOSED');
check('a crash or switching off is only recorded', (await count(`digigate.alerts where event_id in ('${u(7204)}', '${u(7205)}')`)) === 0
  && (await count(`digigate.events where id in ('${u(7204)}', '${u(7205)}')`)) === 2);
check('a release raises an alert and is in the audit log, with the supervisor', (await handheldAlert(7206))?.rule_code === 'HANDHELD_RELEASED'
  && (await count(`digigate.audit_log where action = 'gate.handheld_released' and device_id = '${DEVICE}'`)) === 1);

// Emergencies, let in first: no driver scanned, named by their kind, and the control room told of each one.
const AMBULANCE_VISIT = u(7301);
await onDevice(DEVICE, [{ id: u(7302), type: 'vehicle_entry', occurredAt: minutesAgo(4), gateUserId: GUARD, payload: {
  visit_id: AMBULANCE_VISIT, outcome: 'clear', hits: [], driver: null, typed_plate: 'ND123456', occupants: 1, visit_type: 'emergency', expected_stay_minutes: null,
  vehicle: { vin: null, plate: 'ND123456', disc_number: null, make: null, model: null, colour: null, disc_expires_on: null, manual: true },
  emergency: { kind: 'ambulance', label: 'Ambulance (EMS)', note: null } } }]);
const ambulance = await one(`select d.person_key, d.person_name, d.vehicle_description, v.visit_type, v.exited_at from digigate.visit_details d join digigate.visits v on v.id = d.visit_id where d.visit_id = '${AMBULANCE_VISIT}'`);
check('an emergency let in first opens a visit with no driver, named by its kind', ambulance?.person_key === null && ambulance.person_name === 'Ambulance (EMS)' && ambulance.vehicle_description === null && ambulance.visit_type === 'emergency');
const emergencyAlert = await one(`select severity, status, visit_id from digigate.alerts where event_id = '${u(7302)}' and rule_code = 'EMERGENCY_ENTRY'`);
check('the control room is told of every emergency', emergencyAlert?.severity === 'amber' && emergencyAlert.status === 'open' && emergencyAlert.visit_id === AMBULANCE_VISIT);
check('handhelds get it on site with no person', (await snapshotOf(DEVICE)).openVisits.some((row) => row.id === AMBULANCE_VISIT && row.personKey === null && row.plate === 'ND123456'));
await onDevice(DEVICE, [{ id: u(7303), type: 'vehicle_exit', occurredAt: minutesAgo(2), gateUserId: GUARD, payload: {
  visit_id: AMBULANCE_VISIT, outcome: 'clear', hits: [], driver: null, typed_plate: 'ND123456', occupants: 1, visit_type: 'emergency', exit_checks: null,
  vehicle: { vin: null, plate: 'ND123456', disc_number: null, make: null, model: null, colour: null, disc_expires_on: null, manual: true }, emergency: { label: 'Ambulance (EMS)' } } }]);
check('and leaving ends it, with no second alert', (await one(`select exited_at from digigate.visits where id = '${AMBULANCE_VISIT}'`)).exited_at !== null
  && (await count(`digigate.alerts where event_id = '${u(7303)}'`)) === 0);
await onDevice(DEVICE, [{ id: u(7304), type: 'vehicle_entry', occurredAt: minutesAgo(1), gateUserId: GUARD, payload: {
  visit_id: u(7305), outcome: 'clear', hits: [], driver: null, typed_plate: '', occupants: 1, visit_type: 'emergency',
  vehicle: { vin: null, plate: '', disc_number: null, manual: true }, emergency: { kind: 'other', label: 'Other', note: 'Gas leak' } } }]);
check('an emergency in the guard\'s own words is named by them', (await one(`select person_name from digigate.visit_details where visit_id = '${u(7305)}'`))?.person_name === 'Emergency: Gas leak');
check('the checks list names an emergency by its kind', (await as('authenticated', ADMIN_A, 'aal2', `select person_name from digigate.check_records where id = '${u(7302)}'`)).rows[0]?.person_name === 'Ambulance (EMS)');
await onDevice(DEVICE, [{ id: u(7306), type: 'pedestrian_entry', occurredAt: minutesAgo(1), gateUserId: GUARD, payload: { visit_id: u(7307), outcome: 'clear', hits: [], person: { person_key: 'key-officer', document: 'smart-id', names: 'THABO', surname: 'MOKOENA', manual: false }, visit_type: 'emergency', emergency: { kind: 'police', label: 'Police', note: null } } }]);
check('an emergency on foot, ID scanned, still tells the control room', (await one(`select rule_code from digigate.alerts where event_id = '${u(7306)}'`))?.rule_code === 'EMERGENCY_ENTRY'
  && (await one(`select person_name from digigate.visit_details where visit_id = '${u(7307)}'`))?.person_name === 'THABO MOKOENA');
check('invites are in the audit log', (await count(`digigate.audit_log where action in ('invite.created', 'invite.cancelled')`)) >= 4);
check('a mobile number is kept in +27 form', await db.query(`update digigate.profiles set phone = '0821234567' where id = '${HOST_A}'`).then(() => false, () => true));
check('and belongs to one login only', await db.query(`update digigate.profiles set phone = '+27821234567' where id = '${HOST_B}'`).then(() => false, () => true));

// A client viewer, and a client changing security company.
const VIEWER = u(17);
await db.exec(`
  insert into auth.users (id) values ('${VIEWER}');
  insert into digigate.profiles (id, client_id, full_name, login, roles) values ('${VIEWER}','${CLIENT_A}','Hospital viewer','viewer','{client_viewer}');
`);
check('an admin sees their own client\'s view-only login', (await as('authenticated', ADMIN_A, 'aal2', `select id from digigate.profiles where id = '${VIEWER}'`)).rows.length === 1);
check('another company\'s admin does not', (await as('authenticated', ADMIN_B, 'aal2', `select id from digigate.profiles where id = '${VIEWER}'`)).rows.length === 0);
check('login names are unique', await db.exec(`insert into digigate.profiles (id, org_id, full_name, login, roles) values ('${NOBODY}','${ORG_A}','Copy','room','{manager}')`).then(() => false, () => true));
const seen = async (profile) => (await visits(profile, 'aal2')).rows.map((row) => row.id);
const OLD_ROOM_VISITS = (await seen(ROOM_A)).length;
check('client viewer sees the client\'s visits', (await seen(VIEWER)).length === OLD_ROOM_VISITS && OLD_ROOM_VISITS > 0);
check('client viewer needs MFA too', (await visits(VIEWER, 'aal1')).rows.length === 0);
check('client viewer sees their client only', (await as('authenticated', VIEWER, 'aal2', 'select id from digigate.clients')).rows.length === 1);
check('client viewer sees no guard list', (await as('authenticated', VIEWER, 'aal2', 'select id from digigate.gate_users')).rows.length === 0);
const viewerGate = (await as('authenticated', VIEWER, 'aal2', 'select * from digigate.gate_board($1)', [SITE_A])).rows.find((row) => row.post === 'back-gate');
check('client viewer sees a gate is staffed, not by whom', viewerGate?.on_duty_since !== null && viewerGate?.guard === null);
check('client viewer reads the checks at their site', (await as('authenticated', VIEWER, 'aal2', 'select id from digigate.check_records')).rows.length > 0);
const viewerDevices = (await as('authenticated', VIEWER, 'aal2', `select * from digigate.device_board('', '', 25, 0)`)).rows;
check('client viewer sees the devices at their site, with no guard names', viewerDevices.length > 0 && viewerDevices.every((row) => row.guard === null));
check('client viewer never gets a handheld position', viewerDevices.every((row) => row.health === null || row.health.latitude === undefined));
const viewerGateShift = (await as('authenticated', VIEWER, 'aal2', 'select * from digigate.gate_board($1)', [SITE_A])).rows;
check('client viewer gets no selfie of a guard', viewerGateShift.every((row) => row.shift_id === null && row.selfie === null && row.has_selfie === false));
const viewerResolves = await as('authenticated', VIEWER, 'aal2', `update digigate.alerts set status = 'open' returning id`);
check('client viewer cannot change alerts', viewerResolves.rows.length === 0);
check('client viewer cannot add a post', (await as('authenticated', VIEWER, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','v','V','{vehicle}')`)).error);

// The Devices page: a handheld's full details are a super user's; its company sees battery, network and location only.
await health({ battery: 70, charging: false, network: 'cellular', cellGeneration: '4g', cellBars: 3, latitude: -29.6, longitude: 30.4, fixAt: 1, managed: true, policyProblems: [], simState: 'ready', simOperator: 'Vodacom', dataEnabled: true });
const periodStart = async (day, today) => (await one(`select to_char(digigate.data_period_start(${day}::smallint, '${today}'::date), 'YYYY-MM-DD') as d`)).d;
check('a bundle with no renewal day runs from the 1st', (await periodStart('null', '2026-11-11')) === '2026-11-01');
check('one renewing on the 15th started last month before the 15th', (await periodStart(15, '2026-11-11')) === '2026-10-15' && (await periodStart(15, '2026-11-15')) === '2026-11-15');
check('a renewal day past a short month falls on its last day', (await periodStart(31, '2026-03-01')) === '2026-02-28' && (await periodStart(31, '2026-02-28')) === '2026-02-28' && (await periodStart(31, '2026-11-11')) === '2026-10-31');
check('a company admin cannot set a SIM or bundle, by any route', (await as('authenticated', ADMIN_A, 'aal2', `update digigate.devices set data_bundle_mb = 1 where id = '${DEVICE}' returning id`)).error
  && (await as('authenticated', ADMIN_A, 'aal2', `select digigate.set_device_plan('${DEVICE}', '+27821112222', 2048, 1::smallint)`)).error);
check('nor can a super user without MFA', (await as('authenticated', SUPER, 'aal1', `select digigate.set_device_plan('${DEVICE}', '+27821112222', 2048, 1::smallint)`)).error);
check('a super user sets the SIM number and bundle', !(await as('authenticated', SUPER, 'aal2', `select digigate.set_device_plan('${DEVICE}', '+27821112222', 2048, 1::smallint)`)).error);
check('setting the plan is in the audit log', (await count(`digigate.audit_log where action = 'device.plan_set' and device_id = '${DEVICE}' and detail like '2048 MB bundle%'`)) === 1);
const superBoardRow = (await as('authenticated', SUPER, 'aal2', `select * from digigate.device_board('', '', 100, 0)`)).rows.find((row) => row.id === DEVICE);
check('a super user sees data used against the bundle, and the SIM', superBoardRow?.data_bundle_mb === 2048 && Number(superBoardRow.data_used_bytes) >= 52_000_000 && superBoardRow.health?.simState === 'ready');
const adminBoardRow = (await as('authenticated', ADMIN_A, 'aal2', `select * from digigate.device_board('', '', 25, 0)`)).rows.find((row) => row.id === DEVICE);
check('a company admin sees battery, network and location, and nothing else', adminBoardRow !== undefined && adminBoardRow.data_bundle_mb === null && adminBoardRow.data_used_bytes === null
  && adminBoardRow.health?.simState === undefined && adminBoardRow.health?.managed === undefined && adminBoardRow.health?.policyProblems === undefined && 'battery' in (adminBoardRow.health ?? {}));
const roomBoardRow = (await as('authenticated', ROOM_A, 'aal2', `select * from digigate.device_board('', '', 25, 0)`)).rows.find((row) => row.id === DEVICE);
check('so does the control room', roomBoardRow !== undefined && roomBoardRow.data_used_bytes === null && roomBoardRow.health?.simState === undefined);
const superPage = (await as('authenticated', SUPER, 'aal2', 'select * from digigate.device_detail($1)', [DEVICE])).rows[0];
check('a super user\'s device page has the SIM, bundle and the right to change them', superPage?.sim_number === '+27821112222' && superPage.data_bundle_mb === 2048 && superPage.can_manage === true);
const adminPage = (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.device_detail($1)', [DEVICE])).rows[0];
check('a company admin\'s has neither, nor the right', adminPage?.sim_number === null && adminPage.data_bundle_mb === null && adminPage.can_manage === false);
check('another company sees no such device', (await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.device_detail($1)', [DEVICE])).rows.length === 0);
const dataByDay = (await as('authenticated', SUPER, 'aal2', 'select * from digigate.device_data($1, 30)', [DEVICE])).rows;
check('a super user has its data by day, oldest first', dataByDay.length === 2 && dataByDay[0].day < dataByDay[1].day);
check('nobody else does, not even its company', (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.device_data($1, 30)', [DEVICE])).rows.length === 0
  && (await as('authenticated', VIEWER, 'aal2', 'select * from digigate.device_data($1, 30)', [DEVICE])).rows.length === 0);
const deviceStory = (await as('authenticated', SUPER, 'aal2', 'select * from digigate.device_story($1, 50)', [DEVICE])).rows;
check('a super user reads what happened to it, with who released it', deviceStory.length === 6 && deviceStory.some((row) => row.kind === 'released' && row.actor !== null)
  && deviceStory.some((row) => row.kind === 'switched_off' && row.battery === 4) && deviceStory.some((row) => row.kind === 'app_closed' && row.reason === 'by_user'));
check('its company reads none of it', (await as('authenticated', ADMIN_A, 'aal2', 'select * from digigate.device_story($1, 50)', [DEVICE])).rows.length === 0);

// Release is a super user's alone, asked for from the dashboard and done by the handheld, which clears the request.
check('a company admin cannot ask for a release', (await as('authenticated', ADMIN_A, 'aal2', `select digigate.request_device_release('${DEVICE}')`)).error);
check('a super user can', !(await as('authenticated', SUPER, 'aal2', `select digigate.request_device_release('${DEVICE}')`)).error
  && (await one(`select release_requested_at from digigate.devices where id = '${DEVICE}'`)).release_requested_at !== null
  && (await count(`digigate.audit_log where action = 'device.release_requested' and device_id = '${DEVICE}'`)) === 1);
await onDevice(DEVICE, [{ id: u(7401), type: 'handheld_released', occurredAt: minutesAgo(1), gateUserId: null, payload: { released: true, problems: [], by: 'super_user' } }]);
check('the handheld\'s own release clears the request', (await one(`select release_requested_at from digigate.devices where id = '${DEVICE}'`)).release_requested_at === null);

// A forgotten PIN: a new one from the company's admin, manager or control room, or a super user. Only the PIN changes.
const NEW_PIN = JSON.stringify({ algorithm: 'pbkdf2-sha256', iterations: 20000, salt: 'c2FsdC1mb3ItdGVzdA==', hash: 'bmV3LXBpbi1oYXNo' });
const resetPin = (profile, aal, pin = NEW_PIN) => as('authenticated', profile, aal, `select digigate.reset_gate_user_pin('${GUARD}', $1::jsonb)`, [pin]);
const guardBefore = await one(`select first_name, last_name, role, site_ids, is_active from digigate.gate_users where id = '${GUARD}'`);
check('another company cannot reset a guard\'s PIN', (await resetPin(ADMIN_B, 'aal2')).error);
check('nor can the control room without MFA', (await resetPin(ROOM_A, 'aal1')).error);
check('a record that is not a PIN hash is refused', (await resetPin(ADMIN_A, 'aal2', JSON.stringify({ pin: '123456' }))).error
  && (await resetPin(ADMIN_A, 'aal2', JSON.stringify({ algorithm: 'plain', iterations: 1, salt: 'x', hash: '123456' }))).error);
check('the company\'s control room can, at night when it happens', !(await resetPin(ROOM_A, 'aal2')).error
  && (await one(`select pin ->> 'hash' as hash from digigate.gate_users where id = '${GUARD}'`)).hash === 'bmV3LXBpbi1oYXNo');
check('and nothing else about the guard changes', JSON.stringify(await one(`select first_name, last_name, role, site_ids, is_active from digigate.gate_users where id = '${GUARD}'`)) === JSON.stringify(guardBefore));
check('it is in the audit log as a PIN reset, by them', (await count(`digigate.audit_log where action = 'gate_user.pin_reset' and actor_id = '${ROOM_A}' and detail is null`)) === 1);
const guardNumber = (await one(`select employee_number from digigate.gate_users where id = '${GUARD}'`)).employee_number;
const found = (await as('authenticated', ROOM_A, 'aal2', 'select * from digigate.find_gate_staff($1)', [guardNumber])).rows;
check('the control room finds the guard by employee number, with nothing private', found.some((row) => row.id === GUARD)
  && found.every((row) => Object.keys(row).sort().join() === 'company,employee_number,first_name,id,last_name,role'));
check('and by name', (await as('authenticated', ROOM_A, 'aal2', 'select id from digigate.find_gate_staff($1)', [guardBefore.first_name])).rows.some((row) => row.id === GUARD));
check('another company finds nobody of theirs', !(await as('authenticated', ADMIN_B, 'aal2', 'select id from digigate.find_gate_staff($1)', [guardNumber])).rows.some((row) => row.id === GUARD));
check('a search of one character finds nobody', (await as('authenticated', ROOM_A, 'aal2', 'select id from digigate.find_gate_staff($1)', [guardNumber.slice(0, 1)])).rows.length === 0);
check('the handheld gets the new PIN at its next sync',JSON.stringify((await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s).includes('bmV3LXBpbi1oYXNo'));

// Remote lock, restart and update: a super user's alone, carried out once by the handheld, which closes them.
const command = (profile, kind, payload = '{}') => as('authenticated', profile, 'aal2', 'select digigate.request_device_command($1, $2, $3::jsonb) as id', [DEVICE, kind, payload]);
check('a company admin cannot restart a handheld', (await command(ADMIN_A, 'restart')).error);
check('nor can its control room lock one', (await command(ROOM_A, 'lock')).error);
const restartId = (await command(SUPER, 'restart')).rows?.[0]?.id;
check('a super user can, and it waits for the handheld', typeof restartId === 'string'
  && (await count(`digigate.device_commands where device_id = '${DEVICE}' and kind = 'restart' and done_at is null`)) === 1);
check('asking again renews it rather than queueing a second', (await command(SUPER, 'restart')).rows?.[0]?.id === restartId
  && (await count(`digigate.device_commands where device_id = '${DEVICE}' and kind = 'restart'`)) === 1);
check('an update must name an https download and a version', (await command(SUPER, 'update_app', JSON.stringify({ url: 'http://example.com/a.apk', version_code: 5 }))).error
  && (await command(SUPER, 'update_app', JSON.stringify({ url: 'https://example.com/a.apk' }))).error
  && (await command(SUPER, 'update_app', JSON.stringify({ url: 'https://example.com/a.apk', version_code: 5, sha256: 'nothex' }))).error);
check('and keeps only what the handheld needs', !(await command(SUPER, 'update_app', JSON.stringify({ url: 'https://example.com/a.apk', version_code: 5, sha256: 'AB'.repeat(32), extra: 'x' }))).error
  && JSON.stringify((await one(`select payload from digigate.device_commands where device_id = '${DEVICE}' and kind = 'update_app'`)).payload) === JSON.stringify({ url: 'https://example.com/a.apk', sha256: 'ab'.repeat(32), version_code: 5 }));
check('each request is in the audit log', (await count(`digigate.audit_log where action in ('device.restart_requested', 'device.update_app_requested') and device_id = '${DEVICE}'`)) === 3);
check('only super users can read them', (await as('authenticated', ADMIN_A, 'aal2', 'select id from digigate.device_commands')).rows.length === 0
  && (await as('authenticated', SUPER, 'aal2', 'select id from digigate.device_commands')).rows.length === 2);
await onDevice(DEVICE, [{ id: u(7402), type: 'device_command', occurredAt: minutesAgo(1), gateUserId: null, payload: { command_id: restartId, kind: 'restart', result: 'restarting' } }]);
check('the handheld\'s report closes it with how it went', (await one(`select outcome from digigate.device_commands where id = '${restartId}'`)).outcome === 'restarting'
  && (await count(`digigate.device_commands where device_id = '${DEVICE}' and done_at is null`)) === 1);
await onDevice(DEVICE, [{ id: u(7403), type: 'device_command', occurredAt: minutesAgo(1), gateUserId: null, payload: { command_id: restartId, kind: 'restart', result: 'on-a-call' } }]);
check('and a later word from it is the one kept', (await one(`select outcome from digigate.device_commands where id = '${restartId}'`)).outcome === 'on-a-call');
check('a command\'s report never holds up the rest of the upload', !(await onDevice(DEVICE, [
  { id: u(7404), type: 'device_command', occurredAt: minutesAgo(1), gateUserId: null, payload: { command_id: restartId, kind: 'restart', result: 'locked-app-only' } },
  shiftEvent(7405, 1, { shift_id: u(7406) }),
])).error && (await count(`digigate.events where id in ('${u(7404)}', '${u(7405)}')`)) === 2);

// A company that doesn't pay: suspended by a super user, its logins see nothing, and they're told why.
const roomSitesBefore = (await as('authenticated', ROOM_A, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length;
check('a company admin cannot suspend anyone, even themselves', (await as('authenticated', ADMIN_A, 'aal2', `select digigate.set_company_suspended('${ORG_A}', true, 'Unpaid')`)).error);
check('a super user needs a reason', (await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_A}', true, '  ')`)).error);
check('and suspends with one', !(await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_A}', true, 'Invoice 112 unpaid')`)).error);
check('its control room then sees no sites', roomSitesBefore > 0 && (await as('authenticated', ROOM_A, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length === 0);
check('nor its admin, who can change nothing', (await as('authenticated', ADMIN_A, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length === 0
  && (await as('authenticated', ADMIN_A, 'aal2', `select digigate.can_manage_org('${ORG_A}') as ok`)).rows[0].ok === false);
check('nor its client\'s login', (await as('authenticated', VIEWER, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length === 0);
const status = (await as('authenticated', ROOM_A, 'aal2', 'select * from digigate.my_company_status()')).rows[0];
check('they are told it is suspended, and why', status?.suspended === true && status.reason === 'Invoice 112 unpaid');
check('another company carries on', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length > 0);
check('a super user still sees everything', (await as('authenticated', SUPER, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length > 0);
check('reinstating brings it back, and both are in the audit log', !(await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_A}', false, null)`)).error
  && (await as('authenticated', ROOM_A, 'aal2', 'select digigate.visible_site_ids() as ids')).rows[0].ids.length === roomSitesBefore
  && (await count(`digigate.audit_log where action in ('company.suspended', 'company.reinstated') and org_id = '${ORG_A}'`)) === 2);

check('an admin cannot move a client', (await as('authenticated', ADMIN_A, 'aal2', `select digigate.transfer_client('${CLIENT_A}','${ORG_B}')`)).error);
check('nor can a super user without MFA', (await as('authenticated', SUPER, 'aal1', `select digigate.transfer_client('${CLIENT_A}','${ORG_B}')`)).error);
await db.exec(`insert into digigate.pairing_codes (org_id, site_id, device_name, code_hash, expires_at, created_by) values ('${ORG_A}','${SITE_A}','Spare','spare',now() + interval '10 minutes','${ADMIN_A}')`);
const moved = await as('authenticated', SUPER, 'aal2', `select digigate.transfer_client('${CLIENT_A}','${ORG_B}')`);
check('a super user can move a client', !moved.error);
check('its sites move with it', (await one(`select org_id from digigate.sites where id = '${SITE_A}'`)).org_id === ORG_B);
check('its posts move with it', (await count(`digigate.posts where site_id = '${SITE_A}' and org_id = '${ORG_B}'`)) === 2);
check('the old company\'s handhelds stop', (await count(`digigate.devices where site_id = '${SITE_A}' and revoked_at is null`)) === 0);
check('unused pairing codes go', (await count(`digigate.pairing_codes where code_hash = 'spare'`)) === 0);
check('the old engagement ends', (await count(`digigate.engagements where client_id = '${CLIENT_A}' and org_id = '${ORG_A}' and ended_at is not null`)) === 1);
check('the new one starts', (await count(`digigate.engagements where client_id = '${CLIENT_A}' and org_id = '${ORG_B}' and ended_at is null`)) === 1);
check('the old company loses all access', (await seen(ADMIN_A)).length === 0);
check('its control room too, even with the site still on their list', (await seen(ROOM_A)).length === 0);
check('the new company sees none of the old history', (await seen(ADMIN_B)).length === 0);
check('nor the old events', (await as('authenticated', ADMIN_B, 'aal2', `select id from digigate.events where site_id = '${SITE_A}'`)).rows.length === 0);
check('the client keeps every record', (await seen(VIEWER)).length === OLD_ROOM_VISITS);
check('and so does the super user', (await seen(SUPER)).length === OLD_ROOM_VISITS);

await db.exec(`
  insert into digigate.devices (id, org_id, site_id, name, token_hash) values ('${u(70)}','${ORG_B}','${SITE_A}','New company DT50','t9');
  insert into digigate.gate_users (id, org_id, site_ids, employee_number, first_name, last_name, role, pin) values ('${u(71)}','${ORG_B}','{${SITE_A}}','5001','New','Guard','guard',${PIN});
`);
const newVisit = u(72);
await service('select digigate.ingest_events($1, $2::jsonb)', [u(70), JSON.stringify([{ id: u(73), type: 'pedestrian_entry', occurredAt: Date.now(), gateUserId: u(71), payload: { visit_id: newVisit, outcome: 'clear', hits: [], person: { person_key: 'key-n', names: 'NEW', surname: 'VISITOR' }, visit_type: 'visitor' } }])]);
check('the new company sees what it recorded', (await seen(ADMIN_B)).join() === newVisit);
check('the old company still sees nothing', (await seen(ADMIN_A)).length === 0);
check('the client sees old and new together', (await seen(VIEWER)).length === OLD_ROOM_VISITS + 1);
const newList = (await service('select digigate.device_snapshot($1) as s', [u(70)])).rows[0].s.users.map((user) => user.employeeNumber);
check('the new company\'s handheld gets only its own guards', newList.join() === '5001');

// Revoked devices and access to the device functions.
await db.exec(`update digigate.devices set revoked_at = now()`);
check('a revoked token finds nothing', (await service('select digigate.device_for_token($1) as id', ['t1'])).rows[0].id === null);
check('a revoked device cannot upload', (await ingest([event('lock', {})])).error);
check('a revoked token is reported as revoked', (await service('select digigate.token_is_revoked($1) as r', ['t1'])).rows[0].r === true);
check('a token nobody knows is not', (await service('select digigate.token_is_revoked($1) as r', ['zz'])).rows[0].r === false);
check('dashboard users cannot ask', (await as('authenticated', ADMIN_A, 'aal2', `select digigate.token_is_revoked('t1')`)).error);
check('a revoked device gets no guard list', (await service('select digigate.device_snapshot($1) as s', [DEVICE])).rows[0].s.users.length === 0);
for (const fn of ['ingest_events(uuid, jsonb)', 'device_snapshot(uuid)', 'claim_pairing_code(text, text, text)', 'device_for_token(text)']) {
  const access = await one(`select has_function_privilege('authenticated', 'digigate.${fn}', 'execute') a, has_function_privilege('anon', 'digigate.${fn}', 'execute') b`);
  check(`dashboard users and anon cannot call ${fn}`, !access.a && !access.b);
}

// Usernames belong to a company: name@code.
const codes = (await service('select id, code from digigate.organisations')).rows;
check('every company has a code', codes.length > 0 && codes.every((row) => /^[a-z0-9]{2,16}$/.test(row.code)));
check('no two companies share one', new Set(codes.map((row) => row.code)).size === codes.length);
await db.exec(`insert into digigate.organisations (name, slug) values ('Fire Security', 'fire-security-test'), ('Fire Watch', 'fire-watch-test')`);
const fireCodes = (await service(`select name, code from digigate.organisations where slug in ('fire-security-test', 'fire-watch-test') order by name`)).rows;
check('a new company gets its code from its name', fireCodes[0]?.code === 'fire');
check('and the next one with the same first word gets a number', fireCodes[1]?.code === 'fire2');
const ORG_C_CODE = (await one('select code from digigate.organisations where id = $1', [ORG_C])).code;
const MOVER = u(950), REAL = u(951), VIEWING = u(952);
await db.exec(`
  insert into auth.users (id, email) values ('${MOVER}', 'thandi@digigate.local'), ('${REAL}', 'thandi@example.co.za'), ('${VIEWING}', 'nomsa@digigate.local');
  insert into digigate.profiles (id, org_id, client_id, full_name, login, roles) values
    ('${MOVER}', '${ORG_C}', null, 'Thandi Zulu', 'thandi', '{control_room}'),
    ('${REAL}', '${ORG_C}', null, 'Thandi Real', 'thandi@example.co.za', '{manager}'),
    ('${VIEWING}', null, '${u(901)}', 'Nomsa Viewer', 'nomsa', '{client_viewer}');
  update auth.users set email = 'super@digigate.local' where id = '${SUPER}';
`);
check('dashboard users cannot move logins', !(await one(`select has_function_privilege('authenticated', 'digigate.scope_logins()', 'execute') a`)).a);
const loginsMoved = (await one('select digigate.scope_logins() as n')).n;
const moverNow = await one(`select p.login, u.email from digigate.profiles p join auth.users u on u.id = p.id where p.id = '${MOVER}'`);
check('a company login moves to name@code', moverNow.login === `thandi@${ORG_C_CODE}`);
check('and its account with it, so the same password still signs in', moverNow.email === `thandi@${ORG_C_CODE}.digigate.local`);
check('a client\x27s view-only login takes its company\x27s code', (await one(`select login from digigate.profiles where id = '${VIEWING}'`)).login === `nomsa@${ORG_C_CODE}`);
check('a real email address is left as it is', (await one(`select p.login, u.email from digigate.profiles p join auth.users u on u.id = p.id where p.id = '${REAL}'`)).email === 'thandi@example.co.za');
check('a super user keeps a plain username', (await one(`select login from digigate.profiles where id = '${SUPER}'`)).login === 'super' && (await one(`select email from auth.users where id = '${SUPER}'`)).email === 'super@digigate.local');
check('moving again changes nothing', loginsMoved > 0 && (await one('select digigate.scope_logins() as n')).n === 0);
check('two companies can each have the same name in front', !(await db.query(`insert into digigate.profiles (id, org_id, full_name, login, roles) values ('${NOBODY}', '${ORG_B}', 'Thandi B', 'thandi@company2', '{manager}')`).then(() => null, (error) => error)));

// DigiGate technicians: the same global reads as a super user, with commercial controls and release still closed.
const TECH = u(960), TECH_DEVICE = u(961);
await db.exec(`
  insert into auth.users (id, email) values ('${TECH}', 'technician@example.test');
  insert into digigate.profiles (id, full_name, login, roles) values ('${TECH}', 'Test Technician', 'technician@example.test', '{technician}');
  insert into digigate.devices (id, org_id, site_id, name, token_hash) values ('${TECH_DEVICE}', '${ORG_B}', '${SITE_B}', 'Test handheld', 'tech-token');
  insert into digigate.device_data_days (device_id, org_id, site_id, day, device_bytes, app_bytes)
    values ('${TECH_DEVICE}', '${ORG_B}', '${SITE_B}', current_date, 2048, 1024);
`);
const technicianReads = [
  ['companies', 'select id from digigate.organisations order by id'],
  ['clients', 'select id from digigate.clients order by id'],
  ['sites', 'select id from digigate.sites order by id'],
  ['engagements', 'select id from digigate.engagements order by id'],
  ['profiles', 'select id from digigate.profiles order by id'],
  ['gate staff', 'select id from digigate.gate_users order by id'],
  ['checks', 'select id from digigate.all_check_records order by id limit 25'],
  ['visits', 'select id from digigate.visit_records order by id limit 25'],
  ['alerts', 'select id from digigate.alerts order by id'],
  ['audit log', 'select id from digigate.audit_log order by id limit 25'],
  ['company board', "select * from digigate.company_board('',100,0)"],
  ['people board', "select * from digigate.people_board('','','',false,100,0)"],
  ['people counts', "select * from digigate.people_counts('') order by role,is_active"],
  ['gate staff board', "select * from digigate.gate_staff_board('','','',false,100,0)"],
  ['gate staff counts', "select * from digigate.gate_staff_counts('') order by role,is_active"],
  ['report board', "select * from digigate.report_board(current_date,'',100,0)"],
  ['report totals', 'select * from digigate.report_day_totals(current_date)'],
  ['report summary', `select digigate.report_summary('${ORG_B}','daily',current_date)`],
  ['device board', "select * from digigate.device_board('','',100,0)"],
  ['device details', `select * from digigate.device_detail('${TECH_DEVICE}')`],
  ['device data', `select * from digigate.device_data('${TECH_DEVICE}',35)`],
  ['device story', `select * from digigate.device_story('${TECH_DEVICE}',40)`],
];
for (const [name, sql] of technicianReads) {
  const expected = await as('authenticated', SUPER, 'aal2', sql);
  const actual = await as('authenticated', TECH, 'aal2', sql);
  check(`technician sees the same ${name} as a super user`, !actual.error && !expected.error && JSON.stringify(actual.rows) === JSON.stringify(expected.rows));
}
check('technician is staff but never a super user', (await as('authenticated', TECH, 'aal2', 'select digigate.is_digigate_staff() staff, digigate.is_super_user() super')).rows[0]?.staff === true
  && (await as('authenticated', TECH, 'aal2', 'select digigate.is_super_user() super')).rows[0]?.super === false);
check('technician cannot read a guard PIN', (await as('authenticated', TECH, 'aal2', 'select pin from digigate.gate_users')).error);
check('technician cannot read a device token', (await as('authenticated', TECH, 'aal2', 'select token_hash from digigate.devices')).error);
check('technician can manage normal gate configuration', !(await as('authenticated', TECH, 'aal2', `update digigate.posts set radius_m = 75 where site_id = '${SITE_B}'`)).error);
check('technician can set a SIM and bundle', !(await as('authenticated', TECH, 'aal2', `select digigate.set_device_plan('${TECH_DEVICE}',null,1024,1::smallint)`)).error);
for (const kind of ['lock', 'restart', 'update_app']) {
  const payload = kind === 'update_app' ? { url: 'https://example.test/digigate.apk', version_code: 6 } : {};
  const result = await as('authenticated', TECH, 'aal2', 'select digigate.request_device_command($1,$2,$3) id', [TECH_DEVICE, kind, JSON.stringify(payload)]);
  check(`technician can remotely request ${kind}`, Boolean(result.rows[0]?.id) && !result.error);
}
check('technician sees remote command history', (await as('authenticated', TECH, 'aal2', `select id from digigate.device_commands where device_id = '${TECH_DEVICE}'`)).rows.length === 3);
check('technician remote requests are audited', (await count(`digigate.audit_log where actor_id = '${TECH}' and action in ('device.lock_requested','device.restart_requested','device.update_app_requested')`)) === 3);
for (const [name, sql, argumentsForCheck = []] of [
  ['add a company', "insert into digigate.organisations (name,slug) values ('Forbidden','forbidden-tech')"],
  ['add a client directly', `insert into digigate.clients (org_id,name) values ('${ORG_B}','Forbidden')`],
  ['add a site directly', `insert into digigate.sites (org_id,client_id,name,site_type) values ('${ORG_A}','${CLIENT_SPARE}','Forbidden','hospital')`],
  ['use the site wizard', 'select digigate.create_site($1,$2::jsonb,$3::jsonb)', [ORG_B, JSON.stringify({ ...wizardSite, code: 'TCH' }), JSON.stringify(wizardPoints)]],
  ['suspend a company', `select digigate.set_company_suspended('${ORG_B}',true,'Forbidden')`],
  ['reinstate a company', `select digigate.set_company_suspended('${ORG_B}',false,'')`],
  ['release a handheld', `select digigate.request_device_release('${TECH_DEVICE}')`],
  ['write release fields', `update digigate.devices set release_requested_at = now() where id = '${TECH_DEVICE}'`],
  ['write suspension fields', `update digigate.organisations set suspended_at = now() where id = '${ORG_B}'`],
  ['move a client', `select digigate.transfer_client('${CLIENT_B}','${ORG_A}')`],
  ['grant themselves super-user access', `update digigate.profiles set roles = '{super_user}' where id = '${TECH}'`],
]) check(`technician cannot ${name}`, (await as('authenticated', TECH, 'aal2', sql, argumentsForCheck)).error);
check('technician never leaves a release waiting', (await one(`select release_requested_at from digigate.devices where id = '${TECH_DEVICE}'`)).release_requested_at === null);
for (const [name, sql] of technicianReads.filter(([name]) => ['companies','sites','people board','gate staff board','device board'].includes(name))) {
  const result = await as('authenticated', TECH, 'aal1', sql);
  check(`technician without MFA cannot read ${name}`, !result.error && result.rows.length === 0);
}
check('technician without MFA cannot send remote commands', (await as('authenticated', TECH, 'aal1', `select digigate.request_device_command('${TECH_DEVICE}','lock')`)).error);
await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_B}',true,'Test suspension')`);
check('technician still sees suspended companies and sites', (await as('authenticated', TECH, 'aal2', `select id from digigate.sites where id = '${SITE_B}'`)).rows.length === 1);
check('technician still sees suspended handheld diagnostics', (await as('authenticated', TECH, 'aal2', `select * from digigate.device_detail('${TECH_DEVICE}')`)).rows.length === 1);
await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_B}',false,'')`);
await db.exec(`update digigate.profiles set is_active = false where id = '${TECH}'`);
check('inactive technician sees no companies', (await as('authenticated', TECH, 'aal2', 'select id from digigate.organisations')).rows.length === 0);
check('inactive technician cannot send remote commands', (await as('authenticated', TECH, 'aal2', `select digigate.request_device_command('${TECH_DEVICE}','lock')`)).error);
await db.exec(`update digigate.profiles set is_active = true, org_id = '${ORG_A}' where id = '${TECH}'`);
check('a technician with an assigned org still reads across companies', (await as('authenticated', TECH, 'aal2', 'select digigate.viewer_org() org')).rows[0]?.org === null);

// Edge Functions also use the role boundaries; their service credential must never grant technicians a peer's account.
const techCaller = { org_id: null, roles: ['technician'] }, superCaller = { org_id: null, roles: ['super_user'] };
const adminCaller = { org_id: ORG_A, roles: ['admin'] };
check('function caller recognises staff without making technician super', isStaff(techCaller) && !isSuper(techCaller));
check('technician can administer company accounts and guard records', canManage(techCaller, ORG_A) && canManage(techCaller, ORG_B));
check('company admin cannot appoint a technician', !canCreateRole(adminCaller, 'technician'));
check('technician cannot appoint another technician', !canCreateRole(techCaller, 'technician'));
check('super user can appoint a technician', canCreateRole(superCaller, 'technician'));
check('nobody can create a super user through the people function', !canCreateRole(superCaller, 'super_user'));
check('technician cannot reset or deactivate a super user', !canManagePerson(techCaller, superCaller));
check('technician cannot reset or deactivate a peer', !canManagePerson(techCaller, techCaller));
check('company admin cannot reset or deactivate a technician even if assigned to their company', !canManagePerson(adminCaller, { ...techCaller, org_id: ORG_A }));
check('super user can reset or deactivate a technician', canManagePerson(superCaller, techCaller));

// New-site licensing: company-scoped requests, an idempotent send, and a super-user-only, atomic fulfilment.
const requestLicence = (profile, org = ORG_B, name = 'Licensed Estate', aal = 'aal2') =>
  as('authenticated', profile, aal, 'select digigate.request_site_licence($1,$2,$3,$4) id', [org, name, 'estate', 'Go live next month']);
const requested = await requestLicence(ADMIN_B);
const licenceId = requested.rows[0]?.id;
check('company admin can request a site licence', Boolean(licenceId) && !requested.error);
check('a repeated request returns the pending request', (await requestLicence(ADMIN_B, ORG_B, '  licensed estate  ')).rows[0]?.id === licenceId);
check('a repeated request has one queue row and one audit record', (await count(`digigate.site_licence_requests where id = '${licenceId}'`)) === 1
  && (await count(`digigate.audit_log where action = 'site_licence.requested' and target = '${licenceId}'`)) === 1);
for (const profile of [SUPER, TECH, ADMIN_B]) check(`licence queue visible to ${profile}`, (await as('authenticated', profile, 'aal2', `select id from digigate.site_licence_requests where id = '${licenceId}'`)).rows.length === 1);
check('other company cannot read the request', (await as('authenticated', ADMIN_A, 'aal2', 'select id from digigate.site_licence_requests')).rows.length === 0);
check('admin cannot request for another company', (await requestLicence(ADMIN_A)).error);
check('control room cannot request licences', (await requestLicence(ROOM_A, ORG_A)).error);
check('technician cannot submit a company licence request', (await requestLicence(TECH)).error);
check('admin needs MFA to request licences', (await requestLicence(ADMIN_B, ORG_B, 'No MFA', 'aal1')).error);
check('empty site name is refused', (await requestLicence(ADMIN_B, ORG_B, ' ')).error);
check('long site name is refused', (await requestLicence(ADMIN_B, ORG_B, 'x'.repeat(121))).error);
check('invalid site type is refused', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.request_site_licence($1,$2,$3,$4)', [ORG_B, 'Invalid', 'unknown', ''])).error);
check('long licence note is refused', (await as('authenticated', ADMIN_B, 'aal2', 'select digigate.request_site_licence($1,$2,$3,$4)', [ORG_B, 'Long note', 'estate', 'x'.repeat(501)])).error);
check('admin cannot forge a queue row', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.site_licence_requests (org_id,site_name,site_type,requested_by) values ('${ORG_B}','Forged','estate','${SUPER}')`)).error);
for (const profile of [ADMIN_B, TECH]) {
  check(`${profile} cannot fulfil a request`, (await as('authenticated', profile, 'aal2', 'select digigate.fulfil_site_licence($1,$2)', [licenceId, SITE_B])).error);
  check(`${profile} cannot decline a request`, (await as('authenticated', profile, 'aal2', 'select digigate.decline_site_licence($1)', [licenceId])).error);
}
const licensedDraft = { ...wizardSite, name: 'Licensed Estate', siteType: 'estate', code: 'LIC', licenceRequestId: licenceId };
check('a request cannot be fulfilled in another company', (await newSite(SUPER, licensedDraft, wizardPoints, ORG_A)).error);
check('a failed wizard leaves the request pending', (await newSite(SUPER, licensedDraft, [], ORG_B)).error && (await one('select status from digigate.site_licence_requests where id = $1', [licenceId])).status === 'pending');
const licensed = await newSite(SUPER, licensedDraft, wizardPoints, ORG_B);
check('super user creates the licensed site', Boolean(licensed.rows[0]?.id) && !licensed.error);
const licence = await one('select * from digigate.site_licence_requests where id = $1', [licenceId]);
check('creation fulfils the request with its site and operator', licence.status === 'fulfilled' && licence.site_id === licensed.rows[0]?.id && licence.resolved_by === SUPER && licence.resolved_at !== null);
check('fulfilment is audited without the free-text note', (await count(`digigate.audit_log where action = 'site_licence.fulfilled' and target = '${licenceId}' and detail is null`)) === 1);
check('a fulfilled request cannot create a second site', (await newSite(SUPER, { ...licensedDraft, code: 'LIC2' }, wizardPoints, ORG_B)).error);
const declinedId = (await requestLicence(ADMIN_B, ORG_B, 'Closed Estate')).rows[0]?.id;
check('super user can close a request without creating a site', !(await as('authenticated', SUPER, 'aal2', 'select digigate.decline_site_licence($1)', [declinedId])).error);
check('a closed request cannot create a site', (await newSite(SUPER, { ...licensedDraft, code: 'CLO', licenceRequestId: declinedId }, wizardPoints, ORG_B)).error);
check('the company can request again after closure', (await requestLicence(ADMIN_B, ORG_B, 'Closed Estate')).rows[0]?.id !== declinedId);
await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_B}',true,'Test suspension')`);
check('a suspended admin cannot request a licence', (await requestLicence(ADMIN_B, ORG_B, 'Suspended')).error);
await as('authenticated', SUPER, 'aal2', `select digigate.set_company_suspended('${ORG_B}',false,'')`);
await db.exec(`update digigate.profiles set is_active = false where id = '${ADMIN_B}'`);
check('inactive admin cannot request a licence', (await requestLicence(ADMIN_B, ORG_B, 'Inactive')).error);

const superOnlyFunctions = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'digigate' and p.prosrc like '%digigate.is_super_user()%' order by p.proname`)).rows.map((row) => row.proname);
check('every remaining super-user-only function is an audited commercial or release control', JSON.stringify(superOnlyFunctions) === JSON.stringify([
  'create_site', 'decline_site_licence', 'end_launch_grace', 'fulfil_site_licence', 'request_device_release', 'set_company_suspended',
  'start_launch_grace', 'transfer_client',
]));

// The MFA switch: off, a password alone is enough; on again, the code is needed.
await db.exec('update digigate.platform_settings set require_mfa = false');
check('with MFA switched off, a signed-in session passes without a code', (await as('authenticated', ADMIN_B, 'aal1', 'select digigate.mfa_passed() as ok')).rows[0]?.ok === true
  && (await as('authenticated', ADMIN_B, 'aal1', 'select digigate.mfa_required() as on')).rows[0]?.on === false);
await db.exec('update digigate.platform_settings set require_mfa = true');
check('switched back on, it needs the code again', (await as('authenticated', ADMIN_B, 'aal1', 'select digigate.mfa_passed() as ok')).rows[0]?.ok === false);
check('nobody can change the switch through the API', (await as('authenticated', SUPER, 'aal2', 'update digigate.platform_settings set require_mfa = false')).error
  || (await one('select require_mfa from digigate.platform_settings')).require_mfa === true);

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log('FAILED:', failure);
process.exitCode = failures.length ? 1 : 0;
