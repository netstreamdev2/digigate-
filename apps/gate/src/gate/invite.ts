import { inviteBookingFor } from '@digigate/core';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { bookingByInvite, usedInvites, type SyncedBooking } from '@/db/watch-lists';

/**
 * A visitor's invite, scanned at the gate: the booking it opens, or why it doesn't, in the guard's words. The QR only
 * says the visitor is expected; their ID or licence is still scanned and every rule still runs.
 */
export type ScannedInvite =
  | { kind: 'expected'; booking: SyncedBooking }
  | { kind: 'refused'; title: string; message: string };

const REFUSED: Record<'unknown' | 'not-yet' | 'over' | 'used', { title: string; message: string }> = {
  unknown: {
    title: 'Invite not valid here',
    message: "It was cancelled, already used, or it's for another site. Treat them as a normal visitor: scan their ID or licence.",
  },
  'not-yet': { title: 'Invite not valid yet', message: "It's for a later day. Treat them as a normal visitor: scan their ID or licence." },
  over: { title: 'Invite has run out', message: 'Its days are over. Treat them as a normal visitor: scan their ID or licence.' },
  used: {
    title: 'Invite already used',
    message: 'It was for one visit, and it was scanned in at this gate already. Check their ID or licence carefully, and tell your supervisor.',
  },
};

/** The SHA-256 the server and handhelds keep instead of the code itself. */
export const inviteHash = (code: string): string => bytesToHex(sha256(utf8ToBytes(code)));

export async function resolveInvite(db: SQLiteDatabase, code: string, at: number): Promise<ScannedInvite> {
  const [booking, used] = await Promise.all([bookingByInvite(db, inviteHash(code)), usedInvites(db)]);
  const match = inviteBookingFor(booking, at, used);
  return match.ok ? { kind: 'expected', booking: match.booking } : { kind: 'refused', ...REFUSED[match.reason] };
}
