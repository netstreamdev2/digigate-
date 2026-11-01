// Draws a report as a PDF. It holds only counts: no names, ID numbers or plates, so it's safe to email. Helvetica ships
// inside every PDF reader, which keeps the file small; anything it can't draw is swapped for its plain form.
import pdfLib, { type Color, type PDFDocument as PdfDocument, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';

import { colors, seriesColors } from '../../../packages/design/src/index.ts';
import {
  activitySeries,
  activityUnit,
  averageStay,
  canCompare,
  compactCount,
  countLabel,
  entriesOf,
  hourSeries,
  percentChange,
  periodHeading,
  periodLabel,
  plainLabel,
  priorLabel,
  reportScope,
  reportTitle,
  ruleLines,
  stayLabel,
  type ReportBucket,
  type ReportData,
  type ReportFigures,
} from '../../../packages/core/src/reports.ts';

import { LOGO_HEIGHT, LOGO_LAYERS } from './report-logo.ts';

// An older package: its names only come through reliably on the default export, in Deno and Node alike.
const { PDFDocument, rgb, StandardFonts } = pdfLib;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_SPACE = 52;
const CHART_HEIGHT = 118;
const COLUMN_MAX_WIDTH = 16;
const TILE_GAP = 10;

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
const SERIES = hex(seriesColors[0]);
const CLEAR = hex(colors.clear);
const BLOCKED = hex(colors.blocked);

type Pen = {
  doc: PdfDocument;
  page: PDFPage;
  /** How far down the current page the next thing goes, measured from the top. */
  y: number;
  regular: PDFFont;
  bold: PDFFont;
};

/** Trend direction for a tile: whether going up is good news. */
type UpMeans = 'good' | 'bad' | 'neutral';

function safe(font: PDFFont, text: string): string {
  const drawable = new Set(font.getCharacterSet());
  return Array.from(text, (character) => {
    if (drawable.has(character.codePointAt(0) ?? 0)) return character;
    const plain = character.normalize('NFD').charAt(0);
    return drawable.has(plain.codePointAt(0) ?? 0) ? plain : '?';
  }).join('');
}

function fit(font: PDFFont, text: string, size: number, width: number): string {
  const clean = safe(font, text);
  if (font.widthOfTextAtSize(clean, size) <= width) return clean;
  let cut = clean;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function write(pen: Pen, text: string, x: number, top: number, size: number, options: { font?: PDFFont; color?: Color; right?: boolean } = {}): void {
  const font = options.font ?? pen.regular;
  const clean = safe(font, text);
  const left = options.right ? x - font.widthOfTextAtSize(clean, size) : x;
  pen.page.drawText(clean, { x: left, y: PAGE_HEIGHT - top - size * 0.8, size, font, color: options.color ?? INK });
}

function roundedPath(width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
}

function panel(pen: Pen, x: number, top: number, width: number, height: number, radius: number, fill: Color, edge?: Color): void {
  pen.page.drawSvgPath(roundedPath(width, height, radius), {
    x,
    y: PAGE_HEIGHT - top,
    color: fill,
    ...(edge ? { borderColor: edge, borderWidth: 0.75 } : {}),
  });
}

/** A column with a rounded top, standing square on its baseline. */
function column(pen: Pen, x: number, baseline: number, width: number, height: number, color: Color): void {
  const r = Math.min(2.5, width / 2, height);
  pen.page.drawSvgPath(`M 0 ${r} Q 0 0 ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height} H 0 Z`, { x, y: PAGE_HEIGHT - (baseline - height), color });
}

function rule(pen: Pen, top: number, color: Color = BORDER): void {
  pen.page.drawLine({ start: { x: MARGIN, y: PAGE_HEIGHT - top }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - top }, thickness: 0.6, color });
}

function newPage(pen: Pen): void {
  pen.page = pen.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pen.y = MARGIN;
}

function room(pen: Pen, height: number): void {
  if (pen.y + height > PAGE_HEIGHT - FOOTER_SPACE) newPage(pen);
}

function drawLogo(pen: Pen, x: number, top: number, height: number): void {
  const scale = height / LOGO_HEIGHT;
  for (const layer of LOGO_LAYERS) {
    pen.page.drawSvgPath(layer.d, {
      x: x + layer.x * scale,
      y: PAGE_HEIGHT - (top + layer.y * scale),
      scale: layer.scale * scale,
      color: rgb(layer.color[0] / 255, layer.color[1] / 255, layer.color[2] / 255),
    });
  }
}

function drawHeader(pen: Pen, data: ReportData, generatedAt: string): void {
  drawLogo(pen, MARGIN, 34, 30);
  write(pen, reportTitle(data.frequency), PAGE_WIDTH - MARGIN, 36, 11, { font: pen.bold, color: BRAND, right: true });
  write(pen, `Generated ${generatedAt}`, PAGE_WIDTH - MARGIN, 52, 8, { color: SUBTLE, right: true });

  const top = 80;
  const height = 104;
  panel(pen, MARGIN, top, CONTENT_WIDTH, height, 14, BRAND);
  write(pen, fit(pen.bold, reportScope(data), 25, CONTENT_WIDTH - 44), MARGIN + 22, top + 20, 25, { font: pen.bold, color: WHITE });
  write(pen, data.client ? data.company : 'All sites', MARGIN + 22, top + 52, 10, { color: SKY });
  write(pen, periodHeading(data), MARGIN + 22, top + 74, 12, { font: pen.bold, color: WHITE });
  pen.y = top + height + 14;
}

function changeNote(now: number, before: number, data: ReportData): { text: string; change: number | null } {
  if (!canCompare(data)) return { text: 'So far today', change: null };
  const change = percentChange(now, before);
  if (change === null) return { text: 'Nothing to compare with', change };
  if (change === 0) return { text: `No change on ${priorLabel(data.frequency)}`, change };
  return { text: `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on ${priorLabel(data.frequency)}`, change };
}

function drawTile(pen: Pen, x: number, top: number, width: number, label: string, value: string, note: string, change: number | null, upMeans: UpMeans): void {
  const height = 74;
  panel(pen, x, top, width, height, 11, WHITE, BORDER);
  write(pen, label, x + 13, top + 12, 8.5, { color: MUTED });
  write(pen, value, x + 13, top + 26, 21, { font: pen.bold });

  const worse = change !== null && change !== 0 && upMeans !== 'neutral' && (change > 0) === (upMeans === 'bad');
  const better = change !== null && change !== 0 && upMeans !== 'neutral' && !worse;
  const tone = worse ? BLOCKED : better ? CLEAR : SUBTLE;
  const noteTop = top + 55;
  if (change !== null && change !== 0) {
    const arrow = change > 0 ? 'M 3 0 L 6 5 L 0 5 Z' : 'M 0 0 L 6 0 L 3 5 Z';
    pen.page.drawSvgPath(arrow, { x: x + 13, y: PAGE_HEIGHT - noteTop - 1.5, color: tone });
    write(pen, fit(pen.regular, note, 7.5, width - 36), x + 23, noteTop, 7.5, { color: MUTED });
  } else {
    write(pen, fit(pen.regular, note, 7.5, width - 26), x + 13, noteTop, 7.5, { color: SUBTLE });
  }
}

function drawTiles(pen: Pen, data: ReportData): void {
  const { totals, prior } = data;
  const count = (key: keyof ReportFigures) => totals[key] ?? 0;
  const before = (key: keyof ReportFigures) => prior[key] ?? 0;
  const stay = averageStay(totals);

  const tiles: { label: string; value: string; now: number; then: number; upMeans: UpMeans }[] = [
    { label: 'Scans', value: countLabel(count('checks')), now: count('checks'), then: before('checks'), upMeans: 'neutral' },
    { label: 'Entries', value: countLabel(entriesOf(totals)), now: entriesOf(totals), then: entriesOf(prior), upMeans: 'neutral' },
    { label: 'Exits', value: countLabel(count('exits')), now: count('exits'), then: before('exits'), upMeans: 'neutral' },
    { label: 'Blocked at the boom', value: countLabel(count('blocked')), now: count('blocked'), then: before('blocked'), upMeans: 'bad' },
    { label: 'Warnings', value: countLabel(count('warnings')), now: count('warnings'), then: before('warnings'), upMeans: 'bad' },
    { label: 'Average stay', value: stayLabel(stay), now: stay, then: averageStay(prior), upMeans: 'neutral' },
  ];

  const width = (CONTENT_WIDTH - TILE_GAP * 2) / 3;
  tiles.forEach((tile, index) => {
    const x = MARGIN + (index % 3) * (width + TILE_GAP);
    const top = pen.y + Math.floor(index / 3) * (74 + TILE_GAP);
    const note = changeNote(tile.now, tile.then, data);
    drawTile(pen, x, top, width, tile.label, tile.value, note.text, note.change, tile.upMeans);
  });
  pen.y += 74 * 2 + TILE_GAP + 20;
}

function heading(pen: Pen, title: string, subtitle: string): void {
  write(pen, title, MARGIN, pen.y, 12.5, { font: pen.bold });
  write(pen, subtitle, MARGIN, pen.y + 17, 8.5, { color: MUTED });
  pen.y += 36;
}

/** Clean axis steps: the top of the scale and four even ticks under it. */
function scaleFor(values: readonly number[]): { top: number; ticks: number[] } {
  const peak = Math.max(1, ...values);
  const power = 10 ** Math.floor(Math.log10(peak));
  const step = [0.25, 0.5, 1, 1.25, 1.5, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate * 4 >= peak) ?? power;
  const whole = Math.max(1, Math.ceil(step));
  return { top: whole * 4, ticks: [0, whole, whole * 2, whole * 3, whole * 4] };
}

function drawColumns(pen: Pen, buckets: readonly ReportBucket[]): void {
  const axisWidth = 30;
  const plotLeft = MARGIN + axisWidth;
  const plotWidth = CONTENT_WIDTH - axisWidth;
  const top = pen.y + 8;
  const baseline = top + CHART_HEIGHT;
  const { top: peak, ticks } = scaleFor(buckets.map(({ value }) => value));

  for (const tick of ticks) {
    const y = baseline - (tick / peak) * CHART_HEIGHT;
    pen.page.drawLine({ start: { x: plotLeft, y: PAGE_HEIGHT - y }, end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - y }, thickness: 0.5, color: tick === 0 ? SUBTLE : BORDER });
    write(pen, compactCount(tick), plotLeft - 7, y - 3.5, 7, { color: SUBTLE, right: true });
  }

  const slot = plotWidth / Math.max(1, buckets.length);
  const barWidth = Math.min(COLUMN_MAX_WIDTH, Math.max(2, slot - 2));
  const everyNth = Math.max(1, Math.ceil(buckets.length / 12));
  const highest = Math.max(...buckets.map(({ value }) => value));
  let labelled = false;

  buckets.forEach((bucket, index) => {
    const x = plotLeft + slot * index + (slot - barWidth) / 2;
    const height = (bucket.value / peak) * CHART_HEIGHT;
    if (height > 0) column(pen, x, baseline, barWidth, Math.max(1, height), SERIES);
    if (index % everyNth === 0) {
      const width = pen.regular.widthOfTextAtSize(bucket.label, 7);
      write(pen, bucket.label, x + barWidth / 2 - width / 2, baseline + 6, 7, { color: SUBTLE });
    }
    if (!labelled && bucket.value === highest && highest > 0) {
      labelled = true;
      const text = compactCount(bucket.value);
      const width = pen.bold.widthOfTextAtSize(text, 7.5);
      write(pen, text, x + barWidth / 2 - width / 2, baseline - height - 12, 7.5, { font: pen.bold });
    }
  });
  pen.y = baseline + 34;
}

function drawRankBars(pen: Pen, lines: readonly { label: string; value: number }[], empty: string): void {
  if (lines.length === 0) {
    write(pen, empty, MARGIN, pen.y, 9, { color: MUTED });
    pen.y += 26;
    return;
  }
  const labelWidth = 170;
  const valueWidth = 44;
  const barLeft = MARGIN + labelWidth;
  const barSpace = CONTENT_WIDTH - labelWidth - valueWidth;
  const peak = Math.max(...lines.map(({ value }) => value));
  for (const line of lines) {
    room(pen, 20);
    write(pen, fit(pen.regular, line.label, 9, labelWidth - 10), MARGIN, pen.y + 2, 9);
    panel(pen, barLeft, pen.y + 2, Math.max(4, (line.value / peak) * barSpace), 9, 2.5, SERIES);
    write(pen, countLabel(line.value), PAGE_WIDTH - MARGIN, pen.y + 2, 9, { font: pen.bold, right: true });
    pen.y += 19;
  }
  pen.y += 12;
}

function drawDecisions(pen: Pen, data: ReportData): void {
  const { totals } = data;
  const tiles = [
    { label: 'Supervisor overrides', value: totals.overrides ?? 0 },
    { label: 'Turned away', value: totals.turned_away ?? 0 },
    { label: 'Let through after a warning', value: totals.acknowledged ?? 0 },
  ];
  const width = (CONTENT_WIDTH - TILE_GAP * 2) / 3;
  tiles.forEach((tile, index) => {
    const x = MARGIN + index * (width + TILE_GAP);
    panel(pen, x, pen.y, width, 54, 11, PANEL);
    write(pen, fit(pen.regular, tile.label, 8.5, width - 24), x + 13, pen.y + 11, 8.5, { color: MUTED });
    write(pen, countLabel(tile.value), x + 13, pen.y + 26, 17, { font: pen.bold });
  });
  pen.y += 54 + 22;
}

function drawSites(pen: Pen, data: ReportData): void {
  const showClient = data.client === null;
  const numbers = [
    { label: 'Scans', x: 372, value: (line: ReportData['sites'][number]) => line.checks },
    { label: 'Entries', x: 420, value: (line: ReportData['sites'][number]) => line.entries },
    { label: 'Blocked', x: 468, value: (line: ReportData['sites'][number]) => line.blocked },
    { label: 'Warnings', x: PAGE_WIDTH - MARGIN, value: (line: ReportData['sites'][number]) => line.warnings },
  ];

  const header = () => {
    write(pen, 'Site', MARGIN, pen.y, 7.5, { font: pen.bold, color: SUBTLE });
    if (showClient) write(pen, 'Client', MARGIN + 142, pen.y, 7.5, { font: pen.bold, color: SUBTLE });
    for (const number of numbers) write(pen, number.label, number.x, pen.y, 7.5, { font: pen.bold, color: SUBTLE, right: true });
    pen.y += 15;
    rule(pen, pen.y - 4);
  };

  room(pen, 90);
  heading(pen, 'Sites', 'Busiest first');
  if (data.sites.length === 0) {
    write(pen, 'No site recorded a scan in this period.', MARGIN, pen.y, 9, { color: MUTED });
    pen.y += 26;
    return;
  }
  header();
  for (const line of data.sites) {
    if (pen.y + 22 > PAGE_HEIGHT - FOOTER_SPACE) {
      newPage(pen);
      header();
    }
    write(pen, fit(pen.regular, line.site, 9, showClient ? 134 : 280), MARGIN, pen.y + 2, 9);
    if (showClient) write(pen, fit(pen.regular, line.client, 9, 128), MARGIN + 142, pen.y + 2, 9, { color: MUTED });
    for (const number of numbers) write(pen, countLabel(number.value(line)), number.x, pen.y + 2, 9, { right: true });
    pen.y += 19;
    rule(pen, pen.y - 5);
  }
}

function drawFooters(pen: Pen, data: ReportData): void {
  const pages = pen.doc.getPages();
  pages.forEach((page, index) => {
    pen.page = page;
    rule(pen, PAGE_HEIGHT - 38);
    write(pen, `${safe(pen.regular, reportScope(data))} · Private and confidential`, MARGIN, PAGE_HEIGHT - 31, 7.5, { color: SUBTLE });
    write(pen, 'Counts only: no names, ID numbers or plates', PAGE_WIDTH / 2 + 40, PAGE_HEIGHT - 31, 7.5, { color: SUBTLE });
    write(pen, `Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 31, 7.5, { color: SUBTLE, right: true });
  });
}

/** `generatedAt` is passed in, already in the site's time, so the same data always draws the same file. */
export async function renderReportPdf(data: ReportData, generatedAt: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${reportScope(data)}: ${reportTitle(data.frequency)}`);
  doc.setSubject(periodLabel(data.frequency, data.from, data.to));
  doc.setAuthor('DigiGate');
  doc.setCreator('DigiGate');

  const pen: Pen = {
    doc,
    page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: MARGIN,
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };

  drawHeader(pen, data, generatedAt);
  drawTiles(pen, data);

  heading(pen, 'Scans over the period', `All gates, ${activityUnit(data.frequency)}`);
  drawColumns(pen, activitySeries(data));

  if (data.frequency !== 'daily') {
    room(pen, CHART_HEIGHT + 90);
    heading(pen, 'Busiest hours', 'All scans in the period, by time of day');
    drawColumns(pen, hourSeries(data));
  }

  room(pen, 120);
  heading(pen, 'What the rules flagged', 'Every rule that fired, most frequent first');
  drawRankBars(pen, ruleLines(data.rules), 'No rule fired in this period.');

  room(pen, 120);
  heading(pen, 'What the gate decided', 'What happened after a warning or a block');
  drawDecisions(pen, data);

  room(pen, 120);
  heading(pen, 'Who came through', 'Entries by visit type');
  drawRankBars(pen, data.visit_types.map(({ type, visits }) => ({ label: plainLabel(type), value: visits })), 'Nobody entered in this period.');

  drawSites(pen, data);
  drawFooters(pen, data);

  return await doc.save();
}
