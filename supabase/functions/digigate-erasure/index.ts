// Removes the photos of erased records from Storage. The nightly erasure (digigate.erase_due) deletes the records in the
// database and queues their photos' paths; this empties that queue, which the database can't do itself. Called only by
// the nightly schedule, with a secret kept in Vault. Deployed with --no-verify-jwt: the schedule has no login.
// A file Storage won't remove stays queued and is tried again the next night. Logs carry counts and error names only.
import { admin } from '../_shared/caller.ts';
import { json, sql } from '../_shared/device.ts';

/** One night's share, so a backlog drains over a few nights rather than in one long call. */
const MOST_FILES = 2000;
/** Storage removes up to a thousand paths a call; smaller calls fail smaller. */
const CHUNK = 100;

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const [{ ok }] = await sql`select digigate.erasure_token_ok(${request.headers.get('x-erasure-token') ?? ''}) as ok`;
    if (!ok) return json({ error: 'Not allowed' }, 401);

    const queued = await sql`select bucket, path from digigate.erasure_files order by queued_at limit ${MOST_FILES}`;
    const byBucket = new Map<string, string[]>();
    for (const row of queued) byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row.path]);

    let removed = 0;
    let failed = 0;
    for (const [bucket, paths] of byBucket) {
      for (let start = 0; start < paths.length; start += CHUNK) {
        const chunk = paths.slice(start, start + CHUNK);
        // A path already gone is no error: Storage simply has nothing to remove.
        const { error } = await admin.storage.from(bucket).remove(chunk);
        if (error) {
          failed += chunk.length;
          continue;
        }
        await sql`select digigate.erasure_files_done(${bucket}, ${sql.array(chunk)})`;
        removed += chunk.length;
      }
    }
    if (failed > 0) console.error('digigate-erasure left files queued', failed);
    return json({ removed, failed });
  } catch (cause) {
    console.error('digigate-erasure failed', cause instanceof Error ? cause.name : 'unknown');
    return json({ error: 'Server error' }, 500);
  }
});
