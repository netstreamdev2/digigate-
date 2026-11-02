// Export generated artwork; this script does not generate or recolour vehicles.
import { readFile, writeFile, mkdir, readdir, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

// Keep batch exports bounded on workstations running the app and preview.
sharp.concurrency(1);
sharp.cache(false);

const design = fileURLToPath(new URL('../', import.meta.url));
const root = path.join(design, 'assets/vehicles');
const brief = await readFile(path.join(design, 'vehicle-art-brief.md'), 'utf8');
const colours = [...brief.matchAll(/^\|[^\n]+\| `([a-z]+)` \| `(#[A-Fa-f0-9]{6})` \| ([^|]+)\|/gm)]
  .map(([, name, paint, finish]) => ({ name, paint, finish: finish.trim() }));
const targets = [];
for (const [section, count, palette] of [
  ['1. Generic body types', 12, colours],
  ['2. Models, first list', 24, colours.slice(0, 6)],
  ['3. Models, second list', 40, colours.slice(0, 6)],
]) {
  const block = brief.split(`## ${section}`)[1]?.split('\n## ')[0];
  if (!block) throw new Error(`Missing brief section: ${section}`);
  const names = [...block.matchAll(/^\|[^\n]*`([a-z0-9-]+)`[^\n]*$/gm)].map(m => m[1]);
  if (names.length !== count) throw new Error(`Unexpected model count in ${section}`);
  for (const name of names) for (const colour of palette) {
    const id = `${name}-${colour.name}`;
    targets.push({ id, priority: section.startsWith('3.') ? 'P2' : 'P1', ...colour,
      master: `masters/${id}.png`, app: `app/${id}.webp` });
  }
}
if (colours.length !== 14 || targets.length !== 552) throw new Error('Brief inventory differs from expected 552 assets');
const exists = async p => { try { await access(p); return true; } catch { return false; } };
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const reviewFile = path.join(root, 'visual-review.json');
const [command = 'audit', id, input] = process.argv.slice(2);

async function inspect(file, width, height, previous) {
  const sha256 = await digest(file);
  if (previous?.checkVersion === 1 && previous.sha256 === sha256) return previous;
  const meta = await sharp(file).metadata();
  const stats = await sharp(file).stats();
  const issues = [];
  if (meta.format !== (file.endsWith('.png') ? 'png' : 'webp')) issues.push('incorrect encoding');
  if (meta.width !== width || meta.height !== height) issues.push('incorrect dimensions');
  if (!meta.hasAlpha || stats.isOpaque) issues.push('no transparent pixels');
  if (meta.hasAlpha && stats.channels.at(-1).max === 0) issues.push('empty image');
  if (meta.space !== 'srgb') issues.push(`colour space is ${meta.space}`);
  let framing = null;
  if (width === 1600 && meta.hasAlpha) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + info.channels - 1] >= 200) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
    }
    framing = { opaqueWidth: x1 - x0 + 1, left: x0, groundLine: y1 + 1 };
    if (Math.abs(framing.opaqueWidth - 1344) > 5 || Math.abs(framing.left - 128) > 3 || Math.abs(framing.groundLine - 880) > 3) {
      issues.push('framing outside tolerance');
    }
  }
  return { checkVersion: 1, sha256, bytes: (await stat(file)).size, framing, issues };
}

if (command === 'export') {
  if (!targets.some(t => t.id === id) || !input) throw new Error('Usage: node vehicle-art.mjs export <brief-id> <generated-file>');
  const master = path.join(root, `masters/${id}.png`);
  const app = path.join(root, `app/${id}.webp`);
  if (await exists(master) || await exists(app)) throw new Error(`Refusing to overwrite ${id}`);
  const meta = await sharp(input).metadata();
  const stats = await sharp(input).stats();
  if (!meta.hasAlpha || stats.isOpaque) throw new Error('Source must have genuine transparency');
  // Use opaque vehicle pixels to align the frame, excluding the soft shadow.
  // Only geometric resizing/padding: never paint, recolour or remove background.
  const { data, info } = await sharp(input).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width, maxX = -1, minY = info.height, maxY = -1;
  let cropX = info.width, cropY = info.height, cropRight = -1, cropBottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * info.channels + info.channels - 1];
    if (alpha > 0) {
      cropX = Math.min(cropX, x); cropRight = Math.max(cropRight, x);
      cropY = Math.min(cropY, y); cropBottom = Math.max(cropBottom, y);
    }
    if (alpha >= 200) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX) throw new Error('Source contains no opaque vehicle');
  const scale = 1344 / (maxX - minX + 1);
  const cropWidth = cropRight - cropX + 1, cropHeight = cropBottom - cropY + 1;
  const width = Math.round(cropWidth * scale), height = Math.round(cropHeight * scale);
  const left = 128 - Math.round((minX - cropX) * scale), top = 880 - Math.round((maxY - cropY + 1) * scale);
  if (Math.round((maxY - minY + 1) * scale) > 880) {
    throw new Error('Vehicle is too tall for 84% width above the ground line; regenerate a wider composition');
  }
  const resized = await sharp(input).rotate()
    .extract({ left: cropX, top: cropY, width: cropWidth, height: cropHeight })
    .resize(width, height).toBuffer();
  // Crop only overflow beyond the final canvas. The opaque vehicle must fit;
  // source background margins can contain nearly invisible alpha noise.
  const extractLeft = Math.max(0, -left), extractTop = Math.max(0, -top);
  const framed = await sharp(resized).extract({ left: extractLeft, top: extractTop,
    width: Math.min(width - extractLeft, 1600 - Math.max(0, left)),
    height: Math.min(height - extractTop, 1000 - Math.max(0, top)) }).toBuffer();
  const png = await sharp({ create: { width: 1600, height: 1000, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: framed, left: Math.max(0, left), top: Math.max(0, top) }]).withIccProfile('srgb').png().toBuffer();
  const webp = await sharp(png).resize(480, 300).webp({ quality: 80, alphaQuality: 100, effort: 6 }).toBuffer();
  await mkdir(path.dirname(master), { recursive: true });
  await mkdir(path.dirname(app), { recursive: true });
  await writeFile(master, png, { flag: 'wx' });
  await writeFile(app, webp, { flag: 'wx' });
  console.log(JSON.stringify({ id, master, app, appBytes: webp.length, sizeTargetMet: webp.length <= 25000 }));
} else if (command === 'review') {
  // Explicit manual attestation, never called by export or audit.
  const selected = targets.filter(t => t.id === id || t.id.startsWith(`${id}-`));
  if (!selected.length || selected.length > 14) throw new Error('Usage: node vehicle-art.mjs review <body-or-model-or-asset-id>');
  const reviews = await exists(reviewFile) ? JSON.parse(await readFile(reviewFile, 'utf8')) : {};
  for (const target of selected) {
    reviews[target.id] = { reviewedAt: new Date().toISOString(),
      masterSha256: await digest(path.join(root, target.master)),
      appSha256: await digest(path.join(root, target.app)) };
  }
  await writeFile(reviewFile, `${JSON.stringify(reviews, null, 2)}\n`);
  console.log(JSON.stringify({ visuallyReviewed: selected.map(t => t.id) }));
} else if (command === 'palette') {
  const palette = targets.filter(t => t.id.startsWith(`${id}-`));
  if (!palette.length || palette.length > 14) throw new Error('Usage: node vehicle-art.mjs palette <body-or-model-id>');
  const composites = [];
  for (const [i, target] of palette.entries()) {
    const file = path.join(root, target.app);
    if (!await exists(file)) continue;
    const left = (i % 2) * 640, top = Math.floor(i / 2) * 224;
    const label = Buffer.from(`<svg width="640" height="24"><text x="8" y="18" font-family="Arial" font-size="14" fill="#222">${target.id}</text></svg>`);
    composites.push({ input: label, left, top });
    for (const [j, background] of ['#fafafa', '#18202a'].entries()) {
      composites.push({ input: await sharp(file).resize(320, 200).flatten({ background }).png().toBuffer(),
        left: left + j * 320, top: top + 24 });
    }
  }
  const output = path.join(root, `review/${id}-palette.png`);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({ create: { width: 1280, height: Math.ceil(palette.length / 2) * 224,
    channels: 3, background: '#eeeeee' } }).composite(composites).png().toFile(output);
  console.log(output);
} else if (command === 'small-sizes') {
  const selected = targets.filter(t => t.id === id || t.id.startsWith(`${id}-`));
  if (!selected.length || selected.length > 14) throw new Error('Usage: node vehicle-art.mjs small-sizes <body-or-model-or-asset-id>');
  const composites = [];
  const missing = [];
  const header = Buffer.from('<svg width="448" height="24"><text x="8" y="17" font-family="Arial" font-size="12">Light: 160 px / 64 px</text><text x="232" y="17" font-family="Arial" font-size="12">Dark: 160 px / 64 px</text></svg>');
  composites.push({ input: header, left: 0, top: 0 });
  for (const [i, target] of selected.entries()) {
    const file = path.join(root, target.app);
    const present = await exists(file);
    if (!present) missing.push(target.id);
    const top = 24 + i * 124;
    const label = Buffer.from(`<svg width="448" height="24"><text x="8" y="17" font-family="Arial" font-size="12">${target.id}${present ? '' : ' (missing)'}</text></svg>`);
    composites.push({ input: label, left: 0, top });
    if (!present) continue;
    let left = 0;
    for (const background of ['#fafafa', '#18202a']) {
      for (const width of [160, 64]) {
        const height = Math.round(width * 300 / 480);
        composites.push({ input: await sharp(file).resize(width, height).flatten({ background })
          .extend({ top: 0, bottom: 100 - height, left: 0, right: 0, background }).png().toBuffer(),
          left, top: top + 24 });
        left += width;
      }
    }
  }
  const output = path.join(root, `review/${id}-small-sizes.png`);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({ create: { width: 448, height: 24 + selected.length * 124,
    channels: 3, background: '#eeeeee' } }).composite(composites).png().toFile(output);
  console.log(JSON.stringify({ output, missing }));
} else if (command === 'proof') {
  if (!targets.some(t => t.id === id)) throw new Error('Usage: node vehicle-art.mjs proof <brief-id>');
  const app = path.join(root, `app/${id}.webp`);
  const light = await sharp(app).flatten({ background: '#fafafa' }).png().toBuffer();
  const dark = await sharp(app).flatten({ background: '#18202a' }).png().toBuffer();
  const output = path.join(root, `review/${id}.png`);
  await mkdir(path.dirname(output), { recursive: true });
  await sharp({ create: { width: 960, height: 300, channels: 3, background: '#ffffff' } })
    .composite([{ input: light, left: 0, top: 0 }, { input: dark, left: 480, top: 0 }]).png().toFile(output);
  console.log(output);
} else if (command === 'audit') {
  const assets = [];
  const reviews = await exists(reviewFile) ? JSON.parse(await readFile(reviewFile, 'utf8')) : {};
  const manifestFile = path.join(root, 'manifest.json');
  const previous = await exists(manifestFile) ? JSON.parse(await readFile(manifestFile, 'utf8')) : { assets: [] };
  const previousAssets = new Map(previous.assets.map(a => [a.id, a]));
  for (const target of targets) {
    const masterFile = path.join(root, target.master);
    const appFile = path.join(root, target.app);
    const prior = previousAssets.get(target.id);
    const master = await exists(masterFile) ? await inspect(masterFile, 1600, 1000, prior?.masterCheck) : null;
    const app = await exists(appFile) ? await inspect(appFile, 480, 300, prior?.appCheck) : null;
    const review = reviews[target.id];
    const reviewed = !!(master && app && review && review.masterSha256 === master.sha256 && review.appSha256 === app.sha256);
    assets.push({ ...target, status: !master || !app ? 'missing' : master.issues.length || app.issues.length ? 'invalid' : reviewed ? 'visually-reviewed' : 'exported-awaiting-visual-review',
      masterCheck: master, appCheck: app, sizeTargetMet: app ? app.bytes <= 25000 : null });
  }
  const unexpected = [];
  for (const [folder, ext] of [['masters', '.png'], ['app', '.webp']]) {
    const dir = path.join(root, folder);
    if (await exists(dir)) for (const name of await readdir(dir)) {
      if (!targets.some(t => `${t.id}${ext}` === name)) unexpected.push(`${folder}/${name}`);
    }
  }
  const report = { expected: targets.length, exported: assets.filter(a => ['exported-awaiting-visual-review', 'visually-reviewed'].includes(a.status)).length,
    visuallyReviewed: assets.filter(a => a.status === 'visually-reviewed').length,
    missing: assets.filter(a => a.status === 'missing').length, invalid: assets.filter(a => a.status === 'invalid').length,
    overSizeTarget: assets.filter(a => a.sizeTargetMet === false).map(a => a.id), unexpected,
    visualReviewRequired: ['view angle and lighting', '84% vehicle width and ground line 12% from bottom', 'model recognition at 64 px', 'paint and finish', 'no badges, plates or people'], assets };
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  const cards = assets.filter(a => a.appCheck).map(a => `<article>
    <h2>${a.id}</h2><p>${(a.appCheck.bytes / 1000).toFixed(1)} KB · ${a.status}</p>
    <div class="samples light"><img loading="lazy" decoding="async" src="${a.app}" width="320" height="200" alt="${a.id}"><img loading="lazy" decoding="async" src="${a.app}" width="160" height="100" alt="160 px preview"><img loading="lazy" decoding="async" src="${a.app}" width="64" height="40" alt="64 px preview"></div>
    <div class="samples dark"><img loading="lazy" decoding="async" src="${a.app}" width="320" height="200" alt="${a.id} on dark"><img loading="lazy" decoding="async" src="${a.app}" width="160" height="100" alt="160 px preview on dark"><img loading="lazy" decoding="async" src="${a.app}" width="64" height="40" alt="64 px preview on dark"></div>
    <a href="${a.master}">PNG master</a> · <a href="${a.app}">WebP</a>
  </article>`).join('\n');
  await writeFile(path.join(root, 'preview.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DigiGate vehicle artwork review</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;background:#eee;color:#222}h1{font-size:24px}h2{font-size:15px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,580px),1fr));gap:20px}article{padding:16px;background:white;border:1px solid #ccc}p{color:#555}.samples{display:flex;align-items:end;gap:8px;overflow:auto;padding:8px}.light{background:#fafafa}.dark{background:#18202a}img{flex:none;object-fit:contain}a{display:inline-block;margin-top:12px;color:#174b85}</style>
<h1>DigiGate vehicle artwork review</h1><p>${report.exported} of ${report.expected} pairs exported; ${report.visuallyReviewed} visually reviewed; ${report.missing} missing. Technical checks do not certify visual accuracy. Review records match the current file hashes. Previews: 320, 160 and 64 px, on light and dark backgrounds.</p><main>${cards}</main></html>\n`);
  console.log(JSON.stringify({ ...report, assets: undefined }));
  if (report.invalid || unexpected.length) process.exitCode = 1;
} else {
  throw new Error('Expected export, proof, palette, small-sizes, review or audit command');
}
