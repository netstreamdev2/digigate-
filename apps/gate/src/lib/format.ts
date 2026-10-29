/** Shows only the last few characters, for identifiers the screen doesn't need in full: "•••• 087". */
export function maskAllButLast(value: string, visible: number): string {
  return value.length <= visible ? value : `•••• ${value.slice(-visible)}`;
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

/** Gauteng plates read best grouped: "AB12CDGP" → "AB 12 CD GP". Others are shown as printed. */
export function formatPlate(plate: string): string {
  const gauteng = /^([A-Z]{2})(\d{2})([A-Z]{2})(GP)$/.exec(plate);
  return gauteng ? gauteng.slice(1).join(' ') : plate;
}
