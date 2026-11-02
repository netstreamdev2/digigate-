import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class DeviceSignalNativeModule extends NativeModule<Record<string, never>> {
  /** The same 0 to 4 bars the status bar shows. Null with no SIM, or before the radio has reported. */
  cellBars(): number | null;
}

// Null in Expo Go and in builds made before this module existed; a health report then simply leaves the bars out.
export const DeviceSignal = requireOptionalNativeModule<DeviceSignalNativeModule>('DeviceSignal');
