import { Handheld } from '../../modules/handheld';

/*
 * A gate handheld that DigiGate owns (set up over adb on a freshly reset handheld) is held to the gate policy at every
 * start: DigiGate is its home screen, the guard can open only the phone, camera and gallery besides, and hotspot,
 * airplane mode, mobile data, the clock, location, factory reset and copying files off it are locked. Not a full kiosk:
 * the guard still has the notification shade and Settings for Wi-Fi. A handheld DigiGate doesn't own, such as a phone
 * used for invites, is left exactly as it is.
 */

/** Apps a guard may also open, by package name. None yet; a site setting can add them later without a new build. */
const ALSO_ALLOWED: string[] = [];

export type GatePolicy =
  | { kind: 'not-managed' }
  /** `problems` names any step Android refused, for the control room. */
  | { kind: 'managed'; problems: string[] };

let current: GatePolicy = { kind: 'not-managed' };

/** Safe to repeat. Never throws: a handheld that can't be locked down still has to work as a gate. */
export function applyGatePolicy(): GatePolicy {
  try {
    current = Handheld?.isDeviceOwner() ? { kind: 'managed', problems: Handheld.applyGatePolicy(ALSO_ALLOWED) } : { kind: 'not-managed' };
  } catch (cause) {
    current = { kind: 'managed', problems: [`failed: ${cause instanceof Error ? cause.message : 'unknown error'}`] };
  }
  return current;
}

export const gatePolicy = (): GatePolicy => current;

export type ReleaseResult = { released: true } | { released: false; problems: string[] };

/** Hands the handheld back as an ordinary Android device. It stays under DigiGate's control if any step fails. */
export function releaseHandheld(): ReleaseResult {
  if (!Handheld?.isDeviceOwner()) return { released: false, problems: ['not-device-owner'] };
  const problems = Handheld.release();
  if (problems.length > 0) return { released: false, problems };
  current = { kind: 'not-managed' };
  return { released: true };
}
