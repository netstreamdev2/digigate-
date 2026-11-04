import type { GateEvent, LicencePhotoResult } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';

import { keepLicencePhoto } from '@/db/licence-photos';

/**
 * Once a check is on record, keeps the licence photo that came with it for the control room. The photo often decodes
 * after the result is showing, so this waits for whichever comes second. Returns what went wrong, if anything: the
 * check itself is safe either way.
 */
export function useKeepLicencePhoto(db: SQLiteDatabase, event: Pick<GateEvent, 'id' | 'occurredAt'> | null, photo: LicencePhotoResult | null): string | null {
  const kept = useRef<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!event || !photo?.ok || kept.current === event.id) return;
    kept.current = event.id;
    keepLicencePhoto(db, event.id, event.occurredAt, photo.photo).catch((cause: unknown) => {
      setProblem(`The licence photo wasn't kept for the control room (${cause instanceof Error ? cause.message : 'unknown error'}). The check itself is on record.`);
    });
  }, [db, event, photo]);

  return problem;
}
