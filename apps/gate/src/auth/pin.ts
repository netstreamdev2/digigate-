import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { fromBase64 } from '@/lib/bytes';

import { SecureHash } from '../../modules/secure-hash';

export const PIN_LENGTH = 6;

/** How a PIN is stored: never the PIN itself. Matches scripts/hash-pin.mjs and, later, the server. */
export type PinHash = {
  algorithm: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
};

/** PIN hashes arrive from the server and the local database, so check their shape before trusting them. */
export function isPinHash(value: unknown): value is PinHash {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.algorithm === 'pbkdf2-sha256' &&
    typeof candidate.iterations === 'number' &&
    Number.isInteger(candidate.iterations) &&
    candidate.iterations > 0 &&
    typeof candidate.salt === 'string' &&
    typeof candidate.hash === 'string'
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

async function derive(pin: string, stored: PinHash, length: number): Promise<Uint8Array> {
  if (SecureHash) {
    return fromBase64(await SecureHash.pbkdf2Sha256(pin, stored.salt, stored.iterations, length));
  }
  // JavaScript fallback for Expo Go and older builds. It runs in one go: noble's async variant hands control
  // back every few milliseconds, and on React Native each handover is slow enough to stretch a check to minutes.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return pbkdf2(sha256, new TextEncoder().encode(pin), fromBase64(stored.salt), { c: stored.iterations, dkLen: length });
}

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const expected = fromBase64(stored.hash);
  return constantTimeEqual(await derive(pin, stored, expected.length), expected);
}
