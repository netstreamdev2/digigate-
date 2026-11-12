import { visitTypesFor, type VisitTypeOption } from '@digigate/core';

import { callHost, HostApiError } from './host-api';

/** An invite as its host sees it. The QR's code comes back only while the invite can still be used. */
export type HostInvite = {
  id: string;
  siteId: string;
  siteName: string;
  visitorName: string;
  idLastFour: string | null;
  plate: string | null;
  visitType: string | null;
  note: string | null;
  validFrom: number;
  validUntil: number;
  status: 'active' | 'used' | 'cancelled' | 'expired';
  code: string | null;
};

export type InviteSite = { siteId: string; siteName: string; siteType: string };

const STATUSES = ['active', 'used', 'cancelled', 'expired'] as const;
const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

function inviteOf(value: unknown): HostInvite | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const status = STATUSES.find((known) => known === row.status);
  const from = typeof row.valid_from === 'string' ? Date.parse(row.valid_from) : NaN;
  const until = typeof row.valid_until === 'string' ? Date.parse(row.valid_until) : NaN;
  if (typeof row.id !== 'string' || !status || Number.isNaN(from) || Number.isNaN(until)) return null;
  return {
    id: row.id,
    siteId: text(row.site_id) ?? '',
    siteName: text(row.site_name) ?? '',
    visitorName: text(row.visitor_name) ?? 'Visitor',
    idLastFour: text(row.id_last_four),
    plate: text(row.plate),
    visitType: text(row.visit_type),
    note: text(row.note),
    validFrom: from,
    validUntil: until,
    status,
    code: text(row.code),
  };
}

/** Newest first: what's coming up, then what's done. */
export async function loadInvites(): Promise<HostInvite[]> {
  const data = await callHost('invites');
  const rows = Array.isArray(data.invites) ? data.invites : [];
  return rows.flatMap((row) => inviteOf(row) ?? []).sort((a, b) => (a.status === 'active') === (b.status === 'active') ? b.validFrom - a.validFrom : a.status === 'active' ? -1 : 1);
}

export async function loadSites(): Promise<InviteSite[]> {
  const data = await callHost('sites');
  const rows = Array.isArray(data.sites) ? data.sites : [];
  return rows.flatMap((row: unknown) => {
    if (typeof row !== 'object' || row === null) return [];
    const { site_id, site_name, site_type } = row as Record<string, unknown>;
    return typeof site_id === 'string' && typeof site_name === 'string' ? [{ siteId: site_id, siteName: site_name, siteType: typeof site_type === 'string' ? site_type : '' }] : [];
  });
}

export type NewInvite = { siteId: string; name: string; idNumber: string; plate: string; visitType: string; from: number; until: number; note: string };

export async function createInvite(invite: NewInvite): Promise<{ id: string; code: string }> {
  const data = await callHost('create', { ...invite, from: new Date(invite.from).toISOString(), until: new Date(invite.until).toISOString() });
  if (typeof data.id !== 'string' || typeof data.code !== 'string') throw new HostApiError('failed', 500, null);
  return { id: data.id, code: data.code };
}

export async function cancelInvite(id: string): Promise<void> {
  await callHost('cancel', { id });
}

/** The reasons a host can invite someone for: a site's visit types, less those for its own people and emergencies. */
const NOT_INVITED = new Set(['staff', 'resident', 'emergency']);

export function inviteVisitTypes(siteType: string): readonly VisitTypeOption[] {
  return visitTypesFor(siteType).filter(({ code }) => !NOT_INVITED.has(code));
}

const dayWords = new Intl.DateTimeFormat('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });

/** When an invite is good for, in words: one day, or a run of days. */
export function whenWords(from: number, until: number): string {
  const first = dayWords.format(new Date(from));
  const last = dayWords.format(new Date(until));
  return first === last ? first : `${first} to ${last}`;
}

/** Why something didn't work, in the host's words, with what to do. */
export function problemWords(cause: unknown): string {
  if (!(cause instanceof HostApiError)) return 'Something went wrong. Try again.';
  switch (cause.code) {
    case 'offline':
      return 'No connection. Check your data or Wi-Fi, then try again.';
    case 'no-match':
      return "That number, username or password isn't right.";
    case 'use-mobile':
      return 'That username is at more than one company. Sign in with your mobile number instead.';
    case 'not-a-host':
      return "This login can't send invites. Ask your administrator.";
    case 'slow-down':
      return 'Too many tries. Wait a minute, then try again.';
    case 'short-password':
      return 'Choose a password of at least 8 characters.';
    case 'too-many':
      return 'You have too many invites open. Cancel some you no longer need.';
    case 'invalid':
      return cause.problem ? `Check the details: ${cause.problem}.` : 'Check the details.';
    case 'not-signed-in':
      return 'Sign in again.';
    case 'suspended':
      return 'Visitor invites are paused for your organisation. Ask your administrator.';
    default:
      return 'Something went wrong. Try again.';
  }
}
