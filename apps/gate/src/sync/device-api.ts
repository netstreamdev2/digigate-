import * as SecureStore from 'expo-secure-store';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const TOKEN_NAME = 'digigate.device-token';

/** False when the build has no server settings; the app then runs on its local data alone. */
export const serverConfigured = Boolean(url);

/** This device's secret from pairing, held in the Android Keystore. Null until the device is paired. */
export function deviceToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_NAME);
}

export function saveDeviceToken(token: string): Promise<void> {
  return SecureStore.setItemAsync(TOKEN_NAME, token);
}

export function forgetDeviceToken(): Promise<void> {
  return SecureStore.deleteItemAsync(TOKEN_NAME);
}

/** Calls one of DigiGate's Edge Functions. Devices never touch the database or its API directly. */
export function callFunction(name: string, body: unknown, token?: string): Promise<Response> {
  return fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}
