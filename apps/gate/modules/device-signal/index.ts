import { NativeModule, requireOptionalNativeModule } from 'expo';

export type SimState = 'absent' | 'ready' | 'locked' | 'faulty' | 'unknown';

export type SimInfo = {
  state: SimState;
  /** The network on the SIM, e.g. Vodacom. */
  simOperator: string | null;
  /** The network it's connected through now; differs when roaming. */
  networkOperator: string | null;
  roaming: boolean;
  /** Whether mobile data is switched on. Null when Android won't say. */
  dataEnabled: boolean | null;
};

/** Bytes over mobile data in one range: the whole handheld's, when Android allows, and DigiGate's own. */
export type MobileData = { device: number | null; app: number | null };

declare class DeviceSignalNativeModule extends NativeModule<Record<string, never>> {
  /** The same 0 to 4 bars the status bar shows. Null with no SIM, or before the radio has reported. */
  cellBars(): number | null;
  /** Null when the handheld has no phone radio. */
  sim(): SimInfo | null;
  /** One result per [start, end) range of epoch milliseconds, in the same order. */
  mobileData(ranges: [number, number][]): Promise<MobileData[]>;
}

// Null in Expo Go and in builds made before this module existed; a health report then simply leaves these out.
export const DeviceSignal = requireOptionalNativeModule<DeviceSignalNativeModule>('DeviceSignal');
