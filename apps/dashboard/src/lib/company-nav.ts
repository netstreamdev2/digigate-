import type { IconName } from "@/components/icon";

/** One of a company's own pages, in the sidebar a super user gets while working inside it. */
export type CompanyNavItem = {
  label: string;
  icon: IconName;
  href: string;
  /** Whether this address is this page, for this company. */
  isHere: (path: string, company: string | null) => boolean;
};

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);

/** Pages scoped by `?company=`, the same pages anyone else sees with the company filter set. */
const filtered = (label: string, icon: IconName, base: string, id: string): CompanyNavItem => ({
  label,
  icon,
  href: `${base}?company=${id}`,
  isHere: (path, company) => under(path, base) && company === id,
});

/** Everything a company's admin works with, in the order they reach for it. */
export function companyNav(id: string): readonly CompanyNavItem[] {
  return [
    filtered("Control room", "on-site", "/control-room", id),
    filtered("Checks", "visits", "/checks", id),
    filtered("Hotlist", "watchlist", "/hotlist", id),
    filtered("Expected visitors", "invite", "/expected", id),
    { label: "Sites", icon: "sites", href: `/setup/${id}`, isHere: (path) => under(path, `/setup/${id}`) },
    filtered("People", "people", "/people", id),
    filtered("Devices", "device", "/devices", id),
    { label: "Reports", icon: "reports", href: `/reports/${id}`, isHere: (path) => under(path, `/reports/${id}`) },
    filtered("Audit log", "audit-log", "/audit", id),
    { label: "Admin", icon: "settings", href: `/admin/${id}`, isHere: (path) => under(path, `/admin/${id}`) },
  ];
}
