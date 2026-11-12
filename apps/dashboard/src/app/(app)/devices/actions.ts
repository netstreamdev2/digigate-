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
  // Anything left blank is cleared: the function treats a missing value as none.
  const { error } = await supabase.rpc("set_device_plan", {
    _device: id,
    _sim_number: simNumber ?? undefined,
    _bundle_mb: bundleMb ?? undefined,
    _renews_day: renewsDay ?? undefined,
  });
  if (error) return { problem: error.code === "42501" ? "Only a super user can set a SIM and bundle." : SOMETHING_FAILED, saved: 0 };
  revalidatePath("/devices", "layout");
  return { problem: null, saved: Date.now() };
}

const commandProblem = (code: string | undefined) => (code === "42501" ? "Only a super user can do that to a handheld." : SOMETHING_FAILED);

/** A super user locks a handheld, or restarts it. It does so itself at its next sync, within a minute when it's online. */
export async function requestLock(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_device_command", { _device: text(form, "id"), _kind: "lock" });
  if (error) throw new Error(commandProblem(error.code));
  revalidatePath("/devices", "layout");
}

export async function requestRestart(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_device_command", { _device: text(form, "id"), _kind: "restart" });
  if (error) throw new Error(commandProblem(error.code));
  revalidatePath("/devices", "layout");
}

/**
 * A super user sends a handheld a newer DigiGate: the APK's download link (an EAS build's), its version code, and
 * optionally its SHA-256. The handheld installs it itself when nobody is mid-check, and refuses anything that isn't a
 * newer DigiGate signed by us.
 */
export async function requestAppUpdate(_previous: FormState, form: FormData): Promise<FormState> {
  const url = text(form, "url");
  if (!/^https:\/\/\S+\.\S+$/.test(url)) return { problem: "Paste the APK's download link. It starts with https://.", saved: 0 };
  const versionCode = Number(text(form, "versionCode"));
  if (!Number.isInteger(versionCode) || versionCode < 1) return { problem: "The version code is a whole number, shown on the build's page.", saved: 0 };
  const sha256 = text(form, "sha256").toLowerCase();
  if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) return { problem: "The SHA-256 is 64 letters and numbers. Leave it blank if you don't have it.", saved: 0 };

  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_device_command", {
    _device: text(form, "id"),
    _kind: "update_app",
    _payload: { url, version_code: versionCode, ...(sha256 ? { sha256 } : {}) },
  });
  if (error) return { problem: commandProblem(error.code), saved: 0 };
  revalidatePath("/devices", "layout");
  return { problem: null, saved: Date.now() };
}

/** A super user hands a handheld back as an ordinary Android device; it does so itself at its next sync. */
export async function requestRelease(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc("request_device_release", { _device: text(form, "id") });
  if (error) throw new Error(error.code === "42501" ? "Only a super user can release a handheld." : SOMETHING_FAILED);
  revalidatePath("/devices", "layout");
}
