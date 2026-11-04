import "server-only";

import { cache } from "react";

import { maybe } from "./reads";
import { supabaseServer } from "./supabase/server";

/** What a company looks like on the dashboard: its name, its logo if it has one, and the colour its pages take on. */
export type CompanyBrand = { id: string; name: string; logoUrl: string | null; color: string | null };

export const LOGO_BUCKET = "company-logos";

/** Logos are public, so they load like any other picture without a signed link per page. */
export const logoUrlOf = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/${LOGO_BUCKET}/${path}` : null;

export const brandOf = (row: { id: string; name: string; logo_path: string | null; brand_color: string | null }): CompanyBrand => ({
  id: row.id,
  name: row.name,
  logoUrl: logoUrlOf(row.logo_path),
  color: row.brand_color,
});

/** A company on the super user's cards: its brand and how it's doing right now. */
/** `onSite` counts people, a car's passengers included, as the handhelds do; `carsOnSite` the cars among them. */
export type CompanyCardData = CompanyBrand & { isActive: boolean; sites: number; gateStaff: number; onSite: number; carsOnSite: number; openAlerts: number };

type BoardRow = {
  id: string;
  name: string;
  logo_path: string | null;
  brand_color: string | null;
  is_active: boolean;
  sites: number;
  gate_staff: number;
  on_site: number;
  cars_on_site: number;
  open_alerts: number;
};

export const companyCardOf = (row: BoardRow): CompanyCardData => ({
  ...brandOf(row),
  isActive: row.is_active,
  sites: row.sites,
  gateStaff: row.gate_staff,
  onSite: row.on_site,
  carsOnSite: row.cars_on_site,
  openAlerts: row.open_alerts,
});

/** One company's brand, read once per request however many parts of the page ask. Null when it can't be seen. */
export const companyBrand = cache(async (orgId: string): Promise<CompanyBrand | null> => {
  const supabase = await supabaseServer();
  const row = maybe(await supabase.from("organisations").select("id, name, logo_path, brand_color").eq("id", orgId).maybeSingle());
  return row ? brandOf(row) : null;
});

/** The brand of the company a site belongs to, for pages that start from a site. */
export const siteCompanyBrand = cache(async (siteId: string): Promise<CompanyBrand | null> => {
  const supabase = await supabaseServer();
  const row = maybe(await supabase.from("sites").select("org_id").eq("id", siteId).maybeSingle());
  return row ? companyBrand(row.org_id) : null;
});
