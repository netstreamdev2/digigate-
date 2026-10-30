import type { GateEventPayload, GateEventType } from '@digigate/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import type { FailureRecord } from '@/db/sign-in-failures';

import { verifyPin } from './pin';
import type { GateUser } from './users';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60_000;
const IDLE_CHECK_MS = 10_000;

export type LockReason = 'manual' | 'idle' | 'screen-off';

export type SessionState =
  | { status: 'signed-out' }
  | { status: 'active'; user: GateUser; startedAt: number }
  | { status: 'locked'; user: GateUser; startedAt: number; reason: LockReason };

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: 'wrong-details'; attemptsLeft: number }
  | { ok: false; reason: 'locked-out'; retryAt: number };

export type SupervisorResult =
  | { ok: true; supervisor: GateUser }
  | { ok: false; reason: 'not-a-supervisor' }
  | Exclude<SignInResult, { ok: true }>;

/** Where sign-in reads guards and keeps its records. On the device: the encrypted local database. */
export type SessionStore = {
  findUser(employeeNumber: string): Promise<GateUser | null>;
  getFailure(employeeNumber: string): Promise<FailureRecord | null>;
  setFailure(employeeNumber: string, record: FailureRecord): Promise<void>;
  clearFailure(employeeNumber: string): Promise<void>;
  record(type: GateEventType, gateUserId: string | null, payload?: GateEventPayload): Promise<void>;
};

type SessionApi = {
  state: SessionState;
  signIn(employeeNumber: string, pin: string): Promise<SignInResult>;
  unlock(pin: string): Promise<SignInResult>;
  /** Checks a supervisor's employee number and PIN for an override, with the same lockout and records as sign-in. */
  confirmSupervisor(employeeNumber: string, pin: string): Promise<SupervisorResult>;
  lock(): void;
  signOut(): void;
  /** Called on every touch, so the idle lock measures real inactivity. */
  recordActivity(): void;
  /** True when a lock or sign-out couldn't be written to the device's records. */
  storageProblem: boolean;
};

const SessionContext = createContext<SessionApi | null>(null);

type Props = {
  store: SessionStore;
  idleLockMinutes: number;
  children: ReactNode;
};

// Works the same with or without a connection: PINs are checked against the guard list on the device,
// and every sign-in, failure and lock is written to the outbox for the next sync.
export function SessionProvider({ store, idleLockMinutes, children }: Props) {
  const [state, setState] = useState<SessionState>({ status: 'signed-out' });
  const [storageProblem, setStorageProblem] = useState(false);
  const stateRef = useRef(state);
  const lastActivity = useRef(Date.now());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const recordInBackground = useCallback(
    (type: GateEventType, gateUserId: string, payload: GateEventPayload = {}) => {
      store.record(type, gateUserId, payload).catch(() => setStorageProblem(true));
    },
    [store],
  );

  const attempt = useCallback(
    async (employeeNumber: string, pin: string, user: GateUser | null): Promise<SignInResult> => {
      const now = Date.now();
      const record = await store.getFailure(employeeNumber);
      if (record && record.lockedUntil > now) {
        return { ok: false, reason: 'locked-out', retryAt: record.lockedUntil };
      }

      if (user && user.active && (await verifyPin(pin, user.pin))) {
        await store.clearFailure(employeeNumber);
        return { ok: true };
      }

      // A lockout that has run out starts the count again.
      const count = (record && record.lockedUntil === 0 ? record.count : 0) + 1;
      const gateUserId = user?.id ?? null;
      if (count >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = now + LOCKOUT_MS;
        await store.setFailure(employeeNumber, { count, lockedUntil });
        await store.record('locked_out', gateUserId, { employee_number: employeeNumber, locked_until: lockedUntil });
        return { ok: false, reason: 'locked-out', retryAt: lockedUntil };
      }
      await store.setFailure(employeeNumber, { count, lockedUntil: 0 });
      await store.record('sign_in_failed', gateUserId, { employee_number: employeeNumber, attempt: count });
      return { ok: false, reason: 'wrong-details', attemptsLeft: MAX_FAILED_ATTEMPTS - count };
    },
    [store],
  );

  const signIn = useCallback(
    async (employeeNumber: string, pin: string) => {
      const user = await store.findUser(employeeNumber);
      const result = await attempt(employeeNumber, pin, user);
      if (result.ok && user) {
        await store.record('sign_in', user.id);
        lastActivity.current = Date.now();
        setState({ status: 'active', user, startedAt: Date.now() });
      }
      return result;
    },
    [attempt, store],
  );

  const unlock = useCallback(
    async (pin: string): Promise<SignInResult> => {
      const current = stateRef.current;
      if (current.status !== 'locked') return { ok: false, reason: 'wrong-details', attemptsLeft: 0 };
      const result = await attempt(current.user.employeeNumber, pin, current.user);
      if (result.ok) {
        await store.record('unlock', current.user.id);
        lastActivity.current = Date.now();
        setState({ status: 'active', user: current.user, startedAt: current.startedAt });
      }
      return result;
    },
    [attempt, store],
  );

  const confirmSupervisor = useCallback(
    async (employeeNumber: string, pin: string): Promise<SupervisorResult> => {
      const user = await store.findUser(employeeNumber);
      const result = await attempt(employeeNumber, pin, user);
      if (!result.ok) return result;
      if (!user || user.role !== 'supervisor') return { ok: false, reason: 'not-a-supervisor' };
      return { ok: true, supervisor: user };
    },
    [attempt, store],
  );

  const lockWith = useCallback(
    (reason: LockReason) => {
      const current = stateRef.current;
      if (current.status !== 'active') return;
      setState({ ...current, status: 'locked', reason });
      recordInBackground('lock', current.user.id, { reason });
    },
    [recordInBackground],
  );

  const lock = useCallback(() => lockWith('manual'), [lockWith]);

  const signOut = useCallback(() => {
    const current = stateRef.current;
    if (current.status === 'signed-out') return;
    setState({ status: 'signed-out' });
    recordInBackground('sign_out', current.user.id);
  }, [recordInBackground]);

  const recordActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (state.status !== 'active') return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > idleLockMinutes * 60_000) lockWith('idle');
    }, IDLE_CHECK_MS);
    return () => clearInterval(timer);
  }, [idleLockMinutes, lockWith, state.status]);

  // A shared device that goes dark, or leaves DigiGate, locks at once: whoever picks it up next needs a PIN.
  useEffect(() => {
    if (state.status !== 'active') return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background') lockWith('screen-off');
    });
    return () => subscription.remove();
  }, [lockWith, state.status]);

  const api = useMemo<SessionApi>(
    () => ({ state, signIn, unlock, confirmSupervisor, lock, signOut, recordActivity, storageProblem }),
    [confirmSupervisor, lock, recordActivity, signIn, signOut, state, storageProblem, unlock],
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
