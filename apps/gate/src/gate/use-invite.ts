import type { SQLiteDatabase } from 'expo-sqlite';
import { useEffect, useState } from 'react';

import type { Direction } from './decision';
import { resolveInvite, type ScannedInvite } from './invite';

const ON_THE_WAY_OUT: ScannedInvite = {
  kind: 'refused',
  title: 'Invites are for coming in',
  message: 'On the way out, check them as normal.',
};

/**
 * What an invite scanned on this screen means: the booking it opens, or why it doesn't. Null until one is scanned.
 * The answer belongs to the code it was worked out for, so a reset or a second invite never shows a stale one.
 */
export function useInvite(db: SQLiteDatabase, code: string | null, direction: Direction): ScannedInvite | null {
  const [resolved, setResolved] = useState<{ code: string; invite: ScannedInvite } | null>(null);

  useEffect(() => {
    if (!code || direction === 'exit') return;
    let current = true;
    resolveInvite(db, code, Date.now()).then(
      (invite) => {
        if (current) setResolved({ code, invite });
      },
      (cause: unknown) => {
        if (!current) return;
        setResolved({
          code,
          invite: {
            kind: 'refused',
            title: "Couldn't check the invite",
            message: `Treat them as a normal visitor: scan their ID or licence. (${cause instanceof Error ? cause.message : 'unknown error'})`,
          },
        });
      },
    );
    return () => {
      current = false;
    };
  }, [db, code, direction]);

  if (!code) return null;
  if (direction === 'exit') return ON_THE_WAY_OUT;
  return resolved?.code === code ? resolved.invite : null;
}
