"use server";

import { isValidSaIdNumber } from "@digigate/core";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const refused = (problem: string): FormState => ({ problem, saved: 0 });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The last moment of a day at the site, so an entry "until 30 November" still stops them on the 30th. */
const endOfDay = (day: string) => `${day}T23:59:59+02:00`;

/**
 * Puts a person or a car on the hotlist. An ID number goes straight to the database, which keeps it only as the key
 * the handhelds match on and its last four digits; it never comes back to the dashboard.
 */
export async function addToHotlist(_previous: FormState, form: FormData): Promise<FormState> {
  const orgId = text(form, "orgId");
  const kind = text(form, "kind");
  const value = text(form, "value").replace(/\s/g, "");
  const name = text(form, "name");
  const reason = text(form, "reason");
  const guardNote = text(form, "guardNote");
  const until = text(form, "until");
  const siteId = text(form, "scope") === "site" ? text(form, "siteId") : "";

  if (kind === "person") {
    if (!name) return refused("Give the person's name, as it is on their ID.");
    if (!isValidSaIdNumber(value)) return refused("That isn't a valid SA ID number. Check all 13 digits.");
  } else if (kind === "plate" || kind === "vin") {
    if (!/[a-z0-9]/i.test(value)) return refused(kind === "plate" ? "Enter the number plate." : "Enter the VIN.");
  } else {
    return refused("Choose a person, a plate or a VIN.");
  }
  if (!reason) return refused("Say why, so the control room knows what this is about.");
  if (!guardNote) return refused("Say what the guard should do when it comes up.");
  if (until && !DAY.test(until)) return refused("Pick the end date again.");
  if (until && Date.parse(endOfDay(until)) <= Date.now()) return refused("That end date has already passed.");

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("add_hotlist_entry", {
    _org: orgId,
    _kind: kind,
    _value: value,
    _label: name,
    _reason: reason,
    _guard_note: guardNote,
    ...(siteId ? { _site: siteId } : {}),
    ...(until ? { _expires_at: endOfDay(until) } : {}),
  });
  if (error) {
    if (error.code === "23505") return refused("That's on the hotlist already.");
    if (error.code === "42501") return refused("Your account can't add to this company's hotlist.");
    return refused("That didn't save. Check the details and try again.");
  }
  revalidatePath("/hotlist");
  return { problem: null, saved: Date.now() };
}

/** Takes an entry off. Handhelds stop matching it at their next sync; the record stays for three years, then goes. */
export async function takeOffHotlist(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("remove_hotlist_entry", { _id: text(form, "id") });
  if (error) throw new Error("That entry couldn't be taken off. Refresh the page and try again.");
  revalidatePath("/hotlist");
}
