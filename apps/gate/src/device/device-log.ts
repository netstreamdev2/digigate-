import type { SQLiteDatabase } from 'expo-sqlite';

import { getValue, setValue } from '@/db/kv';
import { appendEvent } from '@/db/outbox';
import { newEventId } from '@/lib/ids';

import { DeviceLog } from '../../modules/device-log';

/** The last native log entry already turned into an event. Kept through a revoke's wipe, so nothing is sent twice. */
const LOG_SEQ_KEY = 'device_log_seq';

/**
 * Turns what the handheld logged about itself (switched off, no signal, mobile data off, DigiGate closed) into
 * `device_status` events in the outbox, at the time each happened. One transaction, so a crash part-way repeats the
 * batch rather than losing or doubling it. Works offline: the events go up with everything else once it's back.
 */
export async function recordDeviceLog(db: SQLiteDatabase): Promise<number> {
  if (!DeviceLog) return 0;
  const stored = Number(await getValue(db, LOG_SEQ_KEY));
  const after = Number.isInteger(stored) && stored > 0 ? stored : 0;
  const entries = DeviceLog.entriesAfter(after);
  const last = entries.at(-1);
  if (!last) return 0;
  await db.withTransactionAsync(async () => {
    for (const entry of entries) {
      await appendEvent(db, {
        id: newEventId(entry.at),
        type: 'device_status',
        occurredAt: entry.at,
        gateUserId: null,
        payload: { status: entry.kind, battery: entry.battery, reason: entry.reason },
      });
    }
    await setValue(db, LOG_SEQ_KEY, String(last.seq));
  });
  return entries.length;
}
