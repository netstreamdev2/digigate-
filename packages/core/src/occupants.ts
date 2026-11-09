/**
 * Who is in a car, counted by the guard: men, women, boys, girls, and anyone they couldn't tell. Counts only, never
 * who: it helps the control room picture a car, tell a dropped-off passenger from a missing one, and know there are
 * children on board, which matters most if a child leaves in a car they didn't arrive in. A baby the guard can't tell
 * is "not sure".
 */

export type OccupantsBySex = { male: number; female: number; boy: number; girl: number; unknown: number };

export const NO_OCCUPANTS: OccupantsBySex = { male: 0, female: 0, boy: 0, girl: 0, unknown: 0 };

export const occupantTotal = (people: OccupantsBySex): number => people.male + people.female + people.boy + people.girl + people.unknown;

export const childrenOf = (people: OccupantsBySex): number => people.boy + people.girl;

const count = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0);

/**
 * Counts as a check's payload carries them. Null when there are none, as for checks from before they were asked.
 * Checks from before children were counted have no boys or girls, so they read as none.
 */
export function occupantsOf(value: unknown): OccupantsBySex | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const people = {
    male: count(fields.male),
    female: count(fields.female),
    boy: count(fields.boy),
    girl: count(fields.girl),
    unknown: count(fields.unknown),
  };
  return occupantTotal(people) > 0 ? people : null;
}

const counted = (n: number, one: string, many: string) => (n ? `${n} ${n === 1 ? one : many}` : null);

/** e.g. "2 men, 1 woman, 1 boy, 1 not sure". */
export function describeOccupants(people: OccupantsBySex): string {
  const parts = [
    counted(people.male, 'man', 'men'),
    counted(people.female, 'woman', 'women'),
    counted(people.boy, 'boy', 'boys'),
    counted(people.girl, 'girl', 'girls'),
    people.unknown ? `${people.unknown} not sure` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(', ') : 'Nobody counted';
}

/** Which way the count changed between coming in and leaving, if it did. */
export type OccupantChange = 'fewer' | 'more' | null;

export const occupantChange = (cameIn: number, leaving: number): OccupantChange => (leaving < cameIn ? 'fewer' : leaving > cameIn ? 'more' : null);
