import Link from "next/link";

import { FormDialog } from "@/components/form-dialog";
import { ListCard, Pagination } from "@/components/list";
import { StatusChip } from "@/components/status-chip";
import { boomsLine, camerasLine, GATE_TYPES, isGateType, lanesLine, NEW_ACCESS_POINT, readAccessPoint, type AccessPointDraft } from "@/lib/access-points";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, must } from "@/lib/reads";
import { supabaseServer } from "@/lib/supabase/server";

import { AccessPointFormFields } from "./access-point-editor";
import { updateAccessPoint } from "./actions";

// A site's access points, each with what it has and an Edit popup. Used on the site's setup page and in Admin.

/** Narrowing the access points, for a manager looking for the gates that need work. */
const SHOWS = { all: "All", manual: "Manual booms", "no-anpr": "No ANPR" } as const;
type Show = keyof typeof SHOWS;
const asShow = (value: string): Show => (value === "manual" || value === "no-anpr" ? value : "all");

type PointRow = {
  label: string;
  gate_type: string;
  lanes: string[];
  booms: string[];
  manned: boolean;
  cctv_cameras: number;
  anpr: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_m: number;
};

/** A saved access point, back in the shape its form edits. */
function draftOf(point: PointRow): AccessPointDraft {
  const location = point.latitude === null || point.longitude === null ? "" : `${point.latitude}, ${point.longitude}`;
  return (
    readAccessPoint({
      label: point.label,
      gateType: point.gate_type,
      lanes: point.lanes,
      booms: point.booms,
      manned: point.manned,
      cctvCameras: point.cctv_cameras,
      anpr: point.anpr,
      location,
      radiusM: point.radius_m,
    }) ?? NEW_ACCESS_POINT
  );
}

function pointDetail(point: PointRow): string {
  const parts = [
    isGateType(point.gate_type) ? GATE_TYPES[point.gate_type] : point.gate_type,
    lanesLine(point.lanes),
    point.lanes.includes("vehicle") ? boomsLine(point.booms) : null,
    point.manned ? "Manned" : "Unmanned",
    camerasLine(point.cctv_cameras, point.anpr),
    point.latitude === null ? "No geofence" : `Geofence ${point.radius_m} m`,
  ];
  return parts.filter(Boolean).join(" · ");
}

function Row({ title, detail, children }: { title: string; detail: string; children?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block text-sm text-ink-muted">{detail}</span>
      </span>
      {children}
    </li>
  );
}

/** `near` is the site's own location, where each Edit popup's map starts if the access point has none yet. */
export async function AccessPointList({ siteId, query, path, near = null }: { siteId: string; query: Query; path: string; near?: { latitude: number; longitude: number } | null }) {
  const search = textParam(query, "q");
  const show = asShow(textParam(query, "show"));
  const page = pageParam(query);
  const [from, to] = rangeOf(page);
  const supabase = await supabaseServer();
  let list = supabase
    .from("posts")
    .select("id, label, gate_type, lanes, booms, manned, cctv_cameras, anpr, latitude, longitude, radius_m", { count: "exact" })
    .eq("site_id", siteId)
    .order("created_at")
    .range(from, to);
  if (search) list = list.ilike("label", likePattern(search));
  if (show === "manual") list = list.contains("booms", ["manual"]);
  if (show === "no-anpr") list = list.eq("anpr", false);
  const listed = await list;
  const points = must(listed);
  const count = counted(listed);
  const empty = search || show !== "all" ? "No access point matches that." : "No access points yet. Guards pick one when they start a shift.";
  return (
    <>
      <nav aria-label="Show" className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(SHOWS) as Show[]).map((option) => (
          <Link
            key={option}
            href={pageHref(path, { ...query, show: option === "all" ? undefined : option }, 1)}
            aria-current={show === option ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-pill px-4 text-sm font-semibold transition ${show === option ? "bg-ink text-ink-inverse" : "bg-surface-muted text-ink hover:bg-border"}`}
          >
            {SHOWS[option]}
          </Link>
        ))}
      </nav>
      <ListCard isEmpty={points.length === 0} empty={empty} footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}>
        {points.map((point) => (
          <Row key={point.id} title={point.label} detail={pointDetail(point)}>
            <span className="flex items-center gap-2">
              {point.cctv_cameras === 0 ? (
                <StatusChip status="blocked" label="No CCTV" />
              ) : point.anpr ? (
                <StatusChip status="clear" label="ANPR" />
              ) : (
                <StatusChip status="blocked" label="No ANPR" />
              )}
              <FormDialog
                compact
                wide
                label="Edit"
                title={`Edit ${point.label}`}
                icon="sites"
                submitLabel="Save changes"
                pendingLabel="Saving…"
                action={updateAccessPoint}
                fields={{ id: point.id }}
              >
                <AccessPointFormFields defaults={draftOf(point)} near={near} />
              </FormDialog>
            </span>
          </Row>
        ))}
      </ListCard>
    </>
  );
}
