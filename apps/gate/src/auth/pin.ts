import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { fromBase64 } from '@/lib/bytes';

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

export async function verifyPin(pin: string, stored: PinHash): Promise<boolean> {
  const expected = fromBase64(stored.hash);
  const derived = await pbkdf2Async(sha256, new TextEncoder().encode(pin), fromBase64(stored.salt), {
    c: stored.iterations,
    dkLen: expected.length,
  });
  return constantTimeEqual(derived, expected);
}
