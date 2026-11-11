import { ruleTitle } from "@digigate/core";

import { LiveDot } from "@/components/device-signs";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Icon } from "@/components/icon";
import { Rail } from "@/components/rail";
import { StatusChip } from "@/components/status-chip";
import type { LiveAlert } from "@/lib/control-room";
import { plural, timeOfDay } from "@/lib/format";

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

/**
 * The site's open alerts as a banner across the top of the page: red and ringing while anything is blocked, amber for
 * warnings, a slim green line when all is clear. The alerts themselves slide along it, blocked first, then the newest,
 * each with its own Close.
 */
export function LiveAlerts({ alerts, total, gateLabel, canClose }: Props) {
  if (alerts.length === 0) {
    return (
      <div role="status" className="mt-6 flex items-center gap-3 rounded-[28px] bg-clear-soft px-5 py-3 text-sm font-semibold text-ink">
        <Icon name="result-clear" className="size-5 text-clear" />
        No open alerts. All clear.
      </div>
    );
  }

  const shown = alerts.reduce((sum, alert) => sum + alert.ids.length, 0);
  const blocked = alerts.filter((alert) => alert.severity === "red").reduce((sum, alert) => sum + alert.ids.length, 0);
  return (
    <section aria-label="Live alerts" className={`mt-6 rounded-[28px] p-5 ${blocked ? "dg-trouble bg-blocked-soft" : "bg-warning-soft"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight text-ink">
          <LiveDot tone={blocked ? "blocked" : "warning"} live />
          {`${plural(total, "open alert")}${blocked ? ` · ${blocked} blocked` : ""}`}
        </h2>
        <p className="text-sm text-ink-muted">{total > shown ? `Blocked first, then the newest: the top ${shown} of ${total}` : "Blocked first, then the newest"}</p>
      </div>
      <Rail label="Open alerts">
        {alerts.map((alert) => {
          const titles = alert.codes.map(ruleTitle).join(" · ");
          const plateDiffers = alert.typedPlate && alert.plate && alert.typedPlate !== alert.plate;
          return (
            <article key={alert.key} className="flex w-[22rem] shrink-0 flex-col rounded-[22px] bg-surface p-4 shadow-floating">
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
              <div className="mt-auto flex items-center justify-between gap-3 pt-3">
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
            </article>
          );
        })}
      </Rail>
    </section>
  );
}
