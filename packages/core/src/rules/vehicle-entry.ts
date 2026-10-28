import { isExpired } from './dates';
import { finalise, hit } from './hits';
import type { GateState, RuleConfig, RuleHit, VehicleEntryScan } from './types';
import { findCloneOnSite, hasHistoryConflict, samePlate, sameVin, vehicleVisits } from './vehicles';

export function evaluateVehicleEntry(scan: VehicleEntryScan, state: GateState, config: RuleConfig): RuleHit[] {
  const { disc, driver } = scan;
  const hits: RuleHit[] = [];

  if (!samePlate({ plate: scan.typedPlate }, disc)) {
    hits.push(hit('PLATE_DISC_MISMATCH'));
  }

  const clone = findCloneOnSite(disc, state.openVisits);
  if (clone) {
    hits.push(hit('DISC_CLONE_ON_SITE', clone.id));
  } else if (hasHistoryConflict(disc, state.vehicleHistory)) {
    hits.push(hit('PLATE_VIN_HISTORY_CONFLICT'));
  }

  // A visit already flagged as a clone of this car isn't also reported as the same car entering twice.
  const alreadyInside = vehicleVisits(state.openVisits).find((visit) => sameVin(visit.vehicle, disc));
  if (alreadyInside && alreadyInside !== clone) {
    hits.push(hit('DUPLICATE_ENTRY', alreadyInside.id));
  }

  if (isExpired(disc.expiresOn, scan.at, config.utcOffsetMinutes)) {
    hits.push(hit('DISC_EXPIRED'));
  }
  if (driver.licenceExpiresOn !== undefined && isExpired(driver.licenceExpiresOn, scan.at, config.utcOffsetMinutes)) {
    hits.push(hit('LICENCE_EXPIRED'));
  }

  const registered = state.registeredPeople.get(driver.personKey);
  if (registered?.status === 'approved' && !registered.knownVins.some((vin) => sameVin({ vin }, disc))) {
    hits.push(hit('UNFAMILIAR_VEHICLE'));
  }

  return finalise(hits, config);
}
