import type { NavItem } from "@/components/sidebar";

import type { CurrentUser } from "./session";
import { canAdminister, isDigiGateStaff } from "./access";

/** Who looks after the hotlist and books visitors in: the people running a company's sites day to day. */
export const canWatchGates = (user: CurrentUser) => isDigiGateStaff(user) || ["admin", "manager", "control_room"].some((role) => user.roles.includes(role));

/** The sidebar for the signed-in dashboard. Setting things up is for administrators. */
export function appNav(user: CurrentUser): readonly NavItem[] {
  const items: NavItem[] = [
    { label: "Control room", icon: "on-site", href: "/control-room" },
    { label: "Checks", icon: "visits", href: "/checks" },
  ];
  if (canWatchGates(user)) {
    // The control room sees battery, network and location; DigiGate staff see the full handheld diagnostics.
    items.push(
      { label: "Hotlist", icon: "watchlist", href: "/hotlist" },
      { label: "Expected visitors", icon: "invite", href: "/expected" },
      { label: "Devices", icon: "device", href: "/devices" },
    );
  }
  if (canAdminister(user)) {
    items.push(
      { label: "Reports", icon: "reports", href: "/reports" },
      { label: "Audit log", icon: "audit-log", href: "/audit" },
      { label: "Companies", icon: "sites", href: "/setup" },
      { label: "People", icon: "people", href: "/people" },
      { label: "Admin", icon: "settings", href: "/admin" },
    );
    if (isDigiGateStaff(user)) items.push({ label: "Site licences", icon: "sites", href: "/setup/licence-requests" });
  }
  return items;
}
