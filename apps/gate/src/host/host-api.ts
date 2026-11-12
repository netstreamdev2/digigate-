import * as SecureStore from 'expo-secure-store';

import { callFunction } from '@/sync/device-api';

/*
 * The visitor-invite app's only way to the server: the digigate-host function, which runs every call as the host. The
 * phone keeps the refresh token in the Keystore and the short-lived access token in memory only, and holds no keys.
 */

const REFRESH_KEY = 'digigate.host.refresh';
/** Refresh this long before the access token runs out, so a slow network never sends a dead one. */
const EARLY_MS = 60_000;

export type HostSession = { accessToken: string; refreshToken: string; expiresAt: number };

export class HostApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly problem: string | null,
  ) {
    super(code);
  }
}

let current: HostSession | null = null;

async function post(body: Record<string, unknown>, token?: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await callFunction('digigate-host', body, token);
  } catch {
    throw new HostApiError('offline', 0, null);
  }
  const data: unknown = await response.json().catch(() => ({}));
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new HostApiError(typeof record.error === 'string' ? record.error : 'failed', response.status, typeof record.problem === 'string' ? record.problem : null);
  }
  return record;
}

function sessionOf(value: unknown): HostSession | null {
  if (typeof value !== 'object' || value === null) return null;
  const { accessToken, refreshToken, expiresAt } = value as Record<string, unknown>;
  return typeof accessToken === 'string' && typeof refreshToken === 'string' && typeof expiresAt === 'number' ? { accessToken, refreshToken, expiresAt } : null;
}

async function keep(session: HostSession): Promise<void> {
  current = session;
  await SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken);
}

export async function forgetHostSession(): Promise<void> {
  current = null;
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export type SignedIn = { name: string; mustChangePassword: boolean };

export async function signInHost(login: string, password: string): Promise<SignedIn> {
  const data = await post({ action: 'sign-in', login, password });
  const session = sessionOf(data.session);
  if (!session) throw new HostApiError('failed', 500, null);
  await keep(session);
  return { name: typeof data.name === 'string' ? data.name : '', mustChangePassword: data.mustChangePassword === true };
}

/** A fresh access token, refreshing from the kept refresh token when it's due. Null when nobody is signed in here. */
async function accessToken(force = false): Promise<string | null> {
  if (current && !force && current.expiresAt - Date.now() > EARLY_MS) return current.accessToken;
  const refreshToken = current?.refreshToken ?? (await SecureStore.getItemAsync(REFRESH_KEY));
  if (!refreshToken) return null;
  try {
    const session = sessionOf((await post({ action: 'refresh', refreshToken })).session);
    if (!session) return null;
    await keep(session);
    return session.accessToken;
  } catch (cause) {
    // A refresh token the server no longer takes means signed out; no connection means try later.
    if (cause instanceof HostApiError && cause.status === 401) await forgetHostSession();
    throw cause;
  }
}

/** One call as the signed-in host; a token the server turns down is refreshed once and tried again. */
export async function callHost(action: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const token = await accessToken();
  if (!token) throw new HostApiError('not-signed-in', 401, null);
  try {
    return await post({ action, ...body }, token);
  } catch (cause) {
    if (!(cause instanceof HostApiError) || cause.status !== 401) throw cause;
    const fresh = await accessToken(true);
    if (!fresh) throw cause;
    return post({ action, ...body }, fresh);
  }
}

/** Whether a host signed in on this phone before; the server still has the last word. */
export async function hasHostSession(): Promise<boolean> {
  return current !== null || (await SecureStore.getItemAsync(REFRESH_KEY)) !== null;
}
