// The visitor-invite app on a host's phone: doctors, managers, estate managers and residents invite visitors and share
// a QR. Hosts sign in with their mobile number, email or username and a password, with no MFA (the user's decision for
// this app), and can do nothing here but invite: every call runs as the host, through invite_sites, my_invites,
// create_invite and cancel_invite, which only ever see their own invites at their own sites. The phone holds no key and
// no service access; it keeps only its refresh token. Deployed with --no-verify-jwt: the session is checked below.
// Logs carry error names only: requests hold passwords and visitors' names.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { admin, audit } from '../_shared/caller.ts';
import { json, sql } from '../_shared/device.ts';

const URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const USERNAME_DOMAIN = 'digigate.local';
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}(@[a-z0-9]{2,16})?$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Roles that may invite, as invite_sites allows. */
const INVITERS = ['host', 'admin', 'manager', 'control_room'];
const MIN_PASSWORD = 8;
const MOST_ACCOUNTS = 8;

// A fresh client per sign-in, so no attempt's session leaks into the next.
const authClient = () => createClient(URL, ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

/** A client that acts as the host, so the database's own rules decide what they can see and do. */
const asHost = (token: string) =>
  createClient(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
    db: { schema: 'digigate' },
  });

/** A South African mobile number as typed (082 123 4567, +27 82 ...), in the +27 form profiles keep; null if it isn't one. */
function phoneOf(typed: string): string | null {
  const digits = typed.replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(digits)) return `+27${digits.slice(1)}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^27\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

const emailOfLogin = (login: string) => (EMAIL.test(login) && !/^[^@]+@[a-z0-9]+$/.test(login) ? login : login.includes('@') ? `${login}.${USERNAME_DOMAIN}` : `${login}@${USERNAME_DOMAIN}`);

/** The auth emails a typed login could belong to: by mobile number, by email, or by username. Active accounts only. */
async function emailsFor(typed: string): Promise<string[]> {
  const phone = phoneOf(typed);
  const rows = phone
    ? await sql`select p.login from digigate.profiles p where p.phone = ${phone} and p.is_active limit ${MOST_ACCOUNTS}`
    : EMAIL.test(typed) && !/^[^@]+@[a-z0-9]+$/.test(typed)
      ? await sql`select p.login from digigate.profiles p where p.login = ${typed} and p.is_active limit ${MOST_ACCOUNTS}`
      : USERNAME.test(typed)
        ? await sql`
            select p.login from digigate.profiles p
            where p.is_active and (p.login = ${typed} or (split_part(p.login, '@', 1) = ${typed} and p.login ~ '^[^@]+@[a-z0-9]+$'))
            limit ${MOST_ACCOUNTS}`
        : [];
  return rows.map((row) => emailOfLogin(row.login));
}

type Session = { accessToken: string; refreshToken: string; expiresAt: number };

const sessionOf = (session: { access_token: string; refresh_token: string; expires_at?: number }): Session => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token,
  expiresAt: (session.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
});

/** The host behind a token, if it's a live session of an active account that may invite. */
async function hostOf(request: Request): Promise<{ id: string; name: string; orgId: string | null; roles: string[]; token: string; mustChange: boolean } | Response> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not-signed-in' }, 401);
  const [profile] = await sql`select full_name, org_id, roles::text[] as roles from digigate.profiles where id = ${data.user.id} and is_active`;
  if (!profile || !profile.roles.some((role: string) => INVITERS.includes(role))) return json({ error: 'not-a-host' }, 403);
  // A company suspended for not paying invites nobody.
  const [company] = await sql`select suspended_at is not null as suspended from digigate.organisations where id = ${profile.org_id}`;
  if (company?.suspended) return json({ error: 'suspended' }, 403);
  return {
    id: data.user.id,
    name: profile.full_name,
    orgId: profile.org_id,
    roles: profile.roles,
    token,
    mustChange: data.user.app_metadata?.must_change_password === true,
  };
}

async function signIn(body: Record<string, unknown>): Promise<Response> {
  const typed = typeof body.login === 'string' ? body.login.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!typed || !password) return json({ error: 'no-match' }, 401);
  const opened: Session[] = [];
  for (const email of await emailsFor(typed)) {
    const { data, error } = await authClient().auth.signInWithPassword({ email, password });
    if (error?.status === 429) return json({ error: 'slow-down' }, 429);
    if (!error && data.session) opened.push(sessionOf(data.session));
  }
  const [only] = opened;
  if (!only) return json({ error: 'no-match' }, 401);
  if (opened.length > 1) {
    // One username and password at two companies: the mobile number tells them apart.
    for (const session of opened) await admin.auth.admin.signOut(session.accessToken, 'local');
    return json({ error: 'use-mobile' }, 409);
  }
  const host = await hostOf(new Request('http://local', { headers: { Authorization: `Bearer ${only.accessToken}` } }));
  if (host instanceof Response) {
    await admin.auth.admin.signOut(only.accessToken, 'local');
    return host;
  }
  return json({ session: only, name: host.name, mustChangePassword: host.mustChange });
}

async function refresh(body: Record<string, unknown>): Promise<Response> {
  const refreshToken = typeof body.refreshToken === 'string' ? body.refreshToken : '';
  if (!refreshToken) return json({ error: 'not-signed-in' }, 401);
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) return json({ error: 'not-signed-in' }, 401);
  return json({ session: sessionOf(data.session) });
}

/** A database refusal in words the host can act on; anything unexpected is only "try again". */
function refusal(error: { code?: string; message?: string }): Response {
  if (error.code === '22023') return json({ error: 'invalid', problem: error.message ?? 'Check the details.' }, 400);
  if (error.code === '54000') return json({ error: 'too-many' }, 429);
  if (error.code === '42501') return json({ error: 'not-allowed' }, 403);
  return json({ error: 'failed' }, 500);
}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad-request' }, 400);
  }

  try {
    if (body.action === 'sign-in') return await signIn(body);
    if (body.action === 'refresh') return await refresh(body);

    const host = await hostOf(request);
    if (host instanceof Response) return host;
    const caller = { id: host.id, name: host.name, org_id: host.orgId, roles: host.roles };

    if (body.action === 'set-password') {
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < MIN_PASSWORD) return json({ error: 'short-password' }, 400);
      const { error } = await admin.auth.admin.updateUserById(host.id, { password, app_metadata: { must_change_password: false } });
      if (error) return json({ error: 'failed' }, 500);
      await audit(caller, host.orgId, 'people', 'person.password_changed', host.name);
      return json({ ok: true });
    }
    // Until they choose their own password, a temporary one opens nothing else.
    if (host.mustChange) return json({ error: 'change-password' }, 403);

    if (body.action === 'me') return json({ name: host.name });
    if (body.action === 'sign-out') {
      await admin.auth.admin.signOut(host.token, 'local');
      return json({ ok: true });
    }

    const db = asHost(host.token);
    if (body.action === 'sites') {
      const { data, error } = await db.rpc('invite_sites');
      return error ? refusal(error) : json({ sites: data });
    }
    if (body.action === 'invites') {
      const { data, error } = await db.rpc('my_invites');
      return error ? refusal(error) : json({ invites: data });
    }
    if (body.action === 'create') {
      const siteId = text(body.siteId);
      if (!UUID.test(siteId)) return json({ error: 'invalid', problem: 'Choose a site.' }, 400);
      const { data, error } = await db.rpc('create_invite', {
        _site: siteId,
        _name: text(body.name),
        _id_number: text(body.idNumber) || null,
        _plate: text(body.plate) || null,
        _visit_type: text(body.visitType) || null,
        _from: text(body.from),
        _until: text(body.until),
        _note: text(body.note) || null,
      });
      const [created] = Array.isArray(data) ? data : [];
      return error || !created ? refusal(error ?? {}) : json({ id: created.invite_id, code: created.code });
    }
    if (body.action === 'cancel') {
      const id = text(body.id);
      if (!UUID.test(id)) return json({ error: 'not-allowed' }, 403);
      const { error } = await db.rpc('cancel_invite', { _id: id });
      return error ? refusal(error) : json({ ok: true });
    }
    return json({ error: 'unknown-action' }, 400);
  } catch (cause) {
    console.error('digigate-host failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'failed' }, 500);
  }
});
