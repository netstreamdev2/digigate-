import { DEFAULT_SHIFT_PERIODS, readShiftPeriods, shiftPeriodAt as periodAt, SITE_RULE_DEFAULTS, type Fence, type ShiftPeriod } from '@digigate/core';
import type { colors } from '@digigate/design';

import type { IconName } from '@/components/icon';

/** What a post handles. Home and the scan chooser offer only these. */
export type Lane = 'vehicle' | 'pedestrian';

const ALL_LANES: readonly Lane[] = ['vehicle', 'pedestrian'];

export type PostOption = {
  code: string;
  label: string;
  lanes: readonly Lane[];
  icon: IconName;
  tint: keyof typeof colors;
  /** Where the post is, once someone has set it in the dashboard. A post without one isn't checked. */
  fence?: Fence | null;
};

/** A post as the dashboard sends it. The app adds its own icon and colour. */
export type SyncedPost = Pick<PostOption, 'code' | 'label' | 'lanes'> & {
  latitude?: number | null;
  longitude?: number | null;
  radiusM?: number | null;
};

export function isSyncedPost(value: unknown): value is SyncedPost {
  if (typeof value !== 'object' || value === null) return false;
  const { code, label, lanes } = value as Record<string, unknown>;
  return (
    typeof code === 'string' &&
    typeof label === 'string' &&
    Array.isArray(lanes) &&
    lanes.length > 0 &&
    lanes.every((lane) => lane === 'vehicle' || lane === 'pedestrian')
  );
}

/** A shift period as the start-shift screen offers it: the site's times, with an icon and colour added here. */
export type ShiftPeriodOption = ShiftPeriod & Pick<PostOption, 'icon' | 'tint'> & { hours: string };

/** The site as the dashboard sends it with each sync: its name and its shift times. */
export type SyncedSite = { name: string; shiftPeriods: readonly ShiftPeriod[] };

export function syncedSiteOf(body: Record<string, unknown>): SyncedSite | null {
  if (typeof body.siteName !== 'string' || !body.siteName) return null;
  return { name: body.siteName, shiftPeriods: readShiftPeriods(body.shiftPeriods) };
}

export type VisitTypeOption = {
  code: string;
  label: string;
  /** What the guard sees beside the label, so the colour is never the only signal. */
  icon: IconName;
  /** A tile colour from the design tokens. */
  tint: keyof typeof colors;
};

// This device's site settings. The site's name, posts and shift times come from the dashboard with each sync (below); the
// rest are still these hospital defaults (see Site types and tenancy in the project notes). Overstay limits are still an
// open decision, so none apply yet.
export const siteConfig = {
  posts: [
    { code: 'main-gate', label: 'Main Gate', lanes: ALL_LANES, icon: 'vehicle', tint: 'tileSky' },
    { code: 'back-gate', label: 'Back Gate', lanes: ['vehicle'], icon: 'vehicle', tint: 'tileLilac' },
    { code: 'walk-in-gate', label: 'Walk-in Gate', lanes: ['pedestrian'], icon: 'pedestrian', tint: 'tileMint' },
  ] satisfies readonly PostOption[],
  /** A shift nobody ended is over after this long, so the next sign-in has to start a new one. */
  maxShiftHours: 14,
  idleLockMinutes: 3,
  /** How long the post's geofence stays quiet after a guard says they're stepping away. */
  steppingAwayMinutes: 10,
  steppingAwayReasons: ['Toilet break', 'Patrol', 'Helping someone', 'Called by a supervisor'],
  visitTypes: [
    { code: 'visitor', label: 'Visitor', icon: 'visitor', tint: 'tileSky' },
    { code: 'staff', label: 'Staff', icon: 'staff', tint: 'tileMint' },
    { code: 'delivery', label: 'Delivery', icon: 'delivery', tint: 'tileButter' },
    { code: 'contractor', label: 'Contractor', icon: 'contractor', tint: 'warningSoft' },
    { code: 'patient_dropoff', label: 'Drop-off', icon: 'patient-dropoff', tint: 'tileLilac' },
    { code: 'emergency', label: 'Emergency', icon: 'emergency', tint: 'blockedSoft' },
  ] satisfies readonly VisitTypeOption[],
  defaultVisitType: 'visitor',
  rules: SITE_RULE_DEFAULTS,
} as const;

const POST_TINTS = ['tileSky', 'tileLilac', 'tileMint', 'tileButter'] as const;

function fenceFrom({ latitude, longitude, radiusM }: SyncedPost): Fence | null {
  return typeof latitude === 'number' && typeof longitude === 'number' && typeof radiusM === 'number' ? { latitude, longitude, radiusM } : null;
}

let syncedPosts: readonly PostOption[] = [];

/** The site's posts from the dashboard. Any number of them works: every screen reads this list. */
export function applySyncedPosts(posts: readonly SyncedPost[]): void {
  syncedPosts = posts.map((post, index) => ({
    code: post.code,
    label: post.label,
    lanes: post.lanes,
    icon: post.lanes.includes('vehicle') ? 'vehicle' : 'pedestrian',
    tint: POST_TINTS[index % POST_TINTS.length] ?? 'tileSky',
    fence: fenceFrom(post),
  }));
}

/** The dashboard's posts once they've synced; until then this build's defaults. */
export function currentPosts(): readonly PostOption[] {
  return syncedPosts.length > 0 ? syncedPosts : siteConfig.posts;
}

const postOf = (code: string): PostOption | undefined => currentPosts().find((post) => post.code === code);

export function postLabel(code: string): string {
  return postOf(code)?.label ?? code;
}

/** A post that has left the config mid-shift keeps every lane, so a guard is never left with nothing to do. */
export function lanesOf(code: string): readonly Lane[] {
  return postOf(code)?.lanes ?? ALL_LANES;
}

/** Null for a post with no location set, or one that has left the config mid-shift. */
export function fenceOf(code: string): Fence | null {
  return postOf(code)?.fence ?? null;
}

const SHIFT_TINTS = ['tileButter', 'tileLilac', 'tileSky', 'tileMint'] as const;

const periodOptions = (periods: readonly ShiftPeriod[]): ShiftPeriodOption[] =>
  periods.map((period, index) => ({ ...period, hours: `${period.start} to ${period.end}`, icon: 'duration', tint: SHIFT_TINTS[index % SHIFT_TINTS.length] ?? 'tileButter' }));

const DEFAULT_PERIODS = periodOptions(DEFAULT_SHIFT_PERIODS);

let syncedSite: { name: string; periods: readonly ShiftPeriodOption[] } | null = null;

/** The site's name and shift times from the dashboard. Null forgets them, as a wiped device must. */
export function applySyncedSite(site: SyncedSite | null): void {
  syncedSite = site ? { name: site.name, periods: periodOptions(site.shiftPeriods) } : null;
}

/** Where this device is, once it has synced; until then just the product's name. */
export function siteName(): string {
  return syncedSite?.name ?? 'DigiGate';
}

/** The site's shift times once they've synced; until then day and night. */
export function currentShiftPeriods(): readonly ShiftPeriodOption[] {
  return syncedSite && syncedSite.periods.length > 0 ? syncedSite.periods : DEFAULT_PERIODS;
}

export function periodHours(code: string): string {
  return currentShiftPeriods().find((period) => period.code === code)?.hours ?? code;
}

/** The shift period the clock says it is, to suggest at the start of a shift. */
export function shiftPeriodAt(at: number): ShiftPeriodOption | undefined {
  return periodAt(currentShiftPeriods(), at, siteConfig.rules.utcOffsetMinutes);
}

/** The visit type for a code, or null for one this site doesn't know (e.g. from an older config). */
export function visitTypeOf(code: string): VisitTypeOption | null {
  return siteConfig.visitTypes.find((type) => type.code === code) ?? null;
}
