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
  /** Turns the screen off and locks it. False if DigiGate isn't the owner or Android refused. */
  lockScreen(): boolean;
  /** Restarts the handheld: "restarting", or why not. */
  restart(): RestartStart;
  /**
   * Installs a newer DigiGate from a downloaded file over this one, silently. Resolves to "installing" once Android has
   * it (the app is then replaced and reopens), or why not.
   */
  installUpdate(path: string, sha256: string | null): Promise<InstallStart>;
  /** How the last install went, if Android reported back; read once. */
  takeInstallResult(): string | null;
}

export type RestartStart = 'restarting' | 'not-device-owner' | 'on-a-call' | 'refused';

export type InstallStart =
  | 'installing'
  | 'not-device-owner'
  | 'missing-file'
  | 'checksum-mismatch'
  | 'not-an-app'
  | 'wrong-app'
  | 'not-newer'
  | 'install-refused';

// Null in Expo Go and in builds made before this module existed.
export const Handheld = requireOptionalNativeModule<HandheldNativeModule>('Handheld');
