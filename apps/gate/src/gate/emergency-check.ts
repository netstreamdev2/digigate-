import { normaliseIdentifier, type EmergencyKind, type GateEvent, type GateEventPayload } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { commitGateEvent, loadGateState, type NewVehicleVisit } from '@/db/visits';
import { newEventId } from '@/lib/ids';

/*
 * Emergencies are let in first and recorded after: an ambulance on a call doesn't wait for a licence scan. The guard
 * picks the kind and, if they can, the plate, and the visit opens with no driver. No rules run on the way in, so
 * nothing can hold the boom; the control room is told of every one. On the way out the guard picks it from the
 * emergency vehicles on site, or scans it like any car: with no entry driver to compare, UNKNOWN_DRIVER stays quiet.
 */

const EMERGENCY = 'emergency';

export type EmergencyEntry = {
  kind: EmergencyKind;
  /** The guard's own words, for Other. */
  note: string | null;
  /** As typed or read off a photo; empty when there was no time. */
  plate: string;
  plateEntry: GateEventPayload;
  guardId: string;
};

/** What the guard and the record call it: the kind, or for Other, the guard's words. */
export const emergencyName = (kind: EmergencyKind, note: string | null): string => (note ? `Emergency: ${note}` : kind.label);

function emergencyVehicle(plate: string): GateEventPayload {
  return { vin: null, plate, disc_number: null, make: null, model: null, colour: null, disc_expires_on: null, manual: true };
}

export async function letEmergencyIn(db: SQLiteDatabase, entry: EmergencyEntry): Promise<GateEvent> {
  const at = Date.now();
  const name = emergencyName(entry.kind, entry.note);
  const visit: NewVehicleVisit = {
    id: newEventId(at),
    kind: 'vehicle',
    driverKey: null,
    coDriverKeys: [],
    vehicle: { vin: '', plate: entry.plate, discNumber: '' },
    occupants: 1,
    visitType: EMERGENCY,
    enteredAt: at,
    expectedStayMinutes: null,
    personName: name,
    vehicleDescription: name,
  };
  const event: GateEvent = {
    id: newEventId(at),
    type: 'vehicle_entry',
    occurredAt: at,
    gateUserId: entry.guardId,
    payload: {
      visit_id: visit.id,
      outcome: 'clear',
      hits: [],
      vehicle: emergencyVehicle(entry.plate),
      typed_plate: entry.plate,
      plate_entry: entry.plateEntry,
      driver: null,
      occupants: 1,
      expected_stay_minutes: null,
      exit_checks: null,
      visit_type: EMERGENCY,
      expected_visitor_id: null,
      emergency: { kind: entry.kind.code, label: entry.kind.label, note: entry.note },
    },
  };
  await commitGateEvent(db, event, { open: visit });
  return event;
}

/** An emergency vehicle on site, at this gate or another, for the guard to let out with one tap. */
export type EmergencyOnSite = { visitId: string; name: string; plate: string; enteredAt: number };

export async function emergenciesOnSite(db: SQLiteDatabase, at: number): Promise<EmergencyOnSite[]> {
  const { state, details } = await loadGateState(db, null, at);
  return state.openVisits
    .filter((visit) => visit.kind === 'vehicle' && visit.visitType === EMERGENCY)
    .map((visit) => {
      const shown = details.get(visit.id);
      return { visitId: visit.id, name: shown?.personName ?? 'Emergency vehicle', plate: shown?.plate ?? '', enteredAt: visit.enteredAt };
    })
    .sort((a, b) => b.enteredAt - a.enteredAt);
}

export async function letEmergencyOut(db: SQLiteDatabase, vehicle: EmergencyOnSite, guardId: string): Promise<GateEvent> {
  const at = Date.now();
  const event: GateEvent = {
    id: newEventId(at),
    type: 'vehicle_exit',
    occurredAt: at,
    gateUserId: guardId,
    payload: {
      visit_id: vehicle.visitId,
      outcome: 'clear',
      hits: [],
      vehicle: emergencyVehicle(normaliseIdentifier(vehicle.plate)),
      typed_plate: vehicle.plate,
      driver: null,
      occupants: 1,
      exit_checks: null,
      visit_type: EMERGENCY,
      emergency: { label: vehicle.name },
    },
  };
  await commitGateEvent(db, event, { close: vehicle.visitId });
  return event;
}
