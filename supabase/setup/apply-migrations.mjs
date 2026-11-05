// Brings a DigiGate database up to date: asks the project which migrations it already has (each records itself in
// digigate.schema_version), applies the rest from supabase/migrations in order, and stops at the first that fails.
// A new project gets every one; the same command run again later applies only what's new.
//
// Run it in your own terminal, never through an assistant: one migration writes a secret to Vault.
//   node supabase/setup/apply-migrations.mjs <project ref>
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [ref] = process.argv.slice(2);
if (!ref || !/^[a-z]{20}$/.test(ref)) {
  console.error('Give the project reference: node supabase/setup/apply-migrations.mjs <project ref>');
  process.exit(1);
}

/**
 * The newest migration the project has, or 0 for a new project, which has no schema_version table yet. Anything it
 * can't read stops the run: guessing "new project" would replay every migration over a live database.
 */
function appliedVersion() {
  let out;
  try {
    // JSON whatever the terminal: the CLI prints a table to a person and JSON to a script, and this must read it the same way.
    out = execSync(`pnpm dlx supabase db query --remote=${ref} --read-only --output json "select max(version) as v from digigate.schema_version"`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (cause) {
    if (/schema_version" does not exist|schema "digigate" does not exist/.test(String(cause.stderr ?? ''))) return 0;
    throw cause;
  }
  const value = /"v"\s*:\s*(\d+)/.exec(out)?.[1];
  if (value === undefined) {
    console.error("Couldn't read which migrations the project has, so nothing was changed. The project answered:");
    console.error(out.split('\n').slice(0, 12).join('\n'));
    process.exit(1);
  }
  return Number(value);
}
const applied = appliedVersion();
console.log(applied ? `The project is at migration ${applied}.` : 'A new project: every migration will be applied.');

const folder = join(import.meta.dirname, '..', 'migrations');
const migrations = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => {
    const version = /schema_version \(version\) values \((\d+)\)/.exec(readFileSync(join(folder, name), 'utf8'))?.[1];
    return { name, version: Number(version ?? 0) };
  });

for (const migration of migrations) {
  if (migration.version !== 0 && migration.version <= applied) continue;
  try {
    // One command line, from parts this script checked: the reference is 20 letters and the file is one of ours.
    execSync(`pnpm dlx supabase db query --remote=${ref} --yes --file "${join(folder, migration.name)}"`, { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`applied ${migration.version || '-'}  ${migration.name}`);
  } catch (cause) {
    console.error(`FAILED  ${migration.name}`);
    console.error(String(cause.stderr ?? cause.message).split('\n').slice(-12).join('\n'));
    console.error(`Fix it, then run the same command again: node supabase/setup/apply-migrations.mjs ${ref}`);
    process.exit(1);
  }
}
console.log('The project is up to date.');
