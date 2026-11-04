import { carParkState, type CarParkState } from '@digigate/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLocalDatabase } from '@/db/database-context';
import { siteHeadcount } from '@/db/visits';
import { siteCarPark } from '@/site/site-config';
import { useSync } from '@/sync/sync-context';

const UNKNOWN: CarParkState = { kind: 'unknown' };

/**
 * The car park now, from the cars every gate has inside as of the last sync, read when the screen comes to the front
 * and after each sync. Off the scan path: it's read beside the screen, never while a check runs.
 */
export function useCarPark(): CarParkState {
  const { db } = useLocalDatabase();
  const { status } = useSync();
  const syncedAt = status.state === 'synced' ? status.lastSyncedAt : null;
  const [state, setState] = useState<CarParkState>(UNKNOWN);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      // For reading only, so a failed read says nothing is known rather than stopping the screen.
      siteHeadcount(db).then(
        ({ vehicles }) => {
          if (active) setState(carParkState(siteCarPark(), vehicles));
        },
        () => {
          if (active) setState(UNKNOWN);
        },
      );
      return () => {
        active = false;
      };
    }, [db, syncedAt]),
  );

  return state;
}
