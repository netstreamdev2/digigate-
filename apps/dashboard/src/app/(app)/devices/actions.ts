"use server";

import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const SOMETHING_FAILED = "That didn't save. Try again.";
const MOST_MB = 1_000_000;

/** A South African number as typed (082 123 4567, +27 82 123 4567) in the +27 form the database keeps. */
function simNumberOf(typed: string): string | null {
  const digits = typed.replace(/[\s()-]/g, "");
  if (/^0\d{9}$/.test(digits)) return `+27${digits.slice(1)}`;
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^27\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}

/** The SIM's number and its bundle, set by an admin of the device's company. Row security refuses anyone else. */
export async function saveDevicePlan(_previous: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "id");
  const typedNumber = text(form, "simNumber");
  const simNumber = typedNumber ? simNumberOf(typedNumber) : null;
  if (typedNumber && !simNumber) return { problem: "That SIM number doesn't look right. Type it like 082 123 4567.", saved: 0 };

  const typedBundle = text(form, "bundle");
  const amount = typedBundle ? Number(typedBundle.replace(",", ".")) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) return { problem: "Give the bundle as a number, such as 2 for 2 GB.", saved: 0 };
  const bundleMb = amount === null ? null : Math.round(text(form, "unit") === "MB" ? amount : amount * 1024);
  if (bundleMb !== null && (bundleMb < 1 || bundleMb > MOST_MB)) return { problem: "That bundle is bigger than any SIM sells.", saved: 0 };

  const typedDay = text(form, "renewsDay");
  const renewsDay = typedDay ? Number(typedDay) : null;
  if (renewsDay !== null && (!Number.isInteger(renewsDay) || renewsDay < 1 || renewsDay > 31)) return { problem: "The renewal day is a day of the month, 1 to 31.", saved: 0 };

  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("devices")
    .update({ sim_number: simNumber, data_bundle_mb: bundleMb, data_renews_day: renewsDay })
    .eq("id", id)
    .select("id");
  if (error) return { problem: SOMETHING_FAILED, saved: 0 };
  // Row security turns a device this account can't change into no rows at all, rather than an error.
  if (data.length === 0) return { problem: "Your account can't do that.", saved: 0 };
  revalidatePath("/devices", "layout");
  return { problem: null, saved: Date.now() };
}
