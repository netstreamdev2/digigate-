"use server";

import { redirect } from "next/navigation";

import { callPeople } from "@/lib/people-api";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { problem: string | null };

export type EnrolState = FormState & { factorId: string | null; qr: string | null; secret: string | null };

// Supabase accounts always have an email. A username is an account on this private domain, so signing in needs no
// lookup, and nobody can use the login to test which usernames exist.
const USERNAME_DOMAIN = "digigate.local";

function accountEmail(login: string): string {
  const name = login.trim().toLowerCase();
  return name.includes("@") ? name : `${name}@${USERNAME_DOMAIN}`;
}

export async function signIn(_previous: FormState, form: FormData): Promise<FormState> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: accountEmail(String(form.get("login") ?? "")),
    password: String(form.get("password") ?? ""),
  });
  if (error) return { problem: "That username or email and password don't match." };
  redirect("/mfa");
}

/** Starts setting up an authenticator app, clearing any attempt that was never finished. */
export async function startEnrolment(_previous: EnrolState): Promise<EnrolState> {
  const supabase = await supabaseServer();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "DigiGate" });
  if (error) return { problem: "Couldn't start the setup. Try again.", factorId: null, qr: null, secret: null };
  // Supabase sends the QR as raw SVG text; encoded, it's safe to use as an image source.
  const svg = data.totp.qr_code.slice(data.totp.qr_code.indexOf(",") + 1);
  const qr = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  return { problem: null, factorId: data.id, qr, secret: data.totp.secret };
}

export async function confirmCode(_previous: FormState, form: FormData): Promise<FormState> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: String(form.get("factorId") ?? ""),
    code: String(form.get("code") ?? ""),
  });
  if (error) return { problem: "That code didn't work. Check the app and enter the current one." };
  redirect("/setup");
}

/** Replaces a temporary password. The flag is cleared only after the new password has saved. */
export async function changePassword(_previous: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 12) return { problem: "Use at least 12 characters." };
  if (password !== form.get("confirm")) return { problem: "Those two passwords don't match." };

  const supabase = await supabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { problem: "That password can't be used. Try a different one." };

  const { status } = await callPeople({ action: "password-changed" });
  if (status !== 200) return { problem: "Your password saved, but something else failed. Try again." };
  redirect("/setup");
}

export async function signOut(): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
