import type { SQLiteDatabase } from 'expo-sqlite';

import { isPinHash } from '@/auth/pin';
import { isGateUserRole, type GateUser } from '@/auth/users';
import { replaceGateUsers } from '@/db/gate-users';
import { pendingEvents, removeEvents } from '@/db/outbox';
import { saveSyncedPosts } from '@/db/site-posts';
import { isSyncedPost, type SyncedPost } from '@/site/site-config';

import { callFunction, deviceToken } from './device-api';

const UPLOAD_BATCH_SIZE = 100;

export type SyncOutcome =
  | { status: 'not-paired' }
  | { status: 'synced'; at: number; uploaded: number; users: number }
  | { status: 'failed'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Server data is checked before it's trusted: a bad row is dropped, never a reason to lose the whole list. */
function toGateUser(value: unknown): GateUser | null {
  if (!isRecord(value)) return null;
  const { id, employeeNumber, firstName, lastName, role, pin, active } = value;
  if (
    typeof id !== 'string' ||
    typeof employeeNumber !== 'string' ||
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof role !== 'string' ||
    typeof active !== 'boolean' ||
    !isGateUserRole(role) ||
    !isPinHash(pin)
  ) {
    return null;
  }
  return { id, employeeNumber, firstName, lastName, role, pin, active };
}

function acceptedIds(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.accepted)) return [];
  return body.accepted.filter((id): id is string => typeof id === 'string');
}

/**
 * One round: upload the outbox oldest first, then replace the local guard list and posts with the site's.
 * An event leaves the outbox only once the server has it, and uploads are idempotent, so a round cut off part-way is
 * simply repeated next time.
 */
export async function syncOnce(db: SQLiteDatabase): Promise<SyncOutcome> {
  const token = await deviceToken();
  if (!token) return { status: 'not-paired' };

  let uploaded = 0;
  for (let batch = await pendingEvents(db, UPLOAD_BATCH_SIZE); batch.length > 0; batch = await pendingEvents(db, UPLOAD_BATCH_SIZE)) {
    const response = await callFunction('digigate-sync', { events: batch }, token);
    // A revoked device stops here and keeps its outbox.
    if (response.status === 401) return { status: 'not-paired' };
    if (!response.ok) return { status: 'failed', reason: `The server answered ${response.status}.` };
    const accepted = acceptedIds(await response.json());
    if (accepted.length === 0) return { status: 'failed', reason: 'The server accepted nothing.' };
    await removeEvents(db, accepted);
    uploaded += accepted.length;
  }

  const response = await callFunction('digigate-sync', { pull: true }, token);
  if (response.status === 401) return { status: 'not-paired' };
  if (!response.ok) return { status: 'failed', reason: `The server answered ${response.status}.` };

  const body: unknown = await response.json();
  if (!isRecord(body) || !Array.isArray(body.users) || !Array.isArray(body.posts)) {
    return { status: 'failed', reason: 'The server sent something unexpected.' };
  }
  const users = body.users.flatMap((row) => {
    const user = toGateUser(row);
    return user ? [user] : [];
  });
  const posts: SyncedPost[] = body.posts.filter(isSyncedPost);
  await replaceGateUsers(db, users);
  await saveSyncedPosts(db, posts);

  return { status: 'synced', at: Date.now(), uploaded, users: users.length };
}
