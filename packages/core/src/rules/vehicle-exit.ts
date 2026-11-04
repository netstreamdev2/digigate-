import { finalise, hit } from './hits';
import { hotlistHit } from './hotlist';
import { isOverstay } from './overstay';
import type { GateState, OpenVehicleVisit, PersonKey, RuleConfig, RuleHit, VehicleExitScan } from './types';
import { discChangedSince, findCloneOnSite, samePlate, sameVehicle, vehicleVisits } from './vehicles';

export function evaluateVehicleExit(scan: VehicleExitScan, state: GateState, config: RuleConfig): RuleHit[] {
  const { disc } = scan;
  const hits: RuleHit[] = [];
  const visit = vehicleVisits(state.openVisits).find((candidate) => sameVehicle(candidate.vehicle, disc));

  // Added to the hotlist while the car was inside still stops it on the way out.
  const hotlisted = hotlistHit({ personKeys: [scan.driver.personKey], plates: [disc.plate, scan.typedPlate], vins: [disc.vin] }, state.hotlist);
  if (hotlisted) {
    hits.push(hotlisted);
  }

  if (!samePlate({ plate: scan.typedPlate }, disc)) {
    hits.push(hit('PLATE_DISC_MISMATCH'));
  }
  if (!visit) {
    hits.push(hit('NO_ENTRY_RECORD'));
  } else if (discChangedSince(visit, disc)) {
    hits.push(hit('DISC_CHANGED_ON_SITE', visit.id));
  }
  if (scan.ignitionRestart === 'failed') {
    hits.push(hit('IGNITION_RESTART_FAILED'));
  }
  if (scan.bootCheck === 'problem') {
    hits.push(hit('BOOT_CHECK_PROBLEM'));
  }

  const driverHit = checkDriver(scan.driver.personKey, visit, state);
  if (driverHit) {
    hits.push(driverHit);
  }

  const clone = findCloneOnSite(disc, state.openVisits, visit?.id);
  if (clone) {
    hits.push(hit('DISC_CLONE_ON_SITE', clone.id));
  }

  if (visit) {
    if (scan.occupants < visit.occupants) {
      hits.push(hit('OCCUPANT_COUNT_DROP', visit.id));
    }
    if (isOverstay(visit, scan.at, config)) {
      hits.push(hit('OVERSTAY', visit.id));
    }
  }

  return finalise(hits, config);
}

/** At most one driver rule fires, the most specific first. */
function checkDriver(personKey: PersonKey, visit: OpenVehicleVisit | undefined, state: GateState): RuleHit | undefined {
  if (visit && (visit.driverKey === personKey || visit.coDriverKeys.includes(personKey))) {
    return undefined;
  }

  const otherCar = vehicleVisits(state.openVisits).find(
    (candidate) => candidate.driverKey === personKey && candidate.id !== visit?.id,
  );
  if (otherCar) {
    return hit('DRIVER_VEHICLE_MISMATCH', otherCar.id);
  }

  const onFoot = state.openVisits.find((candidate) => candidate.kind === 'pedestrian' && candidate.personKey === personKey);
  if (onFoot) {
    return hit('WALKED_IN_DRIVING_OUT', onFoot.id);
  }

  // Without an entry record there's no entry driver to compare against; NO_ENTRY_RECORD already covers it.
  return visit ? hit('UNKNOWN_DRIVER', visit.id) : undefined;
}
