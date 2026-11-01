// Stands in for the handhelds at one test site, so the dashboard can be built and checked against real traffic. It pairs
// through the real function, decides with the real rules in packages/core and uploads through the real sync: the same
// events a DT50 sends, about made-up people and cars. One device per post, staffed by the site's own gate staff.
//
//   pnpm simulate --site <site id> --history 30    first run: pairs, fills the past 30 days, then carries on live
//   pnpm simulate                                  later runs: carries on live with the same devices
//   pnpm simulate:erase                            removes every trace of it, totals and devices included
//   --every <seconds>   how often someone arrives when live (default 20)
//   --for <minutes>     stop after this long live (default 480, and 0 stops once the history is in)
//   --keep <hours>      how long its detail stays on the server (default 24)
//
// Ctrl+C ends the shifts and stops. Detail older than --keep is erased every hour, leaving only the anonymous daily
// totals, so it can't fill a free database. Test project only: it refuses any other.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  ageBand,
  evaluatePedestrianEntry,
  evaluatePedestrianExit,
  evaluateVehicleEntry,
  evaluateVehicleExit,
  outcomeOf,
  sameVin,
  uuidv7,
  vehicleVisits,
  type BootCheck,
  type GateEvent,
  type GateEventPayload,
  type GateEventType,
  type GateState,
  type IgnitionRestart,
  type LicenceDisc,
  type OpenPedestrianVisit,
  type OpenVehicleVisit,
  type RuleConfig,
  type RuleHit,
  type VehicleSighting,
} from '../../../packages/core/src/index.ts';

import { pruneSql, RECLAIM_TABLES, wipeSql } from './retention.ts';
import {
  ARRIVALS_PER_HOUR,
  CAR_SHARE_OF_ARRIVALS,
  LIVE_TROUBLE_FACTOR,
  OVERRIDE_REASONS,
  STAY_MINUTES,
  TROUBLE,
  between,
  chance,
  makeCar,
  makePeople,
  pick,
  type FakeCar,
  type FakePerson,
} from './fake-world.ts';

const TEST_PROJECT = 'fgtuednylvrknqeyxizz';
const STATE_FILE = '.simulator/state.json';
const PEOPLE = 600;
const CARS = 500;
const BATCH = 100;
const UPLOAD_ATTEMPTS = 4;
const MAX_RETRY_WAIT_MS = 30_000;
/** Visits made while live are shortened by this much, so cars leave while someone is watching. */
const LIVE_STAY_DIVISOR = 30;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const HALF_DAY = 12 * HOUR;
/** Shifts change at 06:00 and 18:00 SAST, which is 04:00 and 16:00 UTC. */
const SHIFT_CHANGE_OFFSET = 4 * HOUR;

/** The same settings as the gate app's site config. */
const RULES: RuleConfig = { utcOffsetMinutes: 120, overstayLimitMinutes: {}, disabledRules: [] };

type Post = { code: string; label: string; lanes: string[] };
type SavedDevice = { id: string; token: string; post: Post; shiftId: string | null; guardId: string | null };
type Guard = { id: string; role: string };
type SimVisit = (OpenVehicleVisit | OpenPedestrianVisit) & { deviceId: string };
type SimVehicleVisit = OpenVehicleVisit & { deviceId: string };

type Saved = {
  siteId: string;
  devices: SavedDevice[];
  guards: Guard[];
  people: FakePerson[];
  cars: FakeCar[];
  open: SimVisit[];
  sightings: VehicleSighting[];
  rota: number;
  /** Cloned discs, kept apart so they turn up once and don't haunt the alerts for the rest of the run. */
  twins?: FakeCar[];
};

type Device = SavedDevice & { outbox: GateEvent[] };
type Step = { at: number; run: (at: number) => void };

const { values: options } = parseArgs({
  options: {
    site: { type: 'string' },
    history: { type: 'string' },
    every: { type: 'string', default: '20' },
    for: { type: 'string', default: '480' },
    keep: { type: 'string', default: '24' },
    erase: { type: 'boolean', default: false },
  },
});

process.loadEnvFile('apps/gate/.env');
const serverUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
if (!serverUrl.includes(TEST_PROJECT)) throw new Error('The simulator only runs against the test project.');

const callFunction = (name: string, body: unknown, token?: string): Promise<Response> =>
  fetch(`${serverUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

const newId = (at: number): string => uuidv7(at, randomBytes(10));

/** Runs SQL as the project owner through the Supabase CLI. Only pairing needs it: the rest goes through the real door. */
function query<Row>(sql: string): Row[] {
  const file = join(tmpdir(), 'digigate-simulator.sql');
  writeFileSync(file, sql);
  const args = ['dlx', 'supabase', 'db', 'query', '--linked', '--project-ref', TEST_PROJECT, '--file', `"${file}"`];
  const output = execFileSync('pnpm.cmd', args, { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 });
  const { rows } = JSON.parse(output.slice(output.indexOf('{'), output.lastIndexOf('}') + 1)) as { rows: Row[] };
  return rows;
}

/** One pairing code per post, claimed the way a handheld claims it. */
async function pairDevices(siteId: string): Promise<{ devices: SavedDevice[]; guards: Guard[]; personKey: string }> {
  if (!/^[0-9a-f-]{36}$/.test(siteId)) throw new Error('--site must be a site id.');
  const [site] = query<{ org_id: string; owner: string }>(
    `select s.org_id, (select id from digigate.profiles where 'super_user' = any (roles) limit 1) as owner
     from digigate.sites s where s.id = '${siteId}'`,
  );
  if (!site) throw new Error('No site has that id.');
  const posts = query<Post>(`select code, label, lanes from digigate.posts where site_id = '${siteId}' and is_active order by created_at`);
  if (posts.length === 0) throw new Error('That site has no posts yet.');

  const codes = posts.map((post) => ({ post, code: String(randomInt(1_000_000_000, 10_000_000_000)) }));
  const rows = codes.map(({ post, code }) => {
    const hash = createHash('sha256').update(code).digest('hex');
    return `('${site.org_id}', '${siteId}', 'Simulator ${post.label}', '${hash}', now() + interval '10 minutes', '${site.owner}')`;
  });
  query(`insert into digigate.pairing_codes (org_id, site_id, device_name, code_hash, expires_at, created_by) values ${rows.join(', ')}`);

  const devices: SavedDevice[] = [];
  let personKey = '';
  for (const { post, code } of codes) {
    const response = await callFunction('digigate-pair', { code });
    if (!response.ok) throw new Error(`Pairing was refused: the server answered ${response.status}.`);
    const paired = (await response.json()) as { deviceId: string; token: string; personKey: string };
    devices.push({ id: paired.deviceId, token: paired.token, post, shiftId: null, guardId: null });
    personKey = paired.personKey;
  }

  // The list comes with PIN hashes. Only ids and roles are kept.
  const first = devices[0];
  if (!first) throw new Error('No device was paired.');
  const response = await callFunction('digigate-sync', { pull: true }, first.token);
  if (!response.ok) throw new Error(`The first sync failed: the server answered ${response.status}.`);
  const { users } = (await response.json()) as { users: (Guard & { active: boolean })[] };
  const guards = users.filter((user) => user.active).map(({ id, role }) => ({ id, role }));
  if (guards.length === 0) throw new Error('That site has no gate staff yet.');
  return { devices, guards, personKey };
}

async function loadOrStart(): Promise<Saved> {
  if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Saved;
  if (!options.site) throw new Error('First run: pass --site with the id of a test site.');
  const { devices, guards, personKey } = await pairDevices(options.site);
  const now = Date.now();
  return {
    siteId: options.site,
    devices,
    guards,
    people: makePeople(PEOPLE, personKey, now),
    cars: Array.from({ length: CARS }, (_unused, index) => makeCar(index + 1, now)),
    open: [],
    sightings: [],
    rota: 0,
  };
}

/** Hands freed space back to the project, a table at a time. It can't run inside a transaction. */
function reclaimSpace(): void {
  for (const table of RECLAIM_TABLES) query(`vacuum full digigate.${table}`);
}

if (options.erase) {
  if (!existsSync(STATE_FILE)) {
    console.log('Nothing to erase: the simulator has no devices.');
    process.exit(0);
  }
  const { siteId, devices } = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as Saved;
  query(wipeSql(devices.map((device) => device.id), siteId));
  reclaimSpace();
  rmSync('.simulator', { recursive: true, force: true });
  console.log('Erased. Every simulator record, total and device is gone.');
  process.exit(0);
}

const firstRun = !existsSync(STATE_FILE);
if (options.history && !firstRun) throw new Error('History only goes in on a first run.');

const saved = await loadOrStart();
const liveFrom = Date.now();
const devices: Device[] = saved.devices.map((device) => ({ ...device, outbox: [] }));
const devicesById = new Map(devices.map((device) => [device.id, device]));
const peopleByKey = new Map(saved.people.map((person) => [person.key, person]));
// Runs before twins were kept apart left them in the car pool.
const twins = saved.twins ?? saved.cars.slice(CARS);
saved.cars = saved.cars.slice(0, CARS);
saved.twins = twins;
const carsByVin = new Map([...saved.cars, ...twins].map((car) => [car.vin, car]));
const twinVins = new Set(twins.map((car) => car.vin));
saved.sightings = saved.sightings.filter((seen) => !twinVins.has(seen.vin));
const open = new Map(saved.open.map((visit) => [visit.id, visit]));
const sightings = new Map(saved.sightings.map((seen) => [`${seen.vin}|${seen.plate}`, seen]));
const supervisors = saved.guards.filter((guard) => guard.role === 'supervisor');

const steps: Step[] = [];
let sent = 0;
let stopping = false;

function later(at: number, run: Step['run']): void {
  const index = steps.findIndex((step) => step.at > at);
  steps.splice(index === -1 ? steps.length : index, 0, { at, run });
}

const isLive = (at: number): boolean => at >= liveFrom;
const trouble = (rate: number, at: number): boolean => chance(isLive(at) ? rate * LIVE_TROUBLE_FACTOR : rate);

function stayFor(visitType: string, at: number): number {
  const [low, high] = STAY_MINUTES[visitType] ?? [30, 60];
  return (between(low, high) * MINUTE) / (isLive(at) ? LIVE_STAY_DIVISOR : 1);
}

function personOf(key: string): FakePerson {
  const person = peopleByKey.get(key);
  if (!person) throw new Error('The simulator lost track of a person.');
  return person;
}

function carOf(vin: string): FakeCar {
  const car = carsByVin.get(vin);
  if (!car) throw new Error('The simulator lost track of a car.');
  return car;
}

const openList = (): SimVisit[] => [...open.values()];
const openCars = (): SimVehicleVisit[] => openList().filter((visit) => visit.kind === 'vehicle');
const openWalkers = (): (OpenPedestrianVisit & { deviceId: string })[] => openList().filter((visit) => visit.kind === 'pedestrian');

function freePerson(): FakePerson | undefined {
  const onSite = new Set(openList().map((visit) => (visit.kind === 'vehicle' ? visit.driverKey : visit.personKey)));
  return pick(saved.people.filter((person) => !onSite.has(person.key)));
}

function freeCar(): FakeCar | undefined {
  const onSite = new Set(openCars().map((visit) => visit.vehicle.vin));
  return pick(saved.cars.filter((car) => !onSite.has(car.vin)));
}

const gateState = (): GateState => ({ openVisits: openList(), vehicleHistory: [...sightings.values()], registeredPeople: new Map() });

const discOf = (car: FakeCar): LicenceDisc => ({ vin: car.vin, plate: car.plate, discNumber: car.discNumber, expiresOn: car.discExpiresOn });
const demographics = (person: FakePerson, at: number): GateEventPayload => ({
  sex: person.sex,
  age_band: ageBand(person.birthDate, at, RULES.utcOffsetMinutes),
});
const hitsPayload = (hits: readonly RuleHit[]) =>
  hits.map((ruleHit) => ({ code: ruleHit.code, severity: ruleHit.severity, related_visit_id: ruleHit.relatedVisitId ?? null }));

const vehiclePayload = (car: FakeCar): GateEventPayload => ({
  vin: car.vin,
  plate: car.plate,
  disc_number: car.discNumber,
  register_number: car.registerNumber,
  make: car.make,
  model: car.model,
  colour: car.colour,
  disc_expires_on: car.discExpiresOn,
});

const driverPayload = (person: FakePerson, at: number): GateEventPayload => ({
  person_key: person.key,
  initials: person.initials,
  surname: person.surname,
  licence_expires_on: person.licenceExpiresOn,
  vehicle_codes: ['B'],
  demographics: demographics(person, at),
});

function personPayload(person: FakePerson, at: number): GateEventPayload {
  const shared = { person_key: person.key, surname: person.surname, demographics: demographics(person, at) };
  switch (person.document) {
    case 'driver-licence':
      return { ...shared, document: 'driver-licence', initials: person.initials, manual: false };
    case 'smart-id':
      return { ...shared, document: 'smart-id', names: person.names, manual: false };
    case 'green-id-book':
      return { ...shared, document: 'green-id-book', names: person.names, gender: person.sex, manual: true };
  }
}

function record(device: Device, type: GateEventType, at: number, payload: GateEventPayload, hits: readonly RuleHit[] = []): GateEvent {
  const event: GateEvent = { id: newId(at), type, occurredAt: at, gateUserId: device.guardId, payload };
  device.outbox.push(event);
  if (isLive(at)) {
    const clock = new Date(at + RULES.utcOffsetMinutes * MINUTE).toISOString().slice(11, 19);
    console.log(`${clock}  ${device.post.label.padEnd(14)} ${type.padEnd(17)} ${hits.map((ruleHit) => ruleHit.code).join(' ')}`);
  }
  return event;
}

function openVisit(visit: SimVisit): void {
  open.set(visit.id, visit);
  if (visit.kind === 'vehicle' && !twinVins.has(visit.vehicle.vin)) sightings.set(`${visit.vehicle.vin}|${visit.vehicle.plate}`, { vin: visit.vehicle.vin, plate: visit.vehicle.plate });
}

/**
 * What the guard does about a check. Anything clear goes straight through. A warning or a block waits for a person, so
 * it sits open on the dashboard for a moment, as it does at a real gate.
 */
function settle(
  device: Device,
  check: GateEvent,
  hits: readonly RuleHit[],
  visitId: string | null,
  direction: 'entry' | 'exit',
  letThrough: (at: number) => void,
  turnedAway?: (at: number) => void,
): void {
  const outcome = outcomeOf([...hits]);
  if (outcome === 'clear') {
    letThrough(check.occurredAt);
    return;
  }

  const base = { check_event_id: check.id, visit_id: visitId, direction, codes: hits.map((ruleHit) => ruleHit.code) };
  later(check.occurredAt + between(outcome === 'warning' ? 0.3 : 1, outcome === 'warning' ? 1.5 : 4) * MINUTE, (at) => {
    const supervisor = pick(supervisors);
    if (outcome === 'warning' ? chance(0.15) : chance(0.75) || !supervisor) {
      record(device, 'turned_away', at, base);
      turnedAway?.(at);
      return;
    }
    if (outcome === 'warning') {
      record(device, 'alert_ack', at, base);
    } else {
      record(device, 'override', at, { ...base, supervisor_id: supervisor?.id ?? null, reason: pick(OVERRIDE_REASONS) ?? '' });
    }
    letThrough(at);
  });
}

function checkCarIn(device: Device, at: number, car: FakeCar, person: FakePerson, typedPlate: string, occupants: number, visitType: string): void {
  const driver = { personKey: person.key, licenceExpiresOn: person.licenceExpiresOn };
  const hits = evaluateVehicleEntry({ at, driver, disc: discOf(car), typedPlate }, gateState(), RULES);
  const visit: SimVehicleVisit = {
    id: newId(at),
    kind: 'vehicle',
    driverKey: person.key,
    coDriverKeys: [],
    vehicle: { vin: car.vin, plate: car.plate, discNumber: car.discNumber },
    occupants,
    visitType,
    enteredAt: at,
    deviceId: device.id,
  };
  const check = record(
    device,
    'vehicle_entry',
    at,
    {
      visit_id: visit.id,
      outcome: outcomeOf(hits),
      hits: hitsPayload(hits),
      vehicle: vehiclePayload(car),
      typed_plate: typedPlate,
      driver: driverPayload(person, at),
      occupants,
      exit_checks: null,
      visit_type: visitType,
    },
    hits,
  );
  settle(device, check, hits, visit.id, 'entry', (through) => {
    openVisit(visit);
    later(through + stayFor(visitType, through), (leaving) => {
      // A car that was let in twice has two open visits, and an exit closes the oldest, so look for either.
      const stillInside = open.get(visit.id) ?? openCars().find((candidate) => sameVin(candidate.vehicle, visit.vehicle));
      if (stillInside?.kind === 'vehicle') carLeaves(device, leaving, stillInside);
    });
  });
}

function checkCarOut(
  device: Device,
  at: number,
  car: FakeCar,
  person: FakePerson,
  typedPlate: string,
  occupants: number,
  ignitionRestart: IgnitionRestart,
  bootCheck: BootCheck,
): void {
  const driver = { personKey: person.key, licenceExpiresOn: person.licenceExpiresOn };
  const state = gateState();
  const hits = evaluateVehicleExit({ at, driver, disc: discOf(car), typedPlate, occupants, ignitionRestart, bootCheck }, state, RULES);
  const visit = vehicleVisits(state.openVisits).find((candidate) => sameVin(candidate.vehicle, car));
  const check = record(
    device,
    'vehicle_exit',
    at,
    {
      visit_id: visit?.id ?? null,
      outcome: outcomeOf(hits),
      hits: hitsPayload(hits),
      vehicle: vehiclePayload(car),
      typed_plate: typedPlate,
      driver: driverPayload(person, at),
      occupants,
      exit_checks: { ignition_restart: ignitionRestart, boot_check: bootCheck },
      visit_type: visit?.visitType ?? null,
    },
    hits,
  );
  settle(
    device,
    check,
    hits,
    visit?.id ?? null,
    'exit',
    () => {
      if (visit) open.delete(visit.id);
    },
    (turned) => {
      // Sent back: the car is still inside, and the right person fetches it later.
      const stillInside = visit && open.get(visit.id);
      if (stillInside?.kind === 'vehicle') {
        later(turned + between(5, 40) * MINUTE, (leaving) => {
          if (open.has(stillInside.id)) carLeaves(device, leaving, stillInside, true);
        });
      }
    },
  );
}

/** A car on its way out. `honest` means the real driver with nothing wrong, for the second try after being sent back. */
function carLeaves(device: Device, at: number, visit: SimVehicleVisit, honest = false): void {
  const car = carOf(visit.vehicle.vin);
  let person = personOf(visit.driverKey);
  let typedPlate = car.plate;
  let occupants = visit.occupants;
  let ignitionRestart: IgnitionRestart = 'done';
  let bootCheck: BootCheck = chance(0.03) ? 'clear' : 'not-needed';

  if (!honest) {
    if (trouble(TROUBLE.strangerDriving, at)) {
      person = freePerson() ?? person;
    } else if (trouble(TROUBLE.otherCarsDriver, at)) {
      const other = pick(openCars().filter((candidate) => candidate.id !== visit.id));
      person = other ? personOf(other.driverKey) : person;
    } else if (trouble(TROUBLE.walkedInDrivingOut, at)) {
      const walker = pick(openWalkers());
      person = walker ? personOf(walker.personKey) : person;
    } else if (trouble(TROUBLE.plateTypo, at)) {
      typedPlate = misread(car.plate);
    } else if (trouble(TROUBLE.ignitionFailed, at)) {
      ignitionRestart = 'failed';
    } else if (trouble(TROUBLE.bootProblem, at)) {
      bootCheck = 'problem';
    } else if (occupants > 1 && trouble(TROUBLE.fewerOccupantsOut, at)) {
      occupants -= 1;
    }
  }
  checkCarOut(device, at, car, person, typedPlate, occupants, ignitionRestart, bootCheck);
}

const misread = (plate: string): string => plate.replace(/\d/, (digit) => String((Number(digit) + 1) % 10));

/** A new disc carrying the plate of a car that's already inside. */
function clonedDiscOf(visit: SimVehicleVisit, at: number): FakeCar {
  const twin = { ...makeCar(carsByVin.size + 1, at), plate: visit.vehicle.plate };
  carsByVin.set(twin.vin, twin);
  twinVins.add(twin.vin);
  twins.push(twin);
  return twin;
}

function visitTypeFor(device: Device, person: FakePerson): string {
  if (device.post.code.includes('delivery')) return chance(0.75) ? 'delivery' : 'contractor';
  if (person.staff) return 'staff';
  const roll = Math.random();
  return roll < 0.7 ? 'visitor' : roll < 0.85 ? 'patient_dropoff' : roll < 0.93 ? 'contractor' : roll < 0.98 ? 'delivery' : 'emergency';
}

function carArrives(device: Device, at: number): void {
  if (trouble(TROUBLE.noEntryRecord, at)) {
    const car = freeCar();
    const person = freePerson();
    if (car && person) checkCarOut(device, at, car, person, car.plate, 1, 'done', 'not-needed');
    return;
  }
  const inside = pick(openCars().filter((visit) => visit.deviceId === device.id));
  if (inside && trouble(TROUBLE.doubleEntry, at)) {
    checkCarIn(device, at, carOf(inside.vehicle.vin), personOf(inside.driverKey), inside.vehicle.plate, inside.occupants, inside.visitType);
    return;
  }
  const person = freePerson();
  if (!person) return;
  if (inside && trouble(TROUBLE.clonedDisc, at)) {
    const twin = clonedDiscOf(inside, at);
    checkCarIn(device, at, twin, person, twin.plate, 1, 'visitor');
    return;
  }
  const car = freeCar();
  if (!car) return;
  const typedPlate = trouble(TROUBLE.plateTypo, at) ? misread(car.plate) : car.plate;
  checkCarIn(device, at, car, person, typedPlate, chance(0.4) ? 2 + Math.floor(between(0, 3)) : 1, visitTypeFor(device, person));
}

function checkPersonIn(device: Device, at: number, person: FakePerson, visitType: string): void {
  const hits = evaluatePedestrianEntry({ at, personKey: person.key }, gateState(), RULES);
  const visit: SimVisit = { id: newId(at), kind: 'pedestrian', personKey: person.key, visitType, enteredAt: at, deviceId: device.id };
  const check = record(
    device,
    'pedestrian_entry',
    at,
    { visit_id: visit.id, outcome: outcomeOf(hits), hits: hitsPayload(hits), person: personPayload(person, at), visit_type: visitType },
    hits,
  );
  settle(device, check, hits, visit.id, 'entry', (through) => {
    openVisit(visit);
    later(through + stayFor(visitType, through), (leaving) => {
      if (open.has(visit.id) || openWalkers().some((walker) => walker.personKey === person.key)) checkPersonOut(device, leaving, person);
    });
  });
}

function checkPersonOut(device: Device, at: number, person: FakePerson): void {
  const state = gateState();
  const hits = evaluatePedestrianExit({ at, personKey: person.key }, state, RULES);
  const visit = openWalkers().find((candidate) => candidate.personKey === person.key);
  const check = record(
    device,
    'pedestrian_exit',
    at,
    {
      visit_id: visit?.id ?? null,
      outcome: outcomeOf(hits),
      hits: hitsPayload(hits),
      person: personPayload(person, at),
      visit_type: visit?.visitType ?? null,
    },
    hits,
  );
  settle(device, check, hits, visit?.id ?? null, 'exit', () => {
    if (visit) open.delete(visit.id);
  });
}

function personArrives(device: Device, at: number): void {
  if (trouble(TROUBLE.noEntryOnFoot, at)) {
    const person = freePerson();
    if (person) checkPersonOut(device, at, person);
    return;
  }
  if (trouble(TROUBLE.doubleEntryOnFoot, at)) {
    const walker = pick(openWalkers());
    if (walker) checkPersonIn(device, at, personOf(walker.personKey), walker.visitType);
    return;
  }
  if (trouble(TROUBLE.driverLeavesOnFoot, at)) {
    const car = pick(openCars());
    if (car) checkPersonOut(device, at, personOf(car.driverKey));
    return;
  }
  const person = freePerson();
  if (person) checkPersonIn(device, at, person, person.staff ? 'staff' : chance(0.9) ? 'visitor' : 'contractor');
}

function nextArrivalAt(at: number): number {
  const everySeconds = Number(options.every);
  const hour = new Date(at + RULES.utcOffsetMinutes * MINUTE).getUTCHours();
  const mean = isLive(at) ? everySeconds * 1000 : HOUR / (ARRIVALS_PER_HOUR[hour] ?? 1);
  return at - Math.log(1 - Math.random()) * mean;
}

function arrival(at: number): void {
  later(nextArrivalAt(at), arrival);
  const lane = chance(CAR_SHARE_OF_ARRIVALS) ? 'vehicle' : 'pedestrian';
  const device = pick(devices.filter((candidate) => candidate.post.lanes.includes(lane)));
  if (!device) return;
  if (lane === 'vehicle') carArrives(device, at);
  else personArrives(device, at);
}

function changeShift(at: number): void {
  const hour = new Date(at + RULES.utcOffsetMinutes * MINUTE).getUTCHours();
  const period = hour >= 6 && hour < 18 ? 'day' : 'night';
  saved.rota += 1;
  devices.forEach((device, index) => {
    if (device.shiftId) record(device, 'shift_end', at, { shift_id: device.shiftId, reason: 'handover' });
    device.guardId = saved.guards[(index + saved.rota) % saved.guards.length]?.id ?? null;
    device.shiftId = newId(at);
    record(device, 'shift_start', at, { shift_id: device.shiftId, post: device.post.code, period });
  });
  later(Math.floor((at - SHIFT_CHANGE_OFFSET) / HALF_DAY + 1) * HALF_DAY + SHIFT_CHANGE_OFFSET, changeShift);
}

async function upload(device: Device): Promise<void> {
  while (device.outbox.length > 0) {
    const batch = device.outbox.slice(0, BATCH);
    // No connection is normal at a gate, so like a handheld it holds its events and keeps trying. A refusal is different.
    for (let attempt = 1; ; attempt += 1) {
      const response = await callFunction('digigate-sync', { events: batch }, device.token).catch(() => null);
      if (response?.status === 200) {
        await response.body?.cancel();
        break;
      }
      if (response && attempt >= UPLOAD_ATTEMPTS) throw new Error(`Upload stopped: the server answered ${response.status}. Run it again to carry on.`);
      if (!response && attempt === 1) console.log(`${device.post.label}: no connection, holding ${device.outbox.length} events`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 2000, MAX_RETRY_WAIT_MS)));
    }
    device.outbox.splice(0, batch.length);
    sent += batch.length;
  }
}

function save(): void {
  mkdirSync('.simulator', { recursive: true });
  const kept: Saved = { ...saved, devices: devices.map(({ outbox: _outbox, ...device }) => device), open: openList(), sightings: [...sightings.values()] };
  writeFileSync(STATE_FILE, JSON.stringify(kept));
}

async function flush(minimum: number): Promise<void> {
  const waiting = devices.filter((device) => device.outbox.length >= minimum && device.outbox.length > 0);
  if (waiting.length === 0) return;
  await Promise.all(waiting.map(upload));
  save();
}

function prune(): void {
  const keepHours = Number(options.keep);
  try {
    query(pruneSql(devices.map((device) => device.id), keepHours));
    console.log(`Kept the last ${keepHours} hours of detail and erased the rest`);
  } catch {
    console.log('Could not erase old detail just now. Trying again next hour.');
  }
}

async function run(until: number): Promise<void> {
  let day = '';
  let nextPrune = Date.now();
  for (;;) {
    const step = steps[0];
    if (stopping || !step || Date.now() >= until) return;
    const wait = step.at - Date.now();
    if (wait > 0) {
      await flush(1);
      if (Date.now() >= nextPrune) {
        prune();
        nextPrune = Date.now() + HOUR;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 500)));
      continue;
    }
    steps.shift();
    step.run(step.at);
    const today = new Date(step.at).toISOString().slice(0, 10);
    if (!isLive(step.at) && today !== day) {
      day = today;
      console.log(`${today}  ${sent} events sent, ${open.size} on site`);
    }
    await flush(isLive(step.at) ? 1 : BATCH);
  }
}

async function stop(): Promise<void> {
  for (const device of devices) {
    if (device.shiftId) record(device, 'shift_end', Date.now(), { shift_id: device.shiftId, reason: 'ended' });
    device.shiftId = null;
  }
  await flush(1);
  save();
  console.log(`Stopped: ${sent} events sent, ${open.size} still on site.`);
}

process.on('SIGINT', () => {
  stopping = true;
});

const historyDays = Number(options.history ?? 0);
const start = liveFrom - historyDays * 24 * HOUR;
changeShift(start);
later(start, arrival);
for (const visit of open.values()) {
  const device = devicesById.get(visit.deviceId);
  if (!device) continue;
  later(liveFrom + between(1, 15) * MINUTE, (leaving) => {
    if (!open.has(visit.id)) return;
    if (visit.kind === 'vehicle') carLeaves(device, leaving, visit);
    else checkPersonOut(device, leaving, personOf(visit.personKey));
  });
}

console.log(firstRun ? `Paired ${devices.length} devices.` : `Carrying on with ${devices.length} devices.`);
await run(liveFrom + Number(options.for) * MINUTE);
await stop();
