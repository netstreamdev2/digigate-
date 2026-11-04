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

import { getValue, removeValue, setValue } from './kv';
import { appendEvent } from './outbox';
import { loadHotlist } from './watch-lists';

const GENERATION_KEY = 'site-visits:generation';
/** How long a visit this device ended stays hidden from the server's list, which can lag by a sync or two. */
const CLOSED_KEPT_MS = 24 * 60 * 60_000;

/** A visit at the site as the server lists it. Vehicles entered by hand have no VIN, disc number or expiry. */
export type SiteVisit = {
  id: string;
  kind: 'vehicle' | 'pedestrian';
  personKey: string;
  personName: string;
  visitType: string;
  enteredAt: number;
  occupants: number | null;
  vin: string | null;
  plate: string | null;
  discNumber: string | null;
  discExpiresOn: string | null;
  vehicleDescription: string | null;
};

type VisitRow = {
  id: string;
  kind: 'vehicle' | 'pedestrian';
  person_key: string;
  co_driver_keys: string;
  vin: string | null;
  plate: string | null;
  disc_number: string | null;
  disc_expires_on: string | null;
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
  if (row.plate === null || row.occupants === null) {
    throw new DamagedVisit('A stored vehicle visit has no vehicle');
  }
  return {
    id: row.id,
    kind: 'vehicle',
    driverKey: row.person_key,
    coDriverKeys: coDriverKeys(row.co_driver_keys),
    vehicle: { vin: row.vin ?? '', plate: row.plate, discNumber: row.disc_number ?? '' },
    ...(row.disc_expires_on ? { discExpiresOn: row.disc_expires_on } : {}),
    occupants: row.occupants,
    visitType: row.visit_type,
    enteredAt: row.entered_at,
  };
}

/**
 * Everything the rules read: every open visit on site and, for a vehicle, the past sightings of its VIN or plate.
 * Registered people arrive with staff enrolment; until then nobody is registered.
 */
/**
 * Every open visit at the site: this device's own, then the other gates' from the last sync. Each query reads one whole
 * generation, so a sync landing between them can't leave a visit half there.
 */
async function siteRows(db: SQLiteDatabase): Promise<VisitRow[]> {
  const own = await db.getAllAsync<VisitRow>('SELECT * FROM visits');
  const shared = await db.getAllAsync<VisitRow>(
    `SELECT id, kind, person_key, '[]' AS co_driver_keys, vin, plate, disc_number, disc_expires_on, occupants, visit_type, entered_at,
            person_name, vehicle_description
     FROM site_visits
     WHERE generation = (SELECT CAST(value AS INTEGER) FROM kv WHERE key = ?)
       AND id NOT IN (SELECT id FROM visits)
       AND id NOT IN (SELECT id FROM closed_visits)`,
    GENERATION_KEY,
  );
  return [...own, ...shared];
}

export async function loadGateState(
  db: SQLiteDatabase,
  vehicle: { vin: string; plate: string } | null,
  at: number,
): Promise<{ state: GateState; details: ReadonlyMap<string, VisitDetails>; hotlistNotes: ReadonlyMap<string, string> }> {
  const rows = await siteRows(db);
  const hotlist = await loadHotlist(db, at);
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
  return {
    state: { openVisits: rows.map(toOpenVisit), vehicleHistory: sightings, registeredPeople: new Map(), hotlist: hotlist.entries },
    details,
    hotlistNotes: hotlist.notes,
  };
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
  const rows = (await siteRows(db)).filter((row) => row.person_key === personKey).sort((a, b) => a.entered_at - b.entered_at);
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
        `INSERT INTO visits (id, kind, person_key, co_driver_keys, vin, plate, disc_number, disc_expires_on, occupants, visit_type, entered_at, person_name, vehicle_description)
         VALUES (?, 'vehicle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visit.id,
          visit.driverKey,
          JSON.stringify(visit.coDriverKeys),
          vin,
          plate,
          normaliseIdentifier(visit.vehicle.discNumber),
          visit.discExpiresOn ?? null,
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
      await db.runAsync('INSERT OR REPLACE INTO closed_visits (id, closed_at) VALUES (?, ?)', [change.close, event.occurredAt]);
    }
  });
}

/** Who is on site now, across every gate, for the home screen. */
export async function siteHeadcount(db: SQLiteDatabase): Promise<{ vehicles: number; people: number }> {
  const rows = await siteRows(db);
  const vehicles = rows.filter((row) => row.kind === 'vehicle');
  const onFoot = rows.length - vehicles.length;
  return { vehicles: vehicles.length, people: onFoot + vehicles.reduce((sum, row) => sum + (row.occupants ?? 1), 0) };
}

/**
 * Takes in the site's open visits from a sync. The new list goes in under a new generation, which only then becomes the
 * one read. A visit this device opened goes once the server no longer lists it, so it ended at another gate, unless the
 * device still has an event about it waiting to upload.
 */
export async function saveSiteVisits(db: SQLiteDatabase, visits: readonly SiteVisit[]): Promise<void> {
  const generation = Number((await getValue(db, GENERATION_KEY)) ?? '0') + 1;
  await db.withTransactionAsync(async () => {
    for (const visit of visits) {
      await db.runAsync(
        `INSERT OR REPLACE INTO site_visits (generation, id, kind, person_key, vin, plate, disc_number, disc_expires_on, occupants, visit_type,
           entered_at, person_name, vehicle_description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generation,
          visit.id,
          visit.kind,
          visit.personKey,
          visit.vin === null ? null : normaliseIdentifier(visit.vin),
          visit.plate === null ? null : normaliseIdentifier(visit.plate),
          visit.discNumber === null ? null : normaliseIdentifier(visit.discNumber),
          visit.discExpiresOn,
          visit.occupants,
          visit.visitType,
          visit.enteredAt,
          visit.personName,
          visit.vehicleDescription,
        ],
      );
    }
  });
  await setValue(db, GENERATION_KEY, String(generation));
  await db.runAsync('DELETE FROM site_visits WHERE generation < ?', generation);
  await db.runAsync('DELETE FROM closed_visits WHERE closed_at < ?', Date.now() - CLOSED_KEPT_MS);
  await db.runAsync(
    `DELETE FROM visits
     WHERE id NOT IN (SELECT id FROM site_visits WHERE generation = ?)
       AND id NOT IN (SELECT json_extract(payload, '$.visit_id') FROM outbox WHERE json_extract(payload, '$.visit_id') IS NOT NULL)`,
    generation,
  );
}

/** Visits from before a device was paired belong to no site, so pairing discards them with the outbox. */
export async function clearVisits(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM visits');
    await db.runAsync('DELETE FROM vehicle_sightings');
    await db.runAsync('DELETE FROM site_visits');
    await db.runAsync('DELETE FROM closed_visits');
    await removeValue(db, GENERATION_KEY);
  });
}
