import type { ExpectedVisitor, HotlistEntry } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

/** A hotlist entry as the server sends it: what to match, and what the company wants the guard to do. */
export type SyncedHotlistEntry = HotlistEntry & { guardNote: string; expiresAt: number | null };

/** A booking as the server sends it, with the note the guard sees beside the name. */
export type SyncedBooking = ExpectedVisitor & { note: string | null };

type HotlistRow = { id: string; kind: HotlistEntry['kind']; match_key: string; guard_note: string };
type BookingRow = {
  id: string;
  name: string;
  person_key: string | null;
  plate: string | null;
  visit_type: string | null;
  note: string | null;
  valid_from: number;
  valid_until: number;
  invite_hash: string | null;
  single_use: number;
};

/** A record of a one-visit invite let in here, kept a fortnight: long past any invite's last day. */
const USED_KEPT_MS = 14 * 24 * 60 * 60_000;

/** Replaces the hotlist with the server's, in one step, so a scan never reads half of it. */
export async function saveHotlist(db: SQLiteDatabase, entries: readonly SyncedHotlistEntry[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM hotlist');
    for (const entry of entries) {
      await db.runAsync('INSERT OR REPLACE INTO hotlist (id, kind, match_key, guard_note, expires_at) VALUES (?, ?, ?, ?, ?)', [
        entry.id,
        entry.kind,
        entry.key,
        entry.guardNote,
        entry.expiresAt,
      ]);
    }
  });
}

/** Replaces the bookings with the server's, in one step. Invites let in here stay used, whatever the list says. */
export async function saveBookings(db: SQLiteDatabase, bookings: readonly SyncedBooking[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expected_visitors');
    for (const booking of bookings) {
      await db.runAsync(
        `INSERT OR REPLACE INTO expected_visitors (id, name, person_key, plate, visit_type, note, valid_from, valid_until, invite_hash, single_use)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          booking.id,
          booking.name,
          booking.personKey,
          booking.plate,
          booking.visitType,
          booking.note,
          booking.from,
          booking.until,
          booking.invite ?? null,
          booking.singleUse ? 1 : 0,
        ],
      );
    }
    await db.runAsync('DELETE FROM used_invites WHERE used_at < ?', Date.now() - USED_KEPT_MS);
  });
}

/** The entries in force at `at`, and what each tells the guard. One that has run out stops matching even offline. */
export async function loadHotlist(db: SQLiteDatabase, at: number): Promise<{ entries: HotlistEntry[]; notes: ReadonlyMap<string, string> }> {
  const rows = await db.getAllAsync<HotlistRow>('SELECT id, kind, match_key, guard_note FROM hotlist WHERE expires_at IS NULL OR expires_at > ?', at);
  return {
    entries: rows.map((row) => ({ id: row.id, kind: row.kind, key: row.match_key })),
    notes: new Map(rows.map((row) => [row.id, row.guard_note])),
  };
}

const bookingOf = (row: BookingRow): SyncedBooking => ({
  id: row.id,
  name: row.name,
  personKey: row.person_key,
  plate: row.plate,
  visitType: row.visit_type,
  note: row.note,
  from: row.valid_from,
  until: row.valid_until,
  invite: row.invite_hash,
  singleUse: row.single_use === 1,
});

/** The bookings that cover `at`, less one-visit invites already let in here. */
export async function loadBookings(db: SQLiteDatabase, at: number): Promise<SyncedBooking[]> {
  const rows = await db.getAllAsync<BookingRow>(
    `SELECT * FROM expected_visitors
     WHERE valid_from <= ? AND valid_until >= ?
       AND NOT (single_use = 1 AND id IN (SELECT booking_id FROM used_invites))`,
    [at, at],
  );
  return rows.map(bookingOf);
}

/** The booking an invite's QR belongs to, whatever its dates; null when this handheld doesn't have it. */
export async function bookingByInvite(db: SQLiteDatabase, inviteHash: string): Promise<SyncedBooking | null> {
  const row = await db.getFirstAsync<BookingRow>('SELECT * FROM expected_visitors WHERE invite_hash = ?', inviteHash);
  return row ? bookingOf(row) : null;
}

/** The one-visit invites already let in on this handheld. */
export async function usedInvites(db: SQLiteDatabase): Promise<ReadonlySet<string>> {
  const rows = await db.getAllAsync<{ booking_id: string }>('SELECT booking_id FROM used_invites');
  return new Set(rows.map((row) => row.booking_id));
}

/** A one-visit invite has let its visitor in: it won't again on this handheld, even before the server knows. */
export async function markInviteUsed(db: SQLiteDatabase, bookingId: string, at: number): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO used_invites (booking_id, used_at) VALUES (?, ?)', [bookingId, at]);
}
