// Draws the daily Security Checks report: every gate check of one day, with the driver's licence photo, name, ID number,
// passengers and plate, under a summary. The layout is the client's old system's, which their managers know; the look
// is DigiGate's. It holds personal information, so it only ever leaves locked (see pdf-lock.ts).
//
// Helvetica ships inside every PDF reader, which keeps a 100-page report small; anything it can't draw is swapped for
// its plain form. Licence photos arrive as the 8-bit grey BMPs the handhelds make, and go in as grey images.
import pdfLib, { type Color, type PDFDocument as PdfDocument, type PDFFont, type PDFPage, type PDFRef } from 'npm:pdf-lib@1.17.1';

import { colors } from '../../../packages/design/src/index.ts';
import { TASK_LABELS, passengersOf, sheetSummary, type CheckTask, type SheetSummary } from '../../../packages/core/src/check-sheet.ts';
import { countLabel, plainLabel } from '../../../packages/core/src/reports.ts';

import { LOGO_HEIGHT, LOGO_LAYERS } from './report-logo.ts';

const { PDFDocument, PDFRawStream, StandardFonts, degrees, drawImage, rgb } = pdfLib;

// A4 on its side, like the old report: the eight columns need the width.
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 30;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 34;
const HEADER_ROW = 24;
const ROW = 62;
const PHOTO_WIDTH = 40;
const PHOTO_HEIGHT = 50;
const SUMMARY_ROW = 16;
const MOST_TYPE_ROWS = 7;
// SAST has no daylight saving, so a fixed two hours turns UTC into the time on the gate's clock.
const SAST_MS = 2 * 60 * 60_000;

function hex(value: string): Color {
  const number = Number.parseInt(value.slice(1), 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

const INK = hex(colors.ink);
const MUTED = hex(colors.inkMuted);
const SUBTLE = hex(colors.inkSubtle);
const BORDER = hex(colors.border);
const PANEL = hex(colors.surfaceMuted);
const BRAND = hex(colors.brand);
const SKY = hex(colors.tileSky);
const WHITE = hex(colors.surface);
const WARNING = hex(colors.warning);
const WARNING_SOFT = hex(colors.warningSoft);
const BLOCKED = hex(colors.blocked);
const BLOCKED_SOFT = hex(colors.blockedSoft);

export type SheetCheck = {
  occurredAt: string;
  site: string;
  scannedBy: string | null;
  task: CheckTask;
  visitType: string | null;
  outcome: string | null;
  person: string | null;
  idNumber: string | null;
  personRef: string | null;
  occupants: number | null;
  plate: string | null;
  /** The licence photo as the handheld saved it: an 8-bit grey BMP. */
  photo: Uint8Array | null;
};

export type Sheet = {
  /** Whose checks: the company, and the client when it's one client's sites. */
  scope: string;
  /** The day, as YYYY-MM-DD in SAST. */
  day: string;
  checks: readonly SheetCheck[];
  /** How many checks the day had: more than `checks` when the report was cut short. */
  total: number;
  generatedAt: string;
};

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; drawable: Map<PDFFont, Set<number>> };

function safe(fonts: Fonts, font: PDFFont, text: string): string {
  let drawable = fonts.drawable.get(font);
  if (!drawable) {
    drawable = new Set(font.getCharacterSet());
    fonts.drawable.set(font, drawable);
  }
  const set = drawable;
  return Array.from(text, (character) => {
    if (set.has(character.codePointAt(0) ?? 0)) return character;
    const plain = character.normalize('NFD').charAt(0);
    return set.has(plain.codePointAt(0) ?? 0) ? plain : '?';
  }).join('');
}

/** Cut to fit the width, with an ellipsis when something had to go. */
function fit(fonts: Fonts, font: PDFFont, text: string, size: number, width: number): string {
  const clean = safe(fonts, font, text);
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  let cut = clean;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}...`;
}

/** Up to `lines` lines, broken between words, the last cut to fit. */
function wrap(fonts: Fonts, font: PDFFont, text: string, size: number, width: number, lines: number): string[] {
  const words = safe(fonts, font, text).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (let index = 0; index < words.length; index++) {
    const next = current ? `${current} ${words[index]}` : words[index];
    if (font.widthOfTextAtSize(next, size) <= width || !current) {
      current = next;
      continue;
    }
    if (out.length === lines - 1) {
      current = `${current} ${words.slice(index).join(' ')}`;
      break;
    }
    out.push(current);
    current = words[index];
  }
  if (current) out.push(out.length === lines - 1 ? fit(fonts, font, current, size, width) : current);
  return out.slice(0, lines);
}

type TextOptions = { font?: PDFFont; color?: Color; right?: boolean; width?: number };

/** Writes with its baseline `top` points down the page. */
function write(page: PDFPage, fonts: Fonts, text: string, x: number, top: number, size: number, options: TextOptions = {}): void {
  const font = options.font ?? fonts.regular;
  const shown = options.width ? fit(fonts, font, text, size, options.width) : safe(fonts, font, text);
  const left = options.right ? x - font.widthOfTextAtSize(shown, size) : x;
  page.drawText(shown, { x: left, y: PAGE_HEIGHT - top, size, font, color: options.color ?? INK });
}

function box(page: PDFPage, x: number, top: number, width: number, height: number, color: Color): void {
  page.drawRectangle({ x, y: PAGE_HEIGHT - top - height, width, height, color });
}

function drawLogo(page: PDFPage, x: number, top: number, height: number): void {
  const scale = height / LOGO_HEIGHT;
  for (const layer of LOGO_LAYERS) {
    page.drawSvgPath(layer.d, {
      x: x + layer.x * scale,
      y: PAGE_HEIGHT - (top + layer.y * scale),
      scale: layer.scale * scale,
      color: rgb(layer.color[0] / 255, layer.color[1] / 255, layer.color[2] / 255),
    });
  }
}

/** "2026-11-13 23:54", on the gate's clock. */
export function sheetTime(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at) ? '' : new Date(at + SAST_MS).toISOString().slice(0, 16).replace('T', ' ');
}

type Grey = { width: number; height: number; pixels: Uint8Array<ArrayBuffer> };

/** The pixels of an 8-bit BMP with a grey palette, top row first; null for anything else, which is left out. */
export function greyFromBmp(bmp: Uint8Array): Grey | null {
  if (bmp.length < 54 || bmp[0] !== 0x42 || bmp[1] !== 0x4d) return null;
  const view = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  const offset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const stored = view.getInt32(22, true);
  const height = Math.abs(stored);
  if (view.getUint16(28, true) !== 8 || view.getUint32(30, true) !== 0 || width <= 0 || height === 0 || width > 2000 || height > 2000) return null;
  const rowBytes = Math.ceil(width / 4) * 4;
  if (offset + rowBytes * height > bmp.length) return null;
  const pixels = new Uint8Array(width * height);
  for (let row = 0; row < height; row++) {
    // A positive height means the rows are stored bottom up.
    const from = offset + (stored > 0 ? height - 1 - row : row) * rowBytes;
    pixels.set(bmp.subarray(from, from + width), row * width);
  }
  return { width, height, pixels };
}

async function deflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type Photo = { ref: PDFRef; width: number; height: number };

async function embedPhoto(doc: PdfDocument, bmp: Uint8Array | null): Promise<Photo | null> {
  const grey = bmp ? greyFromBmp(bmp) : null;
  if (!grey) return null;
  const stream = PDFRawStream.of(
    doc.context.obj({
      Type: 'XObject',
      Subtype: 'Image',
      Width: grey.width,
      Height: grey.height,
      ColorSpace: 'DeviceGray',
      BitsPerComponent: 8,
      Filter: 'FlateDecode',
    }),
    await deflate(grey.pixels),
  );
  return { ref: doc.context.register(stream), width: grey.width, height: grey.height };
}

type Column = { key: string; label: string; width: number; right?: boolean };

const COLUMNS: readonly Column[] = [
  { key: 'date', label: 'Date', width: 84 },
  { key: 'site', label: 'Site', width: 112 },
  { key: 'scannedBy', label: 'Scanned by', width: 104 },
  { key: 'task', label: 'Task', width: 100 },
  { key: 'photo', label: 'Photo', width: 54 },
  { key: 'person', label: 'Person', width: 180 },
  { key: 'passengers', label: 'Passengers', width: 58, right: true },
  { key: 'plate', label: 'Plate', width: CONTENT_WIDTH - 692 },
];

const columnX = (key: string): number => {
  let x = MARGIN;
  for (const column of COLUMNS) {
    if (column.key === key) return x;
    x += column.width;
  }
  return x;
};
const columnWidth = (key: string): number => COLUMNS.find((column) => column.key === key)?.width ?? 0;
const CELL = 6;

function drawTableHeader(page: PDFPage, fonts: Fonts, top: number): void {
  box(page, MARGIN, top, CONTENT_WIDTH, HEADER_ROW, BRAND);
  for (const column of COLUMNS) {
    const x = columnX(column.key);
    write(page, fonts, column.label, column.right ? x + column.width - CELL : x + CELL, top + 15.5, 8.5, { font: fonts.bold, color: WHITE, right: column.right });
  }
}

function outcomeChip(outcome: string | null): { label: string; color: Color; soft: Color } | null {
  if (outcome === 'blocked') return { label: 'Blocked', color: BLOCKED, soft: BLOCKED_SOFT };
  if (outcome === 'warning') return { label: 'Warning', color: WARNING, soft: WARNING_SOFT };
  return null;
}

function drawRow(page: PDFPage, fonts: Fonts, check: SheetCheck, photo: Photo | null, top: number, shaded: boolean): void {
  if (shaded) box(page, MARGIN, top, CONTENT_WIDTH, ROW, PANEL);
  const line = top + 16;
  const text = (key: string) => columnX(key) + CELL;
  const room = (key: string) => columnWidth(key) - CELL * 2;

  write(page, fonts, sheetTime(check.occurredAt), text('date'), line, 9, { color: BRAND, font: fonts.bold, width: room('date') });
  wrap(fonts, fonts.regular, check.site, 9, room('site'), 2).forEach((part, index) => write(page, fonts, part, text('site'), line + index * 11, 9));
  wrap(fonts, fonts.regular, check.scannedBy ?? '', 9, room('scannedBy'), 2).forEach((part, index) => write(page, fonts, part, text('scannedBy'), line + index * 11, 9));

  write(page, fonts, TASK_LABELS[check.task], text('task'), line, 9, { width: room('task') });
  if (check.visitType) write(page, fonts, plainLabel(check.visitType), text('task'), line + 11, 8, { font: fonts.italic, color: MUTED, width: room('task') });
  const chip = outcomeChip(check.outcome);
  if (chip) {
    const width = fonts.bold.widthOfTextAtSize(chip.label, 7) + 10;
    box(page, text('task'), line + 17, width, 12, chip.soft);
    write(page, fonts, chip.label, text('task') + 5, line + 25.5, 7, { font: fonts.bold, color: chip.color });
  }

  if (photo) {
    // Fitted inside the frame without stretching.
    const scale = Math.min(PHOTO_WIDTH / photo.width, PHOTO_HEIGHT / photo.height);
    const width = photo.width * scale;
    const height = photo.height * scale;
    const x = columnX('photo') + (columnWidth('photo') - width) / 2;
    const y = PAGE_HEIGHT - top - (ROW - height) / 2 - height;
    const name = page.node.newXObject('Photo', photo.ref);
    page.pushOperators(...drawImage(name, { x, y, width, height, rotate: degrees(0), xSkew: degrees(0), ySkew: degrees(0) }));
  } else {
    write(page, fonts, 'No photo', columnX('photo') + columnWidth('photo') / 2 - 15, top + ROW / 2 + 3, 7, { color: SUBTLE });
  }

  const names = wrap(fonts, fonts.bold, (check.person ?? 'Not recorded').toUpperCase(), 9, room('person'), 2);
  names.forEach((part, index) => write(page, fonts, part, text('person'), line + index * 11, 9, { font: fonts.bold, color: check.person ? BRAND : SUBTLE }));
  write(page, fonts, check.idNumber ?? 'ID number not recorded', text('person'), line + names.length * 11 + 1, check.idNumber ? 9 : 7.5, {
    color: check.idNumber ? MUTED : SUBTLE,
    width: room('person'),
  });

  const passengers = passengersOf(check);
  if (passengers > 0) write(page, fonts, String(passengers), columnX('passengers') + columnWidth('passengers') - CELL, line, 9, { right: true });
  if (check.plate) write(page, fonts, check.plate, text('plate'), line, 9, { font: fonts.bold, color: BRAND, width: room('plate') });

  page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - top - ROW }, end: { x: MARGIN + CONTENT_WIDTH, y: PAGE_HEIGHT - top - ROW }, thickness: 0.5, color: BORDER });
}

/** One small table of the summary: a heading row, then lines, numbers right-aligned. Returns its height. */
function drawSummaryTable(page: PDFPage, fonts: Fonts, x: number, top: number, width: number, headings: readonly string[], numberWidths: readonly number[], rows: readonly (readonly string[])[]): number {
  box(page, x, top, width, SUMMARY_ROW + 2, PANEL);
  const numbersFrom = x + width - numberWidths.reduce((sum, value) => sum + value, 0);
  const cellRight = (index: number) => numbersFrom + numberWidths.slice(0, index + 1).reduce((sum, value) => sum + value, 0) - 6;
  headings.forEach((heading, index) =>
    index === 0
      ? write(page, fonts, heading, x + 6, top + 12, 8.5, { font: fonts.bold })
      : write(page, fonts, heading, cellRight(index - 1), top + 12, 8.5, { font: fonts.bold, right: true }),
  );
  rows.forEach((row, rowIndex) => {
    const line = top + SUMMARY_ROW + 2 + rowIndex * SUMMARY_ROW + 11.5;
    row.forEach((cell, index) =>
      index === 0
        ? write(page, fonts, cell, x + 6, line, 8.5, { width: numbersFrom - x - 12 })
        : write(page, fonts, cell, cellRight(index - 1), line, 8.5, { right: true }),
    );
  });
  return SUMMARY_ROW + 2 + rows.length * SUMMARY_ROW;
}

function typeRows(summary: SheetSummary): string[][] {
  const shown = summary.byType.slice(0, MOST_TYPE_ROWS);
  const rest = summary.byType.slice(MOST_TYPE_ROWS);
  const rows = shown.map((row) => [row.type ? plainLabel(row.type) : '(no type)', countLabel(row.people), countLabel(row.transactions)]);
  if (rest.length) {
    rows.push([`${rest.length} other types`, '', countLabel(rest.reduce((sum, row) => sum + row.transactions, 0))]);
  }
  return rows;
}

const titleOf = (sheet: Sheet) => `Security Checks — ${sheet.day} – ${sheet.day} (${countLabel(sheet.total)})`;

/** The first page's heading and summary. Returns how far down the page the checks start. */
function drawFirstPage(page: PDFPage, fonts: Fonts, sheet: Sheet, summary: SheetSummary): number {
  drawLogo(page, MARGIN, 24, 22);
  write(page, fonts, 'SECURITY CHECKS', PAGE_WIDTH - MARGIN, 34, 8, { font: fonts.bold, color: BRAND, right: true });
  write(page, fonts, titleOf(sheet), MARGIN, 72, 16, { font: fonts.bold });
  write(page, fonts, sheet.scope, MARGIN, 88, 9.5, { color: MUTED, width: CONTENT_WIDTH - 120 });

  box(page, MARGIN, 98, CONTENT_WIDTH, 24, SKY);
  const cut = sheet.total > sheet.checks.length ? `  ·  showing the first ${countLabel(sheet.checks.length)}` : '';
  write(
    page,
    fonts,
    `Summary — ${countLabel(summary.people)} people (each counted once), ${countLabel(summary.transactions)} transactions, ${countLabel(summary.passengers)} passengers${cut}`,
    MARGIN + 10,
    114,
    10,
    { font: fonts.bold, color: BRAND },
  );

  const gap = 16;
  const taskWidth = (CONTENT_WIDTH - gap) * 0.56;
  const tasks = drawSummaryTable(
    page,
    fonts,
    MARGIN,
    132,
    taskWidth,
    ['Task', 'Transactions', 'People', 'Passengers'],
    [80, 60, 70],
    summary.byTask.map((row) => [TASK_LABELS[row.task], countLabel(row.transactions), countLabel(row.people), countLabel(row.passengers)]),
  );
  const types = drawSummaryTable(page, fonts, MARGIN + taskWidth + gap, 132, CONTENT_WIDTH - taskWidth - gap, ['Type', 'People', 'Transactions'], [60, 80], typeRows(summary));
  return 132 + Math.max(tasks, types) + 18;
}

function drawLaterHeading(page: PDFPage, fonts: Fonts, sheet: Sheet): number {
  write(page, fonts, titleOf(sheet), MARGIN, 34, 12, { font: fonts.bold });
  write(page, fonts, sheet.scope, MARGIN, 48, 8.5, { color: MUTED, width: CONTENT_WIDTH - 120 });
  return 58;
}

function drawFooter(page: PDFPage, fonts: Fonts, sheet: Sheet, number: number, pages: number): void {
  write(page, fonts, `Page ${number} of ${pages}`, PAGE_WIDTH - MARGIN, number === 1 ? 72 : 34, number === 1 ? 11 : 10, { font: fonts.bold, color: MUTED, right: true });
  const top = PAGE_HEIGHT - 16;
  write(page, fonts, 'Confidential: personal information protected by POPIA. Keep this file and its password to yourself.', MARGIN, top, 7, { color: SUBTLE });
  write(page, fonts, `Generated ${sheet.generatedAt} by DigiGate`, PAGE_WIDTH - MARGIN, top, 7, { color: SUBTLE, right: true });
}

/** How many checks fit on a page whose rows start `top` points down. */
const rowsFrom = (top: number) => Math.max(1, Math.floor((PAGE_HEIGHT - FOOTER_SPACE - top - HEADER_ROW) / ROW));

/** The report as a document, ready to lock for each person it goes to. */
export async function renderCheckSheet(sheet: Sheet): Promise<PdfDocument> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.setTitle(titleOf(sheet));
  doc.setCreator('DigiGate');
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    drawable: new Map(),
  };
  const summary = sheetSummary(sheet.checks);
  const photos = await Promise.all(sheet.checks.map((check) => embedPhoto(doc, check.photo)));

  const first = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const firstTop = drawFirstPage(first, fonts, sheet, summary);
  const pages: { page: PDFPage; top: number; from: number; to: number }[] = [];
  const onFirst = rowsFrom(firstTop);
  pages.push({ page: first, top: firstTop, from: 0, to: Math.min(onFirst, sheet.checks.length) });
  const laterTop = 58;
  for (let from = onFirst; from < sheet.checks.length; from += rowsFrom(laterTop)) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawLaterHeading(page, fonts, sheet);
    pages.push({ page, top: laterTop, from, to: Math.min(from + rowsFrom(laterTop), sheet.checks.length) });
  }

  pages.forEach(({ page, top, from, to }, index) => {
    if (sheet.checks.length === 0) {
      write(page, fonts, 'No gate checks on this day.', MARGIN, top + 20, 11, { color: MUTED });
    } else {
      drawTableHeader(page, fonts, top);
      for (let at = from; at < to; at++) drawRow(page, fonts, sheet.checks[at], photos[at], top + HEADER_ROW + (at - from) * ROW, (at - from) % 2 === 1);
    }
    drawFooter(page, fonts, sheet, index + 1, pages.length);
  });
  return doc;
}
