import { finalise, hit } from './hits';
import type { GateState, PedestrianScan, RuleConfig, RuleHit } from './types';
import { vehicleVisits } from './vehicles';

export function evaluatePedestrianEntry(scan: PedestrianScan, state: GateState, config: RuleConfig): RuleHit[] {
  const existing = state.openVisits.find((visit) =>
    visit.kind === 'pedestrian' ? visit.personKey === scan.personKey : visit.driverKey === scan.personKey,
  );
  return finalise(existing ? [hit('PEDESTRIAN_DUPLICATE_ENTRY', existing.id)] : [], config);
}

export function evaluatePedestrianExit(scan: PedestrianScan, state: GateState, config: RuleConfig): RuleHit[] {
  const onFoot = state.openVisits.find((visit) => visit.kind === 'pedestrian' && visit.personKey === scan.personKey);
  if (onFoot) {
    return [];
  }

  const cars = vehicleVisits(state.openVisits);
  const droveIn = cars.find((visit) => visit.driverKey === scan.personKey);
  if (droveIn) {
    return finalise([hit('DRIVER_LEFT_ON_FOOT', droveIn.id)], config);
  }

  // An authorised co-driver was scanned in with a car, so leaving on foot isn't unexplained.
  const cameInAsCoDriver = cars.some((visit) => visit.coDriverKeys.includes(scan.personKey));
  return finalise(cameInAsCoDriver ? [] : [hit('PEDESTRIAN_NO_ENTRY')], config);
}
