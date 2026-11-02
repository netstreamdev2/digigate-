"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { callPeople } from "@/lib/people-api";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

const NOT_SAVED: Omit<FormState, "problem"> = { saved: 0 };

/** Closes an alert someone has dealt with, saying who did and what they did. Row security decides who may. */
export async function closeAlert(_previous: FormState, form: FormData): Promise<FormState> {
  const reason = String(form.get("reason") ?? "").trim();
  if (!reason) return { problem: "Say what was done, so the record explains itself.", ...NOT_SAVED };

  const user = await currentUser();
  if (!user) return { problem: "Your account can't do that.", ...NOT_SAVED };

  const ids = String(form.get("ids") ?? "").split(",").filter(Boolean);
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: user.id, resolution: `Control room: ${reason}` })
    .in("id", ids)
    .eq("status", "open");
  if (error) return { problem: "That didn't work. Try again.", ...NOT_SAVED };

  revalidatePath("/control-room", "layout");
  return { problem: null, saved: Date.now() };
}

/** A link to a guard's shift photo that works for a minute. The server decides who may have one, and logs each. */
export async function openSelfie(shiftId: string): Promise<{ url: string | null; problem: string | null }> {
  const { data, status } = await callPeople({ action: "selfie-link", shiftId });
  if (data.url) return { url: data.url, problem: null };
  if (status === 404) return { url: null, problem: "This photo hasn't reached the server yet. The handheld sends it when it has a connection." };
  return { url: null, problem: status === 403 ? "Your account can't see this photo." : "The photo didn't open. Try again." };
}
