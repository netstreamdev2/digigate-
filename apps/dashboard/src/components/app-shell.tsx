import type { ReactNode } from "react";

import type { CompanyBrand } from "@/lib/company-brand";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";

import { CompanyBanner } from "./company-banner";
import { CompanyBeacon } from "./company-beacon";

type Props = {
  /** A short line above the title, or breadcrumbs. */
  eyebrow: ReactNode;
  title: string;
  /** Chips under the title, e.g. search and the live status. */
  chips?: ReactNode;
  /** The page's main buttons, level with the title. */
  actions?: ReactNode;
  /**
   * The company whose records these are. For a super user it says which company they're inside, which repaints the
   * dashboard in its colours (components/company-theme-sync.tsx) and puts a banner on the page. People who work for
   * the company already have its colours and its logo in the sidebar, from the layout.
   */
  company?: CompanyBrand | null;
  /** On a site's own page: the site, so the super user stays inside its company there. */
  siteId?: string | null;
  children: ReactNode;
};

/** The top of every dashboard page and what's under it. The sidebar around it lives in the layout and stays put. */
export async function AppShell({ eyebrow, title, chips, actions, company = null, siteId = null, children }: Props) {
  const user = company ? await currentUser() : null;
  const asDigiGateStaff = user ? isDigiGateStaff(user) : false;

  return (
    <div className="dg-page">
      {company && asDigiGateStaff ? <CompanyBeacon company={company} siteId={siteId} /> : null}
      {company && asDigiGateStaff ? <CompanyBanner company={company} role={user?.roles.includes("super_user") ? "Super user" : "Technician"} /> : null}

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
