import "server-only";

import { siteToday } from "./format";
import { anyColumnLike, likePattern, PAGE_SIZE, rangeOf } from "./paging";
import { counted, maybe, must } from "./reads";
import { supabaseServer } from "./supabase/server";

export type Lane = "vehicle" | "pedestrian";

export type BoardSite = {
  id: string;
  name: string;
  client: string;
  red: number;
  amber: number;
  onSite: number;
  onDuty: number;
};

export type Gate = {
  post: string;
  label: string;
  lanes: readonly string[];
  period: string | null;
  onDutySince: string | null;
  guard: string | null;
  deviceSeenAt: string | null;
  lastCheckAt: string | null;
  /** Null for a client's view-only login, which never sees a guard's photo. */
  shiftId: string | null;
  selfie: "taken" | "skipped" | null;
  hasSelfie: boolean;
  awayUntil: string | null;
  awayReason: string | null;
};

/** Every rule one check broke, as one thing to deal with: a car with two problems is still one car at the boom. */
export type LiveAlert = {
  key: string;
  ids: readonly string[];
  severity: string;
  codes: readonly string[];
  raisedAt: string;
  person: string | null;
  plate: string | null;
  typedPlate: string | null;
  vehicle: string | null;
  post: string | null;
  direction: "in" | "out" | null;
  /** Found by the server re-running the rules after the gate had decided, across every gate's records. */
  foundAfter: boolean;
};

export type InsideNow = {
  id: string;
  person: string;
  vehicle: string | null;
  plate: string | null;
  visitType: string;
  post: string | null;
  enteredAt: string;
};

export type Check = {
  id: string;
  occurredAt: string;
  direction: "in" | "out";
  person: string;
  vehicle: string | null;
  plate: string | null;
  visitType: string | null;
  post: string | null;
  enteredAt: string | null;
  outcome: string | null;
  ruleCodes: string[];
  /** Whether the visit this check belongs to exists, and when it ended: how a blocked check that a supervisor let
   * through shows it went ahead, since the check itself stays blocked on record. */
  visitOpened: boolean;
  exitedAt: string | null;
};

const ALERTS_SHOWN = 25;
const CHECKS_SHOWN = 12;
const NO_NAME = "Erased";
const SITE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const directionOf = (type: string | null) => (type?.endsWith("_entry") ? "in" : "out");

/** The sites this person looks after, trouble first: one company's only, when it's named. */
export async function siteBoard(search: string, page: number, company = ""): Promise<{ sites: BoardSite[]; total: number }> {
  const supabase = await supabaseServer();
  const [from] = rangeOf(page);
  const rows = must(
    await supabase.rpc("site_board", { _search: search ? likePattern(search) : "", _limit: PAGE_SIZE, _offset: from, ...(company ? { _org: company } : {}) }),
  );
  return {
    total: rows[0]?.total ?? 0,
    sites: rows.map((row) => ({
      id: row.site_id,
      name: row.site_name,
      client: row.client_name,
      red: row.red,
      amber: row.amber,
      onSite: row.on_site,
      onDuty: row.on_duty,
    })),
  };
}

/** Null when there's no such site for this person. A failed read throws: it mustn't say a site isn't theirs. */
export async function siteHeading(siteId: string): Promise<{ name: string; client: string } | null> {
  if (!SITE_ID.test(siteId)) return null;
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from("sites").select("name, clients(name)").eq("id", siteId).maybeSingle();
  if (error) throw new Error("A control room read failed.");
  return data ? { name: data.name, client: data.clients?.name ?? "" } : null;
}

export async function gatesAt(siteId: string): Promise<Gate[]> {
  const supabase = await supabaseServer();
  return must(await supabase.rpc("gate_board", { _site: siteId })).map((row) => ({
    post: row.post,
    label: row.label,
    lanes: row.lanes,
    period: row.period,
    onDutySince: row.on_duty_since,
    guard: row.guard,
    deviceSeenAt: row.device_seen_at,
    lastCheckAt: row.last_check_at,
    shiftId: row.shift_id,
    selfie: row.selfie === "taken" || row.selfie === "skipped" ? row.selfie : null,
    hasSelfie: row.has_selfie,
    awayUntil: row.away_until,
    awayReason: row.away_reason,
  }));
}

export async function openAlerts(siteId: string): Promise<{ alerts: LiveAlert[]; red: number; amber: number }> {
  const supabase = await supabaseServer();
  const open = () => supabase.from("alerts").select("id", { count: "exact", head: true }).eq("site_id", siteId).eq("status", "open");
  const [rows, red, amber] = await Promise.all([
    supabase
      .from("alerts")
      .select("id, event_id, rule_code, severity, raised_at, post, source")
      .eq("site_id", siteId)
      .eq("status", "open")
      .order("severity", { ascending: false })
      .order("raised_at", { ascending: false })
      .limit(ALERTS_SHOWN),
    open().eq("severity", "red"),
    open().eq("severity", "amber"),
  ]);

  const alerts = must(rows);
  const eventIds = alerts.flatMap((alert) => (alert.event_id ? [alert.event_id] : []));
  const checks = eventIds.length
    ? must(await supabase.from("check_records").select("id, type, person_name, plate, typed_plate, vehicle_description, post").in("id", eventIds))
    : [];

  const grouped = new Map<string, LiveAlert>();
  for (const alert of alerts) {
    const key = alert.event_id ?? alert.id;
    const known = grouped.get(key);
    if (known) {
      grouped.set(key, { ...known, ids: [...known.ids, alert.id], codes: [...known.codes, alert.rule_code], foundAfter: known.foundAfter || alert.source === "server" });
      continue;
    }
    const check = checks.find((row) => row.id === alert.event_id);
    grouped.set(key, {
      key,
      ids: [alert.id],
      severity: alert.severity,
      codes: [alert.rule_code],
      raisedAt: alert.raised_at,
      person: check?.person_name ?? null,
      plate: check?.plate ?? null,
      typedPlate: check?.typed_plate ?? null,
      vehicle: check?.vehicle_description ?? null,
      post: check?.post ?? alert.post,
      direction: check ? directionOf(check.type) : null,
      foundAfter: alert.source === "server",
    });
  }
  return { alerts: [...grouped.values()], red: counted(red), amber: counted(amber) };
}

export async function insideCounts(siteId: string): Promise<Record<Lane, number>> {
  const supabase = await supabaseServer();
  const inside = (lane: Lane) => supabase.from("visit_records").select("id", { count: "exact", head: true }).eq("site_id", siteId).is("exited_at", null).eq("kind", lane);
  const [vehicle, pedestrian] = await Promise.all([inside("vehicle"), inside("pedestrian")]);
  return { vehicle: counted(vehicle), pedestrian: counted(pedestrian) };
}

/** Who is inside right now, longest stay first, one page at a time. */
export async function insideNow(siteId: string, lane: Lane, search: string, page: number): Promise<{ rows: InsideNow[]; total: number }> {
  const supabase = await supabaseServer();
  const [from, to] = rangeOf(page);
  let list = supabase
    .from("visit_records")
    .select("id, person_name, plate, vehicle_description, visit_type, post, entered_at", { count: "exact" })
    .eq("site_id", siteId)
    .is("exited_at", null)
    .eq("kind", lane)
    .order("entered_at")
    .range(from, to);
  if (search) list = list.or(anyColumnLike(["plate", "person_name"], search));
  const result = await list;
  return {
    total: counted(result),
    rows: must(result).flatMap((row) =>
      row.id && row.entered_at
        ? [{
            id: row.id,
            person: row.person_name ?? NO_NAME,
            vehicle: row.vehicle_description,
            plate: row.plate,
            visitType: row.visit_type ?? "",
            post: row.post,
            enteredAt: row.entered_at,
          }]
        : [],
    ),
  };
}

export async function latestChecks(siteId: string): Promise<Check[]> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase
      .from("check_records")
      .select("id, type, occurred_at, person_name, plate, vehicle_description, visit_type, post, visit_id, visit_entered_at, outcome, rule_codes")
      .eq("site_id", siteId)
      .order("occurred_at", { ascending: false })
      .limit(CHECKS_SHOWN),
  );
  const visitIds = rows.flatMap((row) => (row.visit_id && row.visit_entered_at ? [row.visit_id] : []));
  const visits = visitIds.length ? must(await supabase.from("visit_records").select("id, exited_at").in("id", visitIds)) : [];
  const exitedAt = new Map(visits.flatMap((visit) => (visit.id ? [[visit.id, visit.exited_at] as const] : [])));
  return rows.flatMap((row) =>
    row.id && row.occurred_at
      ? [{
          id: row.id,
          occurredAt: row.occurred_at,
          direction: directionOf(row.type),
          person: row.person_name ?? NO_NAME,
          vehicle: row.vehicle_description,
          plate: row.plate,
          visitType: row.visit_type,
          post: row.post,
          enteredAt: row.visit_entered_at,
          outcome: row.outcome,
          ruleCodes: row.rule_codes ?? [],
          visitOpened: row.visit_entered_at !== null,
          exitedAt: row.visit_id ? (exitedAt.get(row.visit_id) ?? null) : null,
        }]
      : [],
  );
}

/** Entries since midnight on the site's clock, from the running daily counts. */
export async function entriesToday(siteId: string, now: number): Promise<number> {
  const supabase = await supabaseServer();
  const rows = must(await supabase.from("daily_counts").select("visits").eq("site_id", siteId).eq("day", siteToday(now)));
  return rows.reduce((sum, row) => sum + row.visits, 0);
}

export type SiteDay = {
  checks: number;
  exits: number;
  stayMinutes: number;
  blocked: number;
  overrides: number;
  turnedAway: number;
  /** Scans in each hour of the site's day, midnight first. */
  hours: number[];
};

/**
 * Today's running totals at the site, from the counts the server keeps as checks arrive. A site that changed security
 * company today has a row for each; row security leaves the viewer only their own, or both for the site's own logins.
 */
export async function siteDay(siteId: string, now: number): Promise<SiteDay> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase.from("daily_activity").select("checks, exits, stay_minutes, blocked, overrides, turned_away, hours").eq("site_id", siteId).eq("day", siteToday(now)),
  );
  const hours = Array.from({ length: 24 }, (_, hour) => rows.reduce((sum, row) => sum + (row.hours[hour] ?? 0), 0));
  const total = (pick: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  return {
    checks: total((row) => row.checks),
    exits: total((row) => row.exits),
    stayMinutes: total((row) => row.stay_minutes),
    blocked: total((row) => row.blocked),
    overrides: total((row) => row.overrides),
    turnedAway: total((row) => row.turned_away),
    hours,
  };
}

/** Whether the site counts its parking, and how many spaces it has. */
export async function siteParking(siteId: string): Promise<{ open: boolean; spaces: number | null }> {
  const supabase = await supabaseServer();
  const row = maybe(await supabase.from("sites").select("open_parking, parking_spaces").eq("id", siteId).maybeSingle());
  return { open: row?.open_parking ?? true, spaces: row?.parking_spaces ?? null };
}

/** When the longest stay still going began, or null when nobody is inside. */
export async function longestInside(siteId: string): Promise<string | null> {
  const supabase = await supabaseServer();
  const [row] = must(await supabase.from("visit_records").select("entered_at").eq("site_id", siteId).is("exited_at", null).order("entered_at").limit(1));
  return row?.entered_at ?? null;
}
