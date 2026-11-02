import type { ReactNode } from "react";

export type Column = {
  key: string;
  label: string;
  align?: "left" | "right";
};

export type Row = {
  id: string;
  cells: Record<string, ReactNode>;
};

export function DataTable({ columns, rows }: { columns: readonly Column[]; rows: readonly Row[] }) {
  return (
    <div className="-mx-6 overflow-x-auto px-6">
      <table className="w-full min-w-[560px] whitespace-nowrap text-sm">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`pb-3 pr-4 font-semibold last:pr-0 ${column.align === "right" ? "text-right" : "text-left"}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surface-muted/60">
              {columns.map((column) => (
                <td key={column.key} className={`py-3 pr-4 last:pr-0 ${column.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A primary cell with a quieter second line, e.g. a name over a role. */
export function TwoLine({ main, sub }: { main: ReactNode; sub: ReactNode }) {
  return (
    <>
      <p className="font-medium">{main}</p>
      <p className="text-xs text-ink-muted">{sub}</p>
    </>
  );
}
