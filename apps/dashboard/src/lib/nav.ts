import type { NavItem } from "@/components/sidebar";

type AdminPage = "setup" | "people";

/** The sidebar for the pages that run on real data. */
export function adminNav(active: AdminPage): readonly NavItem[] {
  return [
    { label: "Companies", icon: "sites", href: "/setup", active: active === "setup" },
    { label: "People", icon: "people", href: "/people", active: active === "people" },
  ];
}
