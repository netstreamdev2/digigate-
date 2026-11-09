import { DirectionChip } from "./direction-chip";
import { StatusChip } from "./status-chip";

export type ActivityRow = {
  id: string;
  time: string;
  person: string;
  visitType: string;
  direction: "in" | "out";
  vehicle: string;
  plate: string;
  gate: string;
  stay: string;
  /** Info is a check from the site's old gate system, which had no result of its own. */
  result: "clear" | "warning" | "blocked" | "info";
};

// The result sits beside the time so it can never scroll out of sight on a narrow screen.
const columns = ["Time", "Result", "Person", "Movement", "Vehicle", "Gate", "On site"];

export function ActivityTable({ rows }: { rows: readonly ActivityRow[] }) {
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
                <StatusChip status={row.result} />
              </td>
              <td className="py-3 pr-4">
                <p className="font-medium">{row.person}</p>
                <p className="text-xs text-ink-muted">{row.visitType}</p>
              </td>
              <td className="py-3 pr-4">
                <DirectionChip direction={row.direction} />
              </td>
              <td className="py-3 pr-4">
                <p>{row.vehicle}</p>
                <p className="text-xs tabular-nums text-ink-muted">{row.plate}</p>
              </td>
              <td className="py-3 pr-4 text-ink-muted">{row.gate}</td>
              <td className="py-3 tabular-nums text-ink-muted">{row.stay}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
