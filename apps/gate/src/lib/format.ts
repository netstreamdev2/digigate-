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

/** Gauteng plates read best grouped: "AB12CDGP" → "AB 12 CD GP". Others are shown as printed. */
export function formatPlate(plate: string): string {
  const gauteng = /^([A-Z]{2})(\d{2})([A-Z]{2})(GP)$/.exec(plate);
  return gauteng ? gauteng.slice(1).join(' ') : plate;
}
