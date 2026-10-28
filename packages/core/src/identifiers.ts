// Plates, VINs and disc numbers are compared in this form: `CA 123-456` and `ca123456` are the same plate.
export function normaliseIdentifier(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
