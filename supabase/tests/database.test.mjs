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
await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}', 'Audited Client')`);
const added = await auditFor(`action = 'client.added' and target = 'Audited Client'`);
check('a dashboard change is logged with who did it', added?.actor_id === ADMIN_A && added.category === 'setup' && added.org_id === ORG_A);
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
const viewerGate = (await as('authenticated', VIEWER, 'aal2', 'select * from digigate.gate_board($1)', [SITE_A])).rows.find((row) => row.post === 'back-gate');
check('client viewer sees a gate is staffed, not by whom', viewerGate?.on_duty_since !== null && viewerGate?.guard === null);
check('client viewer reads the checks at their site', (await as('authenticated', VIEWER, 'aal2', 'select id from digigate.check_records')).rows.length > 0);
const viewerDevices = (await as('authenticated', VIEWER, 'aal2', `select * from digigate.device_board('', '', 25, 0)`)).rows;
check('client viewer sees the devices at their site, with no guard names', viewerDevices.length > 0 && viewerDevices.every((row) => row.guard === null));
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
