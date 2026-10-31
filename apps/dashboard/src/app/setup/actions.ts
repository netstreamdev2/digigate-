"use server";

import { createHash, pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";

import type { FormState } from "@/lib/form-state";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export type PairingState = { problem: string | null; code: string | null; qr: string | null; expiresAt: string | null };

// Same record the gate app verifies: see apps/gate/src/auth/pin.ts and scripts/hash-pin.mjs.
const PIN_ITERATIONS = 20_000;
const PIN_KEY_BYTES = 32;
const PAIRING_CODE_DIGITS = 10;
const PAIRING_LIFETIME_MS = 10 * 60_000;

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

export async function addOrganisation(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { problem: "Enter the security company's name.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("organisations").insert({ name, slug: slugOf(name) });
  return error ? problemFor(error) : saved();
}

export async function addClient(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { problem: "Enter the client's name.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("clients").insert({ org_id: text(form, "orgId"), name });
  return error ? problemFor(error) : saved();
}

export async function addSite(_previous: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (!name) return { problem: "Enter the site's name.", saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase
    .from("sites")
    .insert({ org_id: text(form, "orgId"), client_id: text(form, "clientId"), name, site_type: text(form, "siteType") });
  return error ? problemFor(error) : saved();
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
}

/** A one-time code, shown once as a QR and as digits. Only its hash is stored. */
export async function createPairingCode(_previous: PairingState, form: FormData): Promise<PairingState> {
  const name = text(form, "name");
  const nothing = { code: null, qr: null, expiresAt: null };
  if (!name) return { problem: "Name the device first, for example Main Gate DT50.", ...nothing };

  const code = String(randomInt(0, 10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, "0");
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
  return { problem: null, code, qr: await QRCode.toDataURL(code, { margin: 1, width: 240 }), expiresAt };
}

export async function revokeDevice(form: FormData): Promise<void> {
  const user = await currentUser();
  const supabase = await supabaseServer();
  await supabase.from("devices").update({ revoked_at: new Date().toISOString(), revoked_by: user?.id ?? null }).eq("id", text(form, "id"));
  revalidatePath("/setup", "layout");
}
