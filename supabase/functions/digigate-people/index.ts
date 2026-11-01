// Manages dashboard accounts, which only the service key can create. Called by the dashboard's server code with the
// signed-in person's session, so the service key stays in Supabase and never reaches the dashboard. Deployed with
// --no-verify-jwt: the session is checked below, and it must have passed MFA. Super users are never created here.
// Logs carry error names only: requests hold names and temporary passwords.
import { admin, audit, callerOf, canManage, isSuper, type Caller } from '../_shared/caller.ts';
import { json, randomHex, sql } from '../_shared/device.ts';

const USERNAME_DOMAIN = 'digigate.local';
const ROLES = ['admin', 'manager', 'control_room', 'supervisor', 'client_viewer'];
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANNED_FOR_GOOD = '876000h';

/** The company responsible for an account: its own, or for a client's login, the client's. */
async function companyOf(profileId: string): Promise<{ org_id: string | null; roles: string[]; full_name: string } | null> {
  const [row] = await sql`
    select coalesce(p.org_id, c.org_id) as org_id, p.roles::text[] as roles, p.full_name
    from digigate.profiles p
    left join digigate.clients c on c.id = p.client_id
    where p.id = ${profileId}`;
  return row ? { org_id: row.org_id, roles: row.roles, full_name: row.full_name } : null;
}

async function createPerson(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const fullName = String(body.fullName ?? '').trim();
  const login = String(body.login ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const siteIds = Array.isArray(body.siteIds) ? body.siteIds.map(String) : [];
  const isClientLogin = role === 'client_viewer';

  if (!fullName) return json({ error: 'name' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'role' }, 400);
  if (!USERNAME.test(login) && !EMAIL.test(login)) return json({ error: 'login' }, 400);
  if (!siteIds.every((id) => UUID.test(id))) return json({ error: 'sites' }, 400);

  let orgId: string | null = null;
  let clientId: string | null = null;
  let responsibleOrg: string | null = null;
  if (isClientLogin) {
    clientId = String(body.clientId ?? '');
    if (!UUID.test(clientId)) return json({ error: 'client' }, 400);
    const [client] = await sql`select org_id from digigate.clients where id = ${clientId}`;
    if (!client || !canManage(caller, client.org_id)) return json({ error: 'not-allowed' }, 403);
    responsibleOrg = client.org_id;
  } else {
    orgId = String(body.orgId ?? '');
    if (!UUID.test(orgId) || !canManage(caller, orgId)) return json({ error: 'not-allowed' }, 403);
    const sites = await sql`select id from digigate.sites where org_id = ${orgId} and id = any(${sql.array(siteIds)}::uuid[])`;
    if (sites.length !== siteIds.length) return json({ error: 'sites' }, 400);
    responsibleOrg = orgId;
  }

  const password = randomHex(8);
  const { data, error } = await admin.auth.admin.createUser({
    email: login.includes('@') ? login : `${login}@${USERNAME_DOMAIN}`,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) return json({ error: 'taken' }, 409);

  try {
    await sql`
      insert into digigate.profiles (id, org_id, client_id, full_name, login, roles, site_ids)
      values (${data.user.id}, ${orgId}, ${clientId}, ${fullName}, ${login}, ${`{${role}}`}::digigate.dashboard_role[], ${sql.array(siteIds)}::uuid[])`;
  } catch (cause) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw cause;
  }
  await audit(caller, responsibleOrg, 'people', 'person.added', fullName, role);
  return json({ id: data.user.id, login, password });
}

async function changePerson(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const id = String(body.id ?? '');
  if (!UUID.test(id) || id === caller.id) return json({ error: 'not-allowed' }, 403);
  const target = await companyOf(id);
  if (!target || target.roles.includes('super_user') || !canManage(caller, target.org_id)) return json({ error: 'not-allowed' }, 403);

  if (body.action === 'set-active') {
    const active = body.active === true;
    await sql`update digigate.profiles set is_active = ${active} where id = ${id}`;
    await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : BANNED_FOR_GOOD });
    await audit(caller, target.org_id, 'people', active ? 'person.reactivated' : 'person.deactivated', target.full_name);
    return json({ ok: true });
  }

  const password = randomHex(8);
  await admin.auth.admin.updateUserById(id, { password, app_metadata: { must_change_password: true } });
  await audit(caller, target.org_id, 'people', 'person.password_reset', target.full_name);
  return json({ id, password });
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const caller = await callerOf(request);
    if (caller instanceof Response) return caller;

    const body = await request.json();
    if (body.action === 'password-changed') {
      await admin.auth.admin.updateUserById(caller.id, { app_metadata: { must_change_password: false } });
      await audit(caller, caller.org_id, 'people', 'person.password_changed', caller.name);
      return json({ ok: true });
    }
    if (!isSuper(caller) && !caller.roles.includes('admin')) return json({ error: 'not-allowed' }, 403);
    if (body.action === 'create') return await createPerson(caller, body);
    if (body.action === 'set-active' || body.action === 'reset-password') return await changePerson(caller, body);
    return json({ error: 'unknown-action' }, 400);
  } catch (cause) {
    console.error('digigate-people failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'server-error' }, 500);
  }
});
