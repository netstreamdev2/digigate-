"use server";

import { revalidatePath } from "next/cache";

import { callPeople } from "@/lib/people-api";
import { supabaseServer } from "@/lib/supabase/server";

export type CreateState = { problem: string | null; created: { name: string; login: string; password: string } | null };

export type ResetState = { problem: string | null; password: string | null };

const PROBLEMS: Record<string, string> = {
  name: "Enter their full name.",
  role: "Choose a role.",
  login: "Usernames are 3 to 32 letters or numbers, with no spaces. An email address also works.",
  sites: "Those sites don't belong to that company.",
  client: "Choose which client this login is for.",
  taken: "That username is already taken.",
  "needs-mfa": "Sign in again, then try this.",
  "not-allowed": "Your account can't do that.",
};

const SOMETHING_FAILED = "That didn't work. Try again.";

const MOST_OPTIONS = 500;

/** The clients and sites of one company, fetched only once that company is chosen. */
export async function companyOptions(orgId: string): Promise<{ clients: { id: string; name: string }[]; sites: { id: string; name: string }[] }> {
  const supabase = await supabaseServer();
  const [{ data: clients }, { data: sites }] = await Promise.all([
    supabase.from("clients").select("id, name").eq("org_id", orgId).order("name").limit(MOST_OPTIONS),
    supabase.from("sites").select("id, name").eq("org_id", orgId).order("name").limit(MOST_OPTIONS),
  ]);
  return { clients: clients ?? [], sites: sites ?? [] };
}

export async function createPerson(_previous: CreateState, form: FormData): Promise<CreateState> {
  const role = String(form.get("role") ?? "");
  const siteIds = form.getAll("siteIds").map(String);
  if (role !== "admin" && role !== "client_viewer" && siteIds.length === 0) {
    return { problem: "Tick at least one site for this person.", created: null };
  }

  const { data } = await callPeople({
    action: "create",
    fullName: form.get("fullName"),
    login: form.get("login"),
    role,
    orgId: form.get("orgId"),
    clientId: form.get("clientId"),
    siteIds,
  });
  if (!data.login || !data.password) return { problem: PROBLEMS[data.error ?? ""] ?? SOMETHING_FAILED, created: null };

  revalidatePath("/people");
  return { problem: null, created: { name: String(form.get("fullName") ?? ""), login: data.login, password: data.password } };
}

export async function resetPassword(_previous: ResetState, form: FormData): Promise<ResetState> {
  const { data } = await callPeople({ action: "reset-password", id: form.get("id") });
  if (!data.password) return { problem: PROBLEMS[data.error ?? ""] ?? SOMETHING_FAILED, password: null };
  return { problem: null, password: data.password };
}

export async function setPersonActive(form: FormData): Promise<void> {
  await callPeople({ action: "set-active", id: form.get("id"), active: form.get("active") === "true" });
  revalidatePath("/people");
}
