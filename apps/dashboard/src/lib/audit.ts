import "server-only";

import { plainLabel, ruleTitle } from "@digigate/core";

import type { IconName } from "@/components/icon";

import { anyColumnLike, rangeOf } from "./paging";
import { counted, must } from "./reads";
import { supabaseServer } from "./supabase/server";

export const AUDIT_CATEGORIES = ["access", "people", "setup", "devices", "alerts", "reports", "gate"] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export const CATEGORY_LOOK: Record<AuditCategory, { label: string; icon: IconName; tint: string }> = {
  access: { label: "Sign-ins", icon: "lock", tint: "bg-tile-sky" },
  people: { label: "People", icon: "users", tint: "bg-tile-lilac" },
  setup: { label: "Setup", icon: "sites", tint: "bg-tile-mint" },
  devices: { label: "Devices", icon: "device", tint: "bg-tile-sky" },
  alerts: { label: "Alerts", icon: "alerts", tint: "bg-warning-soft" },
  reports: { label: "Reports", icon: "reports", tint: "bg-tile-butter" },
  gate: { label: "At the gate", icon: "guard", tint: "bg-tile-mint" },
};

export const asAuditCategory = (value: string): AuditCategory | null => AUDIT_CATEGORIES.find((category) => category === value) ?? null;

/** What each logged action says, reading on from the name of whoever did it. */
const WORDS: Readonly<Record<string, string>> = {
  "dashboard.signed_in": "signed in to the dashboard",
  "person.added": "added the dashboard login for",
  "person.deactivated": "deactivated",
  "person.reactivated": "reactivated",
  "person.password_reset": "reset the password of",
  "person.password_changed": "changed their password",
  "company.added": "added the company",
  "company.changed": "changed the company",
  "company.deactivated": "deactivated the company",
  "company.reactivated": "reactivated the company",
  "client.added": "added the site",
  "client.changed": "changed the site",
  "client.moved": "moved the site to another company:",
  "site.added": "added the site",
  "site.changed": "changed the site",
  "post.added": "added the access point",
  "post.changed": "changed the access point",
  "post.deactivated": "deactivated the access point",
  "post.reactivated": "reactivated the access point",
  "gate_user.added": "added the gate staff member",
  "gate_user.changed": "changed the gate staff member",
  "gate_user.deactivated": "deactivated the gate staff member",
  "gate_user.reactivated": "reactivated the gate staff member",
  "gate_user.record_viewed": "opened the personal record of",
  "gate_user.record_changed": "changed the personal record of",
  "gate_user.id_viewed": "looked at the ID number of",
  "gate_user.photo_changed": "changed the employee photo of",
  "pairing_code.added": "issued a pairing code for",
  "device.added": "paired the device",
  "device.changed": "renamed the device",
  "device.revoked": "revoked the device",
  "alert.closed": "closed the alert",
  "schedule.added": "automated",
  "schedule.changed": "changed the automated report",
  "schedule.deactivated": "paused",
  "schedule.reactivated": "resumed",
  "schedule.deleted": "deleted the automated report",
  "report.sent": "emailed",
  "report.failed": "could not email",
  "gate.sign_in": "signed in at",
  "gate.sign_in_failed": "failed to sign in at",
  "gate.locked_out": "was locked out at",
  "gate.sign_out": "signed out at",
  "gate.shift_start": "went on duty at",
  "gate.shift_end": "came off duty at",
  "gate.override": "overrode a block at",
  "gate.turned_away": "turned someone away at",
  "gate.alert_ack": "let someone through after a warning at",
  "gate.left_post": "left their post with",
  "gate.returned_to_post": "came back to their post with",
  "gate.stepping_away": "said they were stepping away from",
  "shift.selfie_viewed": "looked at the shift photo of",
  "check.licence_photo_viewed": "looked at the licence photo of",
};

export type AuditEntry = {
  id: string;
  at: string;
  category: AuditCategory;
  actor: string;
  words: string;
  target: string | null;
  detail: string | null;
  company: string | null;
};

export type AuditFilter = { search: string; category: AuditCategory | null; company: string; from: string; to: string };

function detailOf(action: string, detail: string | null): string | null {
  if (!detail) return null;
  if (action === "gate.override" || action === "gate.turned_away" || action === "gate.alert_ack") return detail.split(", ").map(ruleTitle).join(", ");
  if (action.startsWith("gate.shift") || action.endsWith("_post")) return detail.split(" · ").map(plainLabel).join(" · ");
  if (action === "gate.stepping_away") return detail.split(" · ").map((part, index) => (index === 0 ? plainLabel(part) : part)).join(" · ");
  if (action.endsWith(".changed")) return `Changed: ${detail.split(", ").map(plainLabel).join(", ")}`;
  return action === "person.added" ? plainLabel(detail) : detail;
}

/** One page of the log, newest first, and how many entries match. */
export async function auditEntries(filter: AuditFilter, page: number): Promise<{ entries: AuditEntry[]; total: number }> {
  const supabase = await supabaseServer();
  const [from, to] = rangeOf(page);

  // An exact count across years of log would be slow, so large results use the planner's estimate.
  let list = supabase
    .from("audit_log")
    .select("id, at, org_id, category, action, actor_name, target, detail", { count: "estimated" })
    .gte("at", filter.from)
    .lt("at", filter.to)
    .order("at", { ascending: false })
    .range(from, to);
  if (filter.category) list = list.eq("category", filter.category);
  if (filter.company) list = list.eq("org_id", filter.company);
  if (filter.search) list = list.or(anyColumnLike(["actor_name", "target", "detail"], filter.search));

  const result = await list;
  const rows = must(result);
  const orgIds = [...new Set(rows.flatMap((row) => (row.org_id ? [row.org_id] : [])))];
  const companies = orgIds.length ? must(await supabase.from("organisations").select("id, name").in("id", orgIds)) : [];

  return {
    total: counted(result),
    entries: rows.flatMap((row) => {
      const category = asAuditCategory(row.category);
      if (!category) return [];
      const actor = row.actor_name ?? (row.action === "device.added" ? "A handheld" : "DigiGate");
      return [
        {
          id: row.id,
          at: row.at,
          category,
          actor,
          words: WORDS[row.action] ?? plainLabel(row.action),
          target: row.action === "alert.closed" && row.target ? ruleTitle(row.target) : row.target,
          detail: detailOf(row.action, row.detail),
          company: companies.find((company) => company.id === row.org_id)?.name ?? null,
        },
      ];
    }),
  };
}

/** How many entries each category holds across the date range and company, for the tabs. */
export async function auditCounts(filter: Pick<AuditFilter, "company" | "from" | "to">): Promise<Partial<Record<AuditCategory, number>>> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.rpc("audit_summary", { _from: filter.from, _to: filter.to, ...(filter.company ? { _org: filter.company } : {}) }));
  const counts: Partial<Record<AuditCategory, number>> = {};
  for (const row of rows) {
    const category = asAuditCategory(row.category);
    if (category) counts[category] = row.entries;
  }
  return counts;
}
