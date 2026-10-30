export { ageBand, type AgeBand } from './demographics';
export { decodeDocument, type DecodedDocument } from './documents/decode';
export {
  decodeDriverLicence,
  decodeLicencePhoto,
  type DriverLicence,
  type DriverLicenceResult,
  type LicencePhotoResult,
} from './documents/driver-licence';
export type { Photo } from './documents/licence-photo/wavelet-image';
export { checkLicence, licencePassesChecks, type LicenceChecks } from './documents/licence-checks';
export { englishPart, parseLicenceDisc, type LicenceDiscResult, type ParsedLicenceDisc } from './documents/licence-disc';
export { vehicleBodyFromDisc, type VehicleBody } from './documents/vehicle-body';
export { isValidSaIdNumber } from './documents/sa-id-number';
export { factsFromSaIdNumber, type SaIdNumberFacts } from './documents/id-number-barcode';
export { parseSmartId, type SmartIdCard, type SmartIdResult } from './documents/smart-id';
export { checkSmartId, smartIdPassesChecks, type SmartIdChecks } from './documents/smart-id-checks';
export type { GateEvent, GateEventPayload, GateEventType, JsonValue } from './events';
export { isExpired } from './rules/dates';
export { normaliseIdentifier } from './identifiers';
export { sameVin, vehicleVisits } from './rules/vehicles';
export { uuidv7 } from './ids';
export { RULE_SEVERITY, type RuleCode, type Severity } from './rules/codes';
export { outcomeOf } from './rules/hits';
export { findOverstays } from './rules/overstay';
export { evaluatePedestrianEntry, evaluatePedestrianExit } from './rules/pedestrian';
export type {
  BootCheck,
  Driver,
  EpochMs,
  GateState,
  IgnitionRestart,
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
