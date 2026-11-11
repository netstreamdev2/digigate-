import type { EmergencyKind, GateEventPayload } from '@digigate/core';

/*
 * An emergency at the gate: the guard says what kind (ambulance, police, fire and rescue, ...) and the check goes on
 * as normal. Nobody comes in without their licence or ID scanned, emergency or not (the user's decision of
 * 2026-11-11): the guard asks them to wait for the scan. The kind travels with the check, and the control room is told.
 */

export const EMERGENCY_VISIT = 'emergency';

export type EmergencyChoice = { kind: EmergencyKind; note: string | null };

/** What the guard and the record call it: the kind, or for Other, the guard's words. */
export const emergencyName = ({ kind, note }: EmergencyChoice): string => (note ? `Emergency: ${note}` : kind.label);

export const emergencyPayload = ({ kind, note }: EmergencyChoice): GateEventPayload => ({ kind: kind.code, label: kind.label, note });
