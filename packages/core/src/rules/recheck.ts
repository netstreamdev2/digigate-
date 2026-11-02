import { evaluatePedestrianEntry, evaluatePedestrianExit } from './pedestrian';
import type { BootCheck, GateState, IgnitionRestart, LicenceDisc, RuleConfig, RuleHit } from './types';
import { evaluateVehicleEntry } from './vehicle-entry';
import { evaluateVehicleExit } from './vehicle-exit';

/** A gate check as a handheld uploads it: what kind, when, and the payload the device wrote. */
export type UploadedCheck = { type: string; occurredAt: number; payload: unknown };

/** The site settings every site starts from, until site config syncs from the dashboard. Both gate and server read these. */
export const SITE_RULE_DEFAULTS: RuleConfig = {
  /** SAST. Decides which calendar day it is for document expiry. */
  utcOffsetMinutes: 120,
  overstayLimitMinutes: {},
  disabledRules: [],
};

type Fields = Readonly<Record<string, unknown>>;

const fieldsOf = (value: unknown): Fields | null => (typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Fields) : null);
const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

function discOf(payload: Fields): LicenceDisc | null {
  const vehicle = fieldsOf(payload.vehicle);
  if (!vehicle) return null;
  return { vin: textOf(vehicle.vin), plate: textOf(vehicle.plate), discNumber: textOf(vehicle.disc_number), expiresOn: textOf(vehicle.disc_expires_on) };
}

function personKeyOf(person: unknown): string | null {
  const key = textOf(fieldsOf(person)?.person_key);
  return key === '' ? null : key;
}

/**
 * Runs the rules again for an uploaded check, against what the server knows: every gate's open visits, not one
 * handheld's. Null when the event isn't a check, or its payload doesn't hold what the rules need.
 */
export function recheck(check: UploadedCheck, state: GateState, config: RuleConfig): RuleHit[] | null {
  const payload = fieldsOf(check.payload);
  if (!payload) return null;
  const at = check.occurredAt;

  if (check.type === 'pedestrian_entry' || check.type === 'pedestrian_exit') {
    const personKey = personKeyOf(payload.person);
    if (!personKey) return null;
    return check.type === 'pedestrian_entry' ? evaluatePedestrianEntry({ at, personKey }, state, config) : evaluatePedestrianExit({ at, personKey }, state, config);
  }

  if (check.type !== 'vehicle_entry' && check.type !== 'vehicle_exit') return null;
  const disc = discOf(payload);
  const personKey = personKeyOf(payload.driver);
  if (!disc || !personKey) return null;
  const licenceExpiresOn = textOf(fieldsOf(payload.driver)?.licence_expires_on);
  const driver = licenceExpiresOn ? { personKey, licenceExpiresOn } : { personKey };
  const typedPlate = textOf(payload.typed_plate);

  if (check.type === 'vehicle_entry') return evaluateVehicleEntry({ at, driver, disc, typedPlate }, state, config);

  const exitChecks = fieldsOf(payload.exit_checks);
  const ignitionRestart: IgnitionRestart = exitChecks?.ignition_restart === 'failed' ? 'failed' : 'done';
  const boot = exitChecks?.boot_check;
  const bootCheck: BootCheck = boot === 'clear' || boot === 'problem' ? boot : 'not-needed';
  const occupants = typeof payload.occupants === 'number' ? payload.occupants : 1;
  return evaluateVehicleExit({ at, driver, disc, typedPlate, occupants, ignitionRestart, bootCheck }, state, config);
}

/** The codes a check's payload says the handheld already raised. */
export function reportedCodes(payload: unknown): string[] {
  const hits = fieldsOf(payload)?.hits;
  return Array.isArray(hits) ? hits.flatMap((hit) => {
    const code = textOf(fieldsOf(hit)?.code);
    return code ? [code] : [];
  }) : [];
}

/** What the server found that the handheld didn't: a gate it couldn't see, or a sync it was waiting for. */
export function missedHits(serverHits: readonly RuleHit[], deviceCodes: readonly string[]): RuleHit[] {
  return serverHits.filter((hit) => !deviceCodes.includes(hit.code));
}
