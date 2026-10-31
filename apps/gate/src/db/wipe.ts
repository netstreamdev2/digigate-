import type { SQLiteDatabase } from 'expo-sqlite';

import { forgetPersonKeySecret } from '@/lib/person-key';
import { applySyncedPosts } from '@/site/site-config';
import { forgetDeviceToken } from '@/sync/device-api';

import { removeValue } from './kv';
import { SITE_POSTS_KEY } from './site-posts';

/**
 * Clears a device the server says is revoked, so a lost or stolen handheld can't sign anyone in, even offline. The
 * outbox stays: records are only ever deleted once the server has them, it's encrypted, and nothing in the app reads it.
 */
export async function wipeRevokedDevice(db: SQLiteDatabase): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM gate_users');
    await db.runAsync('DELETE FROM sign_in_failures');
    await db.runAsync('DELETE FROM visits');
    await db.runAsync('DELETE FROM vehicle_sightings');
    await db.runAsync('DELETE FROM shifts');
    await removeValue(db, SITE_POSTS_KEY);
  });
  applySyncedPosts([]);
  await forgetDeviceToken();
  await forgetPersonKeySecret();
}
