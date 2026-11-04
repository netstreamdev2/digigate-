import "server-only";

import { supabaseServer } from "./supabase/server";

type PeopleData = { error?: string; problem?: string; login?: string; password?: string; url?: string; [field: string]: unknown };
type PeopleResult = { status: number; data: PeopleData };

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
