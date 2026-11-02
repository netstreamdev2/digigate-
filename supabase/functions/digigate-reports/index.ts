// Builds report PDFs and emails them, on request from the dashboard or on a schedule. Deployed with --no-verify-jwt: a
// person proves themselves with their session, and the scheduler with its own secret. Reports hold counts only, so an
// email never carries a name, ID number or plate. Logs carry error names only: requests hold email addresses.
import { audit, callerOf, canManage, isSuper, type Caller } from '../_shared/caller.ts';
import { json, sha256Hex, sql } from '../_shared/device.ts';
import { renderReportEmail } from '../_shared/report-email.ts';
import { renderReportPdf } from '../_shared/report-pdf.ts';
import { isReportFrequency, reportFileName, reportSubject, type ReportData, type ReportFrequency } from '../../../packages/core/src/reports.ts';

const RESEND_URL = 'https://api.resend.com/emails';
// Resend's own test address, which can only reach the account owner. Sending to anyone else needs a verified domain.
const TEST_SENDER = 'DigiGate Reports <onboarding@resend.dev>';
const MOST_RECIPIENTS = 50;
const LONGEST_MESSAGE = 4000;
const LONGEST_SUBJECT = 200;
const SCHEDULES_PER_RUN = 10;

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Scope = { org: string; client: string | null; frequency: ReportFrequency; day: string };
type Recipients = { to: string[]; cc: string[]; bcc: string[] };
type Letter = Recipients & { subject: string; message: string };
type Delivered = { id: string; problem: null } | { id: null; problem: string };

function readScope(body: Record<string, unknown>): Scope | null {
  const { org, client, frequency, day } = body;
  if (typeof org !== 'string' || !UUID.test(org)) return null;
  if (typeof frequency !== 'string' || !isReportFrequency(frequency)) return null;
  if (typeof day !== 'string' || !DAY.test(day)) return null;
  if (client !== null && client !== undefined && (typeof client !== 'string' || !UUID.test(client))) return null;
  return { org, client: client ?? null, frequency, day };
}

/** Clean, lower-case, unique addresses, or null when any of them isn't an address. */
function readAddresses(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const addresses = value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return addresses.every((address) => EMAIL.test(address)) ? [...new Set(addresses)] : null;
}

function readRecipients(body: Record<string, unknown>): Recipients | null {
  const to = readAddresses(body.to);
  const cc = readAddresses(body.cc);
  const bcc = readAddresses(body.bcc);
  if (!to || !cc || !bcc || to.length === 0) return null;
  return to.length + cc.length + bcc.length <= MOST_RECIPIENTS ? { to, cc, bcc } : null;
}

const oneLine = (value: unknown, longest: number) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, longest);

async function reportFor({ org, client, frequency, day }: Scope): Promise<ReportData> {
  const [{ data }] = await sql`select digigate.report_data(${org}::uuid, ${client}::uuid, ${frequency}, ${day}::date) as data`;
  return data;
}

function generatedAt(): string {
  const stamp = new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  return `${stamp.replace(',', '')} SAST`;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let start = 0; start < bytes.length; start += 0x8000) text += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(text);
}

async function deliver(data: ReportData, letter: Letter): Promise<Delivered> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { id: null, problem: 'email-not-set-up' };

  const fileName = reportFileName(data);
  const response = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('REPORTS_FROM') ?? TEST_SENDER,
      to: letter.to,
      ...(letter.cc.length ? { cc: letter.cc } : {}),
      ...(letter.bcc.length ? { bcc: letter.bcc } : {}),
      subject: letter.subject,
      html: renderReportEmail(data, letter.message, fileName),
      attachments: [{ filename: fileName, content: toBase64(await renderReportPdf(data, generatedAt())) }],
    }),
  });
  if (!response.ok) {
    console.error('Resend refused a report', response.status);
    return { id: null, problem: response.status === 401 || response.status === 403 ? 'email-refused' : 'email-failed' };
  }
  const sent: { id?: string } = await response.json();
  return { id: sent.id ?? '', problem: null };
}

/** The history every send leaves, good or bad. Addresses stay here, out of the audit log, which is never erased. */
async function recordSend(scope: Scope, data: ReportData, letter: Letter, delivered: Delivered, scheduleId: string | null, sentBy: string | null): Promise<void> {
  await sql`
    insert into digigate.report_sends (org_id, client_id, schedule_id, frequency, period_from, period_to, subject, recipients, cc, bcc, status, problem, provider_id, sent_by)
    values (
      ${scope.org}::uuid, ${scope.client}::uuid, ${scheduleId}::uuid, ${scope.frequency}, ${data.from}::date, ${data.to}::date, ${letter.subject},
      ${sql.array(letter.to)}::text[], ${sql.array(letter.cc)}::text[], ${sql.array(letter.bcc)}::text[],
      ${delivered.problem ? 'failed' : 'sent'}, ${delivered.problem}, ${delivered.id}, ${sentBy}::uuid
    )`;
}

const peopleCount = ({ to, cc, bcc }: Recipients) => {
  const total = to.length + cc.length + bcc.length;
  return `${total} ${total === 1 ? 'recipient' : 'recipients'}`;
};

async function sendReport(caller: Caller, scope: Scope, body: Record<string, unknown>): Promise<Response> {
  const recipients = readRecipients(body);
  if (!recipients) return json({ error: 'recipients' }, 400);

  const data = await reportFor(scope);
  const letter: Letter = {
    ...recipients,
    subject: oneLine(body.subject, LONGEST_SUBJECT) || reportSubject(data),
    message: String(body.message ?? '').slice(0, LONGEST_MESSAGE),
  };
  const delivered = await deliver(data, letter);
  await recordSend(scope, data, letter, delivered, null, caller.id);
  await audit(caller, scope.org, 'reports', delivered.problem ? 'report.failed' : 'report.sent', letter.subject, peopleCount(letter));
  return delivered.problem ? json({ error: delivered.problem }, 502) : json({ ok: true });
}

async function previewEmail(scope: Scope, body: Record<string, unknown>): Promise<Response> {
  const data = await reportFor(scope);
  return json({
    subject: reportSubject(data),
    fileName: reportFileName(data),
    html: renderReportEmail(data, String(body.message ?? '').slice(0, LONGEST_MESSAGE), reportFileName(data)),
  });
}

async function downloadPdf(scope: Scope): Promise<Response> {
  const data = await reportFor(scope);
  return new Response(await renderReportPdf(data, generatedAt()), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${reportFileName(data)}"` },
  });
}

async function fromScheduler(request: Request): Promise<boolean> {
  const expected = Deno.env.get('REPORTS_CRON_SECRET');
  const given = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  return Boolean(expected) && (await sha256Hex(given)) === (await sha256Hex(expected ?? ''));
}

/**
 * Sends whatever is due. Each schedule moves on to its next run before anything is sent, so a slow or repeated run can
 * never send the same report twice. A failed send isn't retried: it's in the history, and the next period sends as usual.
 */
async function runDue(): Promise<Response> {
  const due = await sql`
    select id, org_id, client_id, name, frequency, recipients, cc, bcc, message
    from digigate.report_schedules
    where is_active and next_run_at <= now()
    order by next_run_at
    limit ${SCHEDULES_PER_RUN}`;

  let sent = 0;
  for (const schedule of due) {
    const claimed = await sql`
      update digigate.report_schedules
      set last_run_at = now(), next_run_at = digigate.next_report_run(frequency, send_at, now())
      where id = ${schedule.id} and is_active and next_run_at <= now()
      returning id`;
    if (claimed.length === 0) continue;

    // Every schedule reports on the period that has just finished, and a run always lands the day after one ends.
    const [{ yesterday }] = await sql`select ((now() at time zone 'Africa/Johannesburg')::date - 1)::text as yesterday`;
    const scope: Scope = { org: schedule.org_id, client: schedule.client_id, frequency: schedule.frequency, day: yesterday };
    const data = await reportFor(scope);
    const letter: Letter = { to: schedule.recipients, cc: schedule.cc, bcc: schedule.bcc, subject: reportSubject(data), message: schedule.message };
    const delivered = await deliver(data, letter);
    await recordSend(scope, data, letter, delivered, schedule.id, null);
    await sql`
      select digigate.write_audit(${schedule.org_id}::uuid, null, null, 'reports', ${delivered.problem ? 'report.failed' : 'report.sent'}, null, ${`Schedule: ${schedule.name}`}, ${letter.subject}, ${peopleCount(letter)})`;
    if (!delivered.problem) sent += 1;
  }
  return json({ due: due.length, sent });
}

/** Proves the function can really draw a PDF here, and says whether email is set up, without sending anything. */
async function health(): Promise<Response> {
  const [row] = await sql`select id from digigate.organisations order by created_at limit 1`;
  const [{ today }] = await sql`select (now() at time zone 'Africa/Johannesburg')::date::text as today`;
  const data = await reportFor({ org: row.id, client: null, frequency: 'monthly', day: today });
  const pdf = await renderReportPdf(data, generatedAt());
  return json({ pdfBytes: pdf.length, emailReady: Boolean(Deno.env.get('RESEND_API_KEY')), senderSet: Boolean(Deno.env.get('REPORTS_FROM')) });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await request.json();
    if (body.action === 'run-due' || body.action === 'health') {
      if (!(await fromScheduler(request))) return json({ error: 'not-allowed' }, 401);
      return body.action === 'health' ? await health() : await runDue();
    }

    const caller = await callerOf(request);
    if (caller instanceof Response) return caller;
    if (!isSuper(caller) && !caller.roles.includes('admin')) return json({ error: 'not-allowed' }, 403);

    const scope = readScope(body);
    if (!scope) return json({ error: 'invalid' }, 400);
    if (!canManage(caller, scope.org)) return json({ error: 'not-allowed' }, 403);

    if (body.action === 'pdf') return await downloadPdf(scope);
    if (body.action === 'preview') return await previewEmail(scope, body);
    if (body.action === 'send') return await sendReport(caller, scope, body);
    return json({ error: 'unknown-action' }, 400);
  } catch (cause) {
    console.error('digigate-reports failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'server-error' }, 500);
  }
});
