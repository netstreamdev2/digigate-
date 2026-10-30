import type { SQLiteDatabase } from 'expo-sqlite';

import { applySyncedPosts, isSyncedPost, type SyncedPost } from '@/site/site-config';

import { getValue, setValue } from './kv';

const KEY = 'site:posts';

/** Keeps the site's posts from the dashboard, so a restart with no connection still offers them. */
export async function saveSyncedPosts(db: SQLiteDatabase, posts: readonly SyncedPost[]): Promise<void> {
  await setValue(db, KEY, JSON.stringify(posts));
  applySyncedPosts(posts);
}

export async function loadSyncedPosts(db: SQLiteDatabase): Promise<void> {
  const stored = await getValue(db, KEY);
  if (!stored) return;
  const parsed: unknown = JSON.parse(stored);
  if (Array.isArray(parsed)) applySyncedPosts(parsed.filter(isSyncedPost));
}
