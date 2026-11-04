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
check('admin adds a client', !(await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Second client')`)).error);
check('a new client starts an engagement', (await count(`digigate.engagements e join digigate.clients c on c.id = e.client_id where c.name = 'Second client' and e.ended_at is null`)) === 1);
check('admin of another organisation cannot add one', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Sneaky')`)).error);
// The dashboard reads a new row straight back, which row security has to allow at the moment it's created.
check('admin adds a site and reads it back', (await as('authenticated', ADMIN_A, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}','New') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'New', 'hospital' from c returning id`)).rows.length === 1);
check('super user adds a site and reads it back', (await as('authenticated', SUPER, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}','New by super') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'New by super', 'hospital' from c returning id`)).rows.length === 1);
check('admin adds a client and reads it back', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.clients (org_id, name) values ('${ORG_A}','Read back') returning id`)).rows.length === 1);
check('super user adds a company and reads it back', (await as('authenticated', SUPER, 'aal2', `insert into digigate.organisations (name, slug) values ('Read back','read-back') returning id`)).rows.length === 1);
check('a site cannot go under another company\'s client', (await as('authenticated', ADMIN_A, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_B}','Wrong','hospital')`)).error);
check('admin of another organisation cannot add a site', (await as('authenticated', ADMIN_B, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_SPARE}','New2','hospital')`)).error);
check('deactivated admin cannot', (await as('authenticated', OFF, 'aal2', `insert into digigate.sites (org_id, client_id, name, site_type) values ('${ORG_A}','${CLIENT_SPARE}','New3','hospital')`)).error);
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
await as('authenticated', ADMIN_A, 'aal2', `with c as (insert into digigate.clients (org_id, name) values ('${ORG_A}', 'Audited Site') returning id) insert into digigate.sites (org_id, client_id, name, site_type) select '${ORG_A}', id, 'Audited Site', 'hospital' from c`);
const added = await auditFor(`action = 'site.added' and target = 'Audited Site'`);
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
const created = await newSite(ADMIN_A, wizardSite, wizardPoints);
const createdId = created.rows[0]?.id;
check('an admin creates a site with its access points in one go', Boolean(createdId) && !created.error);
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
check('a site needs at least one access point', (await newSite(ADMIN_A, { ...wizardSite, code: 'NOP' }, [])).error);
check('an unknown kind of boom is refused', (await newSite(ADMIN_A, { ...wizardSite, code: 'BAD' }, [{ ...wizardPoints[0], booms: ['flying'] }])).error);
check('ANPR needs at least one camera', (await newSite(ADMIN_A, { ...wizardSite, code: 'ANP' }, [{ ...wizardPoints[0], cctvCameras: 0 }])).error);
check('a site code is used once in a company', (await newSite(ADMIN_A, wizardSite, wizardPoints)).error);
check('a refused site leaves nothing half made', (await count('digigate.sites')) === sitesBefore);
check('managed parking needs a number of spaces', (await newSite(ADMIN_A, { ...wizardSite, code: 'PRK', parkingSpaces: null }, wizardPoints)).error);
check('a place set up already cannot get a second site', (await newSite(ADMIN_A, { ...wizardSite, code: 'TWO' }, wizardPoints, ORG_A, CLIENT_A)).error);
check('a place in another company cannot be finished from here', (await newSite(ADMIN_A, { ...wizardSite, code: 'OTB' }, wizardPoints, ORG_A, CLIENT_B)).error);
const adopted = await newSite(ADMIN_A, { ...wizardSite, name: 'Spare Hospital', code: 'SPR' }, wizardPoints, ORG_A, CLIENT_SPARE);
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
check('client viewer never gets a handheld position', viewerDevices.every((row) => row.health === null || row.health.latitude === undefined));
const viewerGateShift = (await as('authenticated', VIEWER, 'aal2', 'select * from digigate.gate_board($1)', [SITE_A])).rows;
check('client viewer gets no selfie of a guard', viewerGateShift.every((row) => row.shift_id === null && row.selfie === null && row.has_selfie === false));
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
