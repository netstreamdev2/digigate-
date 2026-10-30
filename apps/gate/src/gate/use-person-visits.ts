import { useEffect, useState } from 'react';

import type { PersonDocument } from '@/components/person-card';
import { useLocalDatabase } from '@/db/database-context';
import { openVisitsForPerson, type PersonVisit } from '@/db/visits';
import { personKeyFor } from '@/lib/person-key';

import { personIdOf } from './person-id';

export type PersonVisits = { status: 'idle' } | { status: 'loading' } | { status: 'loaded'; visits: PersonVisit[] } | { status: 'failed'; message: string };

/** The scanned person's open visits, looked up as soon as they're scanned, so the guard sees them before Check. */
export function usePersonVisits(person: PersonDocument | null): PersonVisits {
  const { db } = useLocalDatabase();
  const [visits, setVisits] = useState<PersonVisits>({ status: 'idle' });
  // Keyed by the ID, not the object, so a licence photo arriving a moment later doesn't repeat the lookup.
  const id = person ? personIdOf(person) : null;
  const idType = id?.idType ?? null;
  const idNumber = id?.idNumber ?? null;

  useEffect(() => {
    if (idType === null || idNumber === null) {
      setVisits({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setVisits({ status: 'loading' });
    personKeyFor(idType, idNumber)
      .then((key) => openVisitsForPerson(db, key))
      .then(
        (found) => {
          if (!cancelled) setVisits({ status: 'loaded', visits: found });
        },
        (cause: unknown) => {
          if (!cancelled) setVisits({ status: 'failed', message: cause instanceof Error ? cause.message : 'unknown error' });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [db, idType, idNumber]);

  return visits;
}

/** The current time, refreshed every `intervalMs`, for durations that should stay true while a screen is open. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
