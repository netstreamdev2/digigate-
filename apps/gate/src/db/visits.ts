import {
  normaliseIdentifier,
  type GateEvent,
  type GateState,
  type OpenPedestrianVisit,
  type OpenVehicleVisit,
  type OpenVisit,
  type VehicleSighting,
} from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { appendEvent } from './outbox';

type VisitRow = {
  id: string;
  kind: 'vehicle' | 'pedestrian';
  person_key: string;
  co_driver_keys: string;
  vin: string | null;
  plate: string | null;
  disc_number: string | null;
  occupants: number | null;
  visit_type: string;
  entered_at: number;
  person_name: string;
  vehicle_description: string | null;
};

/** What the guard's screen shows about an open visit, beyond what the rules read. */
export type VisitDetails = {
  personName: string;
  vehicleDescription: string | null;
  plate: string | null;
  enteredAt: number;
};

export type NewVehicleVisit = OpenVehicleVisit & { personName: string; vehicleDescription: string };

export type NewPedestrianVisit = OpenPedestrianVisit & { personName: string };

export type NewVisit = NewVehicleVisit | NewPedestrianVisit;

class DamagedVisit extends Error {}

function coDriverKeys(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((key) => typeof key === 'string')) throw new DamagedVisit('A stored visit is damaged');
  return parsed;
}

function toOpenVisit(row: VisitRow): OpenVisit {
  if (row.kind === 'pedestrian') {
    return { id: row.id, kind: 'pedestrian', personKey: row.person_key, visitType: row.visit_type, enteredAt: row.entered_at };
  }
  if (row.vin === null || row.plate === null || row.disc_number === null || row.occupants === null) {
    throw new DamagedVisit('A stored vehicle visit has no vehicle');
  }
  return {
    id: row.id,
    kind: 'vehicle',
    driverKey: row.person_key,
    coDriverKeys: coDriverKeys(row.co_driver_keys),
    vehicle: { vin: row.vin, plate: row.plate, discNumber: row.disc_number },
    occupants: row.occupants,
    visitType: row.visit_type,
    enteredAt: row.entered_at,
  };
}

/**
 * Everything the rules read: every open visit on site and, for a vehicle, the past sightings of its VIN or plate.
 * Registered people arrive with staff enrolment; until then nobody is registered.
 */
export async function loadGateState(
  db: SQLiteDatabase,
  vehicle: { vin: string; plate: string } | null,
): Promise<{ state: GateState; details: ReadonlyMap<string, VisitDetails> }> {
  const rows = await db.getAllAsync<VisitRow>('SELECT * FROM visits');
  const sightings = vehicle
    ? await db.getAllAsync<VehicleSighting>('SELECT vin, plate FROM vehicle_sightings WHERE vin = ? OR plate = ?', [
        normaliseIdentifier(vehicle.vin),
        normaliseIdentifier(vehicle.plate),
      ])
    : [];
  const details = new Map<string, VisitDetails>(
    rows.map((row) => [
      row.id,
      { personName: row.person_name, vehicleDescription: row.vehicle_description, plate: row.plate, enteredAt: row.entered_at },
    ]),
  );
  return { state: { openVisits: rows.map(toOpenVisit), vehicleHistory: sightings, registeredPeople: new Map() }, details };
}

/** One of a person's open visits, as the guard's screen shows it. */
export type PersonVisit = {
  id: string;
  kind: 'vehicle' | 'pedestrian';
  visitType: string;
  enteredAt: number;
  vehicleDescription: string | null;
  plate: string | null;
};

/** The person's open visits: on foot, or as the driver of a car still inside. Oldest first. */
export async function openVisitsForPerson(db: SQLiteDatabase, personKey: string): Promise<PersonVisit[]> {
  const rows = await db.getAllAsync<VisitRow>('SELECT * FROM visits WHERE person_key = ? ORDER BY entered_at', personKey);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    visitType: row.visit_type,
    enteredAt: row.entered_at,
    vehicleDescription: row.vehicle_description,
    plate: row.plate,
  }));
}

export type VisitChange = { open: NewVisit } | { close: string } | null;

/**
 * Writes an event and the visit change it causes in one transaction, before the guard sees the result. A vehicle
 * visit that opens also records the plate and VIN as seen together.
 */
export async function commitGateEvent(db: SQLiteDatabase, event: GateEvent, change: VisitChange): Promise<void> {
  await db.withTransactionAsync(async () => {
    await appendEvent(db, event);
    if (change && 'open' in change && change.open.kind === 'pedestrian') {
      const visit = change.open;
      await db.runAsync(
        `INSERT INTO visits (id, kind, person_key, co_driver_keys, visit_type, entered_at, person_name)
         VALUES (?, 'pedestrian', ?, '[]', ?, ?, ?)`,
        [visit.id, visit.personKey, visit.visitType, visit.enteredAt, visit.personName],
      );
    } else if (change && 'open' in change && change.open.kind === 'vehicle') {
      const visit = change.open;
      const vin = normaliseIdentifier(visit.vehicle.vin);
      const plate = normaliseIdentifier(visit.vehicle.plate);
      await db.runAsync(
        `INSERT INTO visits (id, kind, person_key, co_driver_keys, vin, plate, disc_number, occupants, visit_type, entered_at, person_name, vehicle_description)
         VALUES (?, 'vehicle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visit.id,
          visit.driverKey,
          JSON.stringify(visit.coDriverKeys),
          vin,
          plate,
          normaliseIdentifier(visit.vehicle.discNumber),
          visit.occupants,
          visit.visitType,
          visit.enteredAt,
          visit.personName,
          visit.vehicleDescription,
        ],
      );
      await db.runAsync(
        `INSERT INTO vehicle_sightings (vin, plate, last_seen_at) VALUES (?, ?, ?)
         ON CONFLICT (vin, plate) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
        [vin, plate, visit.enteredAt],
      );
    } else if (change && 'close' in change) {
      await db.runAsync('DELETE FROM visits WHERE id = ?', change.close);
    }
  });
}

/** Visits from before a device was paired belong to no site, so pairing discards them with the outbox. */
export async function clearVisits(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM visits');
    await db.runAsync('DELETE FROM vehicle_sightings');
  });
}
