import type { RuleCode } from '@digigate/core';

// What the guard reads when a rule fires: what happened and what to do next. Titles match the dashboard's.
// Typed as a full record, so adding a rule to core fails the build until it has copy here.
export const ruleCopy: Record<RuleCode, { title: string; message: string }> = {
  DRIVER_VEHICLE_MISMATCH: {
    title: 'Vehicle swap',
    message: 'This driver arrived in a different car. Keep the boom closed and call your supervisor.',
  },
  WALKED_IN_DRIVING_OUT: {
    title: 'Walked in, driving out',
    message: 'This person came in on foot and is now driving a car out. Keep the boom closed and call your supervisor.',
  },
  UNKNOWN_DRIVER: {
    title: 'Unknown driver',
    message: "Someone else brought this car in. Keep the boom closed and call your supervisor.",
  },
  NO_ENTRY_RECORD: {
    title: 'No entry record',
    message: 'DigiGate has no record of this car coming in. Keep the boom closed and call your supervisor.',
  },
  PLATE_DISC_MISMATCH: {
    title: "Plate doesn't match disc",
    message: 'The plate on the car is not the plate on the disc. Check the plate again. If it still differs, call your supervisor.',
  },
  DISC_CLONE_ON_SITE: {
    title: 'Possible cloned plate or disc',
    message: 'Another car on site carries the same plate or disc. Keep the boom closed and call your supervisor.',
  },
  PLATE_VIN_HISTORY_CONFLICT: {
    title: 'Plate and VIN history conflict',
    message: 'This plate was seen before on a different vehicle. Plates can move between cars, so look closely.',
  },
  DUPLICATE_ENTRY: {
    title: 'Already on site',
    message: 'DigiGate thinks this car is already inside. It may have left through an unattended gate.',
  },
  DISC_EXPIRED: { title: 'Licence disc expired', message: "The car's licence disc has expired." },
  LICENCE_EXPIRED: { title: "Driver's licence expired", message: "The driver's licence has expired." },
  OCCUPANT_COUNT_DROP: { title: 'Fewer people leaving', message: 'Fewer people are leaving than came in with this car.' },
  OVERSTAY: { title: 'Overstay', message: 'This visit is longer than the site allows for its visit type.' },
  IGNITION_RESTART_FAILED: {
    title: "Engine didn't restart",
    message: "The driver couldn't stop the engine and start it again, so they may not have the key. Keep the boom closed and call your supervisor.",
  },
  BOOT_CHECK_PROBLEM: {
    title: 'Problem found in the boot',
    message: 'You found a problem in the boot. Keep the boom closed and call your supervisor.',
  },
  PEDESTRIAN_DUPLICATE_ENTRY: {
    title: 'Already on site',
    message: 'DigiGate thinks this person is already inside. They may have left through an unattended gate.',
  },
  PEDESTRIAN_NO_ENTRY: {
    title: 'No entry record',
    message: 'DigiGate has no record of this person coming in. They may have arrived as a passenger.',
  },
  DRIVER_LEFT_ON_FOOT: { title: 'Driver left on foot', message: 'This person drove in and is leaving on foot. Their car is still on site.' },
  UNFAMILIAR_VEHICLE: { title: 'Unfamiliar vehicle', message: "This person hasn't come in this car before." },
};
