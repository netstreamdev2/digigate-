// Runs every migration on a real Postgres engine (PGlite), then proves who can reach what and walks whole gate stories
// through digigate.ingest_events the way the Edge Functions do. Run from the repo root: pnpm test:db
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

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
const ORG_A = u(1), ORG_B = u(2), SITE_A = u(3), SITE_A2 = u(4), SITE_B = u(5), CLIENT_A = u(6), CLIENT_B = u(7);
const SUPER = u(10), ADMIN_A = u(11), ROOM_A = u(12), SUP_A2 = u(13), ADMIN_B = u(14), OFF = u(15), NOBODY = u(16);
const GUARD = u(20), SUPERVISOR = u(21), ELSEWHERE = u(22), GONE = u(23);
const PIN = `'{"algorithm":"pbkdf2-sha256","iterations":20000,"salt":"a","hash":"b"}'`;

await db.exec(`
  insert into auth.users (id) values ('${SUPER}'), ('${ADMIN_A}'), ('${ROOM_A}'), ('${SUP_A2}'), ('${ADMIN_B}'), ('${OFF}'), ('${NOBODY}');
  insert into digigate.organisations (id, name, slug) values ('${ORG_A}','A','a'), ('${ORG_B}','B','b');
  insert into digigate.clients (id, org_id, name) values ('${CLIENT_A}','${ORG_A}','Hospital A'), ('${CLIENT_B}','${ORG_B}','Estate B');
  insert into digigate.sites (id, org_id, client_id, name, site_type) values
    ('${SITE_A}','${ORG_A}','${CLIENT_A}','A1','hospital'), ('${SITE_A2}','${ORG_A}','${CLIENT_A}','A2','hospital'), ('${SITE_B}','${ORG_B}','${CLIENT_B}','B1','estate');
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
check('admin adds a client', !(await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Second client')`)).error);
check('a new client starts an engagement', (await count(`digigate.engagements e join digigate.clients c on c.id = e.client_id where c.name = 'Second client' and e.ended_at is null`)) === 1);
check('admin of another organisation cannot add one', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Sneaky')`)).error);
// The dashboard reads a new row straight back, which row security has to allow at the moment it's created.
check('admin adds a site and reads it back', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_A}','New','hospital') returning id`)).rows.length === 1);
check('super user adds a site and reads it back', (await as('authenticated', SUPER, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_A}','New by super','hospital') returning id`)).rows.length === 1);
check('admin adds a client and reads it back', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Read back') returning id`)).rows.length === 1);
check('super user adds a company and reads it back', (await as('authenticated', SUPER, 'aal2', `insert into digigate.organisations (name, slug) values ('Read back','read-back') returning id`)).rows.length === 1);
check('a site cannot go under another company\'s client', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_B}','Wrong','hospital')`)).error);
check('admin of another organisation cannot add a site', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_A}','New2','hospital')`)).error);
check('deactivated admin cannot', (await as('authenticated', OFF, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_A}','New3','hospital')`)).error);
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
const viewerResolves = await as('authenticated', VIEWER, 'aal2', `update digigate.alerts set status = 'open' returning id`);
check('client viewer cannot change alerts', viewerResolves.rows.length === 0);
check('client viewer cannot add a post', (await as('authenticated', VIEWER, 'aal2', `insert into digigate.posts (org_id, site_id, code, label, lanes) values ('${ORG_A}','${SITE_A}','v','V','{vehicle}')`)).error);

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

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log('FAILED:', failure);
process.exitCode = failures.length ? 1 : 0;
