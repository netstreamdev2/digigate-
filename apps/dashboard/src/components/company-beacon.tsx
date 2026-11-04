"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";

import type { CompanyBrand } from "@/lib/company-brand";
import { enterCompany, stayInCompany } from "@/lib/company-context";

/**
 * Tells the sidebar about this page's company, before the page paints, so the rail and the company's own sidebar
 * arrive with it.
 *
 * A page that lives under the company (its sites, its admin, its reports: the company is in the path) takes a super
 * user inside it. A page merely filtered to a company keeps them inside if they already are, and otherwise leaves
 * them where they were, on the everyday view of every company. `siteId` keeps the company in place on a site's page.
 */
export function CompanyBeacon({ company, siteId = null }: { company: CompanyBrand; siteId?: string | null }) {
  const { id, name, logoUrl, color } = company;
  const underCompany = usePathname().includes(id);
  useLayoutEffect(() => {
    const brand = { id, name, logoUrl, color };
    const context = { company: brand, keys: siteId ? [id, siteId] : [id] };
    if (underCompany) {
      enterCompany(context);
    } else {
      stayInCompany(context);
    }
  }, [id, name, logoUrl, color, siteId, underCompany]);
  return null;
}
