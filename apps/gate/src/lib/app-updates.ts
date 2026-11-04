import * as Updates from 'expo-updates';
import { useEffect } from 'react';

// How often a running handheld asks for a newer version of the app's code. Only code updates arrive this way; anything
// native still needs a new build, and the fingerprint runtime keeps an update from landing on a build it doesn't fit.
const CHECK_EVERY_MS = 30 * 60_000;

let lastProblem: string | null = null;

const noteProblem = (cause: unknown) => {
  lastProblem = cause instanceof Error ? cause.message : 'unknown error';
};

/**
 * Keeps the app's code up to date. A newer version downloads in the background whenever one is published, and the app
 * restarts onto it only when it's safe: nobody signed in, or the screen locked, never mid-check. Every gate record is
 * already in the encrypted database by then, so a restart loses nothing.
 */
export function useAppUpdates(safeToRestart: boolean): void {
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (!Updates.isEnabled) return;
    const check = () => {
      Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : null))
        .then(() => {
          lastProblem = null;
        })
        .catch(noteProblem);
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isUpdatePending && safeToRestart) Updates.reloadAsync().catch(noteProblem);
  }, [isUpdatePending, safeToRestart]);
}

/** Which version of the code is running, for the shift screen, and why the last check failed if it did. */
export function appVersionLine(): string {
  if (!Updates.isEnabled) return 'Development build, running from the PC';
  const when = Updates.createdAt ? Updates.createdAt.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const version = Updates.isEmbeddedLaunch ? 'As installed' : when ? `Updated ${when}` : 'Updated';
  return lastProblem ? `${version} · Last update check failed (${lastProblem})` : version;
}
