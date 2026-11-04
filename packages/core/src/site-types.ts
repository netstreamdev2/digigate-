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
