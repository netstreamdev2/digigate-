export { carParkState, NEARLY_FULL, type CarPark, type CarParkState } from './car-park';
export { ageBand, type AgeBand } from './demographics';
export * from './geofence';
export * from './guard-record';
export * from './shift-periods';
export * from './site-types';
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
export { isValidSaIdNumber } from './documents/sa-id-number';
export { factsFromSaIdNumber, type SaIdNumberFacts } from './documents/id-number-barcode';
export { parseSmartId, type SmartIdCard, type SmartIdResult } from './documents/smart-id';
export { checkSmartId, smartIdPassesChecks, type SmartIdChecks } from './documents/smart-id-checks';
export type { GateEvent, GateEventPayload, GateEventType, JsonValue } from './events';
export { expectedVisitorFor, type ExpectedVisitor } from './expected-visitors';
export { INVITE_QR_PREFIX, inviteBookingFor, inviteCodeFromScan, inviteQrText, type InviteBooking, type InviteMatch } from './invites';
export { hotlistEntryFor, hotlistHit, type HotlistSubject } from './rules/hotlist';
export { isExpired } from './rules/dates';
export { normaliseIdentifier } from './identifiers';
export { plateDifferences, plateReadings, type PlateCharacter, type ReadLine } from './plate-reading';
export { sameVehicle, sameVin, vehicleVisits } from './rules/vehicles';
export { missedHits, recheck, reportedCodes, SITE_RULE_DEFAULTS, type UploadedCheck } from './rules/recheck';
export { uuidv7 } from './ids';
export * from './reports';
export { RULE_SEVERITY, type RuleCode, type Severity } from './rules/codes';
export { outcomeOf } from './rules/hits';
export { findOverstays, isOverstay, stayLimitMinutes } from './rules/overstay';
export * from './occupants';
export { vehicleSearchTerms } from './vehicle-search';
export { evaluatePedestrianEntry, evaluatePedestrianExit } from './rules/pedestrian';
export type {
  BootCheck,
  Driver,
  EpochMs,
  GateState,
  HotlistEntry,
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
export { evaluateVehicleExit, inLaunchGrace } from './rules/vehicle-exit';
