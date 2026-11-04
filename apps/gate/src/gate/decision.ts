import { expectedVisitorFor, type GateEvent, type GateEventPayload, type PersonKey, type RuleHit } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { commitGateEvent, type NewVisit } from '@/db/visits';
import { loadBookings, type SyncedBooking } from '@/db/watch-lists';
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
  /** What the company asked the guard to do, for each hotlist entry a hit points at. */
  hotlistNotes: ReadonlyMap<string, string>;
  /** Entry only: the booking that expects this person or car. */
  expected: SyncedBooking | null;
};

/** The hits as the event records them, each with what it points at. */
export function hitsPayload(hits: readonly RuleHit[]): GateEventPayload[] {
  return hits.map((ruleHit) => ({
    code: ruleHit.code,
    severity: ruleHit.severity,
    related_visit_id: ruleHit.relatedVisitId ?? null,
    hotlist_entry_id: ruleHit.hotlistEntryId ?? null,
  }));
}

/** The notes behind the hotlist hits, and nothing else from the list. */
export function notesFor(hits: readonly RuleHit[], notes: ReadonlyMap<string, string>): ReadonlyMap<string, string> {
  const shown = new Map<string, string>();
  for (const ruleHit of hits) {
    const note = ruleHit.hotlistEntryId ? notes.get(ruleHit.hotlistEntryId) : undefined;
    if (ruleHit.hotlistEntryId && note) shown.set(ruleHit.hotlistEntryId, note);
  }
  return shown;
}

/** The booking expecting someone arriving now, by their key or a plate. Nobody is expected on the way out. */
export async function bookingFor(db: SQLiteDatabase, at: number, personKey: PersonKey, plates: readonly string[]): Promise<SyncedBooking | null> {
  const bookings = await loadBookings(db, at);
  const match = expectedVisitorFor({ personKey, plates }, at, bookings);
  return bookings.find((booking) => booking.id === match?.id) ?? null;
}

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
