import type { SQLiteDatabase } from 'expo-sqlite';

import { readShiftPeriods } from '@digigate/core';

import { applySyncedPosts, applySyncedSite, carParkOf, isSyncedPost, stayOverridesOf, type SyncedPost, type SyncedSite } from '@/site/site-config';

import { getValue, setValue } from './kv';

export const SITE_POSTS_KEY = 'site:posts';
export const SITE_DETAILS_KEY = 'site:details';

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

/** Keeps the site's name and shift times, so a restart with no connection still shows them. */
export async function saveSyncedSite(db: SQLiteDatabase, site: SyncedSite): Promise<void> {
  await setValue(db, SITE_DETAILS_KEY, JSON.stringify(site));
  applySyncedSite(site);
}

export async function loadSyncedSite(db: SQLiteDatabase): Promise<void> {
  const stored = await getValue(db, SITE_DETAILS_KEY);
  if (!stored) return;
  const parsed: unknown = JSON.parse(stored);
  if (typeof parsed !== 'object' || parsed === null) return;
  const { name, shiftPeriods, parking, siteType, stayMinutes, launchGraceUntil } = parsed as Record<string, unknown>;
  if (typeof name !== 'string') return;
  applySyncedSite({
    name,
    shiftPeriods: readShiftPeriods(shiftPeriods),
    parking: carParkOf(parking),
    siteType: typeof siteType === 'string' ? siteType : null,
    stayMinutes: stayOverridesOf(stayMinutes),
    launchGraceUntil: typeof launchGraceUntil === 'number' ? launchGraceUntil : null,
  });
}

/**
 * Moves one access point's geofence on this device at once, after a supervisor has set it here, so the check starts
 * without waiting for a sync. The server sends the same location back on the next one. False when the device has no
 * list from the dashboard yet.
 */
export async function setLocalPostFence(db: SQLiteDatabase, code: string, fence: { latitude: number; longitude: number; radiusM: number }): Promise<boolean> {
  const stored = await getValue(db, SITE_POSTS_KEY);
  if (!stored) return false;
  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) return false;
  const posts = parsed.filter(isSyncedPost);
  if (!posts.some((post) => post.code === code)) return false;
  await saveSyncedPosts(db, posts.map((post) => (post.code === code ? { ...post, ...fence } : post)));
  return true;
}
