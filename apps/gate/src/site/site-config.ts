import {
  DEFAULT_SHIFT_PERIODS,
  emergencyKindsFor,
  occupantReasonsFor,
  readShiftPeriods,
  shiftPeriodAt as periodAt,
  SITE_RULE_DEFAULTS,
  stayMinutesFor,
  type CarPark,
  type EmergencyKind,
  type Fence,
  type RuleConfig,
  type ShiftPeriod,
} from '@digigate/core';
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
  /** False for a gate with no boom, where the guard waves cars through or asks them to stop. */
  hasBoom: boolean;
};

/** A post as the dashboard sends it. The app adds its own icon and colour. */
export type SyncedPost = Pick<PostOption, 'code' | 'label' | 'lanes'> & {
  /** Its booms as the dashboard lists them; absent from an older server, when the post is taken to have one. */
  booms?: readonly string[];
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

/** The site as the dashboard sends it with each sync: its name, type, shift times, car park and its own stays. */
export type SyncedSite = {
  name: string;
  shiftPeriods: readonly ShiftPeriod[];
  parking: CarPark | null;
  siteType: string | null;
  stayMinutes: Readonly<Record<string, number | null>>;
  /** When the site's launch grace ends, if it has one (epoch ms). */
  launchGraceUntil: number | null;
};

/** A site's own stay per visit type, in minutes or null for no limit. Anything else is left out, never guessed. */
export function stayOverridesOf(value: unknown): Record<string, number | null> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number | null] => entry[1] === null || (typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] > 0)),
  );
}

/** The car park as the server sends it. Anything else is no car park known, never a guess at one. */
export function carParkOf(value: unknown): CarPark | null {
  if (typeof value !== 'object' || value === null) return null;
  const { open, spaces } = value as Record<string, unknown>;
  if (typeof open !== 'boolean') return null;
  return { open, spaces: typeof spaces === 'number' && Number.isInteger(spaces) ? spaces : null };
}

export function syncedSiteOf(body: Record<string, unknown>): SyncedSite | null {
  if (typeof body.siteName !== 'string' || !body.siteName) return null;
  return {
    name: body.siteName,
    shiftPeriods: readShiftPeriods(body.shiftPeriods),
    parking: carParkOf(body.parking),
    siteType: typeof body.siteType === 'string' ? body.siteType : null,
    stayMinutes: stayOverridesOf(body.stayMinutes),
    launchGraceUntil: typeof body.launchGraceUntil === 'number' ? body.launchGraceUntil : null,
  };
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
    { code: 'main-gate', label: 'Main Gate', lanes: ALL_LANES, icon: 'vehicle', tint: 'tileSky', hasBoom: true },
    { code: 'back-gate', label: 'Back Gate', lanes: ['vehicle'], icon: 'vehicle', tint: 'tileLilac', hasBoom: true },
    { code: 'walk-in-gate', label: 'Walk-in Gate', lanes: ['pedestrian'], icon: 'pedestrian', tint: 'tileMint', hasBoom: false },
  ] satisfies readonly PostOption[],
  /** A shift nobody ended is over after this long, so the next sign-in has to start a new one. */
  maxShiftHours: 14,
  /** The screen locks after this long without a touch or a scan (8 minutes, the user's choice on 2026-11-10). */
  idleLockMinutes: 8,
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
    hasBoom: Array.isArray(post.booms) ? post.booms.length > 0 : true,
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

/** Whether the post's vehicle lane has a boom. A post that has left the config mid-shift is taken to have one. */
export function hasBoomAt(code: string): boolean {
  return postOf(code)?.hasBoom ?? true;
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

let syncedSite: {
  name: string;
  periods: readonly ShiftPeriodOption[];
  parking: CarPark | null;
  siteType: string | null;
  stayMinutes: Readonly<Record<string, number | null>>;
  launchGraceUntil: number | null;
} | null = null;

/** The site's name and shift times from the dashboard. Null forgets them, as a wiped device must. */
export function applySyncedSite(site: SyncedSite | null): void {
  syncedSite = site
    ? {
        name: site.name,
        periods: periodOptions(site.shiftPeriods),
        parking: site.parking,
        siteType: site.siteType,
        stayMinutes: site.stayMinutes,
        launchGraceUntil: site.launchGraceUntil,
      }
    : null;
}

/** The rules as this site runs them now, with its launch grace while it lasts. */
export function currentRules(): RuleConfig {
  return { ...siteConfig.rules, launchGraceUntil: syncedSite?.launchGraceUntil ?? null };
}

/** When the site's launch grace ends, while it is still running; null once it has ended or if it never started. */
export function launchGraceEndsAt(now: number): number | null {
  const until = syncedSite?.launchGraceUntil ?? null;
  return until !== null && until > now ? until : null;
}

/** The kind of site this is, once it has synced; until then this build's hospital defaults. */
function currentSiteType(): string {
  return syncedSite?.siteType ?? 'hospital';
}

/** How long a visit of this type is expected to last, in minutes; null for no limit. The guard can change it at entry. */
export function expectedStayFor(visitType: string): number | null {
  return stayMinutesFor(currentSiteType(), syncedSite?.stayMinutes)[visitType] ?? null;
}

/** The reasons a guard can give for a car leaving with fewer, or more, people than came in. */
export function occupantReasons(change: 'fewer' | 'more'): readonly string[] {
  return occupantReasonsFor(currentSiteType(), change);
}

/** The emergencies this site lets in first, in the order the guard sees them. */
export function emergencyKinds(): readonly EmergencyKind[] {
  return emergencyKindsFor(currentSiteType());
}

/** The site's car park once it has synced; null until then, which the parking tile says plainly. */
export function siteCarPark(): CarPark | null {
  return syncedSite?.parking ?? null;
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
