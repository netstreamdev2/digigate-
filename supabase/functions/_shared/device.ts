// Shared by the device functions. They reach the database directly with the connection every Edge Function is given,
// so DigiGate needs no change to the project's API settings, which digilog360 also relies on.
import postgres from 'npm:postgres@3.4.5';

export const sql = postgres(Deno.env.get('SUPABASE_DB_URL') ?? '', { prepare: false, max: 1 });

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
