import { minutesBetween } from './dates';
import { finalise, hit } from './hits';
import type { EpochMs, GateState, OpenVisit, RuleConfig, RuleHit } from './types';

export function isOverstay(visit: OpenVisit, at: EpochMs, config: RuleConfig): boolean {
  const limit = config.overstayLimitMinutes[visit.visitType];
  return limit !== undefined && minutesBetween(visit.enteredAt, at) > limit;
}

/** Every open visit past its limit, for the periodic sweep that feeds alerts. */
export function findOverstays(state: GateState, now: EpochMs, config: RuleConfig): RuleHit[] {
  const hits = state.openVisits.filter((visit) => isOverstay(visit, now, config)).map((visit) => hit('OVERSTAY', visit.id));
  return finalise(hits, config);
}
