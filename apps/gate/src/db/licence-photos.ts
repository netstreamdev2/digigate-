import type { Photo } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { toBase64 } from '@/lib/bytes';
import { greyscaleBmp } from '@/lib/greyscale-bmp';

export type PendingLicencePhoto = { eventId: string; bmpBase64: string };

/**
 * Keeps the photo from a driver's licence with the check it came with, until the server has it, so the control room
 * can see who came through. Written after the check is on record and on screen, never as part of it.
 */
export async function keepLicencePhoto(db: SQLiteDatabase, eventId: string, takenAt: number, photo: Photo): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO licence_photos (event_id, taken_at, bmp_base64) VALUES (?, ?, ?)', [eventId, takenAt, toBase64(greyscaleBmp(photo))]);
}

/** The oldest photo the server doesn't have yet. */
export async function pendingLicencePhoto(db: SQLiteDatabase): Promise<PendingLicencePhoto | null> {
  const row = await db.getFirstAsync<{ event_id: string; bmp_base64: string }>('SELECT event_id, bmp_base64 FROM licence_photos ORDER BY taken_at LIMIT 1');
  return row ? { eventId: row.event_id, bmpBase64: row.bmp_base64 } : null;
}

/** Only once the server has answered for it. */
export async function removeLicencePhoto(db: SQLiteDatabase, eventId: string): Promise<void> {
  await db.runAsync('DELETE FROM licence_photos WHERE event_id = ?', [eventId]);
}
