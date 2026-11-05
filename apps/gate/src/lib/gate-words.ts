/**
 * What the guard is told to do with the car or person in front of them, in the words of the gate they stand at. A post
 * with a boom opens it or keeps it down; a gate with no boom is stood open, and the guard waves a car through or asks
 * it to stop. Which one comes from the post's booms on the dashboard, never from the site or company.
 */
export type GateKind = 'boom' | 'open-gate' | 'on-foot';

export type GateWords = {
  /** After a red result: what to do instead of letting them through. */
  stop: string;
  /** After the guard turned them away. */
  turnedAway: string;
  /** Let them through, on the way in and out. */
  letIn: string;
  letOut: string;
};

const WORDS: Readonly<Record<GateKind, GateWords>> = {
  boom: {
    stop: 'Keep the boom closed and call your supervisor.',
    turnedAway: 'Keep the boom closed. The attempt is recorded.',
    letIn: 'Open the boom.',
    letOut: 'Open the boom.',
  },
  // With nothing to hold a car, the guard asks it to pull aside, and never stands in its way.
  'open-gate': {
    stop: "Don't let the car through: ask the driver to pull aside and switch off, and call your supervisor. Never stand in its way.",
    turnedAway: "Don't let them through. The attempt is recorded.",
    letIn: 'Let them in.',
    letOut: 'Let them out.',
  },
  'on-foot': {
    stop: "Don't let them through, and call your supervisor.",
    turnedAway: "Don't let them through. The attempt is recorded.",
    letIn: 'Let them in.',
    letOut: 'Let them out.',
  },
};

export function gateWords(kind: GateKind): GateWords {
  return WORDS[kind];
}

/** The words for a vehicle lane at a post, by whether it has a boom. */
export const vehicleGateWords = (hasBoom: boolean): GateWords => WORDS[hasBoom ? 'boom' : 'open-gate'];
