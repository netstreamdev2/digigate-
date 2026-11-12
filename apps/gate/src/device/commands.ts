import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { getValue, removeValue, setValue } from '@/db/kv';
import { appendEvent } from '@/db/outbox';
import { newEventId } from '@/lib/ids';

import { Handheld } from '../../modules/handheld';

/*
 * What a super user can ask of a handheld from the dashboard, which reaches it at its next sync:
 * - lock: DigiGate locks so the guard's PIN is needed, and the screen goes off. At once.
 * - restart: the handheld restarts. At once: every check is already in the encrypted database, so nothing is lost
 *   but a scan that was half done.
 * - update_app: a newer DigiGate is downloaded and installed over this one, the way an app update would be, but only
 *   when nobody is in the middle of a check (signed out or locked).
 *
 * Each is done once, recorded as a device_command event (which closes it on the server), and remembered on the
 * handheld so a restart, or the server not yet hearing back, never makes it run twice.
 */

export type CommandKind = 'lock' | 'restart' | 'update_app';

export type AppUpdate = { url: string; versionCode: number; sha256: string | null };

export type DeviceCommand =
  | { id: string; kind: 'lock' }
  | { id: string; kind: 'restart' }
  | { id: string; kind: 'update_app'; update: AppUpdate };

const DONE_KEY = 'device_commands_done';
/** The update being installed, so the next start can say how it went. */
const UPDATING_KEY = 'device_update_in_progress';
/** Enough to never repeat one; the server stops sending a command as soon as it hears it was done. */
const REMEMBERED = 40;
const UPDATE_FILE = 'digigate-update.apk';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function toCommand(value: unknown): DeviceCommand | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !UUID.test(value.id)) return null;
  if (value.kind === 'lock') return { id: value.id, kind: 'lock' };
  if (value.kind === 'restart') return { id: value.id, kind: 'restart' };
  if (value.kind !== 'update_app' || !isRecord(value.payload)) return null;
  const { url, version_code: versionCode, sha256 } = value.payload;
  if (typeof url !== 'string' || !url.startsWith('https://') || typeof versionCode !== 'number' || !Number.isInteger(versionCode)) return null;
  return { id: value.id, kind: 'update_app', update: { url, versionCode, sha256: typeof sha256 === 'string' && sha256 !== '' ? sha256 : null } };
}

let pending: readonly DeviceCommand[] = [];
const listeners = new Set<() => void>();

/** The server's list at each sync. An older server sends none, which changes nothing. */
export function receiveCommands(value: unknown): void {
  if (!Array.isArray(value)) return;
  const next = value.flatMap((item) => {
    const command = toCommand(item);
    return command ? [command] : [];
  });
  if (next.length === 0 && pending.length === 0) return;
  pending = next;
  for (const listener of listeners) listener();
}

function usePendingCommands(): readonly DeviceCommand[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
}

async function doneIds(db: SQLiteDatabase): Promise<string[]> {
  const stored = await getValue(db, DONE_KEY);
  if (stored === null) return [];
  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
}

async function markDone(db: SQLiteDatabase, id: string): Promise<void> {
  const ids = (await doneIds(db)).filter((done) => done !== id);
  await setValue(db, DONE_KEY, JSON.stringify([...ids, id].slice(-REMEMBERED)));
}

// Said as `result`, never `outcome`: the server keeps a payload's outcome as a check's result (clear, warning or
// blocked) and would refuse the whole upload over any other word.
async function record(db: SQLiteDatabase, command: { id: string; kind: CommandKind }, result: string): Promise<void> {
  const at = Date.now();
  await appendEvent(db, { id: newEventId(at), type: 'device_command', occurredAt: at, gateUserId: null, payload: { command_id: command.id, kind: command.kind, result } });
}

const installedVersion = (): number => Number(Application.nativeBuildVersion ?? '0');

async function startUpdate(db: SQLiteDatabase, command: { id: string; kind: 'update_app'; update: AppUpdate }): Promise<string> {
  if (!Handheld) return 'not-supported';
  if (!Handheld.isDeviceOwner()) return 'not-device-owner';
  if (installedVersion() >= command.update.versionCode) return 'already-current';
  let file: File;
  try {
    file = await File.downloadFileAsync(command.update.url, new File(Paths.cache, UPDATE_FILE), { idempotent: true });
  } catch {
    return 'download-failed';
  }
  await setValue(db, UPDATING_KEY, JSON.stringify({ id: command.id, versionCode: command.update.versionCode }));
  const started = await Handheld.installUpdate(file.uri, command.update.sha256);
  if (started !== 'installing') {
    await removeValue(db, UPDATING_KEY);
    file.delete();
  }
  return started;
}

/**
 * At start, after an update this handheld began: whether the new version is the one now running. Recorded once, and
 * the downloaded file is cleared away.
 */
export async function reportFinishedUpdate(db: SQLiteDatabase): Promise<boolean> {
  const stored = await getValue(db, UPDATING_KEY);
  if (stored === null) return false;
  await removeValue(db, UPDATING_KEY);
  const parsed: unknown = JSON.parse(stored);
  if (!isRecord(parsed) || typeof parsed.id !== 'string' || typeof parsed.versionCode !== 'number') return false;
  const result = Handheld?.takeInstallResult() ?? null;
  const outcome = installedVersion() >= parsed.versionCode ? 'installed' : (result ?? 'not-installed');
  await record(db, { id: parsed.id, kind: 'update_app' }, outcome);
  const leftover = new File(Paths.cache, UPDATE_FILE);
  if (leftover.exists) leftover.delete();
  return true;
}

type Options = {
  db: SQLiteDatabase;
  /** Nobody is in the middle of a check: signed out, or the screen is locked. Updates wait for this. */
  safeToRestart: boolean;
  /** Locks DigiGate, so the guard's PIN is needed. */
  lock: () => void;
  /** A command's record is in the outbox, ready to go up. */
  recorded: () => void;
};

/** Carries out what a super user asked of this handheld, each once. */
export function useDeviceCommands({ db, safeToRestart, lock, recorded }: Options): void {
  const commands = usePendingCommands();
  // One at a time: a sync can arrive while a download is still running.
  const busy = useRef(false);

  useEffect(() => {
    if (busy.current || commands.length === 0) return;
    busy.current = true;
    const run = async () => {
      const done = new Set(await doneIds(db));
      for (const command of commands) {
        if (done.has(command.id)) continue;
        if (command.kind === 'update_app' && !safeToRestart) continue;
        // On record before anything happens: a restart or an update ends this app before it could say so after.
        await markDone(db, command.id);
        if (command.kind === 'lock') {
          lock();
          const screenOff = Handheld?.lockScreen() ?? false;
          await record(db, command, screenOff ? 'locked' : 'locked-app-only');
          recorded();
        } else if (command.kind === 'restart') {
          await record(db, command, 'restarting');
          const result = Handheld?.restart() ?? 'not-supported';
          if (result !== 'restarting') {
            await record(db, command, result);
            recorded();
          }
        } else {
          const result = await startUpdate(db, command);
          if (result !== 'installing') {
            await record(db, command, result);
            recorded();
          }
        }
      }
    };
    // A command can only fail here on the handheld's own database, and then it's simply tried again at the next sync,
    // since it isn't yet marked done. There's no guard to tell: none of this is theirs to act on.
    run()
      .catch(() => undefined)
      .finally(() => {
        busy.current = false;
      });
  }, [commands, db, lock, recorded, safeToRestart]);
}
