import { DataTable, TwoLine } from "@/components/data-table";
import { Icon } from "@/components/icon";
import { labelFor, shortDate, timeOfDay } from "@/lib/format";
import type { OldCheck } from "@/lib/old-checks";

const NO_VALUE = "—";

/** The old system's checks, as it recorded them: no rule results and no photos, so they open nothing further. */
export function OldCheckList({ checks, showSite, severalDays }: { checks: readonly OldCheck[]; showSite: boolean; severalDays: boolean }) {
  return (
    <DataTable
      columns={[
        { key: "time", label: "Time" },
        { key: "movement", label: "Movement" },
        { key: "person", label: "Person" },
        { key: "vehicle", label: "Vehicle" },
        { key: "people", label: "People", align: "right" },
        { key: "by", label: showSite ? "Site · scanned by" : "Scanned by" },
      ]}
      rows={checks.map((check) => ({
        id: check.id,
        cells: {
          time: <TwoLine main={timeOfDay(check.occurredAt)} sub={severalDays ? shortDate(check.occurredAt) : "Old system"} />,
          movement: (
            <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 text-xs font-semibold">
              <Icon name={check.direction === "in" ? "entry" : "exit"} className="size-4" />
              {check.direction === "in" ? "In" : "Out"}
            </span>
          ),
          person: <TwoLine main={check.person ?? "No driver scanned"} sub={check.visitType ? labelFor(check.visitType) : "Visit type not recorded"} />,
          vehicle: <TwoLine main={check.plate ?? NO_VALUE} sub={[check.vehicle, check.body].filter(Boolean).join(" · ") || NO_VALUE} />,
          people: check.occupants ?? NO_VALUE,
          by: <TwoLine main={check.scannedBy ?? NO_VALUE} sub={showSite ? check.siteName : ""} />,
        },
      }))}
    />
  );
}
