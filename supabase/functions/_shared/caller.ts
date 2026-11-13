// Who is calling a dashboard function. These are deployed with --no-verify-jwt, so the session is checked here, and while
// MFA is switched on every account must have passed it. The service key stays in Supabase and never reaches the dashboard.
import { createClient } from 'npm:@supabase/supabase-js@2';

import { json, sql } from './device.ts';

export const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type Caller = { id: string; name: string; org_id: string | null; roles: string[] };

/** The token is proven by getUser before this runs, so its claims can be trusted. */
function assuranceLevel(token: string): string | null {
  try {
    const payload = (token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).aal ?? null;
  } catch {
    return null;
  }
}

export { canManage, isStaff, isSuper } from './account-access.ts';

/** The signed-in person, or the response that turns them away. */
export async function callerOf(request: Request): Promise<Caller | Response> {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return json({ error: 'not-signed-in' }, 401);
  // MFA is a switch in the database (digigate.platform_settings), off since 13 November.
  if (assuranceLevel(token) !== 'aal2') {
    const [{ required }] = await sql`select digigate.mfa_required() as required`;
    if (required !== false) return json({ error: 'needs-mfa' }, 403);
  }

  const [profile] = await sql`select full_name, org_id, roles::text[] as roles from digigate.profiles where id = ${data.user.id} and is_active`;
  if (!profile) return json({ error: 'not-allowed' }, 403);
  return { id: data.user.id, name: profile.full_name, org_id: profile.org_id, roles: profile.roles };
}

/** A client acting as the signed-in person, so row security and the database's own visibility checks apply. */
export function asCaller(request: Request) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: request.headers.get('Authorization') ?? '' } },
    db: { schema: 'digigate' },
  });
}

/** Records what a function did in the audit log, under the person who asked for it. */
export function audit(caller: Caller, orgId: string | null, category: string, action: string, target: string | null, detail: string | null = null) {
  return sql`select digigate.write_audit(${orgId}::uuid, null, null, ${category}, ${action}, ${caller.id}::uuid, ${caller.name}, ${target}, ${detail})`;
}
