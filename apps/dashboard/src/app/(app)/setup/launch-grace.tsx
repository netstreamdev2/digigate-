import { ConfirmAction } from "@/components/dialog";
import { FormDialog } from "@/components/form-dialog";
import { Icon } from "@/components/icon";
import { StatusChip } from "@/components/status-chip";
import { duration, shortDate, timeOfDay } from "@/lib/format";

import { endLaunchGrace, startLaunchGrace } from "./grace-actions";

const GRACE_MS = 7 * 24 * 60 * 60_000;

/** `canStart`: only DigiGate's super users start and end it; everyone else sees whether it's running. */
type Props = { siteId: string; until: string | null; now: number; canStart: boolean };

const when = (at: string) => `${new Date(at).toLocaleDateString("en-ZA", { weekday: "short", timeZone: "Africa/Johannesburg" })} ${shortDate(at)}, ${timeOfDay(at)}`;

function Explanation() {
  return (
    <>
      <p>
        When a site starts on DigiGate, the cars already parked there have no DigiGate entry. Without a grace, each one would be
        stopped on its way out as &ldquo;No entry record&rdquo;.
      </p>
      <p className="mt-2">
        For 7 days, a car leaving with no entry is <span className="font-semibold text-ink">asked about instead</span>: the guard
        checks the licence and disc, then lets it through or turns it away. Every other check still stops a car, and each one
        asked about is in the checks, alerts and audit log. It ends by itself.
      </p>
    </>
  );
}

/**
 * A site's launch grace: start it when the site goes live, watch it count down, end it early if you must. It switches
 * itself off after 7 days, so nobody has to remember to.
 */
export function LaunchGrace({ siteId, until, now, canStart }: Props) {
  const ends = until ? new Date(until).getTime() : null;
  const running = ends !== null && ends > now;
  const elapsed = running ? Math.min(1, Math.max(0, 1 - (ends - now) / GRACE_MS)) : 0;

  const start = (label: string) => (
    <FormDialog label={label} title="Start the launch grace" icon="duration" submitLabel="Start for 7 days" pendingLabel="Starting…" action={startLaunchGrace} fields={{ siteId }}>
      <div className="text-sm text-ink-muted">
        <Explanation />
      </div>
    </FormDialog>
  );

  return (
    <section aria-label="Launch grace" className="dg-glass mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span className={`grid size-12 shrink-0 place-items-center rounded-lg ${running ? "bg-tile-butter" : "bg-surface-muted"} text-brand`}>
        <Icon name="duration" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-base font-semibold tracking-tight">Launch grace</h2>
          {running ? <StatusChip status="warning" label="Running" /> : ends ? <StatusChip status="clear" label="Ended" /> : null}
        </div>
        {running && until ? (
          <>
            <p className="mt-1 text-sm text-ink-muted">
              <span className="font-semibold text-ink">{`${duration(now, until)} left`}</span>
              {` · ends ${when(until)}. Cars with no DigiGate entry are asked about, not stopped.`}
            </p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-pill bg-surface-muted" role="progressbar" aria-label="Launch grace used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed * 100)}>
              <div className="h-full rounded-pill bg-brand" style={{ width: `${Math.max(2, elapsed * 100)}%` }} />
            </div>
          </>
        ) : ends && until ? (
          <p className="mt-1 text-sm text-ink-muted">{`Ended ${when(until)}. Cars with no DigiGate entry are stopped as normal.`}</p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">
            {canStart
              ? "Going live here? Start it, so cars already parked aren't stopped on their way out. It runs 7 days and ends by itself."
              : "Going live here? Ask DigiGate to start it, so cars already parked aren't stopped on their way out. It runs 7 days and ends by itself."}
          </p>
        )}
      </div>
      <div className="shrink-0">
        {!canStart ? null : running ? (
          <ConfirmAction label="End now" title="End the launch grace now?" confirmLabel="Yes, end it" pendingLabel="Ending…" tone="danger" icon="result-warning" action={endLaunchGrace} fields={{ siteId }}>
            From now on, a car leaving with no DigiGate entry is stopped as &ldquo;No entry record&rdquo;. Handhelds pick this up on their next sync.
          </ConfirmAction>
        ) : (
          start(ends ? "Start again" : "Start launch grace")
        )}
      </div>
    </section>
  );
}
