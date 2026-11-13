// Gathers one day's Security Checks report for digigate-reports: the checks, their licence photos and their ID numbers,
// opened here and nowhere else; and the per-person passwords that lock it. Logs carry counts and error names only.
import { admin } from './caller.ts';
import { sql } from './device.ts';
import { renderCheckSheet, type Sheet, type SheetCheck } from './checks-pdf.ts';
import { seal, unseal } from './sealed.ts';
import { isCheckTask } from '../../../packages/core/src/check-sheet.ts';

const LICENCE_PHOTO_BUCKET = 'licence-photos';
// Well past the busiest day seen; past it the report says it was cut short.
const MOST_CHECKS = 4000;
const PHOTO_DOWNLOADS_AT_ONCE = 12;
// No 0/O, 1/l/I or 5/S: a password read out over the phone must be typed right the first time.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRTUVWXYZ2346789';
const PASSWORD_GROUPS = 4;
const PASSWORD_GROUP_LENGTH = 4;

type SheetRow = {
  id: string;
  occurred_at: Date | string;
  type: string;
  site: string;
  scanned_by: string | null;
  visit_type: string | null;
  outcome: string | null;
  person: string | null;
  id_sealed: string | null;
  person_ref: string | null;
  occupants: number | null;
  plate: string | null;
  photo_path: string | null;
  total: number | string;
};

async function photoOf(path: string | null): Promise<Uint8Array | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(LICENCE_PHOTO_BUCKET).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** Runs `work` over every item, a few at a time, keeping their order. */
async function inBatches<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const at = next++;
        out[at] = await work(items[at]);
      }
    }),
  );
  return out;
}

/** One day of a company's checks (or one client's), as the report draws them. */
export async function loadSheet(org: string, client: string | null, day: string, scope: string, generatedAt: string): Promise<Sheet> {
  const rows = (await sql`select * from digigate.check_sheet(${org}::uuid, ${client}::uuid, ${day}::date, ${MOST_CHECKS})`) as unknown as SheetRow[];
  let missingPhotos = 0;
  const checks = await inBatches(rows, PHOTO_DOWNLOADS_AT_ONCE, async (row): Promise<SheetCheck | null> => {
    if (!isCheckTask(row.type)) return null;
    const photo = await photoOf(row.photo_path);
    if (row.photo_path && !photo) missingPhotos += 1;
    return {
      occurredAt: new Date(row.occurred_at).toISOString(),
      site: row.site,
      scannedBy: row.scanned_by,
      task: row.type,
      visitType: row.visit_type,
      outcome: row.outcome,
      person: row.person,
      idNumber: row.id_sealed ? await unseal('check id number', row.id, row.id_sealed) : null,
      personRef: row.person_ref,
      occupants: row.occupants,
      plate: row.plate,
      photo,
    };
  });
  if (missingPhotos) console.error('Security Checks report: licence photos that would not download', missingPhotos);
  return { scope, day, checks: checks.filter((check): check is SheetCheck => check !== null), total: Number(rows[0]?.total ?? 0), generatedAt };
}

export { renderCheckSheet };

/** The PDF passwords of those of the addresses that have one. */
export async function passwordsFor(org: string, emails: readonly string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (emails.length === 0) return found;
  const rows = await sql`select email, sealed from digigate.report_pdf_passwords where org_id = ${org}::uuid and email = any (${sql.array([...emails])}::text[])`;
  for (const row of rows) {
    const password = await unseal('report pdf password', `${org}:${row.email}`, row.sealed);
    if (password) found.set(row.email, password);
  }
  return found;
}

function newPassword(): string {
  const groups: string[] = [];
  for (let group = 0; group < PASSWORD_GROUPS; group++) {
    // Rejection sampling keeps every character equally likely.
    let part = '';
    while (part.length < PASSWORD_GROUP_LENGTH) {
      const [byte] = crypto.getRandomValues(new Uint8Array(1));
      if (byte < Math.floor(256 / PASSWORD_ALPHABET.length) * PASSWORD_ALPHABET.length) part += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
    }
    groups.push(part);
  }
  return groups.join('-');
}

/** A new password for the address, replacing any it had. Returned once, for the admin to pass on; stored only sealed. */
export async function setPassword(org: string, email: string, setBy: string): Promise<string> {
  const password = newPassword();
  const sealed = await seal('report pdf password', `${org}:${email}`, password);
  await sql`
    insert into digigate.report_pdf_passwords (org_id, email, sealed, set_by, set_at)
    values (${org}::uuid, ${email}, ${sealed}, ${setBy}::uuid, now())
    on conflict (org_id, email) do update set sealed = excluded.sealed, set_by = excluded.set_by, set_at = now()`;
  return password;
}

export async function removePassword(org: string, email: string): Promise<boolean> {
  const removed = await sql`delete from digigate.report_pdf_passwords where org_id = ${org}::uuid and email = ${email} returning email`;
  return removed.length > 0;
}
