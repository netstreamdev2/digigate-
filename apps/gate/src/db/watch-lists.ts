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
};

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

/** Replaces the bookings with the server's, in one step. */
export async function saveBookings(db: SQLiteDatabase, bookings: readonly SyncedBooking[]): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM expected_visitors');
    for (const booking of bookings) {
      await db.runAsync(
        `INSERT OR REPLACE INTO expected_visitors (id, name, person_key, plate, visit_type, note, valid_from, valid_until)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [booking.id, booking.name, booking.personKey, booking.plate, booking.visitType, booking.note, booking.from, booking.until],
      );
    }
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

/** The bookings that cover `at`. */
export async function loadBookings(db: SQLiteDatabase, at: number): Promise<SyncedBooking[]> {
  const rows = await db.getAllAsync<BookingRow>('SELECT * FROM expected_visitors WHERE valid_from <= ? AND valid_until >= ?', [at, at]);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    personKey: row.person_key,
    plate: row.plate,
    visitType: row.visit_type,
    note: row.note,
    from: row.valid_from,
    until: row.valid_until,
  }));
}
