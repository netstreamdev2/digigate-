/**
 * What each site type offers by default. Behaviour differs between site types only through values like these, never
 * through a check on the type in a screen or a rule (see Site types and tenancy in the project notes).
 */

export type SiteType = 'hospital' | 'estate';

export type VisitTypeOption = { code: string; label: string };

const VISIT_TYPES: Readonly<Record<SiteType, readonly VisitTypeOption[]>> = {
  hospital: [
    { code: 'visitor', label: 'Visitor' },
    { code: 'staff', label: 'Staff' },
    { code: 'delivery', label: 'Delivery' },
    { code: 'contractor', label: 'Contractor' },
    { code: 'patient_dropoff', label: 'Drop-off' },
    { code: 'emergency', label: 'Emergency' },
  ],
  estate: [
    { code: 'visitor', label: 'Visitor' },
    { code: 'resident', label: 'Resident' },
    { code: 'domestic_worker', label: 'Domestic worker' },
    { code: 'contractor', label: 'Contractor' },
    { code: 'delivery', label: 'Delivery' },
    { code: 'ehailing', label: 'E-hailing' },
    { code: 'emergency', label: 'Emergency' },
  ],
};

export const isSiteType = (value: string): value is SiteType => value in VISIT_TYPES;

/** The visit types a site of this type offers. An unknown type gets none rather than another type's. */
export function visitTypesFor(siteType: string): readonly VisitTypeOption[] {
  return isSiteType(siteType) ? VISIT_TYPES[siteType] : [];
}

const HOUR = 60;

/**
 * How long each visit type is expected to stay, in minutes, before it shows as over its time. Null is no limit. The
 * guard can change it for one visit at the gate, and a site can set its own.
 */
const STAY_MINUTES: Readonly<Record<SiteType, Readonly<Record<string, number | null>>>> = {
  hospital: { visitor: 4 * HOUR, staff: null, delivery: HOUR, contractor: 10 * HOUR, patient_dropoff: 30, emergency: null },
  estate: { visitor: 4 * HOUR, resident: null, domestic_worker: 10 * HOUR, contractor: 10 * HOUR, delivery: HOUR, ehailing: 15, emergency: null },
};

/** The stays a guard can pick at the gate, in minutes. Null is no limit. */
export const STAY_CHOICES: readonly (number | null)[] = [30, HOUR, 2 * HOUR, 4 * HOUR, 8 * HOUR, 12 * HOUR, null];

/** Each visit type's expected stay at a site of this type, with the site's own settings over the defaults. */
export function stayMinutesFor(siteType: string, overrides: Readonly<Record<string, number | null>> = {}): Readonly<Record<string, number | null>> {
  return { ...(isSiteType(siteType) ? STAY_MINUTES[siteType] : {}), ...overrides };
}

/** What the guard can give as the reason fewer, or more, people left in a car than came in. */
const OCCUPANT_REASONS: Readonly<Record<SiteType, Readonly<Record<'fewer' | 'more', readonly string[]>>>> = {
  hospital: {
    fewer: ['Dropped off a patient', 'Dropped someone off', 'Someone left on foot', 'Not sure'],
    more: ['Fetched a patient', 'Picked someone up', 'Someone walked in and left with them', 'Not sure'],
  },
  estate: {
    fewer: ['Dropped someone off', 'Someone left on foot', 'Not sure'],
    more: ['Picked someone up', 'Someone walked in and left with them', 'Not sure'],
  },
};

export function occupantReasonsFor(siteType: string, change: 'fewer' | 'more'): readonly string[] {
  return isSiteType(siteType) ? OCCUPANT_REASONS[siteType][change] : ['Not sure'];
}

/** A stay in words: 30 min, 1 hour, 4 hours, no limit. */
export function expectedStayLabel(minutes: number | null): string {
  if (minutes === null) return 'No limit';
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? 'hour' : 'hours'}`;
}
