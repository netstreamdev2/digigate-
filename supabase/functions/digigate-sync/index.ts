// A device's only door to the server. Deployed with --no-verify-jwt: devices have no login, so each proves itself with
// its own token. Uploads a batch from the outbox and, when asked, returns what the device needs to run offline. It can
// also carry the device's health and one shift selfie, each sent on its own so a slow photo never holds up events.
// Each check is run through the rules again as it arrives, against every gate's visits, and anything the handheld
// couldn't see becomes a server alert. Run `pnpm functions:bundle` before deploying: the rules come from packages/core.
// Logs carry counts and error names only: event payloads hold personal information.
import { admin } from '../_shared/caller.ts';
import { missedHits, normaliseIdentifier, recheck, reportedCodes, SITE_RULE_DEFAULTS } from '../_shared/core.js';
import { json, sha256Hex, sql } from '../_shared/device.ts';

const MAX_BATCH = 100;
const SELFIE_BUCKET = 'shift-selfies';
const MOST_SELFIE_BYTES = 400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECKS = new Set(['vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit']);

type Uploaded = { id: string; type: string; occurredAt: number; payload: unknown };
type Hit = { code: string; severity: string };

const isUploaded = (value: unknown): value is Uploaded => {
  const event = value as Partial<Uploaded> | null;
  return typeof event === 'object' && event !== null && typeof event.id === 'string' && UUID.test(event.id) && typeof event.type === 'string' && typeof event.occurredAt === 'number';
};

/** Everything the rules read, as the server knows it: every gate's open visits at the site, and past plate and VIN pairs. */
async function siteState(orgId: string, siteId: string, payload: unknown) {
  const visits = await sql`
    select v.id, v.kind, v.visit_type, (extract(epoch from v.entered_at) * 1000)::float8 as entered_at, v.occupants_in,
      d.person_key, d.vin, d.plate, d.disc_number, d.disc_expires_on::text as disc_expires_on
    from digigate.visits v
    join digigate.visit_details d on d.visit_id = v.id
    where v.site_id = ${siteId} and v.org_id = ${orgId} and v.exited_at is null`;
  const openVisits = visits.map((row) =>
    row.kind === 'pedestrian'
      ? { id: row.id, kind: 'pedestrian' as const, personKey: row.person_key, visitType: row.visit_type, enteredAt: row.entered_at }
      : {
          id: row.id,
          kind: 'vehicle' as const,
          driverKey: row.person_key,
          coDriverKeys: [],
          vehicle: { vin: row.vin ?? '', plate: row.plate ?? '', discNumber: row.disc_number ?? '' },
          ...(row.disc_expires_on ? { discExpiresOn: row.disc_expires_on } : {}),
          occupants: row.occupants_in ?? 1,
          visitType: row.visit_type,
          enteredAt: row.entered_at,
        },
  );

  const vehicle = (payload as { vehicle?: { vin?: unknown; plate?: unknown } } | null)?.vehicle;
  const vin = typeof vehicle?.vin === 'string' ? normaliseIdentifier(vehicle.vin) : '';
  const plate = typeof vehicle?.plate === 'string' ? normaliseIdentifier(vehicle.plate) : '';
  const vehicleHistory = vin || plate
    ? await sql`
        select distinct d.vin, d.plate from digigate.visit_details d
        where d.org_id = ${orgId} and d.vin is not null and d.plate is not null
          and (regexp_replace(upper(d.vin), '[^A-Z0-9]', '', 'g') = ${vin} or regexp_replace(upper(d.plate), '[^A-Z0-9]', '', 'g') = ${plate})`
    : [];
  return { openVisits, vehicleHistory: vehicleHistory.map((row) => ({ vin: row.vin, plate: row.plate })), registeredPeople: new Map() };
}

/**
 * The checks in this batch the server hasn't seen, with what the rules find that the handheld didn't. Worked out before
 * the batch is stored, so each check is judged on what was on site when it arrived. A check the server can't judge is
 * still stored: the gate's own record always counts.
 */
async function serverFindings(orgId: string, siteId: string, events: readonly unknown[]): Promise<Map<string, Hit[]>> {
  const findings = new Map<string, Hit[]>();
  const checks = events.filter(isUploaded).filter((event) => CHECKS.has(event.type)).sort((a, b) => a.id.localeCompare(b.id));
  if (checks.length === 0) return findings;
  const known = await sql`select id from digigate.events where id = any(${sql.array(checks.map((event) => event.id))}::uuid[])`;
  const seen = new Set(known.map((row) => row.id));
  for (const check of checks) {
    if (seen.has(check.id)) continue;
    try {
      const hits = recheck(check, await siteState(orgId, siteId, check.payload), SITE_RULE_DEFAULTS);
      const missed = hits ? missedHits(hits, reportedCodes(check.payload)) : [];
      if (missed.length > 0) findings.set(check.id, missed.map((hit) => ({ code: hit.code, severity: hit.severity })));
    } catch (cause) {
      console.error('digigate-sync re-check failed', cause instanceof Error ? cause.name : 'unknown');
    }
  }
  return findings;
}

type Body = { events?: unknown; pull?: unknown; health?: unknown; selfie?: unknown };

/** `later` when the shift hasn't reached the server yet, so the device holds on to the photo and tries again. */
type SelfieResult = 'saved' | 'refused' | 'later';

function jpegBytes(base64: string): Uint8Array | null {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
  const looksLikeJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return looksLikeJpeg && bytes.length <= MOST_SELFIE_BYTES ? bytes : null;
}

async function keepSelfie(deviceId: string, selfie: unknown): Promise<SelfieResult> {
  if (typeof selfie !== 'object' || selfie === null) return 'refused';
  const { shiftId, image } = selfie as { shiftId?: unknown; image?: unknown };
  if (typeof shiftId !== 'string' || !UUID.test(shiftId) || typeof image !== 'string') return 'refused';
  const bytes = jpegBytes(image);
  if (!bytes) return 'refused';

  const [shift] = await sql`select org_id, site_id from digigate.shifts where id = ${shiftId} and device_id = ${deviceId}`;
  if (!shift) return 'later';

  const path = `${shift.org_id}/${shift.site_id}/${shiftId}.jpg`;
  const { error } = await admin.storage.from(SELFIE_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error('selfie upload failed');
  await sql`select digigate.attach_selfie(${deviceId}, ${shiftId}, ${path})`;
  return 'saved';
}

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
      const [device] = await sql`select org_id, site_id from digigate.devices where id = ${deviceId}`;
      const findings = await serverFindings(device.org_id, device.site_id, events);
      const [{ ids }] = await sql`select digigate.ingest_events(${deviceId}, ${sql.json(events)}) as ids`;
      accepted = ids;
      for (const event of events.filter(isUploaded)) {
        const missed = findings.get(event.id);
        if (!missed) continue;
        const visitId = (event.payload as { visit_id?: unknown } | null)?.visit_id;
        await sql`
          insert into digigate.alerts (org_id, site_id, rule_code, severity, source, event_id, visit_id, raised_at, status)
          select ${device.org_id}, ${device.site_id}, hit ->> 'code', hit ->> 'severity', 'server', ${event.id},
            digigate.to_uuid(${typeof visitId === 'string' ? visitId : null}), to_timestamp(${event.occurredAt} / 1000.0),
            case when hit ->> 'severity' = 'info' then 'resolved' else 'open' end
          from jsonb_array_elements(${sql.json(missed)}) hit
          on conflict (event_id, rule_code, source) do nothing`;
      }
    }
    if (typeof body.health === 'object' && body.health !== null) {
      await sql`select digigate.record_device_health(${deviceId}, ${sql.json(body.health)})`;
    }
    const selfie = body.selfie === undefined ? undefined : await keepSelfie(deviceId, body.selfie);
    if (body.pull !== true) return json({ accepted, selfie });

    const [{ snapshot }] = await sql`select digigate.device_snapshot(${deviceId}) as snapshot`;
    return json({ accepted, selfie, ...snapshot });
  } catch (cause) {
    console.error('digigate-sync failed', events.length, cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'Server error' }, 500);
  }
});
