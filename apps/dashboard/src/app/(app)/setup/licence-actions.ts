"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

export type LicenceState = { problem: string | null; sent: boolean };

export async function requestSiteLicence(_previous: LicenceState, form: FormData): Promise<LicenceState> {
  const name = String(form.get("name") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const siteType = String(form.get("siteType") ?? "");
  if (!name || name.length > 120) return { problem: "Give the site a name, up to 120 characters.", sent: false };
  if (!["hospital", "estate"].includes(siteType) || note.length > 500) return { problem: "Check the site type and keep your note under 500 characters.", sent: false };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_site_licence", { _org: String(form.get("orgId") ?? ""), _name: name, _site_type: siteType, _note: note });
  if (error) return { problem: error.code === "42501" ? "Your company's administrator can request a site licence. Ask them to sign in." : "Your request couldn't be sent. Try again.", sent: false };
  revalidatePath("/setup", "layout");
  return { problem: null, sent: true };
}

export async function declineSiteLicence(_previous: FormState, form: FormData): Promise<FormState> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("decline_site_licence", { _request: String(form.get("requestId") ?? "") });
  if (error) return { problem: error.code === "42501" ? "Only a DigiGate super user can close a licence request." : "That request couldn't be closed. Refresh and try again.", saved: 0 };
  revalidatePath("/setup", "layout");
  return { problem: null, saved: Date.now() };
}
