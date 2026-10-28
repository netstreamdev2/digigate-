import type { GateEvent, GateEventPayload, GateEventType } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

type OutboxRow = {
  id: string;
  type: GateEventType;
  occurred_at: number;
  gate_user_id: string | null;
  payload: string;
};

function isPayload(value: unknown): value is GateEventPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))
  );
}

function toEvent(row: OutboxRow): GateEvent {
  const payload: unknown = JSON.parse(row.payload);
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurred_at,
    gateUserId: row.gate_user_id,
    payload: isPayload(payload) ? payload : {},
  };
}

export async function appendEvent(db: SQLiteDatabase, event: GateEvent): Promise<void> {
  await db.runAsync('INSERT INTO outbox (id, type, occurred_at, gate_user_id, payload) VALUES (?, ?, ?, ?, ?)', [
    event.id,
    event.type,
    event.occurredAt,
    event.gateUserId,
    JSON.stringify(event.payload),
  ]);
}

/** Oldest first: UUIDv7 ids sort by creation time. */
export async function pendingEvents(db: SQLiteDatabase, limit: number): Promise<GateEvent[]> {
  const rows = await db.getAllAsync<OutboxRow>('SELECT * FROM outbox ORDER BY id LIMIT ?', limit);
  return rows.map(toEvent);
}

export async function countPendingEvents(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM outbox');
  return row?.count ?? 0;
}

/** Only after the server has acknowledged them. */
export async function removeEvents(db: SQLiteDatabase, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.runAsync(`DELETE FROM outbox WHERE id IN (${ids.map(() => '?').join(', ')})`, [...ids]);
}

/** Events from before a device was paired belong to no site, so pairing discards them. */
export async function clearOutbox(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM outbox');
}
