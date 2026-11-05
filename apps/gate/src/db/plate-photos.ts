import type { SQLiteDatabase } from 'expo-sqlite';

export type PendingPlatePhoto = { eventId: string; jpegBase64: string };

/**
 * Keeps the photo of the car's number plate with the check it came with, until the server has it, so a plate that
 * didn't match can be looked at later: a guard's slip, or a car carrying someone else's disc. Written after the check
 * is on record and on screen, never as part of it.
 */
export async function keepPlatePhoto(db: SQLiteDatabase, eventId: string, takenAt: number, jpegBase64: string): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO plate_photos (event_id, taken_at, jpeg_base64) VALUES (?, ?, ?)', [eventId, takenAt, jpegBase64]);
}

/** The oldest plate photo the server doesn't have yet. */
export async function pendingPlatePhoto(db: SQLiteDatabase): Promise<PendingPlatePhoto | null> {
  const row = await db.getFirstAsync<{ event_id: string; jpeg_base64: string }>('SELECT event_id, jpeg_base64 FROM plate_photos ORDER BY taken_at LIMIT 1');
  return row ? { eventId: row.event_id, jpegBase64: row.jpeg_base64 } : null;
}

/** Only once the server has answered for it. */
export async function removePlatePhoto(db: SQLiteDatabase, eventId: string): Promise<void> {
  await db.runAsync('DELETE FROM plate_photos WHERE event_id = ?', [eventId]);
}
