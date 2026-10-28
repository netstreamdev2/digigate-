export type Severity = 'red' | 'amber' | 'info';

export const RULE_SEVERITY = {
  DRIVER_VEHICLE_MISMATCH: 'red',
  WALKED_IN_DRIVING_OUT: 'red',
  UNKNOWN_DRIVER: 'red',
  NO_ENTRY_RECORD: 'red',
  PLATE_DISC_MISMATCH: 'red',
  DISC_CLONE_ON_SITE: 'red',
  PLATE_VIN_HISTORY_CONFLICT: 'amber',
  DUPLICATE_ENTRY: 'amber',
  DISC_EXPIRED: 'amber',
  LICENCE_EXPIRED: 'amber',
  OCCUPANT_COUNT_DROP: 'info',
  OVERSTAY: 'amber',
  PEDESTRIAN_DUPLICATE_ENTRY: 'amber',
  PEDESTRIAN_NO_ENTRY: 'amber',
  DRIVER_LEFT_ON_FOOT: 'info',
  UNFAMILIAR_VEHICLE: 'info',
} as const satisfies Record<string, Severity>;

export type RuleCode = keyof typeof RULE_SEVERITY;
