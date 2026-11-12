import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

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
  host: "Host (invites visitors)",
  supervisor: "Supervisor",
  client_viewer: "Site viewer",
};

export const roleName = (role: string) => ROLE_LABELS[role] ?? role;

export const roleLabel = (user: CurrentUser) => roleName(user.roles[0] ?? "");

/**
 * Who is signed in. Null when they have an account but no dashboard profile yet. Read once per request, however many
 * parts of the page ask: the sidebar and the page both need it.
 */
export const currentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A read that failed must not look like an account with no profile: that sends a working user to the wrong message.
  const { data: profile, error } = await supabase.from("profiles").select("full_name, roles, org_id, is_active").eq("id", user.id).maybeSingle();
  if (error) throw new Error("The signed-in profile couldn't be read.");
  if (!profile?.is_active) return null;
  return { id: user.id, fullName: profile.full_name, roles: profile.roles, orgId: profile.org_id };
});
