import type { GateEvent } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

import { keepPlatePhoto } from '@/db/plate-photos';

/**
 * Once a check is on record, keeps the plate photo that came with it, as evidence of what plate the car carried.
 * Returns what went wrong, if anything: the check itself is safe either way.
 */
export function useKeepPlatePhoto(db: SQLiteDatabase, event: Pick<GateEvent, 'id' | 'occurredAt'> | null, photo: string | null): string | null {
  const kept = useRef<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!event || !photo || kept.current === event.id) return;
    kept.current = event.id;
    keepPlatePhoto(db, event.id, event.occurredAt, photo).catch((cause: unknown) => {
      setProblem(`The plate photo wasn't kept (${cause instanceof Error ? cause.message : 'unknown error'}). The check itself is on record.`);
    });
  }, [db, event, photo]);

  return problem;
}
