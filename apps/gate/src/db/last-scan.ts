import type { Outcome } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { Shift } from './shifts';
import { getValue, setValue } from './kv';

const LAST_SCAN_KEY = 'home:last-scan';

/** The latest check on this device, for the home screen. Masked values only: the full record is in the outbox. */
export type LastScan = {
  gateUserId: string;
  at: number;
  direction: 'in' | 'out';
  name: string;
  visitType: string;
  outcome: Outcome;
  settled: 'let-through' | 'turned-away' | null;
  plate: string | null;
  vehicle: string | null;
  people: number | null;
  idNumber: string | null;
};

/** Keeps the first two and last three characters, as the guard would read them out, e.g. ND•••812. */
export function masked(value: string): string {
  const clean = value.replace(/\s+/g, '');
  return clean.length <= 5 ? '•'.repeat(clean.length) : `${clean.slice(0, 2)}•••${clean.slice(-3)}`;
}

// The home card is a convenience written after the result is on screen. The check itself is already saved, so a write
// that fails here changes nothing the guard has to act on, and nothing waits for it.

export function rememberLastScan(db: SQLiteDatabase, scan: LastScan): void {
  setValue(db, LAST_SCAN_KEY, JSON.stringify(scan)).catch(() => undefined);
}

/** What the guard decided after a warning or block, so the card shows how it ended. */
export function settleLastScan(db: SQLiteDatabase, settled: NonNullable<LastScan['settled']>): void {
  getValue(db, LAST_SCAN_KEY)
    .then((stored) => (stored ? setValue(db, LAST_SCAN_KEY, JSON.stringify({ ...(JSON.parse(stored) as LastScan), settled })) : undefined))
    .catch(() => undefined);
}

/** The visit type's label for the card, from the code a check recorded. */
export function visitTypeLabel(code: unknown, labelOf: (code: string) => string | null): string {
  return typeof code === 'string' ? (labelOf(code) ?? code) : '';
}

/** Only the signed-in guard's own scan from this shift: the next guard doesn't inherit the last person through the gate. */
export async function loadLastScan(db: SQLiteDatabase, shift: Shift): Promise<LastScan | null> {
  const stored = await getValue(db, LAST_SCAN_KEY);
  if (!stored) return null;
  const scan = JSON.parse(stored) as LastScan;
  return scan.gateUserId === shift.gateUserId && scan.at >= shift.startedAt ? scan : null;
}
