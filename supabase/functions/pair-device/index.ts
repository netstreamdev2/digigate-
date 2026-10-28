// Pairs a gate device using a one-time code and returns a session for the device's own auth user.
// Deploy with --no-verify-jwt: the device has no session until this function gives it one.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const CODE_PATTERN = /^\d{10}$/;

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function secretKey(): string {
  const keys: Record<string, string> = JSON.parse(requireEnv('SUPABASE_SECRET_KEYS'));
  const key = keys['default'];
  if (!key) throw new Error('SUPABASE_SECRET_KEYS has no default key');
  return key;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomPassword(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return respond(405, { error: 'method_not_allowed' });

  const body: unknown = await request.json().catch(() => null);
  const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code.trim() : '';
  if (!CODE_PATTERN.test(code)) return respond(400, { error: 'invalid_code' });

  const admin = createClient(requireEnv('SUPABASE_URL'), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  // Claiming the code in one conditional update means it can only ever pair one device.
  const { data: claimed, error: claimError } = await admin
    .from('device_pairing_codes')
    .update({ used_at: now })
    .eq('code_hash', await sha256Hex(code))
    .is('used_at', null)
    .gt('expires_at', now)
    .select('device_id')
    .maybeSingle();
  if (claimError) return respond(500, { error: 'claim_failed' });
  if (!claimed) return respond(404, { error: 'code_not_found_expired_or_used' });

  const { data: device, error: deviceError } = await admin
    .from('devices')
    .select('id, auth_user_id')
    .eq('id', claimed.device_id)
    .single();
  if (deviceError || !device) return respond(500, { error: 'device_lookup_failed' });

  // Re-pairing replaces the device's credential, which signs out any old copy of it.
  if (device.auth_user_id) {
    const { error } = await admin.auth.admin.deleteUser(device.auth_user_id);
    if (error) return respond(500, { error: 'old_credential_removal_failed' });
  }

  const email = `device-${device.id}@devices.digigate.invalid`;
  const password = randomPassword();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kind: 'device', device_id: device.id },
  });
  if (createError || !created.user) return respond(500, { error: 'credential_creation_failed' });

  const { error: linkError } = await admin
    .from('devices')
    .update({ auth_user_id: created.user.id, paired_at: now, revoked_at: null })
    .eq('id', device.id);
  if (linkError) return respond(500, { error: 'device_link_failed' });

  // The password never leaves this function; the device only ever holds a refreshable session.
  const { data: signedIn, error: signInError } = await admin.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) return respond(500, { error: 'session_creation_failed' });

  return respond(200, {
    deviceId: device.id,
    accessToken: signedIn.session.access_token,
    refreshToken: signedIn.session.refresh_token,
  });
});
