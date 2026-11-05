// Builds a DigiGate database: applies every migration in supabase/migrations, in order, to one Supabase project, and
// stops at the first that fails. Each migration records itself in digigate.schema_version, so a project part-way
// through starts again from where it got to: `--from <version>` skips the ones it already has.
//
// Run it in your own terminal, never through an assistant: one migration writes a secret to Vault.
//   node supabase/setup/apply-migrations.mjs <project ref> [--from <version>]
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [ref, flag, fromValue] = process.argv.slice(2);
if (!ref || !/^[a-z]{20}$/.test(ref)) {
  console.error('Give the project reference: node supabase/setup/apply-migrations.mjs <project ref> [--from <version>]');
  process.exit(1);
}
const from = flag === '--from' ? Number(fromValue) : 1;
if (!Number.isInteger(from) || from < 1) {
  console.error('--from takes a schema version, e.g. --from 25');
  process.exit(1);
}

const folder = join(import.meta.dirname, '..', 'migrations');
const migrations = readdirSync(folder)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => {
    const version = /schema_version \(version\) values \((\d+)\)/.exec(readFileSync(join(folder, name), 'utf8'))?.[1];
    return { name, version: Number(version ?? 0) };
  });

for (const migration of migrations) {
  if (migration.version !== 0 && migration.version < from) continue;
  try {
    // One command line, from parts this script checked: the reference is 20 letters and the file is one of ours.
    execSync(`pnpm dlx supabase db query --remote=${ref} --yes --file "${join(folder, migration.name)}"`, { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`applied ${migration.version || '-'}  ${migration.name}`);
  } catch (cause) {
    console.error(`FAILED  ${migration.name}`);
    console.error(String(cause.stderr ?? cause.message).split('\n').slice(-12).join('\n'));
    console.error(`Fix it, then carry on with: node supabase/setup/apply-migrations.mjs ${ref} --from ${migration.version}`);
    process.exit(1);
  }
}
console.log('Every migration is applied.');
