import type { ReactNode } from "react";

import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { Icon } from "./icon";

/**
 * A company suspended for not paying sees this instead of its pages. The database has already shut its data off
 * (visible_site_ids, in_org); this says why, so nobody takes an empty dashboard for a fault. Super users always pass.
 */
export async function CompanyGate({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user || user.roles.includes("super_user")) return children;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc("my_company_status");
  const status = data?.[0];
  if (!status?.suspended) return children;

  return (
    <section className="mx-auto mt-[12vh] max-w-xl">
      <div className="dg-glass dg-trouble overflow-hidden p-8 text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-pill bg-blocked-soft text-blocked">
          <Icon name="lock" className="size-8" />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">DigiGate is suspended</h1>
        <p className="mt-2 text-ink-muted">{`${status.company}'s DigiGate service is paused, so its dashboard and its handhelds are switched off for now.`}</p>
        {status.reason ? (
          <div className="mx-auto mt-5 max-w-md rounded-lg bg-surface-muted px-4 py-3 text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Reason given</p>
            <p className="mt-0.5 font-medium text-ink">{status.reason}</p>
          </div>
        ) : null}
        <p className="mt-5 text-sm text-ink-muted">Nothing has been deleted. Everything comes back as it was once your account is settled.</p>
      </div>
    </section>
  );
}
