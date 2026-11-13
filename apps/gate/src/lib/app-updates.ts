import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

// How often a running handheld asks for a newer version of the app's code. Only code updates arrive this way; anything
// native still needs a new build, and the fingerprint runtime keeps an update from landing on a build it doesn't fit.
const CHECK_EVERY_MS = 30 * 60_000;
// A handheld starts DigiGate the moment it boots, before its Wi-Fi or mobile data is up, so the first check often fails.
// A failed check tries again soon rather than leaving the handheld on old code for half an hour.
const RETRY_AFTER_MS = 60_000;

let lastProblem: string | null = null;

const noteProblem = (cause: unknown) => {
  lastProblem = cause instanceof Error ? cause.message : 'unknown error';
};

/** Whether DigiGate is on screen: not behind the lock screen, with the screen on. */
function useOnScreen(): boolean {
  const [onScreen, setOnScreen] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setOnScreen(state === 'active'));
    return () => subscription.remove();
  }, []);
  return onScreen;
}

/**
 * Keeps the app's code up to date. A newer version downloads in the background whenever one is published, and the app
 * restarts onto it only when it's safe: nobody signed in, or the screen locked, never mid-check. Every gate record is
 * already in the encrypted database by then, so a restart loses nothing.
 *
 * And only while DigiGate is on screen. Restarting while the screen was off (13 November) left the old screen showing
 * over code that hadn't drawn yet: the guard's first tap reached a navigator that wasn't there, and the app went white.
 * On screen, the restart happens in front of the guard at the PIN screen and takes a second.
 */
export function useAppUpdates(safeToRestart: boolean): void {
  const { isUpdatePending } = Updates.useUpdates();
  const onScreen = useOnScreen();

  useEffect(() => {
    if (!Updates.isEnabled) return;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const check = () => {
      if (retry) clearTimeout(retry);
      retry = null;
      Updates.checkForUpdateAsync()
        .then((result) => (result.isAvailable ? Updates.fetchUpdateAsync() : null))
        .then(() => {
          lastProblem = null;
        })
        .catch((cause: unknown) => {
          noteProblem(cause);
          retry = setTimeout(check, RETRY_AFTER_MS);
        });
    };
    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      clearInterval(timer);
      if (retry) clearTimeout(retry);
    };
  }, []);

  useEffect(() => {
    if (isUpdatePending && safeToRestart && onScreen) Updates.reloadAsync().catch(noteProblem);
  }, [isUpdatePending, safeToRestart, onScreen]);
}

/** Which version of the code is running, for the shift screen, and why the last check failed if it did. */
export function appVersionLine(): string {
  if (!Updates.isEnabled) return 'Development build, running from the PC';
  const when = Updates.createdAt ? Updates.createdAt.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  const version = Updates.isEmbeddedLaunch ? 'As installed' : when ? `Updated ${when}` : 'Updated';
  return lastProblem ? `${version} · Last update check failed (${lastProblem})` : version;
}
