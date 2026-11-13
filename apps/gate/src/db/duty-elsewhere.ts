import type { SQLiteDatabase } from 'expo-sqlite';

import { getValue, removeValue, setValue } from './kv';
import { openShift } from './shifts';

/*
 * One guard, one handheld. Each sync brings the company's guards on duty on other handhelds, so this one won't put
 * them on duty again, and the shifts of this handheld that a supervisor moved elsewhere, so it signs the guard out.
 * The list is only as fresh as the last sync: two handhelds offline can't see each other, and then the server raises
 * GUARD_ON_TWO_DEVICES for the control room instead.
 */

export type DutyElsewhere = {
  gateUserId: string;
  shiftId: string;
  /** The access point's name. */
  post: string;
  site: string | null;
  device: string | null;
  since: number;
};

/** Who was signed out here because their shift moved, for the sign-in screen to explain. */
export type MovedNotice = { firstName: string; at: number };

export const ELSEWHERE_KEY = 'on_duty_elsewhere';
export const NOTICE_KEY = 'shift_moved_notice';

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

function dutyOf(value: unknown): DutyElsewhere | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const gateUserId = text(row.gateUserId);
  const shiftId = text(row.shiftId);
  if (!gateUserId || !shiftId || typeof row.since !== 'number') return null;
  return { gateUserId, shiftId, post: text(row.post) ?? 'another access point', site: text(row.site), device: text(row.device), since: row.since };
}

/** The server's list, checked row by row: a bad row is dropped, never the reason to lose them all. */
export async function saveDutyElsewhere(db: SQLiteDatabase, rows: readonly unknown[]): Promise<void> {
  const list = rows.flatMap((row) => {
    const duty = dutyOf(row);
    return duty ? [duty] : [];
  });
  await setValue(db, ELSEWHERE_KEY, JSON.stringify(list));
}

async function readDutyElsewhere(db: SQLiteDatabase): Promise<DutyElsewhere[]> {
  const stored = await getValue(db, ELSEWHERE_KEY);
  if (!stored) return [];
  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.flatMap((row) => dutyOf(row) ?? []) : [];
}

/** Where a guard is on duty on another handheld, newest first; a shift older than the longest one has run out. */
export async function dutyElsewhereFor(db: SQLiteDatabase, gateUserId: string, now: number, maxShiftMs: number): Promise<DutyElsewhere | null> {
  const list = await readDutyElsewhere(db);
  const current = list.filter((duty) => duty.gateUserId === gateUserId && now - duty.since < maxShiftMs).sort((a, b) => b.since - a.since);
  return current[0] ?? null;
}

/** Everyone on duty on another handheld right now, for greying their number out at sign-in. */
export async function onDutyElsewhereIds(db: SQLiteDatabase, now: number, maxShiftMs: number): Promise<Set<string>> {
  const list = await readDutyElsewhere(db);
  return new Set(list.filter((duty) => now - duty.since < maxShiftMs).map((duty) => duty.gateUserId));
}

/** Once a shift has moved here, it no longer blocks this guard, even before the next sync. */
export async function forgetDutyElsewhere(db: SQLiteDatabase, shiftId: string): Promise<void> {
  const list = await readDutyElsewhere(db);
  await setValue(db, ELSEWHERE_KEY, JSON.stringify(list.filter((duty) => duty.shiftId !== shiftId)));
}

/**
 * Ends this handheld's shift when a supervisor moved it to another one. The server has already ended it, so nothing is
 * sent: the shift row closes here and the sign-in screen is told why. Returns whether it did.
 */
export async function endMovedShift(db: SQLiteDatabase, movedShiftIds: readonly string[], firstNameOf: (gateUserId: string) => Promise<string | null>): Promise<boolean> {
  const open = await openShift(db);
  if (!open || !movedShiftIds.includes(open.id)) return false;
  const at = Date.now();
  await db.runAsync('UPDATE shifts SET ended_at = ? WHERE id = ? AND ended_at IS NULL', [at, open.id]);
  const notice: MovedNotice = { firstName: (await firstNameOf(open.gateUserId)) ?? 'The guard', at };
  await setValue(db, NOTICE_KEY, JSON.stringify(notice));
  return true;
}

/** The notice, read once: it's shown on the sign-in screen, then gone. */
export async function takeMovedNotice(db: SQLiteDatabase): Promise<MovedNotice | null> {
  const stored = await getValue(db, NOTICE_KEY);
  if (!stored) return null;
  await removeValue(db, NOTICE_KEY);
  const parsed: unknown = JSON.parse(stored);
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { firstName, at } = parsed as Record<string, unknown>;
  return typeof firstName === 'string' && typeof at === 'number' ? { firstName, at } : null;
}
