import type { SQLiteDatabase } from 'expo-sqlite';

import { forgetPersonKeySecret } from '@/lib/person-key';
import { stopPostFence } from '@/shift/post-fence';
import { applySyncedPosts, applySyncedSite } from '@/site/site-config';
import { forgetDeviceToken } from '@/sync/device-api';

import { removeValue } from './kv';
import { SITE_DETAILS_KEY, SITE_POSTS_KEY } from './site-posts';
import { SITE_TODAY_KEY } from './site-today';

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
    await db.runAsync('DELETE FROM shift_selfies');
    await db.runAsync('DELETE FROM licence_photos');
    await db.runAsync('DELETE FROM site_visits');
    await db.runAsync('DELETE FROM closed_visits');
    await db.runAsync('DELETE FROM hotlist');
    await db.runAsync('DELETE FROM expected_visitors');
    await removeValue(db, SITE_POSTS_KEY);
    await removeValue(db, SITE_DETAILS_KEY);
    await removeValue(db, SITE_TODAY_KEY);
  });
  applySyncedPosts([]);
  applySyncedSite(null);
  await stopPostFence();
  await forgetDeviceToken();
  await forgetPersonKeySecret();
}
