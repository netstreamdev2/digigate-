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
  /** When a guard who said they were stepping away is due back. */
  awayUntil: number | null;
};

/** The photo a guard took going on duty, or that they couldn't: a gate is never left unstaffed for want of a camera. */
export type ShiftPhoto = { status: 'taken'; jpegBase64: string } | { status: 'skipped' };

export type PendingSelfie = { shiftId: string; jpegBase64: string };

export type ShiftEndReason = 'ended' | 'handover' | 'timed-out';

type ShiftRow = {
  id: string;
  gate_user_id: string;
  post: string;
  period: string;
  started_at: number;
  away_until: number | null;
};

/** The shift this device is on, whoever it belongs to. A device is only ever on one at a time. */
export async function openShift(db: SQLiteDatabase): Promise<Shift | null> {
  const row = await db.getFirstAsync<ShiftRow>(
    'SELECT id, gate_user_id, post, period, started_at, away_until FROM shifts WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
  );
  return row
    ? { id: row.id, gateUserId: row.gate_user_id, post: row.post, period: row.period, startedAt: row.started_at, awayUntil: row.away_until }
    : null;
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

export async function clearShifts(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM shifts');
}

/** Puts a guard on duty, ending the shift of whoever the device was still on. The photo commits with the shift itself. */
export async function beginShift(db: SQLiteDatabase, shift: Shift, photo: ShiftPhoto): Promise<void> {
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
      payload: { shift_id: shift.id, post: shift.post, period: shift.period, selfie: photo.status },
    });
    if (photo.status === 'taken') {
      await db.runAsync('INSERT INTO shift_selfies (shift_id, taken_at, jpeg_base64) VALUES (?, ?, ?)', [shift.id, shift.startedAt, photo.jpegBase64]);
    }
  });
}

/** Records why a guard is leaving their post and when they're due back. */
export async function recordSteppingAway(db: SQLiteDatabase, shift: Shift, reason: string, minutes: number, at: number): Promise<number> {
  const until = at + minutes * 60_000;
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE shifts SET away_until = ? WHERE id = ?', [until, shift.id]);
    await appendEvent(db, {
      id: newEventId(at),
      type: 'stepping_away',
      occurredAt: at,
      gateUserId: shift.gateUserId,
      payload: { shift_id: shift.id, post: shift.post, reason, minutes },
    });
  });
  return until;
}

export async function recordBackAtPost(db: SQLiteDatabase, shift: Shift, at: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE shifts SET away_until = NULL WHERE id = ?', [shift.id]);
    await appendEvent(db, {
      id: newEventId(at),
      type: 'returned_to_post',
      occurredAt: at,
      gateUserId: shift.gateUserId,
      payload: { shift_id: shift.id, post: shift.post },
    });
  });
}

/** The oldest photo the server doesn't have yet. */
export async function pendingSelfie(db: SQLiteDatabase): Promise<PendingSelfie | null> {
  const row = await db.getFirstAsync<{ shift_id: string; jpeg_base64: string }>('SELECT shift_id, jpeg_base64 FROM shift_selfies ORDER BY taken_at LIMIT 1');
  return row ? { shiftId: row.shift_id, jpegBase64: row.jpeg_base64 } : null;
}

/** Only once the server has answered for it. */
export async function removeSelfie(db: SQLiteDatabase, shiftId: string): Promise<void> {
  await db.runAsync('DELETE FROM shift_selfies WHERE shift_id = ?', [shiftId]);
}
