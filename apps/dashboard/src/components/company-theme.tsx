import type { CompanyBrand } from "@/lib/company-brand";
import { companyThemeCss, isBrandColor } from "@/lib/company-theme";

/**
 * Repaints the page in a company's colour for as long as it's on screen. Leaving the company's pages takes it away
 * again, and the wash behind the glass drifts from one colour to the next (globals.css).
 */
export function CompanyTheme({ company }: { company: Pick<CompanyBrand, "color"> }) {
  if (!company.color || !isBrandColor(company.color)) return null;
  return <style>{companyThemeCss(company.color)}</style>;
}
