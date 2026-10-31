import "server-only";

import { supabaseServer } from "./supabase/server";

type PeopleResult = { status: number; data: { error?: string; login?: string; password?: string } };

/** Calls digigate-people as the signed-in person. The service key lives there, never in the dashboard. */
export async function callPeople(body: Record<string, unknown>): Promise<PeopleResult> {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/digigate-people`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
