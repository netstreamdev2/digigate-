import { RULE_SEVERITY, type RuleCode, type Severity } from './codes';
import type { Outcome, RuleConfig, RuleHit } from './types';

const SEVERITY_ORDER: Record<Severity, number> = { red: 0, amber: 1, info: 2 };

export function hit(code: RuleCode, relatedVisitId?: string): RuleHit {
  return relatedVisitId === undefined
    ? { code, severity: RULE_SEVERITY[code] }
    : { code, severity: RULE_SEVERITY[code], relatedVisitId };
}

/** Drops rules the site has switched off and puts the most severe hits first. */
export function finalise(hits: readonly RuleHit[], config: RuleConfig): RuleHit[] {
  return hits
    .filter((ruleHit) => !config.disabledRules.includes(ruleHit.code))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function outcomeOf(hits: readonly RuleHit[]): Outcome {
  if (hits.some((ruleHit) => ruleHit.severity === 'red')) return 'blocked';
  if (hits.some((ruleHit) => ruleHit.severity === 'amber')) return 'warning';
  return 'clear';
}
