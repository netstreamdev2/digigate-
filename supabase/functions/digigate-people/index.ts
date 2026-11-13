// Manages dashboard accounts, which only the service key can create, opens guards' shift selfies, drivers' licence photos and
// cars' plate photos, which only it can read, and keeps guards' personal records (see ../_shared/guard-records.ts). Called by the dashboard's server code with the signed-in person's session, so the service key stays in Supabase
// and never reaches the dashboard. Deployed with --no-verify-jwt: the session is checked below, and it must have passed
// MFA. Super users are never created here.
// Logs carry error names only: requests hold names and temporary passwords.
import { admin, asCaller, audit, callerOf, canManage, isStaff, type Caller } from '../_shared/caller.ts';
import { canCreateRole, canManagePerson } from '../_shared/account-access.ts';
import { json, randomHex, sql } from '../_shared/device.ts';
import { readGuardRecord, revealGuardIdNumber, saveGuardPhoto, saveGuardRecord } from '../_shared/guard-records.ts';

const USERNAME_DOMAIN = 'digigate.local';
const ROLES = ['admin', 'manager', 'control_room', 'supervisor', 'client_viewer', 'host', 'technician'];
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BANNED_FOR_GOOD = '876000h';
const SELFIE_BUCKET = 'shift-selfies';
const SELFIE_LINK_SECONDS = 60;
const LICENCE_PHOTO_BUCKET = 'licence-photos';
const LICENCE_PHOTO_LINK_SECONDS = 60;
const PLATE_PHOTO_BUCKET = 'plate-photos';

/** The company responsible for an account: its own, or for a client's login, the client's. */
async function companyOf(profileId: string): Promise<{ org_id: string | null; roles: string[]; full_name: string } | null> {
  const [row] = await sql`
    select coalesce(p.org_id, c.org_id) as org_id, p.roles::text[] as roles, p.full_name
    from digigate.profiles p
    left join digigate.clients c on c.id = p.client_id
    where p.id = ${profileId}`;
  return row ? { org_id: row.org_id, roles: row.roles, full_name: row.full_name } : null;
}

/**
 * A free name in front of the company's code, for when the one asked for is taken: the name with the person's
 * initial, or with a number. Only this company's logins are looked at.
 */
async function freeUsername(name: string, code: string, fullName: string): Promise<string | null> {
  const initial = fullName.trim().split(/\s+/).pop()?.[0]?.toLowerCase() ?? '';
  const candidates = [...(/^[a-z0-9]$/.test(initial) ? [`${name}.${initial}`] : []), ...Array.from({ length: 8 }, (_, index) => `${name}${index + 2}`)]
    .filter((candidate) => USERNAME.test(candidate))
    .map((candidate) => `${candidate}@${code}`);
  const used = await sql`select login from digigate.profiles where login = any(${sql.array(candidates)})`;
  const taken = new Set(used.map((row) => row.login));
  return candidates.find((candidate) => !taken.has(candidate)) ?? null;
}

async function createPerson(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const fullName = String(body.fullName ?? '').trim();
  const typed = String(body.login ?? '').trim().toLowerCase();
  const role = String(body.role ?? '');
  const siteIds = Array.isArray(body.siteIds) ? body.siteIds.map(String) : [];
  const isClientLogin = role === 'client_viewer';
  const isTechnician = role === 'technician';
  const isEmail = EMAIL.test(typed);
  // A host signs in to the invite app on their phone, with this number or their username or email.
  const typedPhone = String(body.phone ?? '').replace(/[\s()-]/g, '');
  const phone = !typedPhone ? null : /^0\d{9}$/.test(typedPhone) ? `+27${typedPhone.slice(1)}` : /^\+\d{8,15}$/.test(typedPhone) ? typedPhone : /^27\d{9}$/.test(typedPhone) ? `+${typedPhone}` : 'bad';
  // A username belongs to the company: what's typed in front of any @ is the name, and the company's code goes after.
  const name = isEmail ? typed : (typed.split('@')[0] ?? '');

  if (!fullName) return json({ error: 'name' }, 400);
  if (!ROLES.includes(role)) return json({ error: 'role' }, 400);
  if (!canCreateRole(caller, role)) return json({ error: 'not-allowed' }, 403);
  if (isTechnician && (!isEmail || siteIds.length > 0)) return json({ error: 'technician-email' }, 400);
  if (phone === 'bad') return json({ error: 'phone' }, 400);
  if (phone) {
    const [holder] = await sql`select 1 from digigate.profiles where phone = ${phone}`;
    if (holder) return json({ error: 'phone-taken' }, 409);
  }
  if (!isEmail && !USERNAME.test(name)) return json({ error: 'login' }, 400);
  if (!siteIds.every((id) => UUID.test(id))) return json({ error: 'sites' }, 400);

  let orgId: string | null = null;
  let clientId: string | null = null;
  let responsibleOrg: string | null = null;
  if (isTechnician) {
    // DigiGate's own technicians belong to no company and use their work email, with MFA like other dashboard staff.
    orgId = null;
  } else if (isClientLogin) {
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

  const [company] = responsibleOrg ? await sql`select code from digigate.organisations where id = ${responsibleOrg}` : [];
  if (!company && !isTechnician) return json({ error: 'not-allowed' }, 403);
  const login = isEmail ? typed : `${name}@${company.code}`;

  // Taken within this company: say who has it, someone the caller looks after anyway, and offer a free one.
  if (!isEmail) {
    const [holder] = await sql`select full_name, roles::text[] as roles from digigate.profiles where login = ${login}`;
    if (holder) {
      return json({ error: 'taken', holder: { name: holder.full_name, role: holder.roles[0] ?? '' }, suggestion: await freeUsername(name, company.code, fullName) }, 409);
    }
  }

  const password = randomHex(8);
  const { data, error } = await admin.auth.admin.createUser({
    email: isEmail ? typed : `${name}@${company.code}.${USERNAME_DOMAIN}`,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) return json({ error: isEmail ? 'email-taken' : 'taken' }, 409);

  try {
    await sql`
      insert into digigate.profiles (id, org_id, client_id, full_name, login, roles, site_ids, phone)
      values (${data.user.id}, ${orgId}, ${clientId}, ${fullName}, ${login}, ${`{${role}}`}::digigate.dashboard_role[], ${sql.array(siteIds)}::uuid[], ${phone})`;
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
  if (!target || !canManagePerson(caller, target)) return json({ error: 'not-allowed' }, 403);

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

/**
 * A one-minute link to a guard's selfie, logged each time. A client's view-only login never gets one, and anyone else
 * has to be someone who could see that site's control room.
 */
async function selfieLink(caller: Caller, body: Record<string, unknown>): Promise<Response> {
  const shiftId = String(body.shiftId ?? '');
  if (!UUID.test(shiftId) || caller.roles.includes('client_viewer')) return json({ error: 'not-allowed' }, 403);

  const [shift] = await sql`
    select x.org_id, x.selfie_path, trim(g.first_name || ' ' || g.last_name) as guard
    from digigate.shifts x
    join digigate.profiles p on p.id = ${caller.id}
    left join digigate.gate_users g on g.id = x.gate_user_id
    where x.id = ${shiftId}
      and (p.roles::text[] && array['super_user', 'technician'] or (x.org_id = p.org_id and ('admin' = any (p.roles) or x.site_id = any (p.site_ids))))`;
  if (!shift) return json({ error: 'not-allowed' }, 403);
  if (!shift.selfie_path) return json({ error: 'no-selfie' }, 404);

  const { data, error } = await admin.storage.from(SELFIE_BUCKET).createSignedUrl(shift.selfie_path, SELFIE_LINK_SECONDS);
  if (error || !data) throw new Error('selfie link failed');
  await audit(caller, shift.org_id, 'people', 'shift.selfie_viewed', shift.guard);
  return json({ url: data.signedUrl });
}

/**
 * A one-minute link to the photo from a driver's licence, for anyone whose dashboard shows that check, logged each
 * time. The database decides who may see it, asked as the caller; the log names the driver only masked.
 */
async function licencePhotoLink(caller: Caller, request: Request, body: Record<string, unknown>): Promise<Response> {
  const eventId = String(body.eventId ?? '');
  if (!UUID.test(eventId)) return json({ error: 'not-allowed' }, 403);
  const { data, error } = await asCaller(request).rpc('licence_photo_for', { _event: eventId });
  if (error) throw new Error('licence photo lookup failed');
  const [photo] = (data ?? []) as { path: string; org_id: string; person: string | null }[];
  if (!photo) return json({ error: 'no-photo' }, 404);

  const { data: link, error: linkError } = await admin.storage.from(LICENCE_PHOTO_BUCKET).createSignedUrl(photo.path, LICENCE_PHOTO_LINK_SECONDS);
  if (linkError || !link) throw new Error('licence photo link failed');
  await audit(caller, photo.org_id, 'gate', 'check.licence_photo_viewed', photo.person, eventId);
  return json({ url: link.signedUrl });
}

/** Like a licence photo: a one-minute link to the photo of the car's plate, logged each time with the plate masked. */
async function platePhotoLink(caller: Caller, request: Request, body: Record<string, unknown>): Promise<Response> {
  const eventId = String(body.eventId ?? '');
  if (!UUID.test(eventId)) return json({ error: 'not-allowed' }, 403);
  const { data, error } = await asCaller(request).rpc('plate_photo_for', { _event: eventId });
  if (error) throw new Error('plate photo lookup failed');
  const [photo] = (data ?? []) as { path: string; org_id: string; plate: string | null }[];
  if (!photo) return json({ error: 'no-photo' }, 404);

  const { data: link, error: linkError } = await admin.storage.from(PLATE_PHOTO_BUCKET).createSignedUrl(photo.path, LICENCE_PHOTO_LINK_SECONDS);
  if (linkError || !link) throw new Error('plate photo link failed');
  await audit(caller, photo.org_id, 'gate', 'check.plate_photo_viewed', photo.plate, eventId);
  return json({ url: link.signedUrl });
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
    if (body.action === 'selfie-link') return await selfieLink(caller, body);
    if (body.action === 'licence-photo-link') return await licencePhotoLink(caller, request, body);
    if (body.action === 'plate-photo-link') return await platePhotoLink(caller, request, body);
    if (!isStaff(caller) && !caller.roles.includes('admin')) return json({ error: 'not-allowed' }, 403);
    if (body.action === 'create') return await createPerson(caller, body);
    if (body.action === 'set-active' || body.action === 'reset-password') return await changePerson(caller, body);
    if (body.action === 'guard-record') return await readGuardRecord(caller, body);
    if (body.action === 'guard-record-save') return await saveGuardRecord(caller, body);
    if (body.action === 'guard-id-reveal') return await revealGuardIdNumber(caller, body);
    if (body.action === 'guard-photo') return await saveGuardPhoto(caller, body);
    return json({ error: 'unknown-action' }, 400);
  } catch (cause) {
    console.error('digigate-people failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'server-error' }, 500);
  }
});
