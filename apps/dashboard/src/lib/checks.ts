import "server-only";

import type { Check } from "./control-room";
import { addDays, siteMidnightUtc } from "./format";
import { anyColumnLike, rangeOf } from "./paging";
import { counted, must } from "./reads";
import { supabaseServer } from "./supabase/server";

export type CheckDirection = "in" | "out" | "";
export type CheckResult = "clear" | "warning" | "blocked" | "";
export type CheckLane = "vehicle" | "pedestrian" | "";

export type CheckFilter = {
  fromDay: string;
  toDay: string;
  search: string;
  direction: CheckDirection;
  result: CheckResult;
  lane: CheckLane;
  company: string;
  site: string;
};

/** A check on the Checks page: the same as the control room's, with where it happened. */
export type ListedCheck = Check & { siteId: string; siteName: string; gate: string };

const NO_NAME = "Erased";
const NO_VALUE = "—";

const typesFor = (direction: CheckDirection, lane: CheckLane): string[] =>
  (lane ? [lane] : ["vehicle", "pedestrian"]).flatMap((kind) => (direction === "in" ? [`${kind}_entry`] : direction === "out" ? [`${kind}_exit`] : [`${kind}_entry`, `${kind}_exit`]));

/**
 * One page of every check, in and out, newest first, for the days and filters asked for. Searched and paged in the
 * database, with names and plates masked after 365 days as everywhere else, so an old name can't be searched for.
 */
export async function checkPage(filter: CheckFilter, page: number): Promise<{ checks: ListedCheck[]; total: number }> {
  const supabase = await supabaseServer();
  const [from, to] = rangeOf(page);
  let list = supabase
    .from("check_records")
    .select("id, type, occurred_at, site_id, person_name, plate, vehicle_description, visit_type, post, visit_id, visit_entered_at, outcome, rule_codes", {
      count: "exact",
    })
    .gte("occurred_at", siteMidnightUtc(filter.fromDay))
    .lt("occurred_at", siteMidnightUtc(addDays(filter.toDay, 1)))
    .in("type", typesFor(filter.direction, filter.lane))
    .order("occurred_at", { ascending: false })
    .range(from, to);
  if (filter.result) list = list.eq("outcome", filter.result);
  if (filter.company) list = list.eq("org_id", filter.company);
  if (filter.site) list = list.eq("site_id", filter.site);
  if (filter.search) list = list.or(anyColumnLike(["person_name", "plate", "typed_plate"], filter.search));
  const read = await list;
  const rows = must(read);
  const total = counted(read);

  // What the page needs to say about the rows on it, read once for the page, never once a row.
  const siteIds = [...new Set(rows.flatMap((row) => (row.site_id ? [row.site_id] : [])))];
  const visitIds = rows.flatMap((row) => (row.visit_id && row.visit_entered_at ? [row.visit_id] : []));
  const [sites, posts, visits] = await Promise.all([
    siteIds.length ? supabase.from("sites").select("id, name").in("id", siteIds) : null,
    siteIds.length ? supabase.from("posts").select("site_id, code, label").in("site_id", siteIds) : null,
    visitIds.length ? supabase.from("visit_records").select("id, exited_at").in("id", visitIds) : null,
  ]);
  const siteNames = new Map((sites ? must(sites) : []).map((site) => [site.id, site.name]));
  const gateNames = new Map((posts ? must(posts) : []).map((post) => [`${post.site_id}:${post.code}`, post.label]));
  const exitedAt = new Map((visits ? must(visits) : []).flatMap((visit) => (visit.id ? [[visit.id, visit.exited_at] as const] : [])));

  return {
    total,
    checks: rows.flatMap((row) =>
      row.id && row.occurred_at && row.site_id
        ? [
            {
              id: row.id,
              occurredAt: row.occurred_at,
              direction: row.type?.endsWith("_entry") ? "in" : "out",
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
              siteId: row.site_id,
              siteName: siteNames.get(row.site_id) ?? NO_VALUE,
              gate: (row.post && gateNames.get(`${row.site_id}:${row.post}`)) ?? row.post ?? NO_VALUE,
            },
          ]
        : [],
    ),
  };
}
