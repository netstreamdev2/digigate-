// Turns the exported SVGs in assets/icons into one TypeScript module per icon holding its path data,
// so each app imports only the icons it uses and recolours them in code.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'assets', 'icons');
const outDir = join(root, 'src', 'icons');

const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.svg')).sort();

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const file of files) {
  const svg = await readFile(join(sourceDir, file), 'utf8');
  const paths = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)];

  if (!svg.includes('viewBox="0 0 24 24"') || paths.length !== 1 || !svg.includes('fill-rule="evenodd"')) {
    throw new Error(`${file}: expected a single evenodd path on a 24 x 24 viewBox`);
  }

  const name = basename(file, '.svg');
  const source = `// Generated from assets/icons/${file} by scripts/build-icon-modules.mjs. Do not edit.\nexport default '${paths[0][1]}';\n`;
  await writeFile(join(outDir, `${name}.ts`), source);
}

console.log(`Wrote ${files.length} icon modules to src/icons`);
