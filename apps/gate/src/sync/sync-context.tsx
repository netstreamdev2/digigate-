import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useLocalDatabase } from '@/db/database-context';
import { countPendingEvents } from '@/db/outbox';

import { pairDevice, type PairingResult } from './pairing';
import { createGateSupabase } from './supabase';
import { syncOnce } from './sync';

const SYNC_INTERVAL_MS = 60_000;
const UPLOAD_DELAY_MS = 2_000;

export type SyncStatus =
  /** Built without Supabase settings: everything stays on this device. */
  | { state: 'local-only' }
  | { state: 'not-paired' }
  | { state: 'syncing'; lastSyncedAt: number | null }
  | { state: 'synced'; lastSyncedAt: number }
  | { state: 'offline'; lastSyncedAt: number | null; problem: string };

type SyncApi = {
  status: SyncStatus;
  pendingEvents: number;
  syncNow(): Promise<void>;
  pair(code: string): Promise<PairingResult>;
  /** Called after an event is written locally, so it goes up soon when there's a connection. */
  eventRecorded(): void;
};

const SyncContext = createContext<SyncApi | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { db } = useLocalDatabase();
  const client = useMemo(() => createGateSupabase(db), [db]);
  const [status, setStatus] = useState<SyncStatus>(
    client ? { state: 'syncing', lastSyncedAt: null } : { state: 'local-only' },
  );
  const [pendingEvents, setPendingEvents] = useState(0);
  const running = useRef(false);
  const lastSyncedAt = useRef<number | null>(null);
  const uploadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPending = useCallback(async () => {
    setPendingEvents(await countPendingEvents(db));
  }, [db]);

  const syncNow = useCallback(async () => {
    if (!client || running.current) {
      await refreshPending();
      return;
    }
    running.current = true;
    setStatus({ state: 'syncing', lastSyncedAt: lastSyncedAt.current });
    try {
      const outcome = await syncOnce(client, db);
      if (outcome.status === 'synced') {
        lastSyncedAt.current = outcome.at;
        setStatus({ state: 'synced', lastSyncedAt: outcome.at });
      } else if (outcome.status === 'not-paired') {
        setStatus({ state: 'not-paired' });
      } else {
        setStatus({ state: 'offline', lastSyncedAt: lastSyncedAt.current, problem: outcome.reason });
      }
    } catch (cause) {
      // Most often there's simply no connection; the outbox keeps everything until the next round.
      const problem = cause instanceof Error ? cause.message : 'Unknown sync error';
      setStatus({ state: 'offline', lastSyncedAt: lastSyncedAt.current, problem });
    } finally {
      running.current = false;
      await refreshPending();
    }
  }, [client, db, refreshPending]);

  const eventRecorded = useCallback(() => {
    void refreshPending();
    if (uploadTimer.current) clearTimeout(uploadTimer.current);
    uploadTimer.current = setTimeout(() => void syncNow(), UPLOAD_DELAY_MS);
  }, [refreshPending, syncNow]);

  const pair = useCallback(
    async (code: string): Promise<PairingResult> => {
      if (!client) return { ok: false, reason: 'server-error' };
      const result = await pairDevice(client, db, code);
      if (result.ok) await syncNow();
      return result;
    },
    [client, db, syncNow],
  );

  useEffect(() => {
    void syncNow();
    const timer = setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (client) void client.auth.startAutoRefresh();
        void syncNow();
      } else if (client) {
        void client.auth.stopAutoRefresh();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (uploadTimer.current) clearTimeout(uploadTimer.current);
    };
  }, [client, syncNow]);

  const api = useMemo<SyncApi>(
    () => ({ status, pendingEvents, syncNow, pair, eventRecorded }),
    [eventRecorded, pair, pendingEvents, status, syncNow],
  );

  return <SyncContext.Provider value={api}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncApi {
  const sync = useContext(SyncContext);
  if (!sync) throw new Error('useSync must be used inside SyncProvider');
  return sync;
}
