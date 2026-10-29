/** A 13-digit South African ID number with a valid Luhn check digit. Says nothing about whether it was issued. */
export function isValidSaIdNumber(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 13; index++) {
    let digit = Number(value[12 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
