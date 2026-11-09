/**
 * DigiLog360, DigiGate's sister product, one click away in the sidebar. The two keep separate logins and databases:
 * this is only a link. Its address can be changed per deployment with NEXT_PUBLIC_DIGILOG360_URL.
 */
export const digilog360 = {
  name: "DigiLog360",
  summary: "Security operations",
  href: process.env.NEXT_PUBLIC_DIGILOG360_URL?.trim() || "https://www.digilog360.co.za",
  icon: "/digilog360-icon.svg",
} as const;

/*
 * The link has a shutter. It's a suggestion, never an advert, so anyone can slide it down to a slim bar and open it
 * again whenever they like. The choice stays on that browser; if storage is blocked, it lasts until the page reloads.
 */

const TUCKED_KEY = "digigate.digilog360-link-tucked";
const listeners = new Set<() => void>();
/** Set only when the browser wouldn't store the choice, so it still holds for this visit. */
let unsavedChoice: boolean | null = null;

export function isSisterLinkTucked(): boolean {
  if (unsavedChoice !== null) return unsavedChoice;
  try {
    return window.localStorage.getItem(TUCKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSisterLinkTucked(tucked: boolean) {
  try {
    window.localStorage.setItem(TUCKED_KEY, tucked ? "1" : "0");
    unsavedChoice = null;
  } catch {
    unsavedChoice = tucked;
  }
  for (const listener of listeners) listener();
}

export function subscribeSisterLink(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
