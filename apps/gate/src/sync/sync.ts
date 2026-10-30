import type { JsonValue } from '@digigate/core';
import type { SQLiteDatabase } from 'expo-sqlite';

import { isPinHash } from '@/auth/pin';
import { isGateUserRole, type GateUser } from '@/auth/users';
import { replaceGateUsers } from '@/db/gate-users';
import { pendingEvents, removeEvents } from '@/db/outbox';

import type { Database, Json } from './database-types';
import type { GateSupabase } from './supabase';

const UPLOAD_BATCH_SIZE = 100;

export type SyncOutcome =
  | { status: 'not-paired' }
  | { status: 'synced'; at: number; uploaded: number; users: number }
  | { status: 'failed'; reason: string };

type ServerGateUser = Pick<
  Database['public']['Tables']['gate_users']['Row'],
  'id' | 'employee_number' | 'first_name' | 'last_name' | 'role' | 'pin_hash' | 'active'
>;

/** Event payloads are read-only; the generated Json type wants mutable arrays, so arrays are copied on the way out. */
function toJson(value: JsonValue): Json {
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  }
  return value;
}

function toGateUser(row: ServerGateUser): GateUser | null {
  if (!isPinHash(row.pin_hash) || !isGateUserRole(row.role)) return null;
  return {
    id: row.id,
    employeeNumber: row.employee_number,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    pin: row.pin_hash,
    active: row.active,
  };
}

/**
 * One round: upload the outbox oldest first, then replace the local guard list with the site's.
 * Uploads are idempotent, so a round cut off part-way is simply repeated next time.
 */
export async function syncOnce(client: GateSupabase, db: SQLiteDatabase): Promise<SyncOutcome> {
  const { data: sessionData } = await client.auth.getSession();
  if (!sessionData.session) return { status: 'not-paired' };

  const { data: device, error: deviceError } = await client
    .from('devices')
    .select('id, org_id, site_id')
    .maybeSingle();
  if (deviceError) return { status: 'failed', reason: deviceError.message };
  // A revoked device can no longer see its own row.
  if (!device) return { status: 'not-paired' };

  let uploaded = 0;
  for (let batch = await pendingEvents(db, UPLOAD_BATCH_SIZE); batch.length > 0; batch = await pendingEvents(db, UPLOAD_BATCH_SIZE)) {
    const { error } = await client.from('gate_events').upsert(
      batch.map((event) => ({
        id: event.id,
        org_id: device.org_id,
        site_id: device.site_id,
        device_id: device.id,
        gate_user_id: event.gateUserId,
        type: event.type,
        occurred_at: new Date(event.occurredAt).toISOString(),
        payload: toJson(event.payload),
      })),
      { onConflict: 'id', ignoreDuplicates: true },
    );
    if (error) return { status: 'failed', reason: error.message };
    await removeEvents(
      db,
      batch.map((event) => event.id),
    );
    uploaded += batch.length;
  }

  const { data: rows, error: usersError } = await client
    .from('gate_users')
    .select('id, employee_number, first_name, last_name, role, pin_hash, active');
  if (usersError) return { status: 'failed', reason: usersError.message };

  const users = rows.flatMap((row) => {
    const user = toGateUser(row);
    return user ? [user] : [];
  });
  await replaceGateUsers(db, users);

  return { status: 'synced', at: Date.now(), uploaded, users: users.length };
}
