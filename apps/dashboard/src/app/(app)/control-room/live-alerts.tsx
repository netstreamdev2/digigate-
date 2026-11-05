import { ruleTitle } from "@digigate/core";

import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { StatusChip } from "@/components/status-chip";
import type { LiveAlert } from "@/lib/control-room";
import { timeOfDay } from "@/lib/format";

import { closeAlert } from "./actions";
import { PlateEvidence } from "./plate-evidence";

type Props = {
  alerts: readonly LiveAlert[];
  /** Open alerts at the site, which can be more than the ones shown. */
  total: number;
  gateLabel: (post: string | null) => string;
  canClose: boolean;
};

const DIRECTION_WORDS = { in: "Coming in", out: "Going out" } as const;
const PLATE_MISMATCH = "PLATE_DISC_MISMATCH";

export function LiveAlerts({ alerts, total, gateLabel, canClose }: Props) {
  if (alerts.length === 0) return <p className="py-8 text-center text-sm text-ink-muted">No open alerts. All clear.</p>;

  const shown = alerts.reduce((sum, alert) => sum + alert.ids.length, 0);
  return (
    <>
      <ul className="space-y-3">
        {alerts.map((alert) => {
          const titles = alert.codes.map(ruleTitle).join(" · ");
          const plateDiffers = alert.typedPlate && alert.plate && alert.typedPlate !== alert.plate;
          return (
            <li key={alert.key} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={alert.severity === "red" ? "blocked" : "warning"} />
                <p className="font-display text-base font-semibold tracking-tight">{titles}</p>
              </div>
              {alert.foundAfter ? (
                <p className="mt-2 text-xs font-semibold text-brand">Found by the server after the gate, from every gate&apos;s records. They may already have gone through.</p>
              ) : null}
              {alert.person ? <p className="mt-2 text-sm font-medium">{alert.person}</p> : null}
              {alert.plate ? <p className="mt-0.5 text-sm text-ink-muted">{[alert.plate, alert.vehicle].filter(Boolean).join(" · ")}</p> : null}
              {plateDiffers ? <p className="mt-0.5 text-sm text-ink-muted">{`Guard typed ${alert.typedPlate}`}</p> : null}
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-xs tabular-nums text-ink-subtle">
                  {[alert.post ? gateLabel(alert.post) : null, alert.direction ? DIRECTION_WORDS[alert.direction] : null, timeOfDay(alert.raisedAt)].filter(Boolean).join(" · ")}
                </p>
                {canClose ? (
                  <FormDialog
                    compact
                    label="Close"
                    title={`Close: ${titles}`}
                    icon="result-warning"
                    submitLabel="Close alert"
                    pendingLabel="Closing…"
                    action={closeAlert}
                    fields={{ ids: alert.ids.join(",") }}
                  >
                    <p className="text-sm text-ink-muted">This takes it off the live list. It doesn&apos;t let anyone through: the guard at the gate still decides.</p>
                    {alert.eventId && alert.codes.includes(PLATE_MISMATCH) ? (
                      <PlateEvidence eventId={alert.eventId} discPlate={alert.plate} typedPlate={alert.typedPlate} />
                    ) : (
                      <Field label="What was done?" name="reason" autoFocus required />
                    )}
                  </FormDialog>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {total > shown ? <p className="mt-3 text-center text-sm text-ink-muted">{`Showing the top ${shown} of ${total} open alerts`}</p> : null}
    </>
  );
}
