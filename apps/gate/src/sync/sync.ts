import type { SQLiteDatabase } from 'expo-sqlite';

import { isPinHash } from '@/auth/pin';
import { isGateUserRole, type GateUser } from '@/auth/users';
import { endMovedShift, saveDutyElsewhere } from '@/db/duty-elsewhere';
import { gateUserFirstName, replaceGateUsers } from '@/db/gate-users';
import { pendingEvents, removeEvents } from '@/db/outbox';
import { pendingLicencePhoto, removeLicencePhoto } from '@/db/licence-photos';
import { pendingPlatePhoto, removePlatePhoto } from '@/db/plate-photos';
import { pendingSelfie, removeSelfie } from '@/db/shifts';
import { saveSyncedPosts, saveSyncedSite } from '@/db/site-posts';
import { isSiteToday, saveSiteToday } from '@/db/site-today';
import { saveSiteVisits, type SiteVisit } from '@/db/visits';
import { saveBookings, saveHotlist, type SyncedBooking, type SyncedHotlistEntry } from '@/db/watch-lists';
import { wipeRevokedDevice } from '@/db/wipe';
import { isSyncedPost, syncedSiteOf, type SyncedPost } from '@/site/site-config';

import { callFunction, deviceToken } from './device-api';
import { readDeviceHealth } from './device-health';

const UPLOAD_BATCH_SIZE = 100;

export type SyncOutcome =
  | { status: 'not-paired' }
  | { status: 'revoked' }
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

const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

/** A visit from another gate, checked like the guard list: a bad row is dropped, never the reason to lose them all. */
function toSiteVisit(value: unknown): SiteVisit | null {
  if (!isRecord(value)) return null;
  const { id, kind, personKey, personName, visitType, enteredAt, occupants } = value;
  if (
    typeof id !== 'string' ||
    (kind !== 'vehicle' && kind !== 'pedestrian') ||
    typeof personKey !== 'string' ||
    typeof personName !== 'string' ||
    typeof visitType !== 'string' ||
    typeof enteredAt !== 'number'
  ) {
    return null;
  }
  const plate = textOrNull(value.plate);
  if (kind === 'vehicle' && plate === null) return null;
  return {
    id,
    kind,
    personKey,
    personName,
    visitType,
    enteredAt,
    occupants: typeof occupants === 'number' ? occupants : null,
    vin: textOrNull(value.vin),
    plate,
    discNumber: textOrNull(value.discNumber),
    discExpiresOn: textOrNull(value.discExpiresOn),
    vehicleDescription: textOrNull(value.vehicleDescription),
    expectedStayMinutes: typeof value.expectedStayMinutes === 'number' ? value.expectedStayMinutes : null,
  };
}

const isHotlistKind = (value: unknown): value is SyncedHotlistEntry['kind'] => value === 'person' || value === 'plate' || value === 'vin';

/** A hotlist entry from the server, checked like the rest: a bad row is dropped, never the reason to lose them all. */
function toHotlistEntry(value: unknown): SyncedHotlistEntry | null {
  if (!isRecord(value)) return null;
  const { id, kind, key, guardNote, expiresAt } = value;
  if (typeof id !== 'string' || !isHotlistKind(kind) || typeof key !== 'string' || key === '' || typeof guardNote !== 'string') {
    return null;
  }
  return { id, kind, key, guardNote, expiresAt: typeof expiresAt === 'number' ? expiresAt : null };
}

function toBooking(value: unknown): SyncedBooking | null {
  if (!isRecord(value)) return null;
  const { id, name, from, until } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof from !== 'number' || typeof until !== 'number') return null;
  const personKey = textOrNull(value.personKey);
  const plate = textOrNull(value.plate);
  // An invite's QR is a match of its own, so an invite with neither an ID number nor a plate still counts.
  const invite = typeof value.invite === 'string' && /^[0-9a-f]{64}$/.test(value.invite) ? value.invite : null;
  if (personKey === null && plate === null && invite === null) return null;
  return {
    id,
    name,
    personKey,
    plate,
    visitType: textOrNull(value.visitType),
    note: textOrNull(value.note),
    from,
    until,
    invite,
    singleUse: value.singleUse === true,
  };
}

function acceptedIds(body: unknown): string[] {
  if (!isRecord(body) || !Array.isArray(body.accepted)) return [];
  return body.accepted.filter((id): id is string => typeof id === 'string');
}

/**
 * One photo a round, sent on its own so it can never hold up events. It stays on the device until the server keeps it or
 * refuses it for good: "later" means the server hasn't got that shift yet, and any failure simply waits for the next round.
 */
async function uploadSelfie(db: SQLiteDatabase, token: string): Promise<void> {
  const selfie = await pendingSelfie(db);
  if (!selfie) return;
  const response = await callFunction('digigate-sync', { selfie: { shiftId: selfie.shiftId, image: selfie.jpegBase64 } }, token);
  if (!response.ok) return;
  const body: unknown = await response.json();
  if (isRecord(body) && (body.selfie === 'saved' || body.selfie === 'refused')) await removeSelfie(db, selfie.shiftId);
}

/** Like a selfie: one licence photo a round, kept until the server keeps it or refuses it for good. */
async function uploadLicencePhoto(db: SQLiteDatabase, token: string): Promise<void> {
  const photo = await pendingLicencePhoto(db);
  if (!photo) return;
  const response = await callFunction('digigate-sync', { licencePhoto: { eventId: photo.eventId, image: photo.bmpBase64 } }, token);
  if (!response.ok) return;
  const body: unknown = await response.json();
  if (isRecord(body) && (body.licencePhoto === 'saved' || body.licencePhoto === 'refused')) await removeLicencePhoto(db, photo.eventId);
}

/** Like a licence photo: one plate photo a round, kept until the server keeps it or refuses it for good. */
async function uploadPlatePhoto(db: SQLiteDatabase, token: string): Promise<void> {
  const photo = await pendingPlatePhoto(db);
  if (!photo) return;
  const response = await callFunction('digigate-sync', { platePhoto: { eventId: photo.eventId, image: photo.jpegBase64 } }, token);
  if (!response.ok) return;
  const body: unknown = await response.json();
  if (isRecord(body) && (body.platePhoto === 'saved' || body.platePhoto === 'refused')) await removePlatePhoto(db, photo.eventId);
}

/**
 * One round: upload the outbox oldest first, then a waiting selfie, licence photo and plate photo, then send the device's health and replace the local
 * guard list and posts with the site's. An event leaves the outbox only once the server has it, and uploads are
 * idempotent, so a round cut off part-way is simply repeated next time.
 */
export async function syncOnce(db: SQLiteDatabase): Promise<SyncOutcome> {
  const token = await deviceToken();
  if (!token) return { status: 'not-paired' };

  let uploaded = 0;
  for (let batch = await pendingEvents(db, UPLOAD_BATCH_SIZE); batch.length > 0; batch = await pendingEvents(db, UPLOAD_BATCH_SIZE)) {
    const response = await callFunction('digigate-sync', { events: batch }, token);
    if (response.status === 410) {
      await wipeRevokedDevice(db);
      return { status: 'revoked' };
    }
    if (response.status === 401) return { status: 'not-paired' };
    if (!response.ok) return { status: 'failed', reason: `The server answered ${response.status}.` };
    const accepted = acceptedIds(await response.json());
    if (accepted.length === 0) return { status: 'failed', reason: 'The server accepted nothing.' };
    await removeEvents(db, accepted);
    uploaded += accepted.length;
  }

  await uploadSelfie(db, token);
  await uploadLicencePhoto(db, token);
  await uploadPlatePhoto(db, token);

  const response = await callFunction('digigate-sync', { pull: true, health: await readDeviceHealth() }, token);
  if (response.status === 410) {
    await wipeRevokedDevice(db);
    return { status: 'revoked' };
  }
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
  // An older server sends no site details; then the device keeps what it had.
  const site = syncedSiteOf(body);
  if (site) await saveSyncedSite(db, site);
  // An older server sends no visits; then the device keeps working from its own, as it always has.
  if (Array.isArray(body.openVisits)) {
    await saveSiteVisits(db, body.openVisits.flatMap((row) => {
      const visit = toSiteVisit(row);
      return visit ? [visit] : [];
    }));
  }
  // An older server sends neither list; then the device keeps what it had.
  if (Array.isArray(body.hotlist)) {
    await saveHotlist(db, body.hotlist.flatMap((row) => {
      const entry = toHotlistEntry(row);
      return entry ? [entry] : [];
    }));
  }
  if (Array.isArray(body.expectedVisitors)) {
    await saveBookings(db, body.expectedVisitors.flatMap((row) => {
      const booking = toBooking(row);
      return booking ? [booking] : [];
    }));
  }
  if (isSiteToday(body.siteToday)) await saveSiteToday(db, body.siteToday, Date.now());
  // One guard, one handheld: who is on duty elsewhere, and whether a supervisor moved this handheld's shift away.
  if (Array.isArray(body.onDutyElsewhere)) await saveDutyElsewhere(db, body.onDutyElsewhere);
  if (Array.isArray(body.movedShifts)) {
    const moved = body.movedShifts.filter((id): id is string => typeof id === 'string');
    await endMovedShift(db, moved, (id) => gateUserFirstName(db, id));
  }

  return { status: 'synced', at: Date.now(), uploaded, users: users.length };
}
