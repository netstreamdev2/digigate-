/** Groups an SA ID number the way it reads on the card: "8001015009087" → "800101 5009 087". */
export function formatSaIdNumber(value: string): string {
  return /^\d{13}$/.test(value) ? `${value.slice(0, 6)} ${value.slice(6, 10)} ${value.slice(10)}` : value;
}

/** "DLAMINI" → "Dlamini", "VAN DER MERWE" → "Van Der Merwe". For names, which barcodes store in capitals. */
export function titleCase(value: string): string {
  return value.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, boundary: string, letter: string) => boundary + letter.toUpperCase());
}

/** "2027-03-31" → "31 Mar 2027". The date is a calendar date, so it's formatted in UTC to avoid shifting a day. */
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** How long someone has been on site, the way a guard would say it: "45 min", "1 h 49 min", "2 days 3 h". */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const dayWord = days === 1 ? 'day' : 'days';
  return hours % 24 ? `${days} ${dayWord} ${hours % 24} h` : `${days} ${dayWord}`;
}

/** When someone arrived, relative to now: "10:12 today", "18:40 yesterday", "28 Oct, 14:05". */
export function formatArrival(at: number, now: number): string {
  const time = new Date(at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (value: number) => new Date(value).setHours(0, 0, 0, 0);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (daysAgo === 0) return `${time} today`;
  if (daysAgo === 1) return `${time} yesterday`;
  return `${new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}, ${time}`;
}

/**
 * A name as the guard types it, kept the way documents print names: capitals only, letters (accents included),
 * spaces, hyphens and apostrophes, e.g. "VAN DER MERWE", "O'NEIL". Applied on every keystroke, whatever the keyboard.
 */
export function nameInput(value: string): string {
  return value.toUpperCase().replace(/[^\p{L}' -]/gu, '');
}

/** A plate as the guard types it: capitals, digits, spaces and hyphens only. */
export function plateInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9 -]/g, '');
}

/** Gauteng plates read best grouped: "AB12CDGP" → "AB 12 CD GP". Others are shown as printed. */
export function formatPlate(plate: string): string {
  const gauteng = /^([A-Z]{2})(\d{2})([A-Z]{2})(GP)$/.exec(plate);
  return gauteng ? gauteng.slice(1).join(' ') : plate;
}
