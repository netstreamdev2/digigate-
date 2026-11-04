"use server";

import { createHash, pbkdf2Sync, randomBytes, randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import QRCode from "qrcode";

import { accessPointColumns, accessPointProblem, parseLocation, readAccessPoint, type AccessPointDraft } from "@/lib/access-points";
import type { FormState } from "@/lib/form-state";
import { anyColumnLike, likePattern } from "@/lib/paging";
import { findPlaces, type PlaceChoice } from "@/lib/places";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export type PairingState = { problem: string | null; code: string | null; qr: string | null; expiresAt: string | null; createdAt: string | null };

export type PairingLevel = "company" | "site";
export type PairingOption = { id: string; name: string };
export type PairingChoices = { options: PairingOption[]; total: number; problem: string | null };
export type SiteReadiness = { posts: number; staff: number };
/** A gate staff form's answer: `added` names who was just added, so the form can say so and take the next one. */
export type GateStaffState = FormState & { added: string | null };
export type SiteChoice = { id: string; orgId: string; name: string; detail: string };

// Same record the gate app verifies: see apps/gate/src/auth/pin.ts and scripts/hash-pin.mjs.
const PIN_ITERATIONS = 20_000;
const PIN_KEY_BYTES = 32;
const PAIRING_CODE_DIGITS = 10;
const PAIRING_LIFETIME_MS = 10 * 60_000;
const PAIRING_CHOICES_SHOWN = 6;
const SITE_CHOICES_SHOWN = 8;

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
  revalidatePath("/admin", "layout");
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

// Adding a company or site goes straight into it, so the next step is right there. Row security doesn't let an
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

type SiteInput = {
  orgId: string;
  /** Set only to finish a place that has a name but no site yet. */
  placeId: string | null;
  site: { name: string; siteType: string; code: string; address: string; location: string; radiusM: number; openParking: boolean; parkingSpaces: string };
  accessPoints: readonly AccessPointDraft[];
};

/**
 * The site wizard's one save: the site and every access point together, checked here again whatever the browser sent.
 * Goes straight to the site's gate staff, the next thing to set up.
 */
export async function createSite(input: SiteInput): Promise<{ problem: string }> {
  const { site } = input;
  const name = site.name.trim();
  const code = site.code.trim().toUpperCase();
  const location = parseLocation(site.location);
  const spaces = Number(site.parkingSpaces);
  if (!name) return { problem: "Give the site a name." };
  if (code && !/^[A-Z0-9]{2,8}$/.test(code)) return { problem: "The site code is 2 to 8 letters or numbers, like DCH." };
  if (location === "invalid") return { problem: "Paste the site's latitude and longitude, like -29.8587, 31.0218." };
  if (!site.openParking && !(Number.isInteger(spaces) && spaces >= 1)) return { problem: "Say how many parking spaces the site has." };

  const points = input.accessPoints.map(readAccessPoint);
  if (points.length === 0 || points.some((point) => point === null)) return { problem: "Add at least one access point." };
  for (const [index, point] of points.entries()) {
    const issue = point ? accessPointProblem(point) : "It's missing.";
    if (issue) return { problem: `Access point ${index + 1}: ${issue}` };
  }

  const supabase = await supabaseServer();
  const { data: siteId, error } = await supabase.rpc("create_site", {
    _org: input.orgId,
    ...(input.placeId ? { _client: input.placeId } : {}),
    _site: {
      name,
      siteType: site.siteType === "estate" ? "estate" : "hospital",
      code,
      address: site.address.trim().slice(0, 300),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      radiusM: location ? site.radiusM : null,
      openParking: site.openParking,
      parkingSpaces: site.openParking ? null : spaces,
    },
    _access_points: points.flatMap((point) => {
      if (!point) return [];
      const columns = accessPointColumns(point);
      return [{
        label: columns.label,
        gateType: columns.gate_type,
        lanes: columns.lanes,
        booms: columns.booms,
        manned: columns.manned,
        cctvCameras: columns.cctv_cameras,
        anpr: columns.anpr,
        latitude: columns.latitude,
        longitude: columns.longitude,
        radiusM: columns.radius_m,
      }];
    }),
  });
  if (error || !siteId) {
    if (error?.code === "23505") return { problem: "That site code is already used by another site in this company." };
    if (error?.code === "23514" && error.message.includes("set up already")) return { problem: "This site is set up already. Find it in the company's list of sites." };
    return { problem: problemFor(error ?? {}).problem ?? "That didn't save. Try again." };
  }
  revalidatePath("/setup", "layout");
  redirect(`/setup/${input.orgId}/${siteId}?tab=staff&added=1`);
}

/** One access point, from the popup on the site page. Its code is made from its name, unique within the site. */
export async function addAccessPoint(_previous: FormState, form: FormData): Promise<FormState> {
  const draft = readAccessPoint(JSON.parse(text(form, "accessPoint") || "null"));
  if (!draft) return { problem: "That didn't save. Try again.", saved: 0 };
  const issue = accessPointProblem(draft);
  if (issue) return { problem: issue, saved: 0 };
  const siteId = text(form, "siteId");
  const supabase = await supabaseServer();
  const { data: code, error: codeError } = await supabase.rpc("post_code_for", { _site: siteId, _label: draft.label });
  if (codeError || !code) return problemFor(codeError ?? {});
  const { error } = await supabase.from("posts").insert({ org_id: text(form, "orgId"), site_id: siteId, code, ...accessPointColumns(draft) });
  return error ? problemFor(error) : saved();
}

/** Everything about an access point but its code, which handhelds already know it by. */
export async function updateAccessPoint(_previous: FormState, form: FormData): Promise<FormState> {
  const draft = readAccessPoint(JSON.parse(text(form, "accessPoint") || "null"));
  if (!draft) return { problem: "That didn't save. Try again.", saved: 0 };
  const issue = accessPointProblem(draft);
  if (issue) return { problem: issue, saved: 0 };
  const supabase = await supabaseServer();
  const { error } = await supabase.from("posts").update(accessPointColumns(draft)).eq("id", text(form, "id"));
  return error ? problemFor(error) : saved();
}

/**
 * A guard or supervisor, at one site. The form stays open after each one, so a whole shift can be added in one go, and
 * the answer names who was added so the PIN can be handed over.
 */
export async function addGateUser(_previous: GateStaffState, form: FormData): Promise<GateStaffState> {
  const employeeNumber = text(form, "employeeNumber");
  const pin = text(form, "pin");
  const firstName = text(form, "firstName");
  const lastName = text(form, "lastName");
  const siteId = text(form, "siteId");
  const role = text(form, "role") === "supervisor" ? "supervisor" : "guard";
  const refused = (problem: string): GateStaffState => ({ problem, saved: 0, added: null });
  if (!siteId) return refused("Choose the site they work at.");
  if (!firstName || !lastName) return refused("Enter their first name and surname.");
  if (!/^\d{3,8}$/.test(employeeNumber)) return refused("Employee numbers are 3 to 8 digits.");
  if (!/^\d{6}$/.test(pin)) return refused("The PIN must be 6 digits. Tap Make a PIN for one.");
  const supabase = await supabaseServer();
  const { error } = await supabase.from("gate_users").insert({
    org_id: text(form, "orgId"),
    site_ids: [siteId],
    employee_number: employeeNumber,
    first_name: firstName,
    last_name: lastName,
    role,
    pin: hashPin(pin),
  });
  if (error) {
    return refused(error.code === "23505" ? `Employee number ${employeeNumber} is already used in this company. Find them under People.` : (problemFor(error).problem ?? "That didn't save."));
  }
  revalidatePath("/setup", "layout");
  revalidatePath("/people");
  return { problem: null, saved: Date.now(), added: `${firstName} ${lastName}` };
}

const PLACE_SEARCH_MIN = 3;

/** Addresses for the site wizard, as they're typed. Signed-in administrators only, so it can't be used as an open relay. */
export async function placeChoices(search: string): Promise<{ places: PlaceChoice[]; problem: string | null }> {
  const user = await currentUser();
  if (!user || (!user.roles.includes("super_user") && !user.roles.includes("admin"))) return { places: [], problem: "Your account can't do that." };
  const term = search.trim().slice(0, 120);
  if (term.length < PLACE_SEARCH_MIN) return { places: [], problem: null };
  try {
    return { places: await findPlaces(term), problem: null };
  } catch {
    return { places: [], problem: "The address search isn't answering. Type the address yourself, or try again in a moment." };
  }
}

/** Sites to add gate staff to, searched by name or code. Row security decides which come back. */
export async function siteChoices(search: string): Promise<{ sites: SiteChoice[]; problem: string | null }> {
  const supabase = await supabaseServer();
  let list = supabase.from("sites").select("id, org_id, name, code, organisations(name)").eq("is_active", true).order("name").limit(SITE_CHOICES_SHOWN);
  if (search.trim()) list = list.or(anyColumnLike(["name", "code"], search.trim()));
  const { data, error } = await list;
  if (error) return { sites: [], problem: "That didn't load. Try again." };
  return {
    problem: null,
    sites: data.map((site) => ({
      id: site.id,
      orgId: site.org_id,
      name: [site.name, site.code].filter(Boolean).join(" · "),
      detail: site.organisations?.name ?? "",
    })),
  };
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
  return supabase.from("sites").select(columns, count).eq("org_id", parentId).eq("is_active", true).ilike("name", pattern).order("name").limit(PAIRING_CHOICES_SHOWN);
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
