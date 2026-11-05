// Brings a site's checks over from its old gate system's Excel export into DigiGate's old-system log
// (digigate.imported_checks, migration 32). Run it in your own terminal, never through an assistant: it writes real
// people's records to the production database.
//
//   node supabase/setup/import-old-checks.mjs <project ref> <site id> <export.xlsx> --dry-run   (counts only)
//   node supabase/setup/import-old-checks.mjs <project ref> <site id> <export.xlsx>             (imports)
//
// ID numbers never leave this PC: each becomes the company's person key here, the same one a handheld makes from a
// licence, and only that is sent. GPS points, free-text notes and every column DigiGate doesn't keep are left behind.
// It prints counts only, never a name, number or plate. Rows already imported are skipped, so it is safe to run again.
import { execFileSync, execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [ref, siteId, file, flag] = process.argv.slice(2);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
if (!/^[a-z]{20}$/.test(ref ?? '') || !UUID.test(siteId ?? '') || !file) {
  console.error('Usage: node supabase/setup/import-old-checks.mjs <project ref> <site id> <export.xlsx> [--dry-run]');
  process.exit(1);
}
const dryRun = flag === '--dry-run';
const BATCH = 1000;

// The old system's words for a visit, as a hospital's visit types. Anything else is left unsaid, never guessed.
const VISIT_TYPES = {
  Staff: 'staff',
  DayVisitor: 'visitor',
  PackageDelivery: 'delivery',
  EmergencyVehicle: 'emergency',
  Taxi: 'patient_dropoff',
  Contractor: 'contractor',
};

// ---- Reading the export: an .xlsx is a zip of XML, read here in memory and from a private temporary folder.
const decode = (text) => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (name) => `(?:\\w+:)?${name}`;
const columnIndex = (letters) => [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;

function readExport(path) {
  const folder = mkdtempSync(join(tmpdir(), 'dg-old-'));
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${path}', '${folder}')`]);
    const shared = [...readFileSync(join(folder, 'xl/sharedStrings.xml'), 'utf8').matchAll(new RegExp(`<${tag('si')}>([\\s\\S]*?)</${tag('si')}>`, 'g'))].map((match) =>
      decode([...match[1].matchAll(new RegExp(`<${tag('t')}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag('t')}>`, 'g'))].map((t) => t[1]).join('')),
    );
    const sheet = readFileSync(join(folder, 'xl/worksheets/sheet1.xml'), 'utf8');
    const rows = [];
    for (const row of sheet.matchAll(new RegExp(`<${tag('row')}[^>]*>([\\s\\S]*?)</${tag('row')}>`, 'g'))) {
      const cells = [];
      for (const cell of row[1].matchAll(new RegExp(`<${tag('c')} r="([A-Z]+)\\d+"([^>]*?)(?:/>|>([\\s\\S]*?)</${tag('c')}>)`, 'g'))) {
        const [, letters, attributes, inner = ''] = cell;
        const type = /t="([^"]+)"/.exec(attributes)?.[1];
        const raw = new RegExp(`<${tag('v')}>([\\s\\S]*?)</${tag('v')}>`).exec(inner)?.[1];
        const inline = new RegExp(`<${tag('t')}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag('t')}>`).exec(inner)?.[1];
        cells[columnIndex(letters)] = type === 's' && raw !== undefined ? shared[Number(raw)] : type === 'inlineStr' ? decode(inline ?? '') : raw === undefined ? '' : decode(raw);
      }
      rows.push(cells);
    }
    const [headers = [], ...data] = rows;
    return data.filter((cells) => cells.some(Boolean)).map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

// Excel keeps a moment as days since 1899-12-30; the old system's clock is South African time (UTC+2 all year).
const SAST_MS = 2 * 3_600_000;
function moment(value) {
  const serial = Number(value);
  return Number.isFinite(serial) && serial > 30000 ? new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000 - SAST_MS) : null;
}
function calendarDay(value) {
  const serial = Number(value);
  return Number.isFinite(serial) && serial > 30000 ? new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10) : '';
}
const yes = (value) => /^(true|1)$/i.test(value);

// ---- Turning a row into what DigiGate keeps.
function toCheck(row, personKeyOf) {
  const at = moment(row.CreationDate);
  const direction = yes(row.Enter) && !yes(row.Exit) ? 'in' : yes(row.Exit) && !yes(row.Enter) ? 'out' : null;
  if (!at || !direction || !row.SecurityCheckID) return null;
  const idNumber = row.PersonIdentifier.replace(/\s/g, '');
  return {
    ref: row.SecurityCheckID,
    at: at.toISOString(),
    direction,
    // Only an SA ID number makes a person key, the way a handheld does from a licence. Any other number is dropped.
    person_key: /^\d{13}$/.test(idNumber) ? personKeyOf(idNumber) : '',
    name: row.PersonDisplayName.trim(),
    sex: row.Gender === 'Male' ? 'male' : row.Gender === 'Female' ? 'female' : '',
    licence_expires_on: calendarDay(row.DL_DocumentExpiryDate),
    plate: row.PrimaryVehicleRegNo.trim(),
    vin: row.PrimaryVehicleVIN.trim(),
    make: row.PrimaryVehicleMake.trim(),
    model: row.PrimaryVehicleModel.trim(),
    colour: row.PrimaryVehicleVehicleColor.trim(),
    body: row.PrimaryVehicleVehicleDescription.trim(),
    visit_type: VISIT_TYPES[row.PurposeOfVisit] ?? '',
    occupants: row.NumberOfPeople.trim(),
    scanned_by: `${row.UserName} ${row.UserLastName}`.trim(),
  };
}

// ---- Talking to the project, through the Supabase CLI you're signed in with.
function query(sql) {
  const folder = mkdtempSync(join(tmpdir(), 'dg-import-'));
  try {
    const path = join(folder, 'batch.sql');
    writeFileSync(path, sql);
    const out = execSync(`pnpm dlx supabase db query --remote=${ref} --yes --file "${path}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
    const json = out.slice(out.indexOf('{'));
    return JSON.parse(json).rows ?? [];
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}

const rows = readExport(file);
const counts = { read: rows.length, skipped: 0, withPerson: 0, byDirection: { in: 0, out: 0 }, byType: {} };

let personKeyOf = () => 'dry-run';
let orgId = null;
if (!dryRun) {
  // The company's own person key, made now if no handheld has paired yet. Kept in memory only, never printed.
  const [site] = query(`select s.org_id, digigate.org_person_key(s.org_id) as key from digigate.sites s where s.id = '${siteId}';`);
  if (!site) {
    console.error('No site with that id in this project.');
    process.exit(1);
  }
  orgId = site.org_id;
  const key = Buffer.from(site.key, 'hex');
  personKeyOf = (idNumber) => createHmac('sha256', key).update(`02:${idNumber}`).digest('hex');
}

const checks = [];
for (const row of rows) {
  const check = toCheck(row, personKeyOf);
  if (!check) {
    counts.skipped++;
    continue;
  }
  checks.push(check);
  if (check.person_key) counts.withPerson++;
  counts.byDirection[check.direction]++;
  const type = check.visit_type || 'not recorded';
  counts.byType[type] = (counts.byType[type] ?? 0) + 1;
}

console.log(`read ${counts.read} rows · ${checks.length} checks to bring over · ${counts.skipped} skipped (no time, no direction or no id)`);
console.log(`in ${counts.byDirection.in} · out ${counts.byDirection.out} · ${counts.withPerson} with an SA ID number turned into a person key`);
console.log(`visit types: ${Object.entries(counts.byType).map(([type, n]) => `${type} ${n}`).join(' · ')}`);
if (dryRun) {
  console.log('Dry run: nothing was sent.');
  process.exit(0);
}

let added = 0;
for (let start = 0; start < checks.length; start += BATCH) {
  const batch = JSON.stringify(checks.slice(start, start + BATCH));
  if (batch.includes('$dgimport$')) throw new Error('A row holds the batch marker; stopping rather than sending it.');
  const [result] = query(`select digigate.import_old_checks('${orgId}', '${siteId}', $dgimport$${batch}$dgimport$::jsonb) as n;`);
  added += Number(result?.n ?? 0);
  console.log(`batch ${start / BATCH + 1} of ${Math.ceil(checks.length / BATCH)}: ${result?.n ?? 0} added`);
}
console.log(`Done: ${added} checks added; ${checks.length - added} were already there or older than three years.`);
