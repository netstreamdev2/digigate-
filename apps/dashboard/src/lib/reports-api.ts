import "server-only";

import { supabaseServer } from "./supabase/server";

/** Calls digigate-reports as the signed-in person. Building the PDF and sending the email both happen there. */
export async function callReports(body: Record<string, unknown>): Promise<Response> {
  const supabase = await supabaseServer();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/digigate-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
}
