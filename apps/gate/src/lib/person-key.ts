import type { PersonKey } from '@digigate/core';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const SECRET_NAME = 'digigate.person-key-secret';

/** The ID type every South African ID number carries, on a licence and on a smart ID. */
export const SA_ID_TYPE = '02';

const toHex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));

let secret: Promise<Uint8Array> | null = null;

/** Pairing hands the device its organisation's key, so a person matches at every gate. */
export async function setPersonKeySecret(hex: string): Promise<void> {
  await SecureStore.setItemAsync(SECRET_NAME, hex);
  secret = Promise.resolve(fromHex(hex));
}

export async function forgetPersonKeySecret(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_NAME);
  secret = null;
}

// Until pairing replaces it, a device makes its own key and keeps it in the Keystore. Pairing discards every visit and
// event from before it, so nothing keyed with this one outlives it.
function personKeySecret(): Promise<Uint8Array> {
  secret ??= (async () => {
    const stored = await SecureStore.getItemAsync(SECRET_NAME);
    if (stored) return fromHex(stored);
    const created = getRandomBytes(32);
    await SecureStore.setItemAsync(SECRET_NAME, toHex(created));
    return created;
  })();
  return secret;
}

/**
 * A keyed hash of a person's ID type and number: the same person always gets the same key, whichever document
 * they show, but the key can't be turned back into the ID number. Never a plain hash: SA ID numbers are
 * structured enough to brute-force.
 */
export async function personKeyFor(idType: string, idNumber: string): Promise<PersonKey> {
  return toHex(hmac(sha256, await personKeySecret(), new TextEncoder().encode(`${idType}:${idNumber}`)));
}
