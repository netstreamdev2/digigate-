"use server";

import { createHash, pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import type { FormState } from "@/lib/form-state";
import { likePattern } from "@/lib/paging";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export type PairingState = { problem: string | null; code: string | null; qr: string | null; expiresAt: string | null; createdAt: string | null };

export type PairingLevel = "company" | "client" | "site";
export type PairingOption = { id: string; name: string };
export type PairingChoices = { options: PairingOption[]; total: number; problem: string | null };
export type SiteReadiness = { posts: number; staff: number };

// Same record the gate app verifies: see apps/gate/src/auth/pin.ts and scripts/hash-pin.mjs.
const PIN_ITERATIONS = 20_000;
const PIN_KEY_BYTES = 32;
const PAIRING_CODE_DIGITS = 10;
const PAIRING_LIFETIME_MS = 10 * 60_000;
const PAIRING_CHOICES_SHOWN = 6;
// GPS drifts by tens of metres, so a smaller fence would warn guards standing at their post.
const MIN_FENCE_METRES = 30;
const MAX_FENCE_METRES = 1000;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** What went wrong, in plain words. Database messages can carry values, so they never reach the screen. */
function problemFor(error: { code?: string }): FormState {
  if (error.code === "23505") return { problem: "That one already exists.", saved: 0 };
  if (error.code === "42501") return { problem: "Your account can't do that.", saved: 0 };
  return { problem: "That didn't save. Try again.", saved: 0 };
}

function saved(): FormState {
  revalidatePath("/setup", "layout");
  return { problem: null, saved: Date.now() };
}

function hashPin(pin: string) {
  const salt = randomBytes(16);
  return {
    algorithm: "pbkdf2-sha256",
    iterations: PIN_ITERATIONS,
    salt: salt.toString("base64"),
    hash: pbkdf2Sync(pin, salt, PIN_ITERATIONS, PIN_KEY_BYTES, "sha256").toString("base64"),
  };
}

// Adding a company, client or site goes straight into it, so the next step is right there. Row security doesn't let an
// insert hand back a site it has only just made, so each is found again by what makes it unique, newest first.

export async function addOrganisation(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { problem: "Enter the security company's name.", saved: 0 };
  const slug = slugOf(name);
  const supabase = await supabaseServer();
  const { error } = await supabase.from("organisations").insert({ name, slug });
  if (error) return problemFor(error);
  const { data: added } = await supabase.from("organisations").select("id").eq("slug", slug).maybeSingle();
  revalidatePath("/setup", "layout");
  redirect(added ? `/setup/${added.id}?added=1` : "/setup");
}

export async function addClient(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const orgId = text(form, "orgId");
  if (!name) return { problem: "Enter the client's name.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("clients").insert({ org_id: orgId, name });
  if (error) return problemFor(error);
  const { data: added } = await supabase.from("clients").select("id").eq("org_id", orgId).eq("name", name).order("created_at", { ascending: false }).limit(1).maybeSingle();
  revalidatePath("/setup", "layout");
  redirect(added ? `/setup/${orgId}/${added.id}?added=1` : `/setup/${orgId}`);
}

export async function addSite(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const orgId = text(form, "orgId");
  const clientId = text(form, "clientId");
  if (!name) return { problem: "Enter the site's name.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("sites").insert({ org_id: orgId, client_id: clientId, name, site_type: text(form, "siteType") });
  if (error) return problemFor(error);
  const { data: added } = await supabase.from("sites").select("id").eq("client_id", clientId).eq("name", name).order("created_at", { ascending: false }).limit(1).maybeSingle();
  revalidatePath("/setup", "layout");
  redirect(added ? `/setup/${orgId}/${clientId}/${added.id}?added=1` : `/setup/${orgId}/${clientId}`);
}

export async function addPost(_previous: FormState, form: FormData): Promise<FormState> {
  const label = text(form, "label");
  const lanes = form.getAll("lanes").map(String);
  if (!label) return { problem: "Enter the post's name.", saved: 0 };
  if (lanes.length === 0) return { problem: "Choose cars, people on foot, or both.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("posts")
    .insert({ org_id: text(form, "orgId"), site_id: text(form, "siteId"), code: slugOf(label), label, lanes });
  return error ? problemFor(error) : saved();
}

/** Accepts what Google Maps copies, such as -33.9249, 18.4241. Empty clears the location, which turns the geofence off. */
export async function setPostLocation(_previous: FormState, form: FormData): Promise<FormState> {
  const location = text(form, "location");
  const radius = Number(text(form, "radius"));
  const [latitude, longitude, ...rest] = location.split(/[\s,]+/).filter(Boolean).map(Number);
  if (location) {
    const valid = rest.length === 0 && latitude !== undefined && longitude !== undefined && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
    if (!valid) return { problem: "Paste the latitude and longitude, like -33.9249, 18.4241.", saved: 0 };
  }
  if (!Number.isInteger(radius) || radius < MIN_FENCE_METRES || radius > MAX_FENCE_METRES) {
    return { problem: `The distance must be between ${MIN_FENCE_METRES} and ${MAX_FENCE_METRES} metres.`, saved: 0 };
  }
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("posts")
    .update({ latitude: location ? latitude : null, longitude: location ? longitude : null, radius_m: radius })
    .eq("id", text(form, "id"));
  return error ? problemFor(error) : saved();
}

export async function addGateUser(_previous: FormState, form: FormData): Promise<FormState> {
  const employeeNumber = text(form, "employeeNumber");
  const pin = text(form, "pin");
  const firstName = text(form, "firstName");
  const lastName = text(form, "lastName");
  if (!firstName || !lastName) return { problem: "Enter their first name and surname.", saved: 0 };
  if (!/^\d{3,8}$/.test(employeeNumber)) return { problem: "Employee numbers are 3 to 8 digits.", saved: 0 };
  if (!/^\d{6}$/.test(pin)) return { problem: "The PIN must be 6 digits.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("gate_users").insert({
    org_id: text(form, "orgId"),
    site_ids: [text(form, "siteId")],
    employee_number: employeeNumber,
    first_name: firstName,
    last_name: lastName,
    role: text(form, "role"),
    pin: hashPin(pin),
  });
  return error ? problemFor(error) : saved();
}

export async function setGateUserActive(form: FormData): Promise<void> {
  const supabase = await supabaseServer();
  await supabase.from("gate_users").update({ is_active: text(form, "active") === "true" }).eq("id", text(form, "id"));
  revalidatePath("/setup", "layout");
  revalidatePath("/people");
}

function pairingRows(level: PairingLevel, parentId: string, pattern: string, supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const columns = "id, name";
  const count = { count: "exact" } as const;
  if (level === "company") return supabase.from("organisations").select(columns, count).eq("is_active", true).ilike("name", pattern).order("name").limit(PAIRING_CHOICES_SHOWN);
  if (level === "client") return supabase.from("clients").select(columns, count).eq("org_id", parentId).eq("is_active", true).ilike("name", pattern).order("name").limit(PAIRING_CHOICES_SHOWN);
  return supabase.from("sites").select(columns, count).eq("client_id", parentId).eq("is_active", true).ilike("name", pattern).order("name").limit(PAIRING_CHOICES_SHOWN);
}

/** One step of the pairing walk-through: a short list to pick from, searched on the server. Row security decides what's in it. */
export async function pairingChoices(level: PairingLevel, parentId: string, search: string): Promise<PairingChoices> {
  const supabase = await supabaseServer();
  const { data, count, error } = await pairingRows(level, parentId, search ? likePattern(search) : "%", supabase);
  if (error) return { options: [], total: 0, problem: "That didn't load. Try again." };
  return { options: data ?? [], total: count ?? 0, problem: null };
}

/** What the site still needs before a paired handheld is any use. */
export async function siteReadiness(siteId: string): Promise<SiteReadiness | null> {
  const supabase = await supabaseServer();
  const [posts, staff] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("is_active", true),
    supabase.from("gate_users").select("id", { count: "exact", head: true }).contains("site_ids", [siteId]).eq("is_active", true),
  ]);
  return posts.error || staff.error ? null : { posts: posts.count ?? 0, staff: staff.count ?? 0 };
}

/** Whether the handheld has used its code: pairing creates the device, under the name given here. */
export async function deviceWasPaired(siteId: string, name: string, since: string): Promise<boolean> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("devices").select("id").eq("site_id", siteId).eq("name", name).gte("paired_at", since).limit(1);
  return !error && data.length > 0;
}

/** A one-time code, shown once as a QR and as digits. Only its hash is stored. */
export async function createPairingCode(_previous: PairingState, form: FormData): Promise<PairingState> {
  const name = text(form, "name");
  const nothing = { code: null, qr: null, expiresAt: null, createdAt: null };
  if (!name) return { problem: "Name the device first, for example Main Gate DT50.", ...nothing };

  const code = String(randomInt(0, 10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, "0");
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + PAIRING_LIFETIME_MS).toISOString();
  const supabase = await supabaseServer();
  const { error } = await supabase.from("pairing_codes").insert({
    org_id: text(form, "orgId"),
    site_id: text(form, "siteId"),
    device_name: name,
    code_hash: createHash("sha256").update(code).digest("hex"),
    expires_at: expiresAt,
  });
  if (error) return { problem: problemFor(error).problem, ...nothing };
  return { problem: null, code, qr: await QRCode.toDataURL(code, { margin: 1, width: 240 }), expiresAt, createdAt };
}

export async function revokeDevice(form: FormData): Promise<void> {
  const user = await currentUser();
  const supabase = await supabaseServer();
  await supabase.from("devices").update({ revoked_at: new Date().toISOString(), revoked_by: user?.id ?? null }).eq("id", text(form, "id"));
  revalidatePath("/setup", "layout");
  revalidatePath("/devices");
}
