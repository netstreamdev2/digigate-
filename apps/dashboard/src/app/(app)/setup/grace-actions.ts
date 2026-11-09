"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

/** Starts a site's 7-day launch grace, or starts it again. The database checks who may, and logs it. */
export async function startLaunchGrace(_previous: FormState, form: FormData): Promise<FormState> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("start_launch_grace", { _site: String(form.get("siteId") ?? "") });
  if (error) return { problem: "Only an administrator of this company can start its launch grace.", saved: 0 };
  revalidatePath("/setup", "layout");
  revalidatePath("/control-room", "layout");
  return { problem: null, saved: Date.now() };
}

/** Ends a site's launch grace now, before its 7 days are up. Logged too. */
export async function endLaunchGrace(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.rpc("end_launch_grace", { _site: String(form.get("siteId") ?? "") });
  revalidatePath("/setup", "layout");
  revalidatePath("/control-room", "layout");
}
