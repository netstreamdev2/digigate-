import { ruleTitle } from "@digigate/core";
import type { CSSProperties } from "react";

import { LiveDot } from "@/components/device-signs";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Icon } from "@/components/icon";
import { Rail } from "@/components/rail";
import type { LiveAlert } from "@/lib/control-room";
import { addDays, ago, shortDate, siteToday, timeOfDay } from "@/lib/format";

import { closeAlert } from "./actions";
import { PlateEvidence } from "./plate-evidence";

type Props = {
  alerts: readonly LiveAlert[];
  /** Every open alert at the site, by severity: there can be more than the ones shown. */
  red: number;
  amber: number;
  gateLabel: (post: string | null) => string;
  canClose: boolean;
  now: number;
};

const DIRECTION_WORDS = { in: "Coming in", out: "Going out" } as const;
const PLATE_MISMATCH = "PLATE_DISC_MISMATCH";

const SEVERITY = {
  red: { label: "Blocked", icon: "result-blocked", chip: "bg-blocked text-ink-inverse" },
  amber: { label: "Warning", icon: "result-warning", chip: "bg-warning text-ink-inverse" },
} as const;

/** An alert stays open until someone closes it, so one from an earlier day says which day, not just the time. */
function raisedWhen(at: string, now: number): string {
  const day = siteToday(new Date(at).getTime());
  const today = siteToday(now);
  if (day === today) return timeOfDay(at);
  return `${day === addDays(today, -1) ? "Yesterday" : shortDate(at)} · ${timeOfDay(at)}`;
}

function Plate({ value }: { value: string }) {
  return <span className="dg-deck-plate rounded-md px-2 py-0.5 font-mono text-[13px] font-semibold text-ink-inverse">{value}</span>;
}

/** One count in the header: how many, of what, in its colour. */
function Tally({ count, label, tone }: { count: number; label: string; tone: "blocked" | "warning" }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className={`size-2.5 -translate-y-px rounded-full ${tone === "blocked" ? "bg-blocked" : "bg-warning"}`} aria-hidden="true" />
      <span className="font-display text-2xl font-semibold tabular-nums tracking-tight text-ink-inverse">{count}</span>
      <span className="text-sm font-normal text-ink-inverse/65">{label}</span>
    </span>
  );
}

/**
 * The site's open alerts as a dark deck across the top of the page, lit red while anything is blocked and amber for
 * warnings alone, with a slim green line when all is clear. The header counts every open alert; the cards slide along
 * under it, blocked first, then the newest, each with its own Close.
 */
export function LiveAlerts({ alerts, red, amber, gateLabel, canClose, now }: Props) {
  const total = red + amber;
  const first = alerts[0];

  if (total === 0 || !first) {
    return (
      <div role="status" data-severity="clear" className="dg-deck mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[28px] px-6 py-4 text-sm text-ink-inverse">
        <LiveDot tone="clear" live />
        <span className="font-semibold">All clear</span>
        <span className="text-ink-inverse/60">No open alerts at this site.</span>
      </div>
    );
  }

  const shown = alerts.reduce((sum, alert) => sum + alert.ids.length, 0);
  const oldest = alerts.reduce((earliest, alert) => (alert.raisedAt < earliest ? alert.raisedAt : earliest), first.raisedAt);

  return (
    <section aria-label="Live alerts" data-severity={red > 0 ? "red" : "amber"} className="dg-deck mt-6 rounded-[28px] p-6">
      <span className="dg-deck-beam" aria-hidden="true" />

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.24em] text-ink-inverse/60">
            <LiveDot tone={red > 0 ? "blocked" : "warning"} live />
            Live alerts
          </p>
          <h2 className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="flex items-baseline gap-2.5">
              <span className="font-display text-5xl font-bold tabular-nums leading-none tracking-tight text-ink-inverse">{total}</span>
              <span className="text-base font-normal text-ink-inverse/70">open</span>
            </span>
            {red > 0 ? <Tally count={red} label="blocked" tone="blocked" /> : null}
            {amber > 0 ? <Tally count={amber} label={amber === 1 ? "warning" : "warnings"} tone="warning" /> : null}
          </h2>
        </div>
        <p className="text-xs leading-relaxed text-ink-inverse/55 sm:text-right">
          {total > shown ? `Blocked first, then the newest: the top ${shown} of ${total}` : "Blocked first, then the newest"}
          <br />
          {`Oldest shown: ${ago(oldest, now)}`}
        </p>
      </header>

      {/* How much of what's open is blocked. */}
      <div className="dg-deck-meter mt-5 flex h-1 gap-1" aria-hidden="true">
        {red > 0 ? <span className="rounded-pill bg-blocked" style={{ flexGrow: red }} /> : null}
        {amber > 0 ? <span className="rounded-pill bg-warning" style={{ flexGrow: amber }} /> : null}
      </div>

      <div className="mt-2">
        <Rail label="Open alerts">
          {alerts.map((alert, index) => {
            const titles = alert.codes.map(ruleTitle).join(" · ");
            const severity = alert.severity === "red" ? SEVERITY.red : SEVERITY.amber;
            const plateDiffers = alert.typedPlate && alert.plate && alert.typedPlate !== alert.plate;
            const where = [alert.post ? gateLabel(alert.post) : null, alert.direction ? DIRECTION_WORDS[alert.direction] : null].filter(Boolean).join(" · ");
            return (
              <article
                key={alert.key}
                data-severity={alert.severity === "red" ? "red" : "amber"}
                style={{ "--dg-i": index } as CSSProperties}
                className="dg-deck-card flex w-[22.5rem] shrink-0 flex-col rounded-[22px] py-4 pl-6 pr-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${severity.chip}`}>
                    <Icon name={severity.icon} className="size-3.5" />
                    {severity.label}
                  </span>
                  <span className="text-xs tabular-nums text-ink-inverse/60">{raisedWhen(alert.raisedAt, now)}</span>
                </div>

                <p className="mt-3 font-display text-lg font-semibold leading-snug tracking-tight text-ink-inverse">{titles}</p>
                {alert.foundAfter ? (
                  <p className="mt-1.5 text-xs font-medium text-tile-sky">Found by the server after the gate, from every gate&apos;s records. They may already have gone through.</p>
                ) : null}

                {alert.person ? <p className="mt-3 text-sm font-semibold text-ink-inverse">{alert.person}</p> : null}
                {alert.plate ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-inverse/65">
                    <Plate value={alert.plate} />
                    {alert.vehicle}
                  </p>
                ) : null}
                {plateDiffers && alert.typedPlate ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-ink-inverse/65">
                    Guard typed
                    <Plate value={alert.typedPlate} />
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                  <p className="text-xs text-ink-inverse/55">{where}</p>
                  {canClose ? (
                    <FormDialog
                      compact
                      onDark
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
      </div>
    </section>
  );
}
