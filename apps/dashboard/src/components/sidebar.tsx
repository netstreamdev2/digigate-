import Image from "next/image";

import { Icon, type IconName } from "./icon";

type NavItem = {
  label: string;
  icon: IconName;
  badge?: number;
  active?: boolean;
};

const items: readonly NavItem[] = [
  { label: "Overview", icon: "overview-filled", active: true },
  { label: "Live on site", icon: "on-site" },
  { label: "Visits", icon: "visits" },
  { label: "Alerts", icon: "alerts", badge: 3 },
  { label: "People", icon: "people" },
  { label: "Approvals", icon: "approvals", badge: 2 },
  { label: "Users", icon: "users" },
  { label: "Sites & gates", icon: "sites" },
  { label: "Reports", icon: "reports" },
  { label: "Audit log", icon: "audit-log" },
  { label: "Settings", icon: "settings" },
];

type Props = {
  userName: string;
  userRole: string;
};

export function Sidebar({ userName, userRole }: Props) {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex">
      <div className="px-3">
        <Image src="/logo.svg" alt="DigiGate" width={116} height={37} unoptimized priority />
      </div>

      <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <a
            key={item.label}
            href="#"
            aria-current={item.active ? "page" : undefined}
            className={`flex h-11 items-center gap-3 rounded-pill px-3 text-sm font-medium transition-colors ${
              item.active ? "bg-ink text-ink-inverse" : "text-ink-muted hover:bg-surface-muted hover:text-ink"
            }`}
          >
            <Icon name={item.icon} />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-pill bg-badge px-1.5 text-[11px] font-semibold text-ink-inverse">
                {item.badge}
              </span>
            ) : null}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-3 rounded-md bg-surface-muted p-3">
        <span className="grid size-10 place-items-center rounded-pill bg-tile-lilac font-display text-sm font-semibold text-brand">
          {userName.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{userName}</p>
          <p className="truncate text-xs text-ink-muted">{userRole}</p>
        </div>
      </div>
    </aside>
  );
}
