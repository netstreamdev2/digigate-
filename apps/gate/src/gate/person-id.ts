import type { PersonDocument } from '@/components/person-card';
import { SA_ID_TYPE } from '@/lib/person-key';

/**
 * The ID type and number a person is keyed by, and the name to show. A smart ID and a licence on the same SA ID
 * number give the same key, so someone is recognised whichever card they show.
 */
export function personIdOf(person: PersonDocument): { idType: string; idNumber: string; name: string } {
  if (person.kind === 'driver-licence') {
    const { licence } = person;
    return { idType: licence.idNumberType, idNumber: licence.idNumber, name: `${licence.initials} ${licence.surname}` };
  }
  if (person.kind === 'id-book') {
    return { idType: SA_ID_TYPE, idNumber: person.idNumber, name: `${person.names} ${person.surname}` };
  }
  const { card } = person;
  return { idType: SA_ID_TYPE, idNumber: card.idNumber, name: `${card.names} ${card.surname}` };
}
