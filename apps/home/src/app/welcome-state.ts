/*
 * Whether this browser session has been welcomed. The welcome shows once per session: someone coming back from a
 * sign-in page in the same tab isn't greeted twice.
 */

const WELCOMED_KEY = "digi.welcomed";
const listeners = new Set<() => void>();
let welcomedThisVisit = false;

export function readWelcomed(): boolean {
  try {
    return window.sessionStorage.getItem(WELCOMED_KEY) === "1" || welcomedThisVisit;
  } catch {
    return welcomedThisVisit;
  }
}

export function markWelcomed() {
  welcomedThisVisit = true;
  try {
    window.sessionStorage.setItem(WELCOMED_KEY, "1");
  } catch {
    // Kept in memory instead: the welcome won't come back until the page is reloaded.
  }
  for (const listener of listeners) listener();
}

export function subscribeWelcomed(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Runs before the page is first painted, so someone already welcomed this session never sees the welcome flash up
 * while the page starts.
 */
export const welcomedScript = `try{if(sessionStorage.getItem("${WELCOMED_KEY}")==="1")document.documentElement.dataset.welcomed="1"}catch(e){}`;
