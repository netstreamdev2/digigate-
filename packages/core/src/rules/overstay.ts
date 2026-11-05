import { minutesBetween } from './dates';
import { finalise, hit } from './hits';
import type { EpochMs, GateState, OpenVisit, RuleConfig, RuleHit } from './types';

/** How long a visit may last: the stay the guard recorded at entry, else the site's limit for its visit type. */
export function stayLimitMinutes(visit: OpenVisit, config: RuleConfig): number | null {
  if (visit.expectedStayMinutes !== undefined) return visit.expectedStayMinutes;
  return config.overstayLimitMinutes[visit.visitType] ?? null;
}

export function isOverstay(visit: OpenVisit, at: EpochMs, config: RuleConfig): boolean {
  const limit = stayLimitMinutes(visit, config);
  return limit !== null && minutesBetween(visit.enteredAt, at) > limit;
}

/** Every open visit past its limit, for the periodic sweep that feeds alerts. */
export function findOverstays(state: GateState, now: EpochMs, config: RuleConfig): RuleHit[] {
  const hits = state.openVisits.filter((visit) => isOverstay(visit, now, config)).map((visit) => hit('OVERSTAY', visit.id));
  return finalise(hits, config);
}
