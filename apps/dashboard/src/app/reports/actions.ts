"use server";

import { frequencyLabel, isReportFrequency } from "@digigate/core";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form-state";
import { callReports } from "@/lib/reports-api";
import { supabaseServer } from "@/lib/supabase/server";

const EMAIL = /^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/;
const TIME = /^\d{2}:\d{2}$/;
const MOST_RECIPIENTS = 50;

const NOT_SAVED: Omit<FormState, "problem"> = { saved: 0 };
const failed = (problem: string): FormState => ({ problem, ...NOT_SAVED });

const PROBLEMS: Record<string, string> = {
  recipients: "Check the email addresses. There must be at least one in To, and 50 at most in all.",
  "email-not-set-up": "Email isn't switched on yet. The Resend key needs adding to the project first.",
  "email-refused": "Resend refused this. Check the API key and that the sending domain is verified.",
  "email-failed": "The report couldn't be sent. Nothing went out, so it's safe to try again.",
  "needs-mfa": "Sign in again, then try this.",
  "not-allowed": "Your account can't do that.",
};

const SOMETHING_FAILED = "That didn't work. Try again.";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function addresses(form: FormData, name: string): string[] {
  try {
    const list: unknown = JSON.parse(text(form, name) || "[]");
    return Array.isArray(list) ? list.map(String) : [];
  } catch {
    return [];
  }
}

export async function emailPreview(scope: { org: string; client: string; frequency: string; day: string; message: string }): Promise<string | null> {
  const response = await callReports({ action: "preview", ...scope, client: scope.client || null });
  if (!response.ok) return null;
  const { html } = (await response.json()) as { html?: string };
  return html ?? null;
}

export async function sendReport(_previous: FormState, form: FormData): Promise<FormState> {
  const to = addresses(form, "to");
  const cc = addresses(form, "cc");
  const bcc = addresses(form, "bcc");
  if (to.length === 0) return failed("Add at least one address in To.");
  if (![...to, ...cc, ...bcc].every((address) => EMAIL.test(address))) return failed("One of those email addresses doesn't look right. It's shown in red.");

  const org = text(form, "org");
  const response = await callReports({
    action: "send",
    org,
    client: text(form, "client") || null,
    frequency: text(form, "frequency"),
    day: text(form, "day"),
    subject: text(form, "subject"),
    message: String(form.get("message") ?? ""),
    to,
    cc,
    bcc,
  });
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string };
    return failed(PROBLEMS[error ?? ""] ?? SOMETHING_FAILED);
  }
  revalidatePath(`/reports/${org}`);
  return { problem: null, saved: Date.now() };
}

export async function saveSchedule(_previous: FormState, form: FormData): Promise<FormState> {
  const org = text(form, "org");
  const frequency = text(form, "frequency");
  const sendAt = text(form, "sendAt");
  const recipients = addresses(form, "to");
  const cc = addresses(form, "cc");
  const bcc = addresses(form, "bcc");

  if (!isReportFrequency(frequency)) return failed("Choose how often it sends.");
  if (!TIME.test(sendAt)) return failed("Choose a time to send it.");
  if (recipients.length === 0) return failed("Add at least one address in To.");
  const everyone = [...recipients, ...cc, ...bcc];
  if (everyone.length > MOST_RECIPIENTS) return failed("That's more than 50 addresses. Use a mailing list instead.");
  if (!everyone.every((address) => EMAIL.test(address))) return failed("One of those email addresses doesn't look right. It's shown in red.");

  const supabase = await supabaseServer();
  const { error } = await supabase.from("report_schedules").insert({
    org_id: org,
    client_id: text(form, "client") || null,
    name: `${text(form, "scope")}: ${frequencyLabel(frequency).toLowerCase()} report`,
    frequency,
    send_at: sendAt,
    recipients,
    cc,
    bcc,
    message: String(form.get("message") ?? "").slice(0, 4000),
  });
  if (error) return failed(error.code === "42501" ? PROBLEMS["not-allowed"] ?? SOMETHING_FAILED : SOMETHING_FAILED);

  revalidatePath(`/reports/${org}`);
  return { problem: null, saved: Date.now() };
}

export async function setScheduleActive(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.from("report_schedules").update({ is_active: text(form, "active") === "true" }).eq("id", text(form, "id"));
  revalidatePath("/reports", "layout");
}

export async function deleteSchedule(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.from("report_schedules").delete().eq("id", text(form, "id"));
  revalidatePath("/reports", "layout");
}
