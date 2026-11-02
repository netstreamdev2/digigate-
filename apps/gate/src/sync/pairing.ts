import type { SQLiteDatabase } from 'expo-sqlite';

import { clearOutbox } from '@/db/outbox';
import { clearShifts } from '@/db/shifts';
import { clearVisits } from '@/db/visits';
import { setPersonKeySecret } from '@/lib/person-key';

import { callFunction, saveDeviceToken } from './device-api';

export const PAIRING_CODE_LENGTH = 10;

export type PairingResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-code' | 'code-not-found' | 'no-connection' | 'server-error' };

type PairResponse = {
  deviceId: string;
  token: string;
  personKey: string;
};

function isPairResponse(value: unknown): value is PairResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.deviceId === 'string' && typeof candidate.token === 'string' && typeof candidate.personKey === 'string';
}

/** Exchanges a one-time code from the dashboard for this device's token and its organisation's person key. */
export async function pairDevice(db: SQLiteDatabase, code: string): Promise<PairingResult> {
  let response: Response;
  try {
    response = await callFunction('digigate-pair', { code });
  } catch {
    return { ok: false, reason: 'no-connection' };
  }
  if (response.status === 400) return { ok: false, reason: 'invalid-code' };
  if (response.status === 404) return { ok: false, reason: 'code-not-found' };
  if (!response.ok) return { ok: false, reason: 'server-error' };

  const body: unknown = await response.json().catch(() => null);
  if (!isPairResponse(body)) return { ok: false, reason: 'server-error' };

  await saveDeviceToken(body.token);
  await setPersonKeySecret(body.personKey);
  await clearOutbox(db);
  await clearVisits(db);
  await clearShifts(db);
  return { ok: true };
}
