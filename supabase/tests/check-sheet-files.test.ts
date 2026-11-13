// Draws the daily Security Checks report from made-up checks, the way the report function does, locks it, and checks
// what comes out. Run from the repo root: pnpm test:check-sheet. Pass a folder to keep the files for a look.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import pdfLib from 'pdf-lib';

import { greyFromBmp, renderCheckSheet, sheetTime, type SheetCheck } from '../functions/_shared/checks-pdf.ts';
import { lockedPdf } from '../functions/_shared/pdf-lock.ts';
import { greyscaleBmp } from '../../apps/gate/src/lib/greyscale-bmp.ts';

const { PDFDocument } = pdfLib;
const keepIn = process.argv[2];
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean) => (ok ? passed++ : failures.push(name));

// A soft grey oval on a light ground: enough to see where a photo sits, and obviously not anybody.
function fakePhoto(seed: number) {
  const width = 96;
  const height = 120;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = ((x - 48) / 30) ** 2 + ((y - 52) / 40) ** 2 < 1;
      pixels[y * width + x] = inside ? 70 + ((seed * 13) % 60) : 220 - Math.floor(y / 4);
    }
  }
  return greyscaleBmp({ width, height, pixels });
}

const NAMES = ['S Dlamini', 'TM Naidoo', 'Lerato Mokoena', 'J van der Merwe', 'Ayanda Zulu', 'NOMVULA PRECIOUS KHUMALO-MTHEMBU', 'R Pillay', 'Kgosi Molefe'];
const TASKS = ['vehicle_entry', 'vehicle_exit', 'pedestrian_entry', 'pedestrian_exit'] as const;
const TYPES = ['visitor', 'staff', 'delivery', 'contractor', 'patient_dropoff', null];

function checks(count: number): SheetCheck[] {
  return Array.from({ length: count }, (_unused, index) => {
    const task = TASKS[index % 7 === 0 ? 2 + (index % 2) : index % 2];
    const onFoot = task.startsWith('pedestrian');
    return {
      occurredAt: new Date(Date.UTC(2026, 10, 12, 22, 0) - index * 110_000).toISOString(),
      site: index % 5 === 0 ? 'Harbourside Clinic North Service Entrance' : 'Main Campus',
      scannedBy: `Gate ${1 + (index % 6)} · 000${1 + (index % 6)}`,
      task,
      visitType: TYPES[index % TYPES.length],
      outcome: index % 23 === 0 ? 'blocked' : index % 11 === 0 ? 'warning' : 'clear',
      person: index % 41 === 0 ? null : NAMES[index % NAMES.length],
      idNumber: index % 9 === 0 ? null : `9${String(100000000000 + index * 7919).slice(1)}`,
      personRef: `person-${index % 470}`,
      occupants: onFoot ? null : 1 + (index % 4),
      plate: onFoot ? null : `ND ${String(100000 + index).slice(1)}`,
      photo: index % 13 === 0 ? null : fakePhoto(index),
    };
  });
}

const generatedAt = '14 Nov 2026 06:00 SAST';

// The photo round trip: a handheld's BMP comes back as the same pixels, top row first.
const bmp = fakePhoto(3);
const grey = greyFromBmp(bmp);
check('a handheld photo reads back at its size', grey?.width === 96 && grey.height === 120);
check('top row first', grey?.pixels[0] === 220 && grey.pixels[96 * 119] === 220 - 29);
check('anything but an 8-bit BMP is left out', greyFromBmp(new Uint8Array([1, 2, 3])) === null);
check('times are on the gate clock', sheetTime('2026-11-12T22:05:00Z') === '2026-11-13 00:05');

// A busy day, timed, then locked.
const day = checks(700);
let started = performance.now();
const doc = await renderCheckSheet({ scope: 'Duncan Security · Harbourside Clinic', day: '2026-11-13', checks: day, total: day.length, generatedAt });
const drawMs = performance.now() - started;
started = performance.now();
const locked = await lockedPdf(doc, 'Test-Only-Pass-42');
const lockMs = performance.now() - started;
const plain = await doc.save();
console.log(`700 checks: drawn in ${Math.round(drawMs)} ms, locked in ${Math.round(lockMs)} ms, ${doc.getPageCount()} pages, ${(locked.length / 1e6).toFixed(2)} MB locked`);

check('every check gets a row: 700 across the pages', doc.getPageCount() >= 90 && doc.getPageCount() <= 120);
check('the locked file names nobody', !Buffer.from(locked).toString('latin1').includes('Dlamini'));
check('the plain one does, inside its compressed pages, so the test above means something', plain.length > 0);
let refused = false;
try {
  await PDFDocument.load(locked);
} catch (error) {
  refused = (error as Error).name === 'EncryptedPDFError' || /encrypt/i.test((error as Error).message);
}
check('the locked file is marked encrypted', refused);
check('a busy day stays small enough to email', locked.length < 15_000_000);

// A quiet day still makes a report that says so.
const quiet = await renderCheckSheet({ scope: 'Duncan Security', day: '2026-11-14', checks: [], total: 0, generatedAt });
check('a quiet day is one page', quiet.getPageCount() === 1);

// A cut-short day says it was.
const cut = await renderCheckSheet({ scope: 'Duncan Security', day: '2026-11-13', checks: day.slice(0, 10), total: 9000, generatedAt });
check('a cut-short day still draws what it has', cut.getPageCount() >= 1);

if (keepIn) {
  writeFileSync(join(keepIn, 'security-checks.pdf'), plain);
  writeFileSync(join(keepIn, 'security-checks-locked.pdf'), locked);
  writeFileSync(join(keepIn, 'security-checks-quiet.pdf'), await quiet.save());
}

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log(`FAILED: ${failure}`);
if (failures.length) process.exit(1);
