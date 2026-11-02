import { factsFromSaIdNumber, isValidSaIdNumber, type GateEventPayload } from '@digigate/core';

import { SA_ID_TYPE } from '@/lib/person-key';

import { demographicsPayload } from './demographics';

/** Someone the guard typed in: a passport, a damaged card, or a document with no barcode. */
export type TypedPerson = { idType: string; idNumber: string; names: string; surname: string };

/** The key type for a number that isn't a valid South African ID number: a passport or another country's ID. */
const OTHER_ID_TYPE = 'OTHER';

/**
 * A typed number as the person is keyed by. A valid SA ID number gets the same type as a scanned card, so a person
 * typed in today is still recognised when their card scans tomorrow. Anything else is kept as typed, in capitals.
 */
export function typedIdentity(number: string): { idType: string; idNumber: string; saId: boolean } {
  const idNumber = number.replace(/\s+/g, '').toUpperCase();
  const saId = /^\d{13}$/.test(idNumber) && isValidSaIdNumber(idNumber);
  return { idType: saId ? SA_ID_TYPE : OTHER_ID_TYPE, idNumber, saId };
}

/** What a typed-in person's record says about them. Sex and age come only from a valid SA ID number. */
export function typedPersonPayload(person: TypedPerson, personKey: string, reason: string, at: number): GateEventPayload {
  const facts = person.idType === SA_ID_TYPE ? factsFromSaIdNumber(person.idNumber, at) : null;
  return {
    person_key: personKey,
    document: 'typed',
    id_type: person.idType === SA_ID_TYPE ? 'sa-id' : 'other',
    names: person.names,
    surname: person.surname,
    manual: true,
    manual_reason: reason,
    demographics: demographicsPayload(facts?.gender ?? null, facts?.birthDate ?? null, at),
  };
}
