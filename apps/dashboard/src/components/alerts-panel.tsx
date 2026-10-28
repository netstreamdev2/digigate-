import { RULE_SEVERITY, type Severity } from "@digigate/core";

import type { DemoAlert } from "@/demo/dashboard-demo";
import { ruleTitles } from "@/rule-titles";

import { Icon } from "./icon";
import { StatusChip, type Status } from "./status-chip";

const statusBySeverity: Record<Severity, Status> = { red: "blocked", amber: "warning", info: "info" };

type Field = {
  label: string;
  value: string;
  /** Spans both columns, for values too long for half the card. */
  wide?: boolean;
};

type Props = {
  alerts: readonly DemoAlert[];
  /** The visit behind the first alert, shown expanded. */
  expanded: {
    initials: string;
    name: string;
    visitType: string;
    fields: readonly Field[];
  };
};

export function AlertsPanel({ alerts, expanded }: Props) {
  return (
    <ul className="space-y-3">
      {alerts.map((alert, index) => (
        <li key={alert.id} className="rounded-md border border-border p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={statusBySeverity[RULE_SEVERITY[alert.code]]} />
                <p className="font-display text-base font-semibold tracking-tight">{ruleTitles[alert.code]}</p>
              </div>
              <p className="mt-2 text-sm text-ink-muted">{alert.summary}</p>
              <p className="mt-1 text-xs tabular-nums text-ink-subtle">
                {alert.gate} · {alert.time}
              </p>
            </div>
            <Icon name="chevron-right" className="mt-1 size-5 shrink-0 text-ink-subtle" />
          </div>

          {index === 0 ? (
            <div className="mt-4 rounded-md bg-surface-muted p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-pill bg-tile-lilac font-display font-semibold text-brand">
                  {expanded.initials}
                </span>
                <div>
                  <p className="font-display font-semibold tracking-tight">{expanded.name}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{expanded.visitType}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {expanded.fields.map((field) => (
                  <div key={field.label} className={field.wide ? "col-span-2" : undefined}>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{field.label}</dt>
                    <dd className="mt-0.5 text-sm font-medium">{field.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 flex gap-2">
                <button type="button" className="h-10 flex-1 rounded-pill bg-ink text-sm font-semibold text-ink-inverse">
                  Open visit
                </button>
                <button type="button" className="h-10 flex-1 rounded-pill border border-border bg-surface text-sm font-semibold">
                  Resolve
                </button>
              </div>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
