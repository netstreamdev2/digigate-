// Guards' personal records, behind digigate-people. The table has no grants but the service key's, so this is the only
// way in: it checks the caller manages the guard's company, encrypts the ID number, keeps the photo private, and logs
// every view and change. Logs and audit entries name the guard and which fields changed, never what they say.
import { cleanIdNumber, guardRecordProblem, idNumberProblem, isPsiraGrade } from './core.js';
import { admin, audit, canManage, type Caller } from './caller.ts';
import { json, randomHex, sql } from './device.ts';

// As in packages/core/src/guard-record.ts: the bundle carries core's code but not its types.
type IdType = 'sa_id' | 'passport';
type GuardRecordInput = {
  phone: string;
  homeAddress: string;
  psiraNumber: string;
  psiraGrade: string;
  nextOfKinName: string;
  nextOfKinRelationship: string;
  nextOfKinPhone: string;
};

const PHOTO_BUCKET = 'guard-photos';
const PHOTO_LINK_SECONDS = 300;
const PHOTO_MAX_BYTES = 600_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IV_BYTES = 12;

const FIELDS = {
  phone: 'phone',
  homeAddress: 'home_address',
  psiraNumber: 'psira_number',
  psiraGrade: 'psira_grade',
  nextOfKinName: 'next_of_kin_name',
  nextOfKinRelationship: 'next_of_kin_relationship',
  nextOfKinPhone: 'next_of_kin_phone',
} as const satisfies Record<keyof GuardRecordInput, string>;

const encoder = new TextEncoder();

type Keys = { cipher: CryptoKey; mac: CryptoKey };
let keys: Promise<Keys> | null = null;

/** Two keys drawn from the one secret: one encrypts ID numbers, the other makes the keyed hash that finds repeats. */
function recordKeys(): Promise<Keys> {
  keys ??= (async () => {
    const secret = Deno.env.get('GUARD_RECORD_KEY') ?? '';
    if (!secret) throw new Error('GUARD_RECORD_KEY is not set');
    const raw = Uint8Array.from(atob(secret), (character) => character.charCodeAt(0));
    if (raw.length < 32) throw new Error('GUARD_RECORD_KEY is too short');
    const base = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
    const derive = (info: string, algorithm: AesKeyGenParams | HmacKeyGenParams, usages: KeyUsage[]) =>
      crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: encoder.encode(info) }, base, algorithm, false, usages);
    return {
      cipher: await derive('digigate guard id number cipher', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']),
      mac: await derive('digigate guard id number hmac', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']),
    };
  })();
  return keys;
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

// The guard's id is bound into the encryption, so a value copied onto another guard's record won't open.
async function encryptIdNumber(gateUserId: string, number: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(gateUserId) }, (await recordKeys()).cipher, encoder.encode(number));
  const out = new Uint8Array(IV_BYTES + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), IV_BYTES);
  return toBase64(out);
}

async function decryptIdNumber(gateUserId: string, cipher: string): Promise<string> {
  const bytes = fromBase64(cipher);
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, IV_BYTES), additionalData: encoder.encode(gateUserId) },
    (await recordKeys()).cipher,
    bytes.slice(IV_BYTES),
  );
  return new TextDecoder().decode(opened);
}

async function idNumberHmac(orgId: string, type: IdType, number: string): Promise<string> {
  const signed = await crypto.subtle.sign('HMAC', (await recordKeys()).mac, encoder.encode(`${orgId}:${type}:${number}`));
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type Guard = { id: string; org_id: string; name: string };

/** The guard, if the caller manages their company. */
async function guardFor(caller: Caller, body: Record<string, unknown>): Promise<Guard | null> {
  const id = String(body.gateUserId ?? '');
  if (!UUID.test(id)) return null;
  const [guard] = await sql`select id, org_id, trim(first_name || ' ' || last_name) as name from digigate.gate_users where id = ${id}`;
  return guard && canManage(caller, guard.org_id) ? { id: guard.id, org_id: guard.org_id, name: guard.name } : null;
}

async function photoLink(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_LINK_SECONDS);
  if (error || !data) throw new Error('guard photo link failed');
  return data.signedUrl;
}

/** The record as the dashboard shows it: the ID number only by its last four. Opening it is logged. */
export async function readGuardRecord(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardFor(caller, body);
  if (!guard) return json({ error: 'not-allowed' }, 403);
  const [row] = await sql`select * from digigate.gate_user_records where gate_user_id = ${guard.id}`;
  await audit(caller, guard.org_id, 'people', 'gate_user.record_viewed', guard.name);
  return json({
    record: {
      phone: row?.phone ?? '',
      homeAddress: row?.home_address ?? '',
      psiraNumber: row?.psira_number ?? '',
      psiraGrade: row?.psira_grade ?? '',
      nextOfKinName: row?.next_of_kin_name ?? '',
      nextOfKinRelationship: row?.next_of_kin_relationship ?? '',
      nextOfKinPhone: row?.next_of_kin_phone ?? '',
      idType: row?.id_type ?? null,
      idLastFour: row?.id_number_last4 ?? null,
      updatedAt: row?.updated_at ?? null,
    },
    photoUrl: await photoLink(row?.photo_path ?? null),
  });
}

function recordFrom(value: unknown): GuardRecordInput | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as Record<string, unknown>;
  const field = (name: keyof GuardRecordInput) => (typeof input[name] === 'string' ? (input[name] as string).trim() : '');
  const grade = field('psiraGrade');
  return {
    phone: field('phone'),
    homeAddress: field('homeAddress'),
    psiraNumber: field('psiraNumber'),
    psiraGrade: isPsiraGrade(grade) ? grade : '',
    nextOfKinName: field('nextOfKinName'),
    nextOfKinRelationship: field('nextOfKinRelationship'),
    nextOfKinPhone: field('nextOfKinPhone'),
  };
}

/** Saves the record. An ID number is only sent when it is being set or changed, and is never sent back. */
export async function saveGuardRecord(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardFor(caller, body);
  if (!guard) return json({ error: 'not-allowed' }, 403);
  const record = recordFrom(body.record);
  if (!record) return json({ error: 'record' }, 400);
  const problem = guardRecordProblem(record);
  if (problem) return json({ error: 'record', problem }, 400);

  const idType: IdType | null = body.idType === 'sa_id' || body.idType === 'passport' ? body.idType : null;
  const idNumber = typeof body.idNumber === 'string' && body.idNumber.trim() ? cleanIdNumber(body.idNumber) : null;
  if (idNumber && !idType) return json({ error: 'record', problem: 'Choose whether it is an SA ID or a passport.' }, 400);
  if (idNumber && idType) {
    const idProblem = idNumberProblem(idType, idNumber);
    if (idProblem) return json({ error: 'record', problem: idProblem }, 400);
  }

  const values: Record<string, string | null> = {};
  for (const [name, column] of Object.entries(FIELDS)) values[column] = record[name as keyof GuardRecordInput] || null;
  if (idNumber && idType) {
    values.id_type = idType;
    values.id_number_hmac = await idNumberHmac(guard.org_id, idType, idNumber);
    values.id_number_cipher = await encryptIdNumber(guard.id, idNumber);
    values.id_number_last4 = idNumber.slice(-4);
  }

  const [before] = await sql`select * from digigate.gate_user_records where gate_user_id = ${guard.id}`;
  const changed = Object.keys(values).filter((column) => column !== 'id_number_hmac' && column !== 'id_number_last4' && column !== 'id_type' && (before?.[column] ?? null) !== values[column]);
  const row: Record<string, string | Date | null> = { gate_user_id: guard.id, org_id: guard.org_id, ...values, updated_at: new Date(), updated_by: caller.id };
  try {
    await sql`
      insert into digigate.gate_user_records ${sql(row)}
      on conflict (gate_user_id) do update set ${sql(row, ...Object.keys(values), 'updated_at', 'updated_by')}`;
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === '23505') return json({ error: 'id-taken' }, 409);
    throw cause;
  }
  if (changed.length > 0) {
    const words = changed.map((column) => (column === 'id_number_cipher' ? 'ID number' : column.replace(/_/g, ' '))).join(', ');
    await audit(caller, guard.org_id, 'people', 'gate_user.record_changed', guard.name, words);
  }
  return json({ ok: true });
}

/** The whole ID number, for someone who needs it now. Each time is logged. */
export async function revealGuardIdNumber(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardFor(caller, body);
  if (!guard) return json({ error: 'not-allowed' }, 403);
  const [row] = await sql`select id_number_cipher from digigate.gate_user_records where gate_user_id = ${guard.id}`;
  if (!row?.id_number_cipher) return json({ error: 'no-id' }, 404);
  const idNumber = await decryptIdNumber(guard.id, row.id_number_cipher);
  await audit(caller, guard.org_id, 'people', 'gate_user.id_viewed', guard.name);
  return json({ idNumber });
}

/** A new employee photo, already made small in the browser. The old one is deleted once the new one is saved. */
export async function saveGuardPhoto(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const guard = await guardFor(caller, body);
  if (!guard) return json({ error: 'not-allowed' }, 403);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64(String(body.photo ?? ''));
  } catch {
    return json({ error: 'photo' }, 400);
  }
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length > PHOTO_MAX_BYTES) return json({ error: 'photo' }, 400);

  const path = `${guard.org_id}/${guard.id}/${randomHex(8)}.jpg`;
  const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('guard photo upload failed');
  const [before] = await sql`select photo_path from digigate.gate_user_records where gate_user_id = ${guard.id}`;
  await sql`
    insert into digigate.gate_user_records (gate_user_id, org_id, photo_path, updated_at, updated_by)
    values (${guard.id}, ${guard.org_id}, ${path}, now(), ${caller.id})
    on conflict (gate_user_id) do update set photo_path = excluded.photo_path, updated_at = now(), updated_by = excluded.updated_by`;
  if (before?.photo_path) await admin.storage.from(PHOTO_BUCKET).remove([before.photo_path]);
  await audit(caller, guard.org_id, 'people', 'gate_user.photo_changed', guard.name);
  return json({ photoUrl: await photoLink(path) });
}
