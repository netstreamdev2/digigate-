import type { SQLiteDatabase } from 'expo-sqlite';

import { newEventId } from '@/lib/ids';

import { appendEvent } from './outbox';

export type Shift = {
  id: string;
  gateUserId: string;
  /** A post code from site config. */
  post: string;
  /** A shift period code from site config. */
  period: string;
  startedAt: number;
};

export type ShiftEndReason = 'ended' | 'handover' | 'timed-out';

type ShiftRow = {
  id: string;
  gate_user_id: string;
  post: string;
  period: string;
  started_at: number;
};

/** The shift this device is on, whoever it belongs to. A device is only ever on one at a time. */
export async function openShift(db: SQLiteDatabase): Promise<Shift | null> {
  const row = await db.getFirstAsync<ShiftRow>(
    'SELECT id, gate_user_id, post, period, started_at FROM shifts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  return row ? { id: row.id, gateUserId: row.gate_user_id, post: row.post, period: row.period, startedAt: row.started_at } : null;
}

async function writeEnd(db: SQLiteDatabase, shift: Shift, at: number, reason: ShiftEndReason): Promise<void> {
  await db.runAsync('UPDATE shifts SET ended_at = ? WHERE id = ?', [at, shift.id]);
  await appendEvent(db, {
    id: newEventId(at),
    type: 'shift_end',
    occurredAt: at,
    gateUserId: shift.gateUserId,
    payload: { shift_id: shift.id, reason },
  });
}

export async function closeShift(db: SQLiteDatabase, shift: Shift, at: number, reason: ShiftEndReason): Promise<void> {
  await db.withTransactionAsync(() => writeEnd(db, shift, at, reason));
}

/** Puts a guard on duty, ending the shift of whoever the device was still on. */
export async function beginShift(db: SQLiteDatabase, shift: Shift): Promise<void> {
  await db.withTransactionAsync(async () => {
    const previous = await openShift(db);
    if (previous) await writeEnd(db, previous, shift.startedAt, 'handover');
    await db.runAsync('INSERT INTO shifts (id, gate_user_id, post, period, started_at) VALUES (?, ?, ?, ?, ?)', [
      shift.id,
      shift.gateUserId,
      shift.post,
      shift.period,
      shift.startedAt,
    ]);
    await appendEvent(db, {
      id: newEventId(shift.startedAt),
      type: 'shift_start',
      occurredAt: shift.startedAt,
      gateUserId: shift.gateUserId,
      payload: { shift_id: shift.id, post: shift.post, period: shift.period },
    });
  });
}
