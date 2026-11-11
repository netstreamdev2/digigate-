const SITE_TIME_ZONE = "Africa/Johannesburg";

const clock = new Intl.DateTimeFormat("en-ZA", { timeZone: SITE_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockWithSeconds = new Intl.DateTimeFormat("en-ZA", { timeZone: SITE_TIME_ZONE, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
const calendarDay = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TIME_ZONE });
const dayAndMonth = new Intl.DateTimeFormat("en-ZA", { timeZone: SITE_TIME_ZONE, day: "numeric", month: "short" });
const fullDate = new Intl.DateTimeFormat("en-ZA", { timeZone: SITE_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });

const MINUTE_MS = 60_000;

/** A time on the site's clock, e.g. 14:05. Stored in UTC, always shown in SAST. */
export const timeOfDay = (at: string | number) => clock.format(new Date(at));

export const timeWithSeconds = (at: string | number) => clockWithSeconds.format(new Date(at));

/** A date on the site's calendar, e.g. 31 Oct. */
export const shortDate = (at: string | number) => dayAndMonth.format(new Date(at));

/** A date in full, e.g. 1 November 2026. */
export const longDate = (day: string) => fullDate.format(new Date(`${day}T12:00:00Z`));

/** Today on the site's calendar, as YYYY-MM-DD. */
export const siteToday = (now: number) => calendarDay.format(new Date(now));

/** A calendar date some days away. */
export function addDays(day: string, days: number): string {
  const moved = new Date(`${day}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** Midnight on the site's calendar, as a moment in UTC. South Africa has one offset all year, with no daylight saving. */
export const siteMidnightUtc = (day: string) => `${day}T00:00:00+02:00`;

/** A date from the address, or the fallback when it's missing or isn't a date. */
export function dayParam(query: Record<string, string | string[] | undefined>, fallback: string, name = "day"): string {
  const value = query[name];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

/** How long between two moments, e.g. 2h 14m, or 7d 4h once it runs to days. */
export function duration(from: string | number, to: string | number): string {
  const minutes = Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / MINUTE_MS));
  if (minutes < 1) return "Under a minute";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 48) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** How long ago something happened, e.g. 2m ago. */
export function ago(at: string | number, now: number): string {
  return now - new Date(at).getTime() < MINUTE_MS ? "just now" : `${duration(at, now)} ago`;
}

/** A stored code in plain words, e.g. patient_dropoff becomes Patient dropoff. */
export function labelFor(code: string): string {
  const words = code.replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The username a person types: lucy, never lucy@fire. The company code after the @ only keeps two companies' Lucys
 * apart behind the scenes. A real email address is shown as it is.
 */
export const usernameOf = (login: string) => (/^[^@]+@[a-z0-9]+$/.test(login) ? (login.split("@")[0] ?? login) : login);

/** Bytes as the networks sell data: 1 GB is 1024 MB. */
export const MB = 1024 * 1024;

/** Mobile data in plain words: 850 MB, 1.4 GB. */
export function dataSize(bytes: number): string {
  const megabytes = bytes / MB;
  if (megabytes < 1) return megabytes > 0 ? "Under 1 MB" : "0 MB";
  if (megabytes < 1024) return `${Math.round(megabytes)} MB`;
  return `${(megabytes / 1024).toFixed(megabytes < 10 * 1024 ? 1 : 0).replace(/\.0$/, "")} GB`;
}

/** `3 guards`, or with an irregular plural, `3 people`. */
export const plural = (count: number, word: string, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;
