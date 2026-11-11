import {
  evaluatePedestrianEntry,
  evaluatePedestrianExit,
  factsFromSaIdNumber,
  outcomeOf,
  type GateEvent,
  type GateEventPayload,
  type Outcome,
} from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { PersonDocument } from '@/components/person-card';
import { commitGateEvent, loadGateState, type NewPedestrianVisit, type VisitDetails } from '@/db/visits';
import type { SyncedBooking } from '@/db/watch-lists';
import { newEventId } from '@/lib/ids';
import { personKeyFor } from '@/lib/person-key';
import { siteConfig } from '@/site/site-config';

import { bookingFor, hitsPayload, notesFor, type Direction, type GateCheck } from './decision';
import { demographicsPayload } from './demographics';
import { personIdOf } from './person-id';
import { typedPersonPayload } from './typed-identity';

export type CheckedPerson = GateCheck & {
  outcome: Outcome;
  /** Open visits the hits point at, for the guard's explanation. */
  related: ReadonlyMap<string, VisitDetails>;
};

// Until the lawyer settles how ID numbers are kept, events carry the keyed hash and the printed name only.
// The document type travels with the record, so the dashboard knows how much to expect: an ID book carries only
// the ID number, and its name and sex were typed in by the guard (`manual`).
function personPayload(person: PersonDocument, personKey: string, at: number): GateEventPayload {
  switch (person.kind) {
    case 'driver-licence':
      return {
        person_key: personKey,
        document: 'driver-licence',
        initials: person.licence.initials,
        surname: person.licence.surname,
        manual: false,
        demographics: demographicsPayload(person.licence.gender, person.licence.birthDate, at),
      };
    case 'smart-id':
      return {
        person_key: personKey,
        document: 'smart-id',
        names: person.card.names,
        surname: person.card.surname,
        manual: false,
        demographics: demographicsPayload(person.card.gender, person.card.birthDate, at),
      };
    case 'id-book':
      return {
        person_key: personKey,
        document: 'green-id-book',
        names: person.names,
        surname: person.surname,
        gender: person.gender,
        manual: true,
        demographics: demographicsPayload(person.gender, factsFromSaIdNumber(person.idNumber, at)?.birthDate ?? null, at),
      };
    case 'typed':
      return typedPersonPayload(person, personKey, person.reason, at);
  }
}

/**
 * Runs the walk-in rules and writes the result before it is shown. A clear entry opens the visit and a clear exit
 * closes it in the same transaction; a warning waits for the guard. The same person gets the same key whether they
 * show a smart ID or a licence, so a driver who walks out is still recognised.
 */
export async function checkPerson(
  db: SQLiteDatabase,
  input: {
    direction: Direction;
    person: PersonDocument;
    visitType: string;
    expectedStayMinutes: number | null;
    guardId: string;
    /** The booking a scanned invite opened, on the way in. */
    invitedBooking?: SyncedBooking | null;
  },
): Promise<CheckedPerson> {
  const { direction } = input;
  const at = Date.now();
  const identity = personIdOf(input.person);
  const personKey = await personKeyFor(identity.idType, identity.idNumber);
  const { state, details, hotlistNotes } = await loadGateState(db, null, at);

  const scan = { at, personKey };
  const hits =
    direction === 'entry' ? evaluatePedestrianEntry(scan, state, siteConfig.rules) : evaluatePedestrianExit(scan, state, siteConfig.rules);
  const outcome = outcomeOf(hits);

  const openVisit =
    direction === 'exit' ? state.openVisits.find((visit) => visit.kind === 'pedestrian' && visit.personKey === personKey) : undefined;
  const pendingVisit: NewPedestrianVisit | null =
    direction === 'entry'
      ? { id: newEventId(at), kind: 'pedestrian', personKey, visitType: input.visitType, enteredAt: at, expectedStayMinutes: input.expectedStayMinutes, personName: identity.name }
      : null;
  const visitId = pendingVisit?.id ?? openVisit?.id ?? null;
  const expected = direction === 'entry' ? (input.invitedBooking ?? (await bookingFor(db, at, personKey, []))) : null;

  const event: GateEvent = {
    id: newEventId(at),
    type: direction === 'entry' ? 'pedestrian_entry' : 'pedestrian_exit',
    occurredAt: at,
    gateUserId: input.guardId,
    payload: {
      visit_id: visitId,
      outcome,
      hits: hitsPayload(hits),
      person: personPayload(input.person, personKey, at),
      visit_type: direction === 'entry' ? input.visitType : (openVisit?.visitType ?? null),
      expected_stay_minutes: direction === 'entry' ? input.expectedStayMinutes : null,
      expected_visitor_id: expected?.id ?? null,
    },
  };

  const change = outcome !== 'clear' ? null : pendingVisit ? { open: pendingVisit } : openVisit ? { close: openVisit.id } : null;
  await commitGateEvent(db, event, change, expected?.singleUse ? expected.id : null);

  const related = new Map<string, VisitDetails>();
  for (const ruleHit of hits) {
    const visitDetails = ruleHit.relatedVisitId ? details.get(ruleHit.relatedVisitId) : undefined;
    if (ruleHit.relatedVisitId && visitDetails) related.set(ruleHit.relatedVisitId, visitDetails);
  }
  return { direction, event, hits, outcome, visitId, pendingVisit, related, hotlistNotes: notesFor(hits, hotlistNotes), expected };
}
