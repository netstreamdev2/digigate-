"use server";

import { guardRecordProblem, idNumberProblem, isPsiraGrade, readShiftPeriods, shiftPeriodsProblem, type GuardRecordInput, type IdType, type ShiftPeriod } from "@digigate/core";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { callPeople } from "@/lib/people-api";
import { supabaseServer } from "@/lib/supabase/server";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const SOMETHING_FAILED = "That didn't save. Try again.";
const PROBLEMS: Record<string, string> = {
  "not-allowed": "Your account can't do that.",
  "id-taken": "Another guard in this company already has that ID number. Check it, or find them under Guards.",
  photo: "That photo couldn't be used. Choose a JPEG or PNG picture of their face.",
  "no-id": "There's no ID number saved for them yet.",
  "server-error": "Something went wrong on our side. Try again in a moment.",
};

const problemOf = (data: { error?: string; problem?: string }) => (typeof data.problem === "string" ? data.problem : (PROBLEMS[data.error ?? ""] ?? SOMETHING_FAILED));

/** A guard's record, saved through digigate-people, which encrypts the ID number and logs the change. */
export async function saveGuardRecord(_previous: FormState, form: FormData): Promise<FormState> {
  const grade = text(form, "psiraGrade");
  const record: GuardRecordInput = {
    phone: text(form, "phone"),
    homeAddress: text(form, "homeAddress"),
    psiraNumber: text(form, "psiraNumber"),
    psiraGrade: isPsiraGrade(grade) ? grade : "",
    nextOfKinName: text(form, "nextOfKinName"),
    nextOfKinRelationship: text(form, "nextOfKinRelationship"),
    nextOfKinPhone: text(form, "nextOfKinPhone"),
  };
  const problem = guardRecordProblem(record);
  if (problem) return { problem, saved: 0 };

  const idNumber = text(form, "idNumber");
  const idType: IdType = text(form, "idType") === "passport" ? "passport" : "sa_id";
  if (idNumber) {
    const idProblem = idNumberProblem(idType, idNumber);
    if (idProblem) return { problem: idProblem, saved: 0 };
  }

  const gateUserId = text(form, "gateUserId");
  const { status, data } = await callPeople({ action: "guard-record-save", gateUserId, record, ...(idNumber ? { idType, idNumber } : {}) });
  if (status !== 200) return { problem: problemOf(data), saved: 0 };
  revalidatePath("/admin", "layout");
  return { problem: null, saved: Date.now() };
}

/** The whole ID number, shown for a moment. Each time is logged under the person who asked. */
export async function revealIdNumber(gateUserId: string): Promise<{ idNumber: string | null; problem: string | null }> {
  const { status, data } = await callPeople({ action: "guard-id-reveal", gateUserId });
  if (status !== 200 || typeof data.idNumber !== "string") return { idNumber: null, problem: problemOf(data) };
  return { idNumber: data.idNumber, problem: null };
}

/** A new employee photo, already made small in the browser. */
export async function saveGuardPhoto(gateUserId: string, photo: string): Promise<{ photoUrl: string | null; problem: string | null }> {
  const { status, data } = await callPeople({ action: "guard-photo", gateUserId, photo });
  if (status !== 200 || typeof data.photoUrl !== "string") return { photoUrl: null, problem: problemOf(data) };
  revalidatePath("/admin", "layout");
  return { photoUrl: data.photoUrl, problem: null };
}

/** A site's shift times, which handhelds pick up on their next sync. */
export async function saveShiftPeriods(_previous: FormState, form: FormData): Promise<FormState> {
  let periods: ShiftPeriod[];
  try {
    periods = readShiftPeriods(JSON.parse(text(form, "periods") || "[]"));
  } catch {
    return { problem: SOMETHING_FAILED, saved: 0 };
  }
  const problem = shiftPeriodsProblem(periods);
  if (problem) return { problem, saved: 0 };
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("sites").update({ shift_periods: periods }).eq("id", text(form, "siteId")).select("id");
  if (error) return { problem: SOMETHING_FAILED, saved: 0 };
  // Row security turns a site this account can't change into no rows at all, rather than an error.
  if (data.length === 0) return { problem: "Your account can't do that.", saved: 0 };
  revalidatePath("/admin", "layout");
  return { problem: null, saved: Date.now() };
}

/** A super user suspends a company that hasn't paid: its dashboard, handhelds and invites stop. The database checks who. */
export async function suspendCompany(_previous: FormState, form: FormData): Promise<FormState> {
  const reason = text(form, "reason");
  if (!reason) return { problem: "Give a reason. The company's people will see it.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_company_suspended", { _org: text(form, "orgId"), _suspended: true, _reason: reason });
  if (error) return { problem: error.code === "42501" ? "Only a super user can suspend a company." : SOMETHING_FAILED, saved: 0 };
  revalidatePath("/", "layout");
  return { problem: null, saved: Date.now() };
}

/** Reinstating a suspended company: everything comes back at once, and its handhelds at their next sync. */
export async function reinstateCompany(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("set_company_suspended", { _org: text(form, "orgId"), _suspended: false, _reason: "" });
  if (error) throw new Error(error.code === "42501" ? "Only a super user can reinstate a company." : SOMETHING_FAILED);
  revalidatePath("/", "layout");
}
