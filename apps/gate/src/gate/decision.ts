import type { GateEvent, RuleHit } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { commitGateEvent, type NewVisit } from '@/db/visits';
import { newEventId } from '@/lib/ids';

export type Direction = 'entry' | 'exit';

/** What a decision needs from any check at the gate, on wheels or on foot. */
export type GateCheck = {
  direction: Direction;
  event: GateEvent;
  hits: RuleHit[];
  /** Entry: the visit that opens once they're let in. Exit: the open visit that closes, if there is one. */
  visitId: string | null;
  /** Kept for a let-through after a warning or override, which opens the visit then. */
  pendingVisit: NewVisit | null;
};

export type Decision =
  | { kind: 'acknowledged' }
  | { kind: 'override'; supervisorId: string; reason: string }
  | { kind: 'turned-away' };

/**
 * Records what the guard did after a warning or a block. Letting them through opens the visit on entry, or closes
 * it on exit, in the same transaction as the event.
 */
export async function recordDecision(db: SQLiteDatabase, checked: GateCheck, decision: Decision, guardId: string): Promise<void> {
  const at = Date.now();
  const codes = checked.hits.map((ruleHit) => ruleHit.code);
  const base = { check_event_id: checked.event.id, visit_id: checked.visitId, direction: checked.direction, codes };
  const event: GateEvent =
    decision.kind === 'acknowledged'
      ? { id: newEventId(at), type: 'alert_ack', occurredAt: at, gateUserId: guardId, payload: base }
      : decision.kind === 'override'
        ? {
            id: newEventId(at),
            type: 'override',
            occurredAt: at,
            gateUserId: guardId,
            payload: { ...base, supervisor_id: decision.supervisorId, reason: decision.reason },
          }
        : { id: newEventId(at), type: 'turned_away', occurredAt: at, gateUserId: guardId, payload: base };

  const change =
    decision.kind === 'turned-away'
      ? null
      : checked.pendingVisit
        ? { open: checked.pendingVisit }
        : checked.visitId
          ? { close: checked.visitId }
          : null;
  await commitGateEvent(db, event, change);
}
