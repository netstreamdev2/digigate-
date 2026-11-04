"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SitePicker } from "@/app/(app)/setup/gate-staff-form";
import type { SiteChoice } from "@/app/(app)/setup/actions";

import { CancelButton, Dialog, DialogHeading, useDialog } from "./dialog";
import type { IconName } from "./icon";

type Props = {
  label: string;
  title: string;
  icon: IconName;
  pickLabel: string;
  /** Only this company's sites are offered, for a super user working inside it. */
  orgId?: string;
  /** The form, once a site is chosen. `close` shuts the popup; `changeSite` goes back to the search. */
  children: (site: SiteChoice, controls: { close: () => void; changeSite: () => void }) => ReactNode;
};

/**
 * A popup that starts by finding the site, which also says which company it's for, then shows the form. The page
 * catches up when it closes.
 */
export function SiteFirstDialog({ label, title, icon, pickLabel, orgId = "", children }: Props) {
  const dialog = useDialog();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [site, setSite] = useState<SiteChoice | null>(null);

  const reset = () => {
    setOpen(false);
    setSite(null);
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          dialog.open();
        }}
        className="inline-flex h-11 shrink-0 items-center rounded-pill bg-brand px-5 text-sm font-semibold text-ink-inverse shadow-floating transition hover:bg-ink"
      >
        {label}
      </button>
      <Dialog dialogRef={dialog.ref} onClose={reset} wide={site !== null}>
        <DialogHeading icon={icon} tone="neutral" title={title} />
        {open ? (
          site ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface-muted px-4 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-semibold">{site.name}</span>
                  {site.detail ? <span className="text-ink-muted">{` · ${site.detail}`}</span> : null}
                </span>
                <button type="button" onClick={() => setSite(null)} className="text-xs font-semibold text-brand hover:underline">
                  Change site
                </button>
              </div>
              {children(site, { close: dialog.close, changeSite: () => setSite(null) })}
            </div>
          ) : (
            <>
              <div className="mt-5">
                <SitePicker onPick={setSite} label={pickLabel} orgId={orgId} />
              </div>
              <div className="mt-5 flex justify-end">
                <CancelButton onClick={dialog.close} />
              </div>
            </>
          )
        ) : null}
      </Dialog>
    </>
  );
}
