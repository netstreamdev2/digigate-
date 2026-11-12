import "server-only";

import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

/*
 * A gate PIN as it's kept: a salted PBKDF2 hash, never the PIN itself. The same record the gate app verifies
 * offline: see apps/gate/src/auth/pin.ts and scripts/hash-pin.mjs.
 */

const PIN_ITERATIONS = 20_000;
const PIN_KEY_BYTES = 32;
const PIN_DIGITS = 6;

export type PinRecord = { algorithm: "pbkdf2-sha256"; iterations: number; salt: string; hash: string };

export function hashPin(pin: string): PinRecord {
  const salt = randomBytes(16);
  return {
    algorithm: "pbkdf2-sha256",
    iterations: PIN_ITERATIONS,
    salt: salt.toString("base64"),
    hash: pbkdf2Sync(pin, salt, PIN_ITERATIONS, PIN_KEY_BYTES, "sha256").toString("base64"),
  };
}

/** Six digits from the server's secure random source, for a PIN nobody chose. */
export function freshPin(): string {
  return Array.from({ length: PIN_DIGITS }, () => String(randomInt(10))).join("");
}
