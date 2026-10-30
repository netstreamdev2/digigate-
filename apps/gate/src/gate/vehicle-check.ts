import {
  englishPart,
  evaluateVehicleEntry,
  evaluateVehicleExit,
  outcomeOf,
  sameVin,
  vehicleVisits,
  type DriverLicence,
  type GateEvent,
  type BootCheck,
  type GateEventPayload,
  type IgnitionRestart,
  type Outcome,
  type ParsedLicenceDisc,
  type RuleHit,
} from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { commitGateEvent, loadGateState, type NewVehicleVisit, type VisitDetails } from '@/db/visits';
import { newEventId } from '@/lib/ids';
import { personKeyFor } from '@/lib/person-key';
import { siteConfig } from '@/site/site-config';

import type { GateCheck } from './decision';
import { demographicsPayload } from './demographics';

export type VehicleDocuments = { disc: ParsedLicenceDisc; licence: DriverLicence };

/** Which way the car is going. Only an exit has the checks at the car. */
export type Passage = { direction: 'entry' } | { direction: 'exit'; ignitionRestart: IgnitionRestart; bootCheck: BootCheck };

export type CheckInput = VehicleDocuments & Passage & {
  /** The plate the guard read off the car. */
  typedPlate: string;
  occupants: number;
  /** Entry only: exits keep the visit's own type. */
  visitType: string;
  guardId: string;
};

/** A checked vehicle: what the rules found, already written to the device's records. */
export type CheckedVehicle = GateCheck & {
  outcome: Outcome;
  /** Open visits the hits point at, for the guard's explanation. */
  related: ReadonlyMap<string, VisitDetails>;
};

function vehiclePayload(disc: ParsedLicenceDisc): GateEventPayload {
  return {
    vin: disc.vin,
    plate: disc.plate,
    disc_number: disc.discNumber,
    register_number: disc.registerNumber,
    make: disc.make,
    model: disc.model,
    colour: englishPart(disc.colour),
    disc_expires_on: disc.expiresOn,
  };
}

// Until the lawyer settles how ID numbers and photos are kept, events carry the keyed hash and the printed name only.
function driverPayload(licence: DriverLicence, personKey: string, at: number): GateEventPayload {
  return {
    person_key: personKey,
    initials: licence.initials,
    surname: licence.surname,
    licence_expires_on: licence.expiresOn,
    vehicle_codes: licence.vehicleCodes,
    demographics: demographicsPayload(licence.gender, licence.birthDate, at),
  };
}

function hitsPayload(hits: readonly RuleHit[]) {
  return hits.map((ruleHit) => ({ code: ruleHit.code, severity: ruleHit.severity, related_visit_id: ruleHit.relatedVisitId ?? null }));
}

/**
 * Runs the rules for a vehicle at the entry or exit and writes the result before it is shown. A clear entry opens
 * its visit and a clear exit closes it in the same transaction; anything else waits for the guard's decision.
 */
export async function checkVehicle(db: SQLiteDatabase, input: CheckInput): Promise<CheckedVehicle> {
  const { disc, licence, direction } = input;
  const at = Date.now();
  const personKey = await personKeyFor(licence.idNumberType, licence.idNumber);
  const { state, details } = await loadGateState(db, disc);
  const driver = licence.expiresOn ? { personKey, licenceExpiresOn: licence.expiresOn } : { personKey };
  const vehicle = { vin: disc.vin, plate: disc.plate, discNumber: disc.discNumber, expiresOn: disc.expiresOn };

  const hits =
    input.direction === 'entry'
      ? evaluateVehicleEntry({ at, driver, disc: vehicle, typedPlate: input.typedPlate }, state, siteConfig.rules)
      : evaluateVehicleExit(
          {
            at,
            driver,
            disc: vehicle,
            typedPlate: input.typedPlate,
            occupants: input.occupants,
            ignitionRestart: input.ignitionRestart,
            bootCheck: input.bootCheck,
          },
          state,
          siteConfig.rules,
        );
  const outcome = outcomeOf(hits);

  const openVisit = direction === 'exit' ? vehicleVisits(state.openVisits).find((visit) => sameVin(visit.vehicle, disc)) : undefined;
  const pendingVisit: NewVehicleVisit | null =
    direction === 'entry'
      ? {
          id: newEventId(at),
          kind: 'vehicle',
          driverKey: personKey,
          coDriverKeys: [],
          vehicle: { vin: disc.vin, plate: disc.plate, discNumber: disc.discNumber },
          occupants: input.occupants,
          visitType: input.visitType,
          enteredAt: at,
          personName: `${licence.initials} ${licence.surname}`,
          vehicleDescription: `${disc.make} ${disc.model} · ${englishPart(disc.colour)}`,
        }
      : null;
  const visitId = pendingVisit?.id ?? openVisit?.id ?? null;

  const event: GateEvent = {
    id: newEventId(at),
    type: direction === 'entry' ? 'vehicle_entry' : 'vehicle_exit',
    occurredAt: at,
    gateUserId: input.guardId,
    payload: {
      visit_id: visitId,
      outcome,
      hits: hitsPayload(hits),
      vehicle: vehiclePayload(disc),
      typed_plate: input.typedPlate,
      driver: driverPayload(licence, personKey, at),
      occupants: input.occupants,
      exit_checks: input.direction === 'exit' ? { ignition_restart: input.ignitionRestart, boot_check: input.bootCheck } : null,
      visit_type: direction === 'entry' ? input.visitType : (openVisit?.visitType ?? null),
    },
  };

  const change = outcome !== 'clear' ? null : pendingVisit ? { open: pendingVisit } : openVisit ? { close: openVisit.id } : null;
  await commitGateEvent(db, event, change);

  const related = new Map<string, VisitDetails>();
  for (const ruleHit of hits) {
    const visitDetails = ruleHit.relatedVisitId ? details.get(ruleHit.relatedVisitId) : undefined;
    if (ruleHit.relatedVisitId && visitDetails) related.set(ruleHit.relatedVisitId, visitDetails);
  }
  if (openVisit) {
    const own = details.get(openVisit.id);
    if (own) related.set(openVisit.id, own);
  }

  return { direction, event, hits, outcome, visitId, pendingVisit, related };
}
