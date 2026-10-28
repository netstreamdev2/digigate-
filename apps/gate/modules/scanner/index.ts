import { NativeModule, requireOptionalNativeModule } from 'expo';

export type ScanEvent = {
  /** The decoded barcode's raw bytes, base64-encoded. Never log these: they are PII. */
  bytes: string;
  length: number;
  /** The vendor's symbology code, as reported. */
  symbology: string | null;
  vendor: string;
  receivedAt: number;
};

export type ScannerInfo = {
  /** Null when this device's scanner has no adapter yet. */
  vendor: string | null;
  manufacturer: string;
  model: string;
  androidVersion: string;
  outputMode: 'app' | 'keyboard' | 'unknown';
};

type ScannerEvents = {
  onScan(event: ScanEvent): void;
};

declare class ScannerNativeModule extends NativeModule<ScannerEvents> {
  getScannerInfo(): ScannerInfo;
  /** Changes a scanner setting on the device, so only call it when the user asks. */
  switchToAppOutput(): boolean;
}

// Null in Expo Go, which can't load custom native code; only the development or release build has it.
export const Scanner = requireOptionalNativeModule<ScannerNativeModule>('Scanner');
