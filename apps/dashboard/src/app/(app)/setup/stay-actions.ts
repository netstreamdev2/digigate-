"use server";

import { STAY_CHOICES, visitTypesFor } from "@digigate/core";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

const NO_LIMIT = "none";

/**
 * A site's expected stays, one per visit type, from the dialog on its setup page. Only the usual choices are kept,
 * whatever the browser sent; row security decides who may change the site, and the change is logged.
 */
export async function saveSiteStays(_previous: FormState, form: FormData): Promise<FormState> {
  const siteId = String(form.get("siteId") ?? "");
  const supabase = await supabaseServer();
  const { data: site } = await supabase.from("sites").select("site_type").eq("id", siteId).maybeSingle();
  if (!site) return { problem: "That site isn't one your account can change.", saved: 0 };

  const stays: Record<string, number | null> = {};
  for (const type of visitTypesFor(site.site_type)) {
    const chosen = String(form.get(type.code) ?? "");
    const minutes = chosen === NO_LIMIT ? null : Number(chosen);
    if (minutes !== null && !STAY_CHOICES.includes(minutes)) return { problem: `Pick a stay for ${type.label}.`, saved: 0 };
    stays[type.code] = minutes;
  }

  const { error } = await supabase.from("sites").update({ stay_minutes: stays }).eq("id", siteId);
  if (error) return { problem: "The stays weren't saved. Try again.", saved: 0 };
  revalidatePath("/setup", "layout");
  return { problem: null, saved: Date.now() };
}
