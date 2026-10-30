import Image from "next/image";
import type { ReactNode } from "react";

import { Icon } from "./icon";
import { Sidebar, type NavItem } from "./sidebar";

type Props = {
  nav: readonly NavItem[];
  user: { name: string; role: string };
  eyebrow: string;
  title: string;
  /** Chips under the title, e.g. the time range and live status. */
  chips?: ReactNode;
  alertCount?: number;
  children: ReactNode;
};

/** The frame every dashboard page shares: sidebar, page title, search and alerts. */
export function AppShell({ nav, user, eyebrow, title, chips, alertCount, children }: Props) {
  return (
    <div className="flex min-h-screen">
      <Sidebar items={nav} userName={user.name} userRole={user.role} />

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        <Image src="/logo.svg" alt="DigiGate" width={104} height={33} unoptimized className="mb-6 lg:hidden" />

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink-muted">{eyebrow}</p>
            <h1 className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-pill border border-border bg-surface px-4 sm:w-80 sm:flex-none">
              <Icon name="search" className="size-5 shrink-0 text-ink-subtle" />
              <span className="sr-only">Search</span>
              <input
                type="search"
                placeholder="Search a plate, name or visit"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-subtle"
              />
            </label>
            <button
              type="button"
              aria-label={alertCount ? `${alertCount} open alerts` : "Alerts"}
              className="relative grid size-11 shrink-0 place-items-center rounded-pill bg-surface text-ink shadow-card"
            >
              <Icon name="bell" />
              {alertCount ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-pill border-2 border-surface-muted bg-badge px-1 text-[11px] font-semibold text-ink-inverse">
                  {alertCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        {chips ? <div className="mt-6 flex flex-wrap items-center gap-2">{chips}</div> : null}

        {children}
      </main>
    </div>
  );
}

export function RangeChip({ label }: { label: string }) {
  return (
    <span className="inline-flex h-9 items-center rounded-pill bg-ink px-4 text-sm font-semibold text-ink-inverse">{label}</span>
  );
}

export function LiveChip({ updatedAt }: { updatedAt: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-pill bg-clear-soft px-4 text-sm font-semibold text-clear">
      <span className="size-2 rounded-pill bg-clear" aria-hidden="true" />
      Live · updated {updatedAt}
    </span>
  );
}
