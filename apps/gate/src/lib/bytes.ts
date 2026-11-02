export function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunks keep each fromCharCode call well under the engine's argument limit.
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}
