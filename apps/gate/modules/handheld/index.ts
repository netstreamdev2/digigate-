import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class HandheldNativeModule extends NativeModule<Record<string, never>> {
  /** Whether DigiGate is this handheld's device owner, as set up over adb on a freshly reset handheld. */
  isDeviceOwner(): boolean;
  /**
   * DigiGate as the home screen, other apps hidden but the phone, camera and gallery (and `alsoAllowed`), and the
   * settings that would take the handheld off the record locked. Safe to repeat. Returns the names of steps that failed.
   */
  applyGatePolicy(alsoAllowed: string[]): string[];
  /** Undoes all of it and gives up device ownership. Returns the names of steps that failed; it stays owner if any did. */
  release(): string[];
}

// Null in Expo Go and in builds made before this module existed.
export const Handheld = requireOptionalNativeModule<HandheldNativeModule>('Handheld');
