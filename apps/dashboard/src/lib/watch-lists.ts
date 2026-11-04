import "server-only";

import { anyColumnLike, rangeOf } from "./paging";
import { counted, must } from "./reads";
import { supabaseServer } from "./supabase/server";

export type HotlistTab = "in-force" | "off";
export type BookingTab = "coming" | "arrived" | "past";

export type HotlistRow = {
  id: string;
  orgId: string;
  company: string;
  site: string | null;
  kind: "person" | "plate" | "vin";
  label: string;
  idLastFour: string | null;
  reason: string;
  guardNote: string;
  expiresAt: string | null;
  addedBy: string | null;
  addedAt: string;
  removedAt: string | null;
};

export type BookingRow = {
  id: string;
  orgId: string;
  site: string;
  name: string;
  idLastFour: string | null;
  plate: string | null;
  visitType: string | null;
  note: string | null;
  from: string;
  until: string;
  bookedBy: string | null;
  cancelledAt: string | null;
  arrivedAt: string | null;
};

const isKind = (value: string): value is HotlistRow["kind"] => value === "person" || value === "plate" || value === "vin";

/** One page of a company's hotlist, or every company's for a super user. Searched and paged in the database. */
export async function hotlistPage(
  filter: { tab: HotlistTab; search: string; company: string },
  page: number,
  now: number,
): Promise<{ rows: HotlistRow[]; total: number }> {
  const supabase = await supabaseServer();
  const at = new Date(now).toISOString();
  const [from, to] = rangeOf(page);
  let list = supabase
    .from("hotlist")
    .select("id, org_id, kind, label, id_last_four, reason, guard_note, expires_at, created_by_name, created_at, removed_at, sites(name), organisations(name)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);
  list = filter.tab === "in-force" ? list.is("removed_at", null).or(`expires_at.is.null,expires_at.gt.${at}`) : list.or(`removed_at.not.is.null,expires_at.lte.${at}`);
  if (filter.company) list = list.eq("org_id", filter.company);
  if (filter.search) list = list.or(anyColumnLike(["label", "reason"], filter.search));
  const read = await list;
  return {
    total: counted(read),
    rows: must(read).flatMap((row) =>
      isKind(row.kind)
        ? [
            {
              id: row.id,
              orgId: row.org_id,
              company: row.organisations?.name ?? "",
              site: row.sites?.name ?? null,
              kind: row.kind,
              label: row.label,
              idLastFour: row.id_last_four,
              reason: row.reason,
              guardNote: row.guard_note,
              expiresAt: row.expires_at,
              addedBy: row.created_by_name,
              addedAt: row.created_at,
              removedAt: row.removed_at,
            },
          ]
        : [],
    ),
  };
}

/** One page of expected visitors: still to come soonest first, the rest newest first. */
export async function bookingPage(
  filter: { tab: BookingTab; search: string; company: string },
  page: number,
  now: number,
): Promise<{ rows: BookingRow[]; total: number }> {
  const supabase = await supabaseServer();
  const at = new Date(now).toISOString();
  const [from, to] = rangeOf(page);
  let list = supabase
    .from("expected_visitors")
    .select("id, org_id, visitor_name, id_last_four, plate, visit_type, note, valid_from, valid_until, created_by_name, cancelled_at, arrived_at, sites(name)", {
      count: "exact",
    })
    .range(from, to);
  if (filter.tab === "coming") list = list.is("cancelled_at", null).is("arrived_at", null).gte("valid_until", at).order("valid_from");
  else if (filter.tab === "arrived") list = list.not("arrived_at", "is", null).order("arrived_at", { ascending: false });
  else list = list.is("arrived_at", null).or(`cancelled_at.not.is.null,valid_until.lt.${at}`).order("valid_from", { ascending: false });
  if (filter.company) list = list.eq("org_id", filter.company);
  if (filter.search) list = list.or(anyColumnLike(["visitor_name", "plate", "note"], filter.search));
  const read = await list;
  return {
    total: counted(read),
    rows: must(read).map((row) => ({
      id: row.id,
      orgId: row.org_id,
      site: row.sites?.name ?? "",
      name: row.visitor_name,
      idLastFour: row.id_last_four,
      plate: row.plate,
      visitType: row.visit_type,
      note: row.note,
      from: row.valid_from,
      until: row.valid_until,
      bookedBy: row.created_by_name,
      cancelledAt: row.cancelled_at,
      arrivedAt: row.arrived_at,
    })),
  };
}
