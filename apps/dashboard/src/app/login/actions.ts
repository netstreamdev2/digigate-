"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { callPeople } from "@/lib/people-api";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { problem: string | null };

export type EnrolState = FormState & { factorId: string | null; qr: string | null; secret: string | null };

// Supabase accounts always have an email. A username is an account on this private domain, so signing in needs no
// lookup, and nobody can use the login to test which usernames exist.
const USERNAME_DOMAIN = "digigate.local";
// What the authenticator app lists the code under, like "Google: name@gmail.com".
const AUTHENTICATOR_ISSUER = "DigiGate";

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

/** The name a person signs in with: their username, or their email when they have a real one. */
function loginName(email: string): string {
  const suffix = `@${USERNAME_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}

/**
 * The authenticator link, made here rather than taken from Supabase, whose own names the entry after the web address
 * and the hidden username email. The secret is Supabase's, so its codes still verify.
 */
function authenticatorLink(account: string, secret: string): string {
  const label = `${encodeURIComponent(AUTHENTICATOR_ISSUER)}:${encodeURIComponent(account)}`;
  const options = new URLSearchParams({ secret, issuer: AUTHENTICATOR_ISSUER, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${options.toString()}`;
}

/** Starts setting up an authenticator app, clearing any attempt that was never finished. */
export async function startEnrolment(_previous: EnrolState): Promise<EnrolState> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { problem: "Your session has ended. Sign in again.", factorId: null, qr: null, secret: null };
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: AUTHENTICATOR_ISSUER, issuer: AUTHENTICATOR_ISSUER });
  if (error) return { problem: "Couldn't start the setup. Try again.", factorId: null, qr: null, secret: null };
  const qr = await QRCode.toDataURL(authenticatorLink(loginName(user.email), data.totp.secret), { margin: 1, width: 240 });
  return { problem: null, factorId: data.id, qr, secret: data.totp.secret };
}

export async function confirmCode(_previous: FormState, form: FormData): Promise<FormState> {
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: String(form.get("factorId") ?? ""),
    code: String(form.get("code") ?? ""),
  });
  if (error) return { problem: "That code didn't work. Check the app and enter the current one." };
  await supabase.rpc("note_sign_in");
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
