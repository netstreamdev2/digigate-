import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class SecureHashNativeModule extends NativeModule<Record<string, never>> {
  /** PBKDF2-HMAC-SHA256 on a background thread. Returns the derived key, base64-encoded. */
  pbkdf2Sha256(password: string, saltBase64: string, iterations: number, keyLength: number): Promise<string>;
}

// Null in Expo Go and in builds made before this module existed; callers then fall back to JavaScript.
export const SecureHash = requireOptionalNativeModule<SecureHashNativeModule>('SecureHash');
