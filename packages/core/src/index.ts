export { decodeDocument, type DecodedDocument } from './documents/decode';
export { decodeDriverLicence, type DriverLicence, type DriverLicenceResult } from './documents/driver-licence';
export { englishPart, parseLicenceDisc, type LicenceDiscResult, type ParsedLicenceDisc } from './documents/licence-disc';
export { isValidSaIdNumber } from './documents/sa-id-number';
export type { GateEvent, GateEventPayload, GateEventType } from './events';
export { isExpired } from './rules/dates';
export { normaliseIdentifier } from './identifiers';
export { uuidv7 } from './ids';
export { RULE_SEVERITY, type RuleCode, type Severity } from './rules/codes';
export { outcomeOf } from './rules/hits';
export { findOverstays } from './rules/overstay';
export { evaluatePedestrianEntry, evaluatePedestrianExit } from './rules/pedestrian';
export type {
  Driver,
  EpochMs,
  GateState,
  IsoDate,
  LicenceDisc,
  OpenPedestrianVisit,
  OpenVehicleVisit,
  OpenVisit,
  Outcome,
  PedestrianScan,
  PersonKey,
  RegisteredPerson,
  RuleConfig,
  RuleHit,
  VehicleEntryScan,
  VehicleExitScan,
  VehicleIdentity,
  VehicleSighting,
} from './rules/types';
export { evaluateVehicleEntry } from './rules/vehicle-entry';
export { evaluateVehicleExit } from './rules/vehicle-exit';
