import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { useLocalDatabase } from '@/db/database-context';
import { forgetDutyElsewhere } from '@/db/duty-elsewhere';
import { beginShift, closeShift, openShift, type Shift, type ShiftMove, type ShiftPhoto } from '@/db/shifts';
import { newEventId } from '@/lib/ids';
import { hasBoomAt, lanesOf, postLabel, siteConfig, siteName, type Lane } from '@/site/site-config';
import { useSync } from '@/sync/sync-context';

const HOUR_MS = 60 * 60_000;

type ShiftApi = {
  /** The device's open shift, whoever it belongs to. Undefined until it's known for the signed-in guard. */
  shift: Shift | null | undefined;
  /** True when the device's shift record couldn't be read. */
  problem: boolean;
  /** A move takes over the guard's shift from another handheld, with a supervisor's approval. */
  start(post: string, period: string, photo: ShiftPhoto, move?: ShiftMove | null): Promise<void>;
  /** Ends the guard's shift and signs them out. */
  end(): Promise<void>;
};

const ShiftContext = createContext<ShiftApi | null>(null);

/**
 * Which guard is on duty on this device. A guard who signs back in during their shift carries on with it; one who
 * signs in over someone else's open shift starts their own. A shift nobody ended runs out after `maxShiftHours`, so
 * nobody stays on duty for days from one start.
 */
export function ShiftProvider({ children }: { children: ReactNode }) {
  const { db } = useLocalDatabase();
  const { eventRecorded, status } = useSync();
  const syncedAt = status.state === 'synced' ? status.lastSyncedAt : null;
  const { state, signOut } = useSession();
  const userId = state.status === 'signed-out' ? null : state.user.id;
  const [known, setKnown] = useState<{ forUser: string; shift: Shift | null } | null>(null);
  const [problem, setProblem] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const open = await openShift(db);
      if (!open || Date.now() - open.startedAt <= siteConfig.maxShiftHours * HOUR_MS) return open;
      await closeShift(db, open, Date.now(), 'timed-out');
      eventRecorded();
      return null;
    };
    load().then(
      (shift) => {
        if (cancelled) return;
        setProblem(false);
        setKnown({ forUser: userId, shift });
      },
      () => {
        if (cancelled) return;
        // The guard can still start a shift, and starting one writes a fresh record of who is on duty.
        setProblem(true);
        setKnown({ forUser: userId, shift: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, eventRecorded, userId]);

  const shift = userId !== null && known?.forUser === userId ? known.shift : undefined;

  // A supervisor may have moved this guard's shift to another handheld. The sync has ended it here, so they're signed
  // out, and the sign-in screen says why.
  useEffect(() => {
    if (syncedAt === null || !userId || !shift) return;
    const onShift = shift.id;
    let cancelled = false;
    openShift(db).then(
      (open) => {
        if (cancelled || open?.id === onShift) return;
        setKnown({ forUser: userId, shift: null });
        signOut();
      },
      () => {
        // The record couldn't be read this time; the next sync checks again.
      },
    );
    return () => {
      cancelled = true;
    };
  }, [db, shift, signOut, syncedAt, userId]);

  const start = useCallback(
    async (post: string, period: string, photo: ShiftPhoto, move: ShiftMove | null = null) => {
      if (!userId) return;
      const at = Date.now();
      const next: Shift = { id: newEventId(at), gateUserId: userId, post, period, startedAt: at, awayUntil: null };
      await beginShift(db, next, photo, move);
      if (move) await forgetDutyElsewhere(db, move.fromShiftId);
      setProblem(false);
      setKnown({ forUser: userId, shift: next });
      eventRecorded();
    },
    [db, eventRecorded, userId],
  );

  const end = useCallback(async () => {
    if (!userId || !shift) return;
    await closeShift(db, shift, Date.now(), 'ended');
    setKnown({ forUser: userId, shift: null });
    eventRecorded();
    signOut();
  }, [db, eventRecorded, shift, signOut, userId]);

  const api = useMemo<ShiftApi>(() => ({ shift, problem, start, end }), [end, problem, shift, start]);

  return <ShiftContext.Provider value={api}>{children}</ShiftContext.Provider>;
}

/** Where the signed-in guard is posted: its name, and which lanes it handles. */
export function usePost(): { label: string; lanes: readonly Lane[]; hasBoom: boolean } {
  const { shift } = useShift();
  return useMemo(
    () => ({ label: shift ? postLabel(shift.post) : siteName(), lanes: lanesOf(shift?.post ?? ''), hasBoom: hasBoomAt(shift?.post ?? '') }),
    [shift],
  );
}

export function useShift(): ShiftApi {
  const shift = useContext(ShiftContext);
  if (!shift) throw new Error('useShift must be used inside ShiftProvider');
  return shift;
}
