"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
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
