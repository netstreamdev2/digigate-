import type { ReactNode } from "react";

import type { CompanyBrand } from "@/lib/company-brand";
import { currentUser } from "@/lib/session";

import { CompanyBanner } from "./company-banner";
import { CompanyTheme } from "./company-theme";

type Props = {
  /** A short line above the title, or breadcrumbs. */
  eyebrow: ReactNode;
  title: string;
  /** Chips under the title, e.g. search and the live status. */
  chips?: ReactNode;
  /** The page's main buttons, level with the title. */
  actions?: ReactNode;
  /**
   * The company whose records these are. Its colours repaint the page, and a super user gets a banner saying whose
   * company they're working inside. People who work for the company have its logo in the sidebar instead.
   */
  company?: CompanyBrand | null;
  children: ReactNode;
};

/** The top of every dashboard page and what's under it. The sidebar around it lives in the layout and stays put. */
export async function AppShell({ eyebrow, title, chips, actions, company = null, children }: Props) {
  const user = company ? await currentUser() : null;
  const asSuperUser = user?.roles.includes("super_user") ?? false;

  return (
    <div className="dg-page">
      {company ? <CompanyTheme company={company} /> : null}
      {company && asSuperUser ? <CompanyBanner company={company} /> : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink-muted">{eyebrow}</div>
          <h1 className="dg-page-title mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {chips ? <div className="mt-6 flex flex-wrap items-center gap-2">{chips}</div> : null}

      {children}
    </div>
  );
}
