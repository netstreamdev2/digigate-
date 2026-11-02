import type { SQLiteDatabase } from 'expo-sqlite';

import { getValue, setValue } from './kv';

export const SITE_TODAY_KEY = 'site:today';

/** The site's day as of the last sync: open alerts, and visits ended so far with their total time on site. */
export type SiteToday = { openAlerts: number; exits: number; stayMinutes: number; syncedAt: number };

export function isSiteToday(value: unknown): value is Omit<SiteToday, 'syncedAt'> {
  if (typeof value !== 'object' || value === null) return false;
  const { openAlerts, exits, stayMinutes } = value as Record<string, unknown>;
  return typeof openAlerts === 'number' && typeof exits === 'number' && typeof stayMinutes === 'number';
}

export async function saveSiteToday(db: SQLiteDatabase, today: Omit<SiteToday, 'syncedAt'>, syncedAt: number): Promise<void> {
  await setValue(db, SITE_TODAY_KEY, JSON.stringify({ ...today, syncedAt }));
}

/** Null until the first sync, and for a day that has since ended on the site's clock. */
export async function loadSiteToday(db: SQLiteDatabase, now: number, utcOffsetMinutes: number): Promise<SiteToday | null> {
  const stored = await getValue(db, SITE_TODAY_KEY);
  if (!stored) return null;
  const parsed: unknown = JSON.parse(stored);
  if (!isSiteToday(parsed) || typeof (parsed as Partial<SiteToday>).syncedAt !== 'number') return null;
  const today = parsed as SiteToday;
  const dayOf = (at: number) => new Date(at + utcOffsetMinutes * 60_000).toISOString().slice(0, 10);
  return dayOf(today.syncedAt) === dayOf(now) ? today : null;
}
