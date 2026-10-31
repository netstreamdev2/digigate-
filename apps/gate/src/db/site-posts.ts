import type { SQLiteDatabase } from 'expo-sqlite';

import { applySyncedPosts, isSyncedPost, type SyncedPost } from '@/site/site-config';

import { getValue, setValue } from './kv';

export const SITE_POSTS_KEY = 'site:posts';

/** Keeps the site's posts from the dashboard, so a restart with no connection still offers them. */
export async function saveSyncedPosts(db: SQLiteDatabase, posts: readonly SyncedPost[]): Promise<void> {
  await setValue(db, SITE_POSTS_KEY, JSON.stringify(posts));
  applySyncedPosts(posts);
}

export async function loadSyncedPosts(db: SQLiteDatabase): Promise<void> {
  const stored = await getValue(db, SITE_POSTS_KEY);
  if (!stored) return;
  const parsed: unknown = JSON.parse(stored);
  if (Array.isArray(parsed)) applySyncedPosts(parsed.filter(isSyncedPost));
}
