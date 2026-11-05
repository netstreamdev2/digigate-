import type { RuleCode } from '@digigate/core';

import type { GateWords } from './gate-words';

// What the guard reads when a rule fires: what happened and what to do next. Titles match the dashboard's. {stop} is
// the gate's own instruction (gate-words.ts), so a post with no boom never tells the guard to keep one closed.
// Typed as a full record, so adding a rule to core fails the build until it has copy here.
export const ruleCopy: Record<RuleCode, { title: string; message: string }> = {
  HOTLIST_MATCH: {
    title: 'On the hotlist',
    message: 'The company has asked for this person or car to be stopped. {stop}',
  },
  DRIVER_VEHICLE_MISMATCH: {
    title: 'Vehicle swap',
    message: 'This driver arrived in a different car. {stop}',
  },
  WALKED_IN_DRIVING_OUT: {
    title: 'Walked in, driving out',
    message: 'This person came in on foot and is now driving a car out. {stop}',
  },
  UNKNOWN_DRIVER: {
    title: 'Unknown driver',
    message: "Someone else brought this car in. {stop}",
  },
  NO_ENTRY_RECORD: {
    title: 'No entry record',
    message: 'DigiGate has no record of this car coming in. {stop}',
  },
  PLATE_DISC_MISMATCH: {
    title: "Plate doesn't match disc",
    message: 'The plate on the car is not the plate on the disc. Check the plate again. If it still differs, call your supervisor.',
  },
  DISC_CLONE_ON_SITE: {
    title: 'Possible cloned plate or disc',
    message: 'Another car on site carries the same plate or disc. {stop}',
  },
  DISC_CHANGED_ON_SITE: {
    title: 'Disc changed since entry',
    message: 'This car came in with a different licence disc: the plate, disc number or expiry has changed. {stop}',
  },
  PLATE_VIN_HISTORY_CONFLICT: {
    title: 'Plate and VIN history conflict',
    message: 'This plate was seen before on a different vehicle. Plates can move between cars, so look closely.',
  },
  DUPLICATE_ENTRY: {
    title: 'Already on site',
    message: 'DigiGate thinks this car is already inside. It may have left through an unattended gate.',
  },
  DRIVER_ALREADY_ON_SITE: {
    title: 'Driver already on site',
    message: "DigiGate has this driver inside already, on foot or in another car. They may have left without being scanned out, or someone else has their licence. Check their face against the licence photo.",
  },
  DISC_EXPIRED: { title: 'Licence disc expired', message: "The car's licence disc has expired." },
  LICENCE_EXPIRED: { title: "Driver's licence expired", message: "The driver's licence has expired." },
  OCCUPANT_COUNT_DROP: { title: 'Fewer people leaving', message: 'Fewer people are leaving than came in with this car. Not an alarm: say why below if you know.' },
  OCCUPANT_COUNT_RISE: { title: 'More people leaving', message: 'More people are leaving than came in with this car. Not an alarm: say why below if you know.' },
  OVERSTAY: { title: 'Stayed longer than expected', message: 'This visit ran past the stay recorded when it came in. It is noted; let them out as normal.' },
  IGNITION_RESTART_FAILED: {
    title: "Engine didn't restart",
    message: "The driver couldn't stop the engine and start it again, so they may not have the key. {stop}",
  },
  BOOT_CHECK_PROBLEM: {
    title: 'Problem found in the boot',
    message: 'You found a problem in the boot. {stop}',
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

/** A rule's message, with the instruction for the gate the guard stands at. */
export function ruleMessage(code: RuleCode, words: GateWords): string {
  return ruleCopy[code].message.replace('{stop}', words.stop);
}
