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
import { newEventId } from '@/lib/ids';
import { personKeyFor } from '@/lib/person-key';
import { siteConfig } from '@/site/site-config';

import type { Direction, GateCheck } from './decision';
import { demographicsPayload } from './demographics';
import { personIdOf } from './person-id';

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
  }
}

/**
 * Runs the walk-in rules and writes the result before it is shown. A clear entry opens the visit and a clear exit
 * closes it in the same transaction; a warning waits for the guard. The same person gets the same key whether they
 * show a smart ID or a licence, so a driver who walks out is still recognised.
 */
export async function checkPerson(
  db: SQLiteDatabase,
  input: { direction: Direction; person: PersonDocument; visitType: string; guardId: string },
): Promise<CheckedPerson> {
  const { direction } = input;
  const at = Date.now();
  const identity = personIdOf(input.person);
  const personKey = await personKeyFor(identity.idType, identity.idNumber);
  const { state, details } = await loadGateState(db, null);

  const scan = { at, personKey };
  const hits =
    direction === 'entry' ? evaluatePedestrianEntry(scan, state, siteConfig.rules) : evaluatePedestrianExit(scan, state, siteConfig.rules);
  const outcome = outcomeOf(hits);

  const openVisit =
    direction === 'exit' ? state.openVisits.find((visit) => visit.kind === 'pedestrian' && visit.personKey === personKey) : undefined;
  const pendingVisit: NewPedestrianVisit | null =
    direction === 'entry'
      ? { id: newEventId(at), kind: 'pedestrian', personKey, visitType: input.visitType, enteredAt: at, personName: identity.name }
      : null;
  const visitId = pendingVisit?.id ?? openVisit?.id ?? null;

  const event: GateEvent = {
    id: newEventId(at),
    type: direction === 'entry' ? 'pedestrian_entry' : 'pedestrian_exit',
    occurredAt: at,
    gateUserId: input.guardId,
    payload: {
      visit_id: visitId,
      outcome,
      hits: hits.map((ruleHit) => ({ code: ruleHit.code, severity: ruleHit.severity, related_visit_id: ruleHit.relatedVisitId ?? null })),
      person: personPayload(input.person, personKey, at),
      visit_type: direction === 'entry' ? input.visitType : (openVisit?.visitType ?? null),
    },
  };

  const change = outcome !== 'clear' ? null : pendingVisit ? { open: pendingVisit } : openVisit ? { close: openVisit.id } : null;
  await commitGateEvent(db, event, change);

  const related = new Map<string, VisitDetails>();
  for (const ruleHit of hits) {
    const visitDetails = ruleHit.relatedVisitId ? details.get(ruleHit.relatedVisitId) : undefined;
    if (ruleHit.relatedVisitId && visitDetails) related.set(ruleHit.relatedVisitId, visitDetails);
  }
  return { direction, event, hits, outcome, visitId, pendingVisit, related };
}
