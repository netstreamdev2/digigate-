import type { RuleCode } from "@digigate/core";

// Typed as a full record, so adding a rule to core fails the build until it has a title here.
export const ruleTitles: Record<RuleCode, string> = {
  DRIVER_VEHICLE_MISMATCH: "Vehicle swap",
  WALKED_IN_DRIVING_OUT: "Walked in, driving out",
  UNKNOWN_DRIVER: "Unknown driver",
  NO_ENTRY_RECORD: "No entry record",
  PLATE_DISC_MISMATCH: "Plate doesn't match disc",
  DISC_CLONE_ON_SITE: "Possible cloned plate or disc",
  PLATE_VIN_HISTORY_CONFLICT: "Plate and VIN history conflict",
  DUPLICATE_ENTRY: "Already on site",
  DISC_EXPIRED: "Licence disc expired",
  LICENCE_EXPIRED: "Driver's licence expired",
  OCCUPANT_COUNT_DROP: "Fewer people leaving",
  OVERSTAY: "Overstay",
  PEDESTRIAN_DUPLICATE_ENTRY: "Already on site",
  PEDESTRIAN_NO_ENTRY: "No entry record",
  DRIVER_LEFT_ON_FOOT: "Driver left on foot",
  UNFAMILIAR_VEHICLE: "Unfamiliar vehicle",
};
