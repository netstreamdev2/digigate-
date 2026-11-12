import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { deviceToken } from '@/sync/device-api';

import { Handheld } from '../../modules/handheld';
import { Scanner } from '../../modules/scanner';

/*
 * One app, two jobs. On a gate handheld (a device with a scanner DigiGate knows, one DigiGate owns, or any device paired
 * as a gate) it's the guard app. On anyone else's phone it's the visitor-invite app for hosts. A phone can still be
 * paired as a gate from the invite app's sign-in, and then it's a gate device from then on.
 */

export type DeviceMode = 'gate' | 'host';

export async function detectDeviceMode(): Promise<DeviceMode> {
  try {
    if (Scanner?.getScannerInfo().vendor) return 'gate';
    if (Handheld?.isDeviceOwner()) return 'gate';
  } catch {
    // A scanner or owner check that fails says nothing either way; pairing decides below.
  }
  return (await deviceToken()) ? 'gate' : 'host';
}

type ModeContext = { mode: DeviceMode | null; recheck: () => void };

const Context = createContext<ModeContext>({ mode: null, recheck: () => undefined });

export function DeviceModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DeviceMode | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    detectDeviceMode().then(
      (next) => {
        if (live) setMode(next);
      },
      () => {
        if (live) setMode('host');
      },
    );
    return () => {
      live = false;
    };
  }, [round]);

  const recheck = useCallback(() => setRound((value) => value + 1), []);
  const value = useMemo(() => ({ mode, recheck }), [mode, recheck]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export const useDeviceMode = (): ModeContext => useContext(Context);
