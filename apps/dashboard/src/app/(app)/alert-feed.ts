"use server";

import { ruleTitle } from "@digigate/core";

import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

export type FeedAlert = {
  id: string;
  title: string;
  severity: "red" | "amber";
  site: string;
  siteId: string;
  at: string;
  /** Found by the server re-checking, after the gate had decided. */
  foundAfter: boolean;
};

/** Long enough to cover a slow poll or a laptop waking up, short enough that old news never pops up. */
const WINDOW_MS = 15 * 60_000;
const MOST = 10;

/**
 * The open red and amber alerts that reached the server in the last few minutes, at the sites this person can see.
 * Timed by when they arrived, not when the gate raised them, so a handheld that was offline still announces its
 * alerts when it catches up. Null when the read fails: the caller just tries again next round.
 */
export async function recentAlerts(): Promise<FeedAlert[] | null> {
  const user = await currentUser();
  if (!user) return [];
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from("alerts")
    .select("id, rule_code, severity, raised_at, site_id, source, sites(name), events!inner(received_at)")
    .eq("status", "open")
    .in("severity", ["red", "amber"])
    .gte("events.received_at", new Date(Date.now() - WINDOW_MS).toISOString())
    .order("raised_at", { ascending: false })
    .limit(MOST);
  if (error) return null;
  return data.flatMap((row) =>
    row.severity === "red" || row.severity === "amber"
      ? [{
          id: row.id,
          title: ruleTitle(row.rule_code),
          severity: row.severity,
          site: row.sites?.name ?? "A site",
          siteId: row.site_id,
          at: row.raised_at,
          foundAfter: row.source === "server",
        }]
      : [],
  );
}
