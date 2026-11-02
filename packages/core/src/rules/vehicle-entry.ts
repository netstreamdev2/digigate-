import { isExpired } from './dates';
import { finalise, hit } from './hits';
import type { GateState, RuleConfig, RuleHit, VehicleEntryScan } from './types';
import { findCloneOnSite, hasHistoryConflict, samePlate, sameVehicle, sameVin, vehicleVisits } from './vehicles';

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
  const alreadyInside = vehicleVisits(state.openVisits).find((visit) => sameVehicle(visit.vehicle, disc));
  if (alreadyInside && alreadyInside !== clone) {
    hits.push(hit('DUPLICATE_ENTRY', alreadyInside.id));
  }

  // Nobody can drive in while they're inside. Already here on foot, or as the driver of another car still on site,
  // means they left without being scanned out, or someone else is using their licence.
  const driverInside = state.openVisits.find((visit) =>
    visit.kind === 'pedestrian' ? visit.personKey === driver.personKey : visit.driverKey === driver.personKey && !sameVehicle(visit.vehicle, disc),
  );
  if (driverInside) {
    hits.push(hit('DRIVER_ALREADY_ON_SITE', driverInside.id));
  }

  // A car entered by hand has no disc expiry to check.
  if (disc.expiresOn !== '' && isExpired(disc.expiresOn, scan.at, config.utcOffsetMinutes)) {
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
