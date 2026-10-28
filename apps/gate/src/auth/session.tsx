import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { verifyPin } from './pin';
import type { GateUser } from './users';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;
const IDLE_CHECK_MS = 10_000;

export type SessionState =
  | { status: 'signed-out' }
  | { status: 'active'; user: GateUser; startedAt: number }
  | { status: 'locked'; user: GateUser; startedAt: number };

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-details'; attemptsLeft: number }
  | { ok: false; reason: 'locked-out'; retryAt: number };

type SessionApi = {
  state: SessionState;
  signIn(employeeNumber: string, pin: string): Promise<SignInResult>;
  unlock(pin: string): Promise<SignInResult>;
  lock(): void;
  signOut(): void;
  /** Called on every touch, so the idle lock measures real inactivity. */
  recordActivity(): void;
};

type FailureRecord = {
  count: number;
  lockedUntil: number;
};

const SessionContext = createContext<SessionApi | null>(null);

type Props = {
  users: readonly GateUser[];
  idleLockMinutes: number;
  children: ReactNode;
};

// Failed attempts are kept in memory for now, so a restart clears a lockout.
// They move into the encrypted local database with the rest of Phase 1.
export function SessionProvider({ users, idleLockMinutes, children }: Props) {
  const [state, setState] = useState<SessionState>({ status: 'signed-out' });
  const failures = useRef(new Map<string, FailureRecord>());
  const lastActivity = useRef(Date.now());

  const attempt = useCallback(async (employeeNumber: string, pin: string, user: GateUser | undefined): Promise<SignInResult> => {
    const now = Date.now();
    const record = failures.current.get(employeeNumber);
    if (record && record.lockedUntil > now) {
      return { ok: false, reason: 'locked-out', retryAt: record.lockedUntil };
    }

    if (user && (await verifyPin(pin, user.pin))) {
      failures.current.delete(employeeNumber);
      return { ok: true };
    }

    // A lockout that has run out starts the count again.
    const count = (record && record.lockedUntil === 0 ? record.count : 0) + 1;
    if (count >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = now + LOCKOUT_MS;
      failures.current.set(employeeNumber, { count, lockedUntil });
      return { ok: false, reason: 'locked-out', retryAt: lockedUntil };
    }
    failures.current.set(employeeNumber, { count, lockedUntil: 0 });
    return { ok: false, reason: 'wrong-details', attemptsLeft: MAX_FAILED_ATTEMPTS - count };
  }, []);

  const signIn = useCallback(
    async (employeeNumber: string, pin: string) => {
      const user = users.find((candidate) => candidate.employeeNumber === employeeNumber);
      const result = await attempt(employeeNumber, pin, user);
      if (result.ok && user) {
        lastActivity.current = Date.now();
        setState({ status: 'active', user, startedAt: Date.now() });
      }
      return result;
    },
    [attempt, users],
  );

  const unlock = useCallback(
    async (pin: string): Promise<SignInResult> => {
      if (state.status !== 'locked') return { ok: false, reason: 'wrong-details', attemptsLeft: 0 };
      const result = await attempt(state.user.employeeNumber, pin, state.user);
      if (result.ok) {
        lastActivity.current = Date.now();
        setState({ ...state, status: 'active' });
      }
      return result;
    },
    [attempt, state],
  );

  const lock = useCallback(() => {
    setState((current) => (current.status === 'active' ? { ...current, status: 'locked' } : current));
  }, []);

  const signOut = useCallback(() => setState({ status: 'signed-out' }), []);

  const recordActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (state.status !== 'active') return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > idleLockMinutes * 60_000) lock();
    }, IDLE_CHECK_MS);
    return () => clearInterval(timer);
  }, [idleLockMinutes, lock, state.status]);

  const api = useMemo<SessionApi>(
    () => ({ state, signIn, unlock, lock, signOut, recordActivity }),
    [lock, recordActivity, signIn, signOut, state, unlock],
  );

  return <SessionContext.Provider value={api}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

/** The signed-in (or locked) user. Null while signed out, including the moment a screen is closing after sign-out. */
export function useCurrentUser(): GateUser | null {
  const { state } = useSession();
  return state.status === 'signed-out' ? null : state.user;
}
