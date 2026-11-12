/*
 * The last product picked, remembered on this browser only, for the "Last used" badge. Storage can be blocked
 * (private windows, locked-down browsers), and then the page simply shows no badge.
 */

const LAST_USED_KEY = "digilog360.last-product";

export function readLastUsed(): string | null {
  try {
    return window.localStorage.getItem(LAST_USED_KEY);
  } catch {
    return null;
  }
}

export function rememberLastUsed(id: string) {
  try {
    window.localStorage.setItem(LAST_USED_KEY, id);
  } catch {
    // Nothing to do: the badge is a nicety, and the link still goes where it should.
  }
}

export function subscribeLastUsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
