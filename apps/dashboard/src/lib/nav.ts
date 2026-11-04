import type { NavItem } from "@/components/sidebar";

import type { CurrentUser } from "./session";

/** Who looks after the hotlist and books visitors in: the people running a company's sites day to day. */
export const canWatchGates = (user: CurrentUser) => ["super_user", "admin", "manager", "control_room"].some((role) => user.roles.includes(role));

const isAdministrator = (user: CurrentUser) => user.roles.includes("super_user") || user.roles.includes("admin");

/** The sidebar for the signed-in dashboard. Setting things up is for administrators. */
export function appNav(user: CurrentUser): readonly NavItem[] {
  const items: NavItem[] = [{ label: "Control room", icon: "on-site", href: "/control-room" }];
  if (canWatchGates(user)) {
    items.push({ label: "Hotlist", icon: "watchlist", href: "/hotlist" }, { label: "Expected visitors", icon: "invite", href: "/expected" });
  }
  if (isAdministrator(user)) {
    items.push(
      { label: "Devices", icon: "device", href: "/devices" },
      { label: "Reports", icon: "reports", href: "/reports" },
      { label: "Audit log", icon: "audit-log", href: "/audit" },
      { label: "Companies", icon: "sites", href: "/setup" },
      { label: "People", icon: "people", href: "/people" },
      { label: "Admin", icon: "settings", href: "/admin" },
    );
  }
  return items;
}
