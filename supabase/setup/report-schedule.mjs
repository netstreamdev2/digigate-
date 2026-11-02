// Starts automated reports on a Supabase project, once. It makes a secret the scheduler and the report function share,
// stores it in the project's vault and function settings, and sets a job running every 5 minutes. The secret is never
// printed or kept in a file, and running this again replaces it safely.
//
// Run from the repo root, with the Supabase CLI logged in: node supabase/setup/report-schedule.mjs <project ref>
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [ref] = process.argv.slice(2);
if (!ref) throw new Error('Pass the project ref.');

const supabase = (args) => execFileSync('pnpm.cmd', ['dlx', 'supabase', ...args], { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 });

const secret = randomBytes(32).toString('hex');
const url = `https://${ref}.supabase.co/functions/v1/digigate-reports`;
const folder = mkdtempSync(join(tmpdir(), 'digigate-setup-'));
const file = join(folder, 'schedule.sql');

try {
  writeFileSync(
    file,
    `
    create extension if not exists pg_cron;
    create extension if not exists pg_net;

    do $$
    begin
      if exists (select 1 from vault.secrets where name = 'digigate_reports_cron') then
        perform vault.update_secret((select id from vault.secrets where name = 'digigate_reports_cron'), '${secret}');
      else
        perform vault.create_secret('${secret}', 'digigate_reports_cron');
      end if;
      if not exists (select 1 from vault.secrets where name = 'digigate_reports_url') then
        perform vault.create_secret('${url}', 'digigate_reports_url');
      end if;
    end;
    $$;

    select cron.schedule('digigate-reports', '*/5 * * * *', $job$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'digigate_reports_url'),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'digigate_reports_cron')
        ),
        body := '{"action":"run-due"}'::jsonb
      );
    $job$);
    `,
  );
  supabase(['db', 'query', '--linked', '--project-ref', ref, '--file', `"${file}"`]);
  supabase(['secrets', 'set', '--project-ref', ref, `REPORTS_CRON_SECRET=${secret}`]);
  console.log('Automated reports are running on this project.');
} finally {
  rmSync(folder, { recursive: true, force: true });
}
