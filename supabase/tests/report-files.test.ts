// Draws a report as a PDF and an email from made-up figures, the way the report function does, and checks what comes out.
// Run from the repo root: pnpm test:reports. Pass a folder to keep the files for a look: pnpm test:reports <folder>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import pdfLib from 'pdf-lib';

import { escapeHtml, renderReportEmail } from '../functions/_shared/report-email.ts';
import { renderReportPdf } from '../functions/_shared/report-pdf.ts';
import type { ReportData, ReportFrequency } from '../../packages/core/src/reports.ts';

const { PDFDocument } = pdfLib;
const keepIn = process.argv[2];
let passed = 0;
const failures: string[] = [];
const check = (name: string, ok: boolean) => (ok ? passed++ : failures.push(name));

function daysFrom(start: string, count: number) {
  return Array.from({ length: count }, (_unused, index) => {
    const day = new Date(`${start}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + index);
    const wave = Math.round(160 + 90 * Math.sin(index / 2.3) + (index % 7 < 5 ? 60 : -30));
    return { day: day.toISOString().slice(0, 10), checks: wave, entries: Math.round(wave * 0.48) };
  });
}

const sites = (count: number) =>
  Array.from({ length: count }, (_unused, index) => ({
    site_id: `site-${index}`,
    site: index % 3 ? `Main Campus ${index}` : `North Wing Service Entrance ${index}`,
    client: index % 2 ? `Sunnyside Memorial Hospital ${index}` : `Test Estate ${index}`,
    checks: 1200 - index * 11,
    entries: 600 - index * 5,
    exits: 590 - index * 5,
    blocked: 14 - (index % 9),
    warnings: 31 - (index % 13),
    overrides: index % 4,
  }));

const report = (frequency: ReportFrequency, overrides: Partial<ReportData> = {}): ReportData => {
  const shape: Record<ReportFrequency, [string, string, number]> = {
    daily: ['2026-10-31', '2026-10-31', 1],
    weekly: ['2026-10-26', '2026-11-01', 7],
    monthly: ['2026-10-01', '2026-10-31', 31],
    quarterly: ['2026-07-01', '2026-09-30', 92],
    yearly: ['2026-01-01', '2026-12-31', 365],
  };
  const [from, to, length] = shape[frequency];
  return {
    company: 'Fire Security',
    client: null,
    frequency,
    from,
    to,
    prior_from: '2026-09-01',
    prior_to: '2026-09-30',
    totals: { checks: 28150, vehicles_in: 8240, people_in: 5543, exits: 13721, stay_minutes: 1180000, blocked: 214, warnings: 407, overrides: 53, turned_away: 161, acknowledged: 346, active_sites: 12 },
    prior: { checks: 25100, vehicles_in: 7800, people_in: 5100, exits: 12800, stay_minutes: 1100000, blocked: 240, warnings: 380, overrides: 40, turned_away: 170, acknowledged: 320, active_sites: 12 },
    days: daysFrom(from, length),
    hours: [12, 8, 6, 7, 11, 44, 310, 420, 301, 221, 240, 288, 280, 262, 241, 262, 330, 372, 288, 176, 110, 80, 52, 30],
    rules: [
      { code: 'OCCUPANT_COUNT_DROP', hits: 132 },
      { code: 'DISC_EXPIRED', hits: 128 },
      { code: 'LICENCE_EXPIRED', hits: 109 },
      { code: 'PLATE_DISC_MISMATCH', hits: 89 },
      { code: 'DRIVER_VEHICLE_MISMATCH', hits: 42 },
      { code: 'UNKNOWN_DRIVER', hits: 33 },
      { code: 'IGNITION_RESTART_FAILED', hits: 12 },
    ],
    visit_types: [
      { type: 'visitor', visits: 8100 },
      { type: 'staff', visits: 3100 },
      { type: 'delivery', visits: 1300 },
      { type: 'contractor', visits: 880 },
      { type: 'patient_dropoff', visits: 322 },
      { type: 'emergency', visits: 81 },
    ],
    sites: sites(12),
    ...overrides,
  };
};

const GENERATED = '1 Nov 2026, 13:05 SAST';

for (const frequency of ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const) {
  const bytes = await renderReportPdf(report(frequency), GENERATED);
  const doc = await PDFDocument.load(bytes);
  check(`a ${frequency} report is a PDF`, new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-');
  check(`a ${frequency} report has pages`, doc.getPageCount() >= 1);
  check(`a ${frequency} report stays small enough to email`, bytes.length < 1_000_000);
  if (keepIn) writeFileSync(join(keepIn, `report-${frequency}.pdf`), bytes);
}

const manySites = await renderReportPdf(report('monthly', { sites: sites(120) }), GENERATED);
check('every site gets a row, however many pages it takes', (await PDFDocument.load(manySites)).getPageCount() >= 4);
if (keepIn) writeFileSync(join(keepIn, 'report-many-sites.pdf'), manySites);

const quiet = report('daily', {
  totals: {},
  prior: {},
  days: [{ day: '2026-10-31', checks: 0, entries: 0 }],
  hours: Array.from({ length: 24 }, () => 0),
  rules: [],
  visit_types: [],
  sites: [],
});
check('a period with nothing in it still draws', (await PDFDocument.load(await renderReportPdf(quiet, GENERATED))).getPageCount() >= 1);

const awkward = report('weekly', { company: 'Müller & Søn 警備 "Ltd"', client: `A very long client name ${'that keeps going '.repeat(8)}` });
check('names outside the PDF font draw without failing', (await PDFDocument.load(await renderReportPdf(awkward, GENERATED))).getPageCount() >= 1);

const html = renderReportEmail(report('weekly'), 'Good morning,\n\nHere is your report.', 'report.pdf');
check('the email carries the headline figures', html.includes('28 150') && html.includes('Fire Security'));
check('the email keeps paragraphs', html.includes('Good morning,') && html.includes('Here is your report.'));
check('the email names the attachment', html.includes('report.pdf'));
check('the email has no scripts or remote images', !/<script|<img|src=/i.test(html));
check('an empty message gets a plain default', renderReportEmail(report('weekly'), '   ', 'r.pdf').includes('The full report is attached'));

const injected = renderReportEmail(report('weekly', { company: '<b>Co</b>' }), '<script>alert(1)</script>', 'r.pdf');
check('whatever someone typed is escaped', !injected.includes('<script>') && !injected.includes('<b>Co</b>'));
check('escaping covers quotes', escapeHtml(`"'<>&`) === '&#34;&#39;&#60;&#62;&#38;');

const everything = JSON.stringify(report('monthly'));
check('the test figures hold no person, so the check below means something', !/person|plate"|vin"/i.test(everything));

console.log(`${passed} passed, ${failures.length} failed`);
for (const failure of failures) console.log('FAILED:', failure);
process.exitCode = failures.length ? 1 : 0;
