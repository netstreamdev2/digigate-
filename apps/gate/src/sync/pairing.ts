import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { clearOutbox } from '@/db/outbox';
import { clearVisits } from '@/db/visits';

import type { GateSupabase } from './supabase';

export const PAIRING_CODE_LENGTH = 10;

export type PairingResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-code' | 'code-not-found' | 'no-connection' | 'server-error' };

type PairResponse = {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
};

function isPairResponse(value: unknown): value is PairResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.deviceId === 'string' &&
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string'
  );
}

/** Exchanges a one-time code from the dashboard for this device's own session (supabase/functions/pair-device). */
export async function pairDevice(client: GateSupabase, db: SQLiteDatabase, code: string): Promise<PairingResult> {
  const { data, error } = await client.functions.invoke<unknown>('pair-device', { body: { code } });

  if (error instanceof FunctionsFetchError) return { ok: false, reason: 'no-connection' };
  if (error instanceof FunctionsHttpError) {
    const status = error.context instanceof Response ? error.context.status : 0;
    if (status === 400) return { ok: false, reason: 'invalid-code' };
    if (status === 404) return { ok: false, reason: 'code-not-found' };
    return { ok: false, reason: 'server-error' };
  }
  if (error || !isPairResponse(data)) return { ok: false, reason: 'server-error' };

  const { error: sessionError } = await client.auth.setSession({
    access_token: data.accessToken,
    refresh_token: data.refreshToken,
  });
  if (sessionError) return { ok: false, reason: 'server-error' };

  await clearOutbox(db);
  await clearVisits(db);
  return { ok: true };
}
