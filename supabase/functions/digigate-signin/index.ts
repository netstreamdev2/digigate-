// Signs a dashboard user in with just their username, the way they always have. Behind the scenes a username belongs to
// a company (lucy is lucy@fire's account at Fire Security, and Lion Security can have its own lucy), so this finds every
// account with that name and signs in to the one the password opens. If the same name and password open accounts at
// two companies, it says which companies, and the person picks: only someone who already holds that password learns it.
//
// A wrong password and a name nobody has get the same answer, so this can't be used to find out which usernames exist.
// Every attempt goes through Supabase's own sign-in, with its limits. Deployed with --no-verify-jwt: nobody is signed in
// yet. Logs carry error names only: requests hold passwords.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { admin } from '../_shared/caller.ts';

import { json, sql } from '../_shared/device.ts';

const USERNAME_DOMAIN = 'digigate.local';
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const CODE = /^[a-z0-9]{2,16}$/;
/** The choice for an account that belongs to no company: a super user's. */
const NO_COMPANY = '-';
/** More accounts than this with one name would be someone fishing, not a person signing in. */
const MOST_ACCOUNTS = 8;

type Account = { email: string; code: string; company: string; logoPath: string | null; color: string | null };

// A fresh client per attempt, so no attempt's session can leak into the next. The key only opens Supabase's door: the
// session that comes back is the person's own, with their own rights, exactly as if they'd signed in directly.
const signInClient = () =>
  createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { autoRefreshToken: false, persistSession: false } });

/** Every active account with this name: a super user's plain one, and each company's name@code. */
async function accountsNamed(name: string): Promise<Account[]> {
  const rows = await sql`
    select p.login, o.code, o.name as company, o.logo_path, o.brand_color
    from digigate.profiles p
    left join digigate.clients c on c.id = p.client_id
    left join digigate.organisations o on o.id = coalesce(p.org_id, c.org_id)
    where p.is_active and (p.login = ${name} or (split_part(p.login, '@', 1) = ${name} and p.login ~ '^[^@]+@[a-z0-9]+$'))
    limit ${MOST_ACCOUNTS}`;
  return rows.map((row) =>
    row.login.includes('@')
      ? { email: `${row.login}.${USERNAME_DOMAIN}`, code: row.code, company: row.company, logoPath: row.logo_path, color: row.brand_color }
      : { email: `${row.login}@${USERNAME_DOMAIN}`, code: NO_COMPANY, company: 'DigiGate', logoPath: null, color: null },
  );
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: { name?: unknown; password?: unknown; company?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'no-match' }, 400);
  }
  const name = typeof body.name === 'string' ? body.name.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const company = typeof body.company === 'string' && (body.company === NO_COMPANY || CODE.test(body.company)) ? body.company : null;
  if (!USERNAME.test(name) || !password) return json({ error: 'no-match' }, 401);

  try {
    const accounts = (await accountsNamed(name)).filter((account) => !company || account.code === company);
    const opened: { account: Account; accessToken: string; refreshToken: string }[] = [];
    for (const account of accounts) {
      const { data, error } = await signInClient().auth.signInWithPassword({ email: account.email, password });
      if (error?.status === 429) return json({ error: 'slow-down' }, 429);
      if (!error && data.session) opened.push({ account, accessToken: data.session.access_token, refreshToken: data.session.refresh_token });
    }

    const [only] = opened;
    if (!only) return json({ error: 'no-match' }, 401);
    if (opened.length === 1) return json({ session: { accessToken: only.accessToken, refreshToken: only.refreshToken } });

    // The same name and password open more than one account: none stays signed in until the person picks.
    for (const { accessToken } of opened) await admin.auth.admin.signOut(accessToken, 'local');
    return json({ choices: opened.map(({ account }) => ({ code: account.code, company: account.company, logoPath: account.logoPath, color: account.color })) });
  } catch (cause) {
    console.error('digigate-signin failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'failed' }, 500);
  }
});
