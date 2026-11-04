import { finalise, hit } from './hits';
import { hotlistHit } from './hotlist';
import type { GateState, PedestrianScan, RuleConfig, RuleHit } from './types';
import { vehicleVisits } from './vehicles';

const onFoot = (scan: PedestrianScan) => ({ personKeys: [scan.personKey], plates: [], vins: [] });

export function evaluatePedestrianEntry(scan: PedestrianScan, state: GateState, config: RuleConfig): RuleHit[] {
  const hits: RuleHit[] = [];
  const hotlisted = hotlistHit(onFoot(scan), state.hotlist);
  if (hotlisted) {
    hits.push(hotlisted);
  }
  const existing = state.openVisits.find((visit) =>
    visit.kind === 'pedestrian' ? visit.personKey === scan.personKey : visit.driverKey === scan.personKey,
  );
  if (existing) {
    hits.push(hit('PEDESTRIAN_DUPLICATE_ENTRY', existing.id));
  }
  return finalise(hits, config);
}

export function evaluatePedestrianExit(scan: PedestrianScan, state: GateState, config: RuleConfig): RuleHit[] {
  const hits: RuleHit[] = [];
  const hotlisted = hotlistHit(onFoot(scan), state.hotlist);
  if (hotlisted) {
    hits.push(hotlisted);
  }

  const walkedIn = state.openVisits.find((visit) => visit.kind === 'pedestrian' && visit.personKey === scan.personKey);
  if (walkedIn) {
    return finalise(hits, config);
  }

  const cars = vehicleVisits(state.openVisits);
  const droveIn = cars.find((visit) => visit.driverKey === scan.personKey);
  if (droveIn) {
    hits.push(hit('DRIVER_LEFT_ON_FOOT', droveIn.id));
    return finalise(hits, config);
  }

  // An authorised co-driver was scanned in with a car, so leaving on foot isn't unexplained.
  const cameInAsCoDriver = cars.some((visit) => visit.coDriverKeys.includes(scan.personKey));
  if (!cameInAsCoDriver) {
    hits.push(hit('PEDESTRIAN_NO_ENTRY'));
  }
  return finalise(hits, config);
}
