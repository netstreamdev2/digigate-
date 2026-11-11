import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { useLocalDatabase } from '@/db/database-context';
import { loadLastScan, type LastScan } from '@/db/last-scan';
import type { Shift } from '@/db/shifts';
import { loadSiteToday } from '@/db/site-today';
import { siteHeadcount } from '@/db/visits';
import { siteConfig } from '@/site/site-config';
import { useSync } from '@/sync/sync-context';

const REFRESH_MS = 30_000;

/**
 * What home shows. Who is on site comes from this device's records, which hold every gate's open visits as of the last
 * sync. The day's average stay and the open alerts come from the server, so they're null until a sync today.
 */
export type HomeFigures = {
  vehicles: number;
  people: number;
  averageStayMs: number | null;
  lastScan: LastScan | null;
  readAt: number;
};

/** Read while home is in front, and again every half minute and after each sync. Null while loading or if a read fails. */
export function useHomeFigures(shift: Shift | null | undefined): HomeFigures | null {
  const { db } = useLocalDatabase();
  const { status } = useSync();
  const syncedAt = status.state === 'synced' ? status.lastSyncedAt : null;
  const [figures, setFigures] = useState<HomeFigures | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        const now = Date.now();
        const [headcount, today, lastScan] = await Promise.all([
          siteHeadcount(db),
          loadSiteToday(db, now, siteConfig.rules.utcOffsetMinutes),
          shift ? loadLastScan(db, shift) : Promise.resolve(null),
        ]);
        if (!active) return;
        setFigures({
          ...headcount,
          averageStayMs: today && today.exits > 0 ? (today.stayMinutes / today.exits) * 60_000 : null,
          lastScan,
          readAt: now,
        });
      };
      // The figures are for reading, not for acting on, so a failed read shows dashes rather than stopping the screen.
      const refresh = () => load().catch(() => (active ? setFigures(null) : undefined));
      void refresh();
      const timer = setInterval(() => void refresh(), REFRESH_MS);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [db, shift, syncedAt]),
  );

  return figures;
}
