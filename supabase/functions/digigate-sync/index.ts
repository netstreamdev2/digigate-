// A device's only door to the server. Deployed with --no-verify-jwt: devices have no login, so each proves itself with
// its own token. Uploads a batch from the outbox and, when asked, returns what the device needs to run offline.
// Logs carry counts and error names only: event payloads hold personal information.
import { json, sha256Hex, sql } from '../_shared/device.ts';

const MAX_BATCH = 100;

type Body = { events?: unknown; pull?: unknown };

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Not paired' }, 401);

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
  const events = body.events ?? [];
  if (!Array.isArray(events) || events.length > MAX_BATCH) return json({ error: 'Invalid batch' }, 400);

  try {
    const tokenHash = await sha256Hex(token);
    const [{ device_id: deviceId }] = await sql`select digigate.device_for_token(${tokenHash}) as device_id`;
    if (!deviceId) {
      // 410 tells the handheld to clear itself, so it's only ever sent for a device known to be revoked.
      const [{ revoked }] = await sql`select digigate.token_is_revoked(${tokenHash}) as revoked`;
      return revoked ? json({ error: 'Revoked' }, 410) : json({ error: 'Not paired' }, 401);
    }

    let accepted: string[] = [];
    if (events.length > 0) {
      const [{ ids }] = await sql`select digigate.ingest_events(${deviceId}, ${sql.json(events)}) as ids`;
      accepted = ids;
    }
    if (body.pull !== true) return json({ accepted });

    const [{ snapshot }] = await sql`select digigate.device_snapshot(${deviceId}) as snapshot`;
    return json({ accepted, ...snapshot });
  } catch (cause) {
    console.error('digigate-sync failed', events.length, cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'Server error' }, 500);
  }
});
