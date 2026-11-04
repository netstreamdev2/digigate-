import Image from "next/image";

import type { CompanyBrand } from "@/lib/company-brand";
import { accentOf } from "@/lib/company-theme";

type Props = {
  company: Pick<CompanyBrand, "id" | "name" | "logoUrl" | "color">;
  size: number;
  /**
   * Names this mark for the page transition, so the same company's mark on the next page grows out of this one. Only
   * one mark per company may be named on a page at a time.
   */
  morph?: boolean;
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

/** A company's logo on a white tile, or its initials on its own colour until it has one. */
export function CompanyMark({ company, size, morph = false }: Props) {
  const style = {
    width: size,
    height: size,
    viewTransitionName: morph ? `company-${company.id}` : undefined,
    // White initials need a colour dark enough to read on, whatever the company's own is.
    ...(company.logoUrl ? {} : { background: company.color ? accentOf(company.color) : "var(--dg-color-brand)" }),
  };
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[28%] ${morph ? "dg-morph" : ""} ${company.logoUrl ? "bg-surface shadow-card ring-1 ring-border" : "text-ink-inverse"}`}
      style={style}
    >
      {company.logoUrl ? (
        <Image src={company.logoUrl} alt={`${company.name} logo`} width={size} height={size} unoptimized className="size-[82%] object-contain" />
      ) : (
        <span className="font-display font-bold tracking-tight" style={{ fontSize: Math.round(size * 0.38) }} aria-hidden="true">
          {initialsOf(company.name)}
        </span>
      )}
    </span>
  );
}
