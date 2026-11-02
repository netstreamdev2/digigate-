import { FENCE_START, stepFence, type Fence, type FenceState, type Fix } from '@digigate/core';
import type { LocationObject } from 'expo-location';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Vibration } from 'react-native';

import { appendEvent } from '@/db/outbox';
import { recordBackAtPost, recordSteppingAway, type Shift } from '@/db/shifts';
import { newEventId } from '@/lib/ids';
import { locationLibrary, taskManagerLibrary } from '@/lib/native';

// Watches whether the device has left its post, from the handheld's own GPS, with no connection needed. It runs as a
// foreground service so that locking the screen doesn't beat it, and lives outside React so a reading is handled whether
// or not a screen is up. With the screen off Android can hold a reading back by up to a minute. Each one keeps the time it
// was taken, so the sums stay right and only the warning can come later. Positions go no further than this file and the
// latest one in a health report: the events it records say only that the guard left or came back.

const TASK = 'digigate-post-fence';
const READING_EVERY_MS = 30_000;
const WARNING_BUZZ = [0, 500, 200, 500, 200, 500];

export type FenceProblem = 'no-permission' | 'location-off';

export type FenceStatus = {
  watching: boolean;
  /** Confirmed gone from the post, with no reason given. */
  outside: boolean;
  /** Set while the guard has said they're stepping away. */
  awayUntil: number | null;
  problem: FenceProblem | null;
};

type Watch = {
  db: SQLiteDatabase;
  shift: Shift;
  fence: Fence;
  state: FenceState;
  pausedUntil: number | null;
  recorded: () => void;
};

const NOT_WATCHING: FenceStatus = { watching: false, outside: false, awayUntil: null, problem: null };

let watch: Watch | null = null;
let status = NOT_WATCHING;
let latest: Fix | null = null;
const listeners = new Set<() => void>();

function publish(next: FenceStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

function publishWatch(current: Watch): void {
  const away = current.pausedUntil !== null && Date.now() < current.pausedUntil;
  publish({ watching: true, outside: !away && current.state.side === 'outside', awayUntil: away ? current.pausedUntil : null, problem: null });
}

export function subscribeToFence(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const fenceStatus = (): FenceStatus => status;

/** The newest position this shift, for the device's health report. Never stored here beyond the one. */
export const latestReading = (): Fix | null => latest;

async function takeReading(fix: Fix): Promise<void> {
  latest = fix;
  const current = watch;
  if (!current) return;

  const before = current.state;
  const { state, change } = stepFence(before, fix, current.fence, current.pausedUntil);
  current.state = state;
  if (change) {
    const at = Date.now();
    try {
      await appendEvent(current.db, {
        id: newEventId(at),
        type: change === 'left' ? 'left_post' : 'returned_to_post',
        occurredAt: at,
        gateUserId: current.shift.gateUserId,
        payload: { shift_id: current.shift.id, post: current.shift.post },
      });
      current.recorded();
    } catch {
      // Nothing can be shown from here, and nothing is lost: the next reading comes to the same answer and writes it.
      current.state = before;
    }
  }
  publishWatch(current);
  if (current.state.side === 'outside' && (current.pausedUntil === null || fix.at >= current.pausedUntil)) Vibration.vibrate(WARNING_BUZZ);
}

// Android finds a task by name when it wakes the app, so this has to be defined as soon as the code loads.
taskManagerLibrary?.defineTask<{ locations: LocationObject[] }>(TASK, async ({ data, error }) => {
  if (error || !data) return;
  for (const { coords, timestamp } of data.locations) {
    await takeReading({ latitude: coords.latitude, longitude: coords.longitude, accuracyM: coords.accuracy ?? Number.POSITIVE_INFINITY, at: timestamp });
  }
});

type WatchOptions = { db: SQLiteDatabase; shift: Shift; fence: Fence; postLabel: string; recorded: () => void };

/** Has to be called with the app in front: Android won't let a location service start from the background. */
export async function startPostFence({ db, shift, fence, postLabel, recorded }: WatchOptions): Promise<void> {
  const location = locationLibrary;
  if (!location || !taskManagerLibrary) return;

  const { granted } = await location.requestForegroundPermissionsAsync();
  if (!granted) {
    watch = null;
    publish({ ...NOT_WATCHING, problem: 'no-permission' });
    return;
  }

  const current: Watch = { db, shift, fence, state: FENCE_START, pausedUntil: shift.awayUntil, recorded };
  watch = current;
  publishWatch(current);
  try {
    if (await location.hasStartedLocationUpdatesAsync(TASK)) return;
    await location.startLocationUpdatesAsync(TASK, {
      accuracy: location.Accuracy.High,
      timeInterval: READING_EVERY_MS,
      distanceInterval: 0,
      foregroundService: { notificationTitle: 'DigiGate', notificationBody: `On duty at ${postLabel}` },
    });
  } catch {
    watch = null;
    publish({ ...NOT_WATCHING, problem: 'location-off' });
  }
}

export async function stopPostFence(): Promise<void> {
  watch = null;
  latest = null;
  publish(NOT_WATCHING);
  const location = locationLibrary;
  if (!location) return;
  try {
    if (await location.hasStartedLocationUpdatesAsync(TASK)) await location.stopLocationUpdatesAsync(TASK);
  } catch {
    // A service that won't stop has no watch to report to, so it records nothing and goes when the app does.
  }
}

/** Pauses the fence and starts it clean: if the guard isn't back when this runs out, they're told about the usual way. */
export async function stepAway(reason: string, minutes: number): Promise<void> {
  const current = watch;
  if (!current) return;
  current.pausedUntil = await recordSteppingAway(current.db, current.shift, reason, minutes, Date.now());
  current.state = FENCE_START;
  current.recorded();
  publishWatch(current);
}

export async function backAtPost(): Promise<void> {
  const current = watch;
  if (!current) return;
  await recordBackAtPost(current.db, current.shift, Date.now());
  current.pausedUntil = null;
  current.state = FENCE_START;
  current.recorded();
  publishWatch(current);
}
