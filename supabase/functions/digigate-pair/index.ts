// Turns a one-time code from the dashboard into a device. Deployed with --no-verify-jwt: a device has no login, and the
// code is the proof. The token is returned once and only its hash is stored.
import { json, randomHex, sha256Hex, sql } from '../_shared/device.ts';

const CODE_PATTERN = /^\d{10}$/;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let code: unknown;
  try {
    ({ code } = await request.json());
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return json({ error: 'Invalid code' }, 400);

  const token = randomHex(32);
  try {
    const [device] = await sql`
      select device_id, person_key
      from digigate.claim_pairing_code(${await sha256Hex(code)}, ${await sha256Hex(token)}, ${randomHex(32)})`;
    if (!device) return json({ error: 'Code not found' }, 404);
    return json({ deviceId: device.device_id, token, personKey: device.person_key });
  } catch (cause) {
    console.error('digigate-pair failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'Server error' }, 500);
  }
});
