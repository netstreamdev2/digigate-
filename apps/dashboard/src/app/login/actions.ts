"use server";

import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { logoUrlOf } from "@/lib/company-brand";
import { callPeople } from "@/lib/people-api";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { problem: string | null };

export type EnrolState = FormState & { factorId: string | null; qr: string | null; secret: string | null };

/** A company to pick, when one username and password open accounts at more than one. */
export type SignInChoice = { code: string; company: string; logoUrl: string | null; color: string | null };

export type SignInState = FormState & { choices: SignInChoice[] | null };

// Supabase accounts always have an email. A username is an account on this private domain. Behind the scenes it
// belongs to a company (lucy at Fire Security is lucy@fire.digigate.local, so Lion Security can have a lucy too), but
// people only ever type and see "lucy": digigate-signin finds the account the password opens. Super users have plain
// accounts on the domain itself, and a real email address signs in as it is.
const USERNAME_DOMAIN = "digigate.local";
// What the authenticator app lists the code under, like "Google: name@gmail.com".
const AUTHENTICATOR_ISSUER = "DigiGate";
const NO_MATCH = "That username or email and password don't match.";

/** Straight to Supabase for a real email, or for name@code typed out in full. */
function accountEmail(login: string): string {
  const [local = "", domain = ""] = login.split("@");
  return domain.includes(".") ? login : `${local}@${domain}.${USERNAME_DOMAIN}`;
}

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const login = String(form.get("login") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const company = String(form.get("company") ?? "");
  const supabase = await supabaseServer();

  if (login.includes("@")) {
    const { error } = await supabase.auth.signInWithPassword({ email: accountEmail(login), password });
    if (error) return { problem: NO_MATCH, choices: null };
    // In through the front door: the page guard sends them to the code screen first if MFA is switched on.
    redirect("/");
  }

  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/functions/v1/digigate-signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: login, password, ...(company ? { company } : {}) }),
  }).catch(() => null);
  if (!response) return { problem: "DigiGate couldn't be reached. Check your connection and try again.", choices: null };
  if (response.status === 429) return { problem: "Too many tries. Wait a minute, then try again.", choices: null };
  const body: unknown = await response.json().catch(() => null);
  const result = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  if (Array.isArray(result.choices)) {
    const choices = result.choices.flatMap((choice: unknown): SignInChoice[] => {
      const row = typeof choice === "object" && choice !== null ? (choice as Record<string, unknown>) : {};
      return typeof row.code === "string" && typeof row.company === "string"
        ? [{ code: row.code, company: row.company, logoUrl: logoUrlOf(typeof row.logoPath === "string" ? row.logoPath : null), color: typeof row.color === "string" ? row.color : null }]
        : [];
    });
    return { problem: null, choices };
  }

  const session = typeof result.session === "object" && result.session !== null ? (result.session as Record<string, unknown>) : null;
  if (!session || typeof session.accessToken !== "string" || typeof session.refreshToken !== "string") {
    return { problem: response.status === 401 ? NO_MATCH : "That didn't work. Try again.", choices: null };
  }
  const { error } = await supabase.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
  if (error) return { problem: "That didn't work. Try again.", choices: null };
  redirect("/");
}

/** The name a person signs in with: just their username, never the company code behind it, or their real email. */
function loginName(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return domain === USERNAME_DOMAIN || domain.endsWith(`.${USERNAME_DOMAIN}`) ? local : email;
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
