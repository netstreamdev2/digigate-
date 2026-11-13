// The email that carries a report. Tables and inline styles, because that's all mail clients agree on, and no images, so
// it reads the same when a client blocks them. Anything a person typed is escaped before it goes in.
import { colors } from '../../../packages/design/src/index.ts';
import {
  averageStay,
  canCompare,
  countLabel,
  entriesOf,
  percentChange,
  periodHeading,
  priorLabel,
  reportScope,
  reportTitle,
  ruleLines,
  stayLabel,
  type ReportData,
} from '../../../packages/core/src/reports.ts';

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const TOP_RULES = 4;

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

const paragraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${colors.inkRaised};">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

function changeWords(now: number, before: number, data: ReportData): string {
  if (!canCompare(data)) return 'So far today';
  const change = percentChange(now, before);
  if (change === null) return '&nbsp;';
  if (change === 0) return `No change on ${priorLabel(data.frequency)}`;
  return `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on ${priorLabel(data.frequency)}`;
}

function tile(label: string, value: string, note: string): string {
  return `<td width="33.33%" style="padding:5px;" valign="top">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.surfaceMuted};border-radius:14px;">
      <tr><td style="padding:14px 14px 13px;font-family:${FONT};">
        <div style="font-size:12px;line-height:16px;color:${colors.inkMuted};">${label}</div>
        <div style="font-size:24px;line-height:30px;font-weight:700;color:${colors.ink};letter-spacing:-0.4px;">${value}</div>
        <div style="font-size:11px;line-height:15px;color:${colors.inkSubtle};">${note}</div>
      </td></tr>
    </table>
  </td>`;
}

/**
 * The Security Checks report that can travel with a daily report: attached and locked with the reader's own password,
 * or left off because no password is set for their address yet. The password itself never appears in an email.
 */
export type ChecksAttachment = { state: 'attached'; fileName: string } | { state: 'no-password' };

function checksNote(checks: ChecksAttachment | undefined): string {
  if (!checks) return '';
  if (checks.state === 'attached') {
    return `<br><strong>Also attached:</strong> ${escapeHtml(checks.fileName)}, every check with photos and ID numbers. It's locked with your personal PDF password, which DigiGate never emails.`;
  }
  return "<br><strong>Security Checks not attached:</strong> no PDF password is set for your address yet. Ask your DigiGate administrator to set one; they'll give it to you by phone.";
}

export function renderReportEmail(data: ReportData, message: string, fileName: string, checks?: ChecksAttachment): string {
  const { totals, prior } = data;
  const count = (key: 'checks' | 'exits' | 'blocked' | 'warnings') => totals[key] ?? 0;
  const before = (key: 'checks' | 'exits' | 'blocked' | 'warnings') => prior[key] ?? 0;
  const scope = escapeHtml(reportScope(data));
  const period = escapeHtml(periodHeading(data));
  const stay = averageStay(totals);

  const rules = ruleLines(data.rules).slice(0, TOP_RULES).map(
    ({ label, value }) => `<tr>
      <td style="padding:9px 0;border-top:1px solid ${colors.border};font-family:${FONT};font-size:14px;line-height:20px;color:${colors.ink};">${escapeHtml(label)}</td>
      <td align="right" style="padding:9px 0;border-top:1px solid ${colors.border};font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;color:${colors.ink};">${countLabel(value)}</td>
    </tr>`,
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${scope}: ${escapeHtml(reportTitle(data.frequency))}</title>
</head>
<body style="margin:0;padding:0;background:${colors.surfaceMuted};">
<div style="display:none;max-height:0;overflow:hidden;">${countLabel(count('checks'))} scans and ${countLabel(count('blocked'))} blocked, ${period}. The full report is attached.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.surfaceMuted};">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
    <tr><td style="padding:0 6px 16px;font-family:${FONT};font-size:18px;font-weight:700;letter-spacing:-0.3px;color:${colors.brand};">digigate</td></tr>
    <tr><td style="background:${colors.brand};border-radius:22px;padding:26px 28px;font-family:${FONT};">
      <div style="font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${colors.tileSky};">${escapeHtml(reportTitle(data.frequency))}</div>
      <div style="padding-top:8px;font-size:27px;line-height:32px;font-weight:700;letter-spacing:-0.6px;color:${colors.surface};">${scope}</div>
      <div style="padding-top:6px;font-size:15px;line-height:21px;color:${colors.tileSky};">${period}</div>
    </td></tr>
    <tr><td style="padding-top:12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.surface};border-radius:22px;">
        <tr><td style="padding:24px 23px 8px;font-family:${FONT};">
          ${message.trim() ? paragraphs(message) : `<p style="margin:0 0 14px;font-size:15px;line-height:23px;color:${colors.inkRaised};">Here is the ${escapeHtml(reportTitle(data.frequency).toLowerCase())} for ${scope}. The full report is attached as a PDF.</p>`}
        </td></tr>
        <tr><td style="padding:0 18px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${tile('Scans', countLabel(count('checks')), changeWords(count('checks'), before('checks'), data))}
              ${tile('Entries', countLabel(entriesOf(totals)), changeWords(entriesOf(totals), entriesOf(prior), data))}
              ${tile('Exits', countLabel(count('exits')), changeWords(count('exits'), before('exits'), data))}
            </tr>
            <tr>
              ${tile('Blocked', countLabel(count('blocked')), changeWords(count('blocked'), before('blocked'), data))}
              ${tile('Warnings', countLabel(count('warnings')), changeWords(count('warnings'), before('warnings'), data))}
              ${tile('Average stay', stayLabel(stay), changeWords(stay, averageStay(prior), data))}
            </tr>
          </table>
        </td></tr>
        ${
          rules.length
            ? `<tr><td style="padding:22px 23px 4px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${colors.ink};">What the rules flagged</td></tr>
        <tr><td style="padding:6px 23px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rules.join('')}</table></td></tr>`
            : ''
        }
        <tr><td style="padding:20px 23px 24px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${colors.tileSky};border-radius:14px;">
            <tr><td style="padding:13px 16px;font-family:${FONT};font-size:13px;line-height:19px;color:${colors.brand};">
              <strong>Attached:</strong> ${escapeHtml(fileName)}${checksNote(checks)}
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:18px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${colors.inkMuted};">
      ${
        checks?.state === 'attached'
          ? `The summary holds counts only. The Security Checks PDF holds personal information protected by POPIA: don't forward it, and never share its password. It's private to ${scope} and the people it was sent to.`
          : `This report holds counts only: no names, ID numbers or number plates. It's private to ${scope} and the people it was sent to.`
      }
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
