import type { RuleCode, Severity } from './codes';

/** Milliseconds since the Unix epoch, UTC. */
export type EpochMs = number;

/** A calendar date as printed on a document, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Keyed hash of a person's ID type and number. Never the raw ID number. */
export type PersonKey = string;

export type VehicleIdentity = {
  vin: string;
  plate: string;
  discNumber: string;
};

export type LicenceDisc = VehicleIdentity & {
  expiresOn: IsoDate;
};

export type Driver = {
  personKey: PersonKey;
  /** Absent when the driver was identified without a licence, e.g. by manual entry. */
  licenceExpiresOn?: IsoDate;
};

export type OpenVehicleVisit = {
  id: string;
  kind: 'vehicle';
  driverKey: PersonKey;
  coDriverKeys: readonly PersonKey[];
  vehicle: VehicleIdentity;
  /** The expiry on the disc scanned at entry. Absent for visits recorded before it was kept. */
  discExpiresOn?: IsoDate;
  occupants: number;
  visitType: string;
  enteredAt: EpochMs;
};

export type OpenPedestrianVisit = {
  id: string;
  kind: 'pedestrian';
  personKey: PersonKey;
  visitType: string;
  enteredAt: EpochMs;
};

export type OpenVisit = OpenVehicleVisit | OpenPedestrianVisit;

/** A plate and VIN seen together on a past visit. */
export type VehicleSighting = {
  vin: string;
  plate: string;
};

export type RegisteredPerson = {
  personKey: PersonKey;
  status: 'pending' | 'approved';
  knownVins: readonly string[];
};

/**
 * Someone or something a company wants stopped at its gates. `key` is a person key for a person, and the plate or VIN
 * itself for a car, in any form: it's compared normalised.
 */
export type HotlistEntry = {
  id: string;
  kind: 'person' | 'plate' | 'vin';
  key: string;
};

/** Everything the rules read. On a gate device this comes from the local database. */
export type GateState = {
  openVisits: readonly OpenVisit[];
  vehicleHistory: readonly VehicleSighting[];
  registeredPeople: ReadonlyMap<PersonKey, RegisteredPerson>;
  /** The company's hotlist entries for this site that are in force now. */
  hotlist: readonly HotlistEntry[];
};

/** Per-site rule settings, from site config. */
export type RuleConfig = {
  /** The site's offset from UTC, used to decide which calendar day it is for expiry dates. */
  utcOffsetMinutes: number;
  /** Overstay limit per visit type. Visit types without a limit never overstay. */
  overstayLimitMinutes: Readonly<Partial<Record<string, number>>>;
  disabledRules: readonly RuleCode[];
};

export type VehicleEntryScan = {
  at: EpochMs;
  driver: Driver;
  disc: LicenceDisc;
  /** The plate the guard reads off the car. */
  typedPlate: string;
};

/** Whether the driver could stop the engine and start it again at the exit: someone without the key can't. */
export type IgnitionRestart = 'done' | 'failed';

/** The boot is only opened when something looks suspicious. */
export type BootCheck = 'not-needed' | 'clear' | 'problem';

export type VehicleExitScan = {
  at: EpochMs;
  driver: Driver;
  disc: LicenceDisc;
  typedPlate: string;
  occupants: number;
  ignitionRestart: IgnitionRestart;
  bootCheck: BootCheck;
};

export type PedestrianScan = {
  at: EpochMs;
  personKey: PersonKey;
};

export type RuleHit = {
  code: RuleCode;
  severity: Severity;
  /** The open visit that explains the hit, e.g. the other car this driver arrived in. */
  relatedVisitId?: string;
  /** The hotlist entry behind a HOTLIST_MATCH. */
  hotlistEntryId?: string;
};

export type Outcome = 'clear' | 'warning' | 'blocked';
