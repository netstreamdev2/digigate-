export type Severity = 'red' | 'amber' | 'info';

export const RULE_SEVERITY = {
  HOTLIST_MATCH: 'red',
  DRIVER_VEHICLE_MISMATCH: 'red',
  WALKED_IN_DRIVING_OUT: 'red',
  UNKNOWN_DRIVER: 'red',
  NO_ENTRY_RECORD: 'red',
  PLATE_DISC_MISMATCH: 'red',
  DISC_CLONE_ON_SITE: 'red',
  DISC_CHANGED_ON_SITE: 'red',
  PLATE_VIN_HISTORY_CONFLICT: 'amber',
  DUPLICATE_ENTRY: 'amber',
  DRIVER_ALREADY_ON_SITE: 'amber',
  DISC_EXPIRED: 'amber',
  LICENCE_EXPIRED: 'amber',
  OCCUPANT_COUNT_DROP: 'info',
  OCCUPANT_COUNT_RISE: 'info',
  // A note, not a stop: the car is leaving anyway. The dashboard shows a visit running over while it's still on site.
  OVERSTAY: 'info',
  IGNITION_RESTART_FAILED: 'red',
  BOOT_CHECK_PROBLEM: 'red',
  PEDESTRIAN_DUPLICATE_ENTRY: 'amber',
  PEDESTRIAN_NO_ENTRY: 'amber',
  DRIVER_LEFT_ON_FOOT: 'info',
  UNFAMILIAR_VEHICLE: 'info',
} as const satisfies Record<string, Severity>;

export type RuleCode = keyof typeof RULE_SEVERITY;
