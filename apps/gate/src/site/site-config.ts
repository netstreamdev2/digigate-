import type { RuleConfig } from '@digigate/core';
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
};

export type ShiftPeriodOption = Omit<PostOption, 'lanes'> & {
  hours: string;
  /** Hour of the day at the site it starts. */
  startHour: number;
  /** Hour of the day at the site it ends; below `startHour` when it runs past midnight. */
  endHour: number;
};

export type VisitTypeOption = {
  code: string;
  label: string;
  /** What the guard sees beside the label, so the colour is never the only signal. */
  icon: IconName;
  /** A tile colour from the design tokens. */
  tint: keyof typeof colors;
};

// This device's site settings. Phase 2 syncs them from the dashboard (see Site types and tenancy in the project notes); until
// then the gate runs on these hospital defaults. Overstay limits are still an open decision, so none apply yet.
export const siteConfig = {
  site: 'Demo Hospital',
  posts: [
    { code: 'main-gate', label: 'Main Gate', lanes: ALL_LANES, icon: 'vehicle', tint: 'tileSky' },
    { code: 'back-gate', label: 'Back Gate', lanes: ['vehicle'], icon: 'vehicle', tint: 'tileLilac' },
    { code: 'walk-in-gate', label: 'Walk-in Gate', lanes: ['pedestrian'], icon: 'pedestrian', tint: 'tileMint' },
  ] satisfies readonly PostOption[],
  shiftPeriods: [
    { code: 'day', label: 'Day', hours: '06:00 to 18:00', icon: 'duration', tint: 'tileButter', startHour: 6, endHour: 18 },
    { code: 'night', label: 'Night', hours: '18:00 to 06:00', icon: 'duration', tint: 'tileLilac', startHour: 18, endHour: 6 },
  ] satisfies readonly ShiftPeriodOption[],
  /** A shift nobody ended is over after this long, so the next sign-in has to start a new one. */
  maxShiftHours: 14,
  idleLockMinutes: 3,
  visitTypes: [
    { code: 'visitor', label: 'Visitor', icon: 'visitor', tint: 'tileSky' },
    { code: 'staff', label: 'Staff', icon: 'staff', tint: 'tileMint' },
    { code: 'delivery', label: 'Delivery', icon: 'delivery', tint: 'tileButter' },
    { code: 'contractor', label: 'Contractor', icon: 'contractor', tint: 'warningSoft' },
    { code: 'patient_dropoff', label: 'Drop-off', icon: 'patient-dropoff', tint: 'tileLilac' },
    { code: 'emergency', label: 'Emergency', icon: 'emergency', tint: 'blockedSoft' },
  ] satisfies readonly VisitTypeOption[],
  defaultVisitType: 'visitor',
  rules: {
    /** SAST. Decides which calendar day it is for document expiry. */
    utcOffsetMinutes: 120,
    overstayLimitMinutes: {},
    disabledRules: [],
  } satisfies RuleConfig,
} as const;

const postOf = (code: string): PostOption | undefined => siteConfig.posts.find((post) => post.code === code);

export function postLabel(code: string): string {
  return postOf(code)?.label ?? code;
}

/** A post that has left the config mid-shift keeps every lane, so a guard is never left with nothing to do. */
export function lanesOf(code: string): readonly Lane[] {
  return postOf(code)?.lanes ?? ALL_LANES;
}

export function periodHours(code: string): string {
  return siteConfig.shiftPeriods.find((period) => period.code === code)?.hours ?? code;
}

/** The shift period the clock says it is, to suggest at the start of a shift. */
export function shiftPeriodAt(at: number): ShiftPeriodOption {
  const hour = new Date(at + siteConfig.rules.utcOffsetMinutes * 60_000).getUTCHours();
  const inPeriod = ({ startHour, endHour }: ShiftPeriodOption) =>
    startHour < endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  return siteConfig.shiftPeriods.find(inPeriod) ?? siteConfig.shiftPeriods[0];
}

/** The visit type for a code, or null for one this site doesn't know (e.g. from an older config). */
export function visitTypeOf(code: string): VisitTypeOption | null {
  return siteConfig.visitTypes.find((type) => type.code === code) ?? null;
}
