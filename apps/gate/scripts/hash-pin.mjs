// Prints a PIN hash record in the format the gate app verifies. Usage: node scripts/hash-pin.mjs <6-digit PIN>
// Uses Node's own crypto, so a match on the device also proves server-made hashes will verify there.
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const ITERATIONS = 20_000;
const pin = process.argv[2] ?? '';

if (!/^\d{6}$/.test(pin)) {
  console.error('Usage: node scripts/hash-pin.mjs <6-digit PIN>');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = pbkdf2Sync(pin, salt, ITERATIONS, 32, 'sha256');

console.log(
  JSON.stringify({
    algorithm: 'pbkdf2-sha256',
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  }),
);
