import type { DemoActivity } from "@/demo/dashboard-demo";

import { Icon } from "./icon";
import { StatusChip } from "./status-chip";

const columns = ["Time", "Person", "Movement", "Vehicle", "Gate", "On site", "Result"];

export function ActivityTable({ rows }: { rows: readonly DemoActivity[] }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[640px] whitespace-nowrap text-sm">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {columns.map((column) => (
              <th key={column} scope="col" className="pb-3 pr-4 font-semibold last:pr-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted/60">
              <td className="py-3 pr-4 tabular-nums text-ink-muted">{row.time}</td>
              <td className="py-3 pr-4">
                <p className="font-medium">{row.person}</p>
                <p className="text-xs text-ink-muted">{row.visitType}</p>
              </td>
              <td className="py-3 pr-4">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-muted px-2.5 text-xs font-semibold">
                  <Icon name={row.direction === "in" ? "entry" : "exit"} className="size-4" />
                  {row.direction === "in" ? "In" : "Out"}
                </span>
              </td>
              <td className="py-3 pr-4">
                <p>{row.vehicle}</p>
                <p className="text-xs tabular-nums text-ink-muted">{row.plate}</p>
              </td>
              <td className="py-3 pr-4 text-ink-muted">{row.gate}</td>
              <td className="py-3 pr-4 tabular-nums text-ink-muted">{row.stay}</td>
              <td className="py-3">
                <StatusChip status={row.result} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
