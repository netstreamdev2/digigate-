import "server-only";

import type { CheckDirection } from "./checks";
import { addDays, siteMidnightUtc } from "./format";
import { rangeOf, withEveryWord } from "./paging";
import { counted, must } from "./reads";
import { supabaseServer } from "./supabase/server";

/** A check brought over from a site's old gate system: what it recorded, with none of DigiGate's own rule results. */
export type OldCheck = {
  id: string;
  occurredAt: string;
  direction: "in" | "out";
  person: string | null;
  sex: string | null;
  plate: string | null;
  vehicle: string | null;
  body: string | null;
  visitType: string | null;
  occupants: number | null;
  scannedBy: string | null;
  siteName: string;
};

export type OldCheckFilter = { fromDay: string; toDay: string; search: string; direction: CheckDirection; company: string; site: string };

/**
 * One page of the old system's checks, newest first, searched and paged in the database with the same visibility and
 * 365-day masking as DigiGate's own checks.
 */
export async function oldCheckPage(filter: OldCheckFilter, page: number): Promise<{ checks: OldCheck[]; total: number }> {
  const supabase = await supabaseServer();
  const [from, to] = rangeOf(page);
  let list = supabase
    .from("imported_check_records")
    .select("id, site_id, occurred_at, direction, person_name, sex, plate, vehicle_description, body, visit_type, occupants, scanned_by", { count: "exact" })
    .gte("occurred_at", siteMidnightUtc(filter.fromDay))
    .lt("occurred_at", siteMidnightUtc(addDays(filter.toDay, 1)))
    .order("occurred_at", { ascending: false })
    .range(from, to);
  if (filter.direction) list = list.eq("direction", filter.direction);
  if (filter.company) list = list.eq("org_id", filter.company);
  if (filter.site) list = list.eq("site_id", filter.site);
  if (filter.search) list = withEveryWord(list, ["person_name", "plate", "vehicle_search"], filter.search);
  const read = await list;
  const rows = must(read);

  const siteIds = [...new Set(rows.flatMap((row) => (row.site_id ? [row.site_id] : [])))];
  const sites = siteIds.length ? must(await supabase.from("sites").select("id, name").in("id", siteIds)) : [];
  const siteName = new Map(sites.map((site) => [site.id, site.name]));

  return {
    total: counted(read),
    checks: rows.flatMap((row) =>
      row.id && row.occurred_at && (row.direction === "in" || row.direction === "out")
        ? [
            {
              id: row.id,
              occurredAt: row.occurred_at,
              direction: row.direction,
              person: row.person_name,
              sex: row.sex,
              plate: row.plate,
              vehicle: row.vehicle_description,
              body: row.body ? (row.body.split(" / ")[0] ?? row.body) : null,
              visitType: row.visit_type,
              occupants: row.occupants,
              scannedBy: row.scanned_by,
              siteName: (row.site_id && siteName.get(row.site_id)) ?? "",
            },
          ]
        : [],
    ),
  };
}
