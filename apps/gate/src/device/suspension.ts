import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { getValue, removeValue, setValue } from '@/db/kv';
import { appendEvent } from '@/db/outbox';
import { newEventId } from '@/lib/ids';

import { releaseHandheld } from './gate-policy';

/*
 * Two things only a super user decides, which reach a handheld at its sync:
 * - Suspension, when the security company doesn't pay. The handheld then shows a full-screen notice and does nothing
 *   else, but keeps syncing, so what it recorded still uploads, and it comes back the moment the company is reinstated.
 *   It's kept on the handheld, so a restart or a dead connection doesn't lift it.
 * - Release from DigiGate's control. The handheld does it itself and says so; nobody at the site can.
 */

const SUSPENDED_KEY = 'company_suspended';

export type Suspension = { reason: string | null } | null;

let current: Suspension = null;
const listeners = new Set<() => void>();

function publish(next: Suspension): void {
  current = next;
  for (const listener of listeners) listener();
}

/** What the handheld last heard, read once at start. */
export async function loadSuspension(db: SQLiteDatabase): Promise<void> {
  const stored = await getValue(db, SUSPENDED_KEY);
  if (stored === null) return publish(null);
  const parsed: unknown = JSON.parse(stored);
  const reason = typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).reason === 'string' ? ((parsed as Record<string, unknown>).reason as string) : null;
  publish({ reason });
}

/** The server's word at each sync: suspended with a reason, or not. An older server says nothing, which changes nothing. */
export async function applySuspension(db: SQLiteDatabase, value: unknown): Promise<void> {
  if (value === undefined) return;
  if (value === null) {
    await removeValue(db, SUSPENDED_KEY);
    return publish(null);
  }
  const reason = typeof value === 'object' && typeof (value as Record<string, unknown>).reason === 'string' ? ((value as Record<string, unknown>).reason as string) : null;
  await setValue(db, SUSPENDED_KEY, JSON.stringify({ reason }));
  publish({ reason });
}

export function useSuspension(): Suspension {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

/**
 * A super user asked for this handheld's release. It hands itself back and records that it did, which clears the
 * request on the server. A handheld DigiGate doesn't own has nothing to release.
 */
export async function releaseOnRequest(db: SQLiteDatabase, requested: unknown): Promise<void> {
  if (requested !== true) return;
  const result = releaseHandheld();
  if (!result.released && result.problems.includes('not-device-owner')) return;
  const at = Date.now();
  await appendEvent(db, {
    id: newEventId(at),
    type: 'handheld_released',
    occurredAt: at,
    gateUserId: null,
    payload: { released: result.released, problems: result.released ? [] : result.problems, by: 'super_user' },
  });
}
