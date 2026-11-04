"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { stillInside, useCompanyContext } from "@/lib/company-context";
import { companyThemeCss, isBrandColor } from "@/lib/company-theme";

/**
 * The super user's colours, from the one place that knows which company they're inside: that company's colour while
 * they're in it, the next company's the moment they switch, and DigiGate's own as soon as they leave.
 *
 * It can't come from each page: pages visited a moment ago stay alive, hidden, so the back button is instant, and a
 * colour each of them set would linger after the super user had moved on.
 */
export function CompanyThemeSync() {
  const context = useCompanyContext();
  const address = `${usePathname()}?${useSearchParams().toString()}`;
  const color = context && stillInside(context, address) ? context.company.color : null;
  return color && isBrandColor(color) ? <style>{companyThemeCss(color)}</style> : null;
}
