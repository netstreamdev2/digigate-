import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { callHost, forgetHostSession, hasHostSession, HostApiError, signInHost } from './host-api';

/** The host on this phone: still checking, signed out, or signed in (and whether they must choose a password first). */
export type HostState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; name: string; mustChangePassword: boolean };

type HostContext = {
  state: HostState;
  signIn: (login: string, password: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Context = createContext<HostContext | null>(null);

export function HostSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HostState>({ status: 'checking' });

  // A host who signed in before stays signed in: the kept refresh token is tried once at start.
  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await hasHostSession())) return { status: 'signed-out' } as const;
      try {
        const me = await callHost('me');
        return { status: 'signed-in', name: typeof me.name === 'string' ? me.name : '', mustChangePassword: false } as const;
      } catch (cause) {
        if (cause instanceof HostApiError && cause.code === 'change-password') return { status: 'signed-in', name: '', mustChangePassword: true } as const;
        // Offline at start: their list waits, but they aren't sent back to sign-in for it.
        if (cause instanceof HostApiError && cause.code === 'offline') return { status: 'signed-in', name: '', mustChangePassword: false } as const;
        await forgetHostSession();
        return { status: 'signed-out' } as const;
      }
    })().then((next) => {
      if (live) setState(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const signIn = useCallback(async (login: string, password: string) => {
    const signedIn = await signInHost(login, password);
    setState({ status: 'signed-in', name: signedIn.name, mustChangePassword: signedIn.mustChangePassword });
  }, []);

  const setPassword = useCallback(async (password: string) => {
    await callHost('set-password', { password });
    setState((previous) => (previous.status === 'signed-in' ? { ...previous, mustChangePassword: false } : previous));
  }, []);

  const signOut = useCallback(async () => {
    // The phone forgets the session either way; one the server didn't hear about simply runs out within the hour.
    await callHost('sign-out').catch(() => undefined);
    await forgetHostSession();
    setState({ status: 'signed-out' });
  }, []);

  const value = useMemo(() => ({ state, signIn, setPassword, signOut }), [state, signIn, setPassword, signOut]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHostSession(): HostContext {
  const context = useContext(Context);
  if (!context) throw new Error('useHostSession is used outside HostSessionProvider');
  return context;
}
