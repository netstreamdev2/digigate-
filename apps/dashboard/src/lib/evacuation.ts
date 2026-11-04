import "server-only";

import { must } from "./reads";
import { supabaseServer } from "./supabase/server";

/** Everyone a marshal must account for, in the order they'd be called: by name within cars and on foot. */
export type Evacuee = {
  id: string;
  kind: "vehicle" | "pedestrian";
  person: string;
  plate: string | null;
  vehicle: string | null;
  /** People in the car, the driver included. */
  occupants: number;
  visitType: string | null;
  post: string | null;
  enteredAt: string;
};

/** A site's biggest day, with room to spare. Past this the list says it's cut short rather than leaving people off quietly. */
export const MOST_EVACUEES = 3000;
const NO_NAME = "Name erased";

export async function evacuees(siteId: string): Promise<{ people: Evacuee[]; complete: boolean }> {
  const supabase = await supabaseServer();
  const rows = must(
    await supabase
      .from("visit_records")
      .select("id, kind, person_name, plate, vehicle_description, occupants_in, visit_type, post, entered_at")
      .eq("site_id", siteId)
      .is("exited_at", null)
      .order("person_name")
      .limit(MOST_EVACUEES + 1),
  );
  const people = rows.slice(0, MOST_EVACUEES).flatMap((row): Evacuee[] => {
    const kind = row.kind === "vehicle" || row.kind === "pedestrian" ? row.kind : null;
    return row.id && row.entered_at && kind
      ? [
          {
            id: row.id,
            kind,
            person: row.person_name ?? NO_NAME,
            plate: row.plate,
            vehicle: row.vehicle_description,
            occupants: kind === "vehicle" ? Math.max(1, row.occupants_in ?? 1) : 1,
            visitType: row.visit_type,
            post: row.post,
            enteredAt: row.entered_at,
          },
        ]
      : [];
  });
  return { people, complete: rows.length <= MOST_EVACUEES };
}
