import { normaliseIdentifier } from './identifiers';
import type { EpochMs, PersonKey } from './rules/types';

/**
 * A visitor booked in ahead from the dashboard: known by their ID number (kept as a person key), by the plate of the
 * car they're coming in, or both, for a stretch of days.
 */
export type ExpectedVisitor = {
  id: string;
  /** As the booking was made: the name the guard checks against the document. */
  name: string;
  personKey: PersonKey | null;
  plate: string | null;
  /** The visit type the booking asks for, if it set one. */
  visitType: string | null;
  from: EpochMs;
  until: EpochMs;
  /** A visitor invite's hash, when the booking came from one; matched by scanning the visitor's QR. */
  invite?: string | null;
  /** One visit only, as an invite is. */
  singleUse?: boolean;
};

/**
 * The booking that expects this person or car now. A person's own key is the surer match, so it's looked for first;
 * a plate alone finds the booking for a car whose driver wasn't named. Outside its days a booking expects nobody.
 */
export function expectedVisitorFor(
  subject: { personKey: PersonKey; plates: readonly string[] },
  at: EpochMs,
  expected: readonly ExpectedVisitor[],
): ExpectedVisitor | undefined {
  const current = expected.filter((booking) => booking.from <= at && at <= booking.until);
  const byPerson = current.find((booking) => booking.personKey !== null && booking.personKey === subject.personKey);
  if (byPerson) return byPerson;
  const plates = subject.plates.map(normaliseIdentifier).filter((plate) => plate !== '');
  return current.find((booking) => booking.plate !== null && normaliseIdentifier(booking.plate) !== '' && plates.includes(normaliseIdentifier(booking.plate)));
}
