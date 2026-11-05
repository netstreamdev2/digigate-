/**
 * Who is in a car, counted by the guard: men, women, and anyone they couldn't tell. Counts only, never who: it helps the
 * control room picture a car and tell a dropped-off passenger from a missing one, and it feeds nothing else.
 */

export type OccupantsBySex = { male: number; female: number; unknown: number };

export const NO_OCCUPANTS: OccupantsBySex = { male: 0, female: 0, unknown: 0 };

export const occupantTotal = (people: OccupantsBySex): number => people.male + people.female + people.unknown;

const count = (value: unknown): number => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0);

/** Counts as a check's payload carries them. Null when there are none, as for checks from before they were asked. */
export function occupantsOf(value: unknown): OccupantsBySex | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  const people = { male: count(fields.male), female: count(fields.female), unknown: count(fields.unknown) };
  return occupantTotal(people) > 0 ? people : null;
}

/** e.g. "2 men, 1 woman, 1 not sure". */
export function describeOccupants(people: OccupantsBySex): string {
  const parts = [
    people.male ? `${people.male} ${people.male === 1 ? 'man' : 'men'}` : null,
    people.female ? `${people.female} ${people.female === 1 ? 'woman' : 'women'}` : null,
    people.unknown ? `${people.unknown} not sure` : null,
  ].filter((part): part is string => part !== null);
  return parts.length ? parts.join(', ') : 'Nobody counted';
}

/** Which way the count changed between coming in and leaving, if it did. */
export type OccupantChange = 'fewer' | 'more' | null;

export const occupantChange = (cameIn: number, leaving: number): OccupantChange => (leaving < cameIn ? 'fewer' : leaving > cameIn ? 'more' : null);
