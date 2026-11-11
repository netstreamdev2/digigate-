import { NativeModule, requireOptionalNativeModule } from 'expo';

/** What happened to the handheld. Times are when it happened, not when DigiGate heard about it. */
export type DeviceLogKind =
  | 'switched_off'
  | 'went_off'
  | 'switched_on'
  | 'airplane_on'
  | 'airplane_off'
  | 'data_off'
  | 'data_on'
  | 'no_signal'
  | 'signal_back'
  | 'sim_removed'
  | 'sim_back'
  | 'app_closed';

/** Why DigiGate was closed, as far as Android says. */
export type AppClosedReason = 'by_user' | 'crash' | 'not_responding' | 'low_memory' | 'system';

export type DeviceLogEntry = {
  seq: number;
  at: number;
  kind: DeviceLogKind;
  /** Battery percentage at the time, when known. For went_off, the last reading before it went. */
  battery: number | null;
  reason: AppClosedReason | null;
};

declare class DeviceLogNativeModule extends NativeModule<Record<string, never>> {
  /** Entries newer than `seq`, oldest first; the handheld keeps the newest 500. */
  entriesAfter(seq: number): DeviceLogEntry[];
}

// Null in Expo Go and in builds made before this module existed.
export const DeviceLog = requireOptionalNativeModule<DeviceLogNativeModule>('DeviceLog');
