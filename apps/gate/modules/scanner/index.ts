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

const DUPLICATE_WINDOW_MS = 250;

/**
 * Listens for scans, dropping an identical one inside 250 ms. Urovo sends every scan twice (once per broadcast
 * action); the native module filters this from its next build, and this keeps older builds correct too.
 * Returns null where there is no scanner module.
 */
export function subscribeToScans(listener: (event: ScanEvent) => void): { remove(): void } | null {
  if (!Scanner) return null;
  let previous: ScanEvent | null = null;
  return Scanner.addListener('onScan', (event) => {
    if (previous && previous.bytes === event.bytes && event.receivedAt - previous.receivedAt < DUPLICATE_WINDOW_MS) return;
    previous = event;
    listener(event);
  });
}
