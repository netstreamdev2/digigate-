"use server";

import { revalidatePath } from "next/cache";

import { isBrandColor } from "@/lib/company-theme";
import { LOGO_BUCKET } from "@/lib/company-brand";
import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

const LOGO_TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png" };
const LOGO_MAX_BYTES = 300_000;

const refused = (problem: string): FormState => ({ problem, saved: 0 });

/**
 * A company's logo and colour. The browser has already redrawn the logo as a small WebP or PNG (lib/logo-image.ts),
 * so anything else that arrives is refused rather than kept. Storage and the database both check that whoever sends it
 * looks after this company.
 */
export async function saveCompanyBrand(_previous: FormState, form: FormData): Promise<FormState> {
  const orgId = String(form.get("orgId") ?? "");
  const color = String(form.get("color") ?? "").trim().toLowerCase();
  const logo = form.get("logo");
  const removeLogo = form.get("removeLogo") === "1";
  if (color && !isBrandColor(color)) return refused("Pick the colour again: that one didn't come through.");

  const supabase = await supabaseServer();
  const { data: current, error: readError } = await supabase.from("organisations").select("logo_path").eq("id", orgId).maybeSingle();
  if (readError || !current) return refused("That company couldn't be found. Refresh the page and try again.");

  let path = removeLogo ? null : current.logo_path;
  if (logo instanceof File && logo.size > 0) {
    const extension = LOGO_TYPES[logo.type];
    if (!extension || logo.size > LOGO_MAX_BYTES) return refused("That logo didn't come through as expected. Pick it again.");
    path = `${orgId}/logo-${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, logo, { contentType: logo.type, upsert: false });
    if (error) return refused("The logo couldn't be saved. Check you're still signed in and try again.");
  }

  const { error } = await supabase.rpc("set_company_brand", { _org: orgId, _logo_path: path ?? "", _color: color });
  if (error) return refused(error.code === "42501" ? "Your account can't change this company's look." : "That didn't save. Try again.");

  // The old file goes once the new one is in use, so a failed save never leaves the company without a logo.
  if (current.logo_path && current.logo_path !== path) {
    const { error: removeError } = await supabase.storage.from(LOGO_BUCKET).remove([current.logo_path]);
    if (removeError) {
      revalidatePath("/", "layout");
      return refused("The new look is saved, but the old logo file couldn't be cleared away. Close this and try again later.");
    }
  }

  revalidatePath("/", "layout");
  return { problem: null, saved: Date.now() };
}
