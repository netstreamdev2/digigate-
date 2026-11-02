import type { NavItem } from "@/components/sidebar";

import type { CurrentUser } from "./session";

type AppPage = "control-room" | "devices" | "reports" | "audit" | "setup" | "people";

/** The sidebar for the pages that run on real data. Setting things up is for administrators. */
export function appNav(user: CurrentUser, active: AppPage): readonly NavItem[] {
  const items: NavItem[] = [{ label: "Control room", icon: "on-site", href: "/control-room", active: active === "control-room" }];
  if (user.roles.includes("super_user") || user.roles.includes("admin")) {
    items.push(
      { label: "Devices", icon: "device", href: "/devices", active: active === "devices" },
      { label: "Reports", icon: "reports", href: "/reports", active: active === "reports" },
      { label: "Audit log", icon: "audit-log", href: "/audit", active: active === "audit" },
      { label: "Companies", icon: "sites", href: "/setup", active: active === "setup" },
      { label: "People", icon: "people", href: "/people", active: active === "people" },
    );
  }
  return items;
}
