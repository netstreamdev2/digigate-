"use server";

import { isValidSaIdNumber, visitTypesFor } from "@digigate/core";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { supabaseServer } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const refused = (problem: string): FormState => ({ problem, saved: 0 });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LONGEST_DAYS = 31;
const DAY_MS = 86_400_000;

/**
 * Books a visitor in for one or more whole days at one site. They're recognised by their ID number, the plate of the
 * car they're coming in, or both. Nobody they're visiting is recorded: a hospital never says who someone came to see.
 */
export async function bookVisitor(_previous: FormState, form: FormData): Promise<FormState> {
  const orgId = text(form, "orgId");
  const siteId = text(form, "siteId");
  const name = text(form, "name");
  const idNumber = text(form, "idNumber").replace(/\s/g, "");
  const plate = text(form, "plate");
  const visitType = text(form, "visitType");
  const note = text(form, "note");
  const fromDay = text(form, "from");
  const untilDay = text(form, "until") || fromDay;

  if (!name) return refused("Give the visitor's name, as it is on their ID.");
  if (!idNumber && !/[a-z0-9]/i.test(plate)) return refused("Give their ID number, the car's plate, or both, so the gate knows them.");
  if (idNumber && !isValidSaIdNumber(idNumber)) return refused("That isn't a valid SA ID number. Check all 13 digits.");
  if (!DAY.test(fromDay) || !DAY.test(untilDay)) return refused("Pick the days they're coming.");
  const from = Date.parse(`${fromDay}T00:00:00+02:00`);
  const until = Date.parse(`${untilDay}T23:59:59+02:00`);
  if (until < from) return refused("The last day can't be before the first.");
  if (until - from > LONGEST_DAYS * DAY_MS) return refused(`Book at most ${LONGEST_DAYS} days at a time.`);
  if (until <= Date.now()) return refused("Those days have already passed.");
  if (note.length > 200) return refused("Keep the note for the guard short: 200 characters at most.");

  const supabase = await supabaseServer();
  const { data: site, error: siteError } = await supabase.from("sites").select("site_type").eq("id", siteId).maybeSingle();
  if (siteError || !site) return refused("That site couldn't be found. Pick it again.");
  if (visitType && !visitTypesFor(site.site_type).some((option) => option.code === visitType)) return refused("Pick the kind of visit again.");

  const { error } = await supabase.rpc("add_expected_visitor", {
    _org: orgId,
    _site: siteId,
    _name: name,
    _id_number: idNumber,
    _plate: plate,
    _visit_type: visitType,
    _from: new Date(from).toISOString(),
    _until: new Date(until).toISOString(),
    _note: note,
  });
  if (error) return refused(error.code === "42501" ? "Your account can't book visitors at this site." : "That didn't save. Check the details and try again.");
  revalidatePath("/expected");
  return { problem: null, saved: Date.now() };
}

export async function cancelBooking(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("cancel_expected_visitor", { _id: text(form, "id") });
  if (error) throw new Error("That booking couldn't be cancelled. Refresh the page and try again.");
  revalidatePath("/expected");
}
