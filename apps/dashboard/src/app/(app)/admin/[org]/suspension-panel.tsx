import { ConfirmAction } from "@/components/dialog";
import { FormDialog } from "@/components/form-dialog";
import { TextAreaField } from "@/components/form";
import { Icon } from "@/components/icon";
import { shortDate, timeOfDay } from "@/lib/format";

import { reinstateCompany, suspendCompany } from "../actions";

type Props = { orgId: string; company: string; suspendedAt: string | null; reason: string | null; canManage: boolean };

/**
 * A super user's switch for a company that doesn't pay. Suspended, its people see a suspended notice and no data, its
 * handhelds pause at their next sync, and its hosts can't invite; reinstating brings all of it back as it was.
 */
export function SuspensionPanel({ orgId, company, suspendedAt, reason, canManage }: Props) {
  if (suspendedAt) {
    return (
      <section aria-label="Suspended" className="dg-trouble mt-6 flex flex-col gap-4 rounded-[28px] bg-blocked-soft p-5 sm:flex-row sm:items-center">
        <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-surface text-blocked">
          <Icon name="lock" className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold tracking-tight text-ink">{`${company} is suspended`}</p>
          <p className="text-sm text-ink-muted">{`Since ${shortDate(suspendedAt)}, ${timeOfDay(suspendedAt)}${reason ? ` · ${reason}` : ""}. Its dashboard, handhelds and invites are paused; nothing has been deleted.`}</p>
        </div>
        {canManage ? <ConfirmAction
          label="Reinstate"
          title={`Reinstate ${company}?`}
          confirmLabel="Yes, reinstate"
          pendingLabel="Reinstating…"
          tone="neutral"
          icon="unlock"
          action={reinstateCompany}
          fields={{ orgId }}
        >
          Its people get their dashboard back at once, and its handhelds come back at their next sync.
        </ConfirmAction> : null}
      </section>
    );
  }

  return (
    <section aria-label="Service" className="mt-6 flex flex-col gap-3 rounded-[28px] bg-tile-mint p-5 sm:flex-row sm:items-center">
      <span className="grid size-12 shrink-0 place-items-center rounded-pill bg-surface text-clear">
        <Icon name="result-clear" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">Service active</p>
        <p className="text-sm text-ink-muted">This company&apos;s dashboard, handhelds and invites are active. DigiGate super users manage suspensions.</p>
      </div>
      {canManage ? <FormDialog compact label="Suspend this company" title={`Suspend ${company}`} icon="lock" submitLabel="Suspend" pendingLabel="Suspending…" action={suspendCompany} fields={{ orgId }}>
        <p className="text-sm text-ink-muted">
          Its people see a suspended notice instead of their dashboard. Its handhelds stop checking people in at their next sync, but keep sending what
          they recorded. Its hosts can&apos;t invite. Nothing is deleted.
        </p>
        <TextAreaField label="Reason (its people will see this)" name="reason" rows={3} maxLength={300} placeholder="Invoice 112 is 30 days overdue" required />
      </FormDialog> : null}
    </section>
  );
}
