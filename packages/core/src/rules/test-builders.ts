// Synthetic, obviously fake identities for tests. Real scans never appear here.
import type {
  GateState,
  LicenceDisc,
  OpenPedestrianVisit,
  OpenVehicleVisit,
  PersonKey,
  RegisteredPerson,
  RuleConfig,
  RuleHit,
  VehicleIdentity,
} from './types';

export const MINUTE = 60_000;

/** 28 Oct 2026, 10:00 SAST. */
export const NOW = Date.UTC(2026, 9, 28, 8, 0);

export const config: RuleConfig = {
  utcOffsetMinutes: 120,
  overstayLimitMinutes: { visitor: 240 },
  disabledRules: [],
};

export const carA: LicenceDisc = {
  vin: 'TESTVIN0000000001',
  plate: 'TEST 001',
  discNumber: 'DISCTEST001',
  expiresOn: '2027-01-31',
};

export const carB: LicenceDisc = {
  vin: 'TESTVIN0000000002',
  plate: 'TEST 002',
  discNumber: 'DISCTEST002',
  expiresOn: '2027-01-31',
};

export function identity(disc: LicenceDisc): VehicleIdentity {
  return { vin: disc.vin, plate: disc.plate, discNumber: disc.discNumber };
}

export function vehicleVisit(overrides: Partial<OpenVehicleVisit> = {}): OpenVehicleVisit {
  return {
    id: 'visit-car-a',
    kind: 'vehicle',
    driverKey: 'person-a',
    coDriverKeys: [],
    vehicle: identity(carA),
    occupants: 2,
    visitType: 'visitor',
    enteredAt: NOW - 60 * MINUTE,
    ...overrides,
  };
}

export function pedestrianVisit(overrides: Partial<OpenPedestrianVisit> = {}): OpenPedestrianVisit {
  return {
    id: 'visit-on-foot',
    kind: 'pedestrian',
    personKey: 'person-walker',
    visitType: 'visitor',
    enteredAt: NOW - 30 * MINUTE,
    ...overrides,
  };
}

export function gateState(overrides: Partial<GateState> = {}): GateState {
  return {
    openVisits: [],
    vehicleHistory: [],
    registeredPeople: new Map(),
    ...overrides,
  };
}

export function registered(
  personKey: PersonKey,
  knownVins: readonly string[],
  status: RegisteredPerson['status'] = 'approved',
): ReadonlyMap<PersonKey, RegisteredPerson> {
  return new Map([[personKey, { personKey, status, knownVins }]]);
}

export function codes(hits: readonly RuleHit[]): string[] {
  return hits.map((ruleHit) => ruleHit.code);
}
