import "server-only";

import { redirect } from "next/navigation";

import { supabaseServer } from "./supabase/server";

export type CurrentUser = {
  id: string;
  fullName: string;
  roles: readonly string[];
  orgId: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  super_user: "Super user",
  admin: "Administrator",
  manager: "Manager",
  control_room: "Control room",
  supervisor: "Supervisor",
  client_viewer: "Client viewer",
};

export const roleName = (role: string) => ROLE_LABELS[role] ?? role;

export const roleLabel = (user: CurrentUser) => roleName(user.roles[0] ?? "");

/** Who is signed in. Null when they have an account but no dashboard profile yet. */
export async function currentUser(): Promise<CurrentUser | null> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name, roles, org_id, is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active) return null;
  return { id: user.id, fullName: profile.full_name, roles: profile.roles, orgId: profile.org_id };
}
