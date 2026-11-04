import {
  englishPart,
  evaluateVehicleEntry,
  evaluateVehicleExit,
  outcomeOf,
  sameVehicle,
  vehicleVisits,
  type DriverLicence,
  type GateEvent,
  type BootCheck,
  type GateEventPayload,
  type IgnitionRestart,
  type LicenceDisc,
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
import { typedPersonPayload, type TypedPerson } from './typed-identity';

export type VehicleDocuments = { disc: ParsedLicenceDisc; licence: DriverLicence };

/**
 * The car and its driver as the rules and the record see them: scanned off the disc and licence, or typed in by the
 * guard. A typed car has no VIN, disc number or expiry: they're left empty, never guessed, and the rules match it by plate.
 */
export type CheckSubject = {
  idType: string;
  idNumber: string;
  personName: string;
  licenceExpiresOn: string | null;
  vehicle: LicenceDisc;
  vehicleDescription: string;
  vehiclePayload: GateEventPayload;
  driverPayload: (personKey: string, at: number) => GateEventPayload;
};

/** A car typed in by the guard: the plate always, the make, model and colour when they can tell. */
export type TypedCar = { plate: string; makeAndModel: string; colour: string };

/** Which way the car is going. Only an exit has the checks at the car. */
export type Passage = { direction: 'entry' } | { direction: 'exit'; ignitionRestart: IgnitionRestart; bootCheck: BootCheck };

export type CheckInput = Passage & {
  subject: CheckSubject;
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
    // The body type in the disc's own words, shown to the control room. Not personal information.
    description: disc.description,
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

export function scannedSubject({ disc, licence }: VehicleDocuments): CheckSubject {
  return {
    idType: licence.idNumberType,
    idNumber: licence.idNumber,
    personName: `${licence.initials} ${licence.surname}`,
    licenceExpiresOn: licence.expiresOn,
    vehicle: { vin: disc.vin, plate: disc.plate, discNumber: disc.discNumber, expiresOn: disc.expiresOn },
    vehicleDescription: `${disc.make} ${disc.model} · ${englishPart(disc.colour)}`,
    vehiclePayload: vehiclePayload(disc),
    driverPayload: (personKey, at) => driverPayload(licence, personKey, at),
  };
}

export function typedSubject(car: TypedCar, driver: TypedPerson, reason: string): CheckSubject {
  return {
    idType: driver.idType,
    idNumber: driver.idNumber,
    personName: `${driver.names} ${driver.surname}`,
    licenceExpiresOn: null,
    vehicle: { vin: '', plate: car.plate, discNumber: '', expiresOn: '' },
    vehicleDescription: [car.makeAndModel || 'Make not given', car.colour].filter(Boolean).join(' · '),
    vehiclePayload: { vin: null, plate: car.plate, disc_number: null, make: car.makeAndModel || null, model: null, colour: car.colour || null, disc_expires_on: null, manual: true },
    driverPayload: (personKey, at) => typedPersonPayload(driver, personKey, reason, at),
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
  const { subject, direction } = input;
  const at = Date.now();
  const personKey = await personKeyFor(subject.idType, subject.idNumber);
  const { vehicle } = subject;
  const { state, details } = await loadGateState(db, vehicle);
  const driver = subject.licenceExpiresOn ? { personKey, licenceExpiresOn: subject.licenceExpiresOn } : { personKey };

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

  const openVisit = direction === 'exit' ? vehicleVisits(state.openVisits).find((visit) => sameVehicle(visit.vehicle, vehicle)) : undefined;
  const pendingVisit: NewVehicleVisit | null =
    direction === 'entry'
      ? {
          id: newEventId(at),
          kind: 'vehicle',
          driverKey: personKey,
          coDriverKeys: [],
          vehicle: { vin: vehicle.vin, plate: vehicle.plate, discNumber: vehicle.discNumber },
          ...(vehicle.expiresOn ? { discExpiresOn: vehicle.expiresOn } : {}),
          occupants: input.occupants,
          visitType: input.visitType,
          enteredAt: at,
          personName: subject.personName,
          vehicleDescription: subject.vehicleDescription,
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
      vehicle: subject.vehiclePayload,
      typed_plate: input.typedPlate,
      driver: subject.driverPayload(personKey, at),
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
