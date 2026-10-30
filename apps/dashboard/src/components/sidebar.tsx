import Image from "next/image";

import { Icon, type IconName } from "./icon";

export type NavItem = {
  label: string;
  icon: IconName;
  badge?: number;
  active?: boolean;
};

type Props = {
  items: readonly NavItem[];
  userName: string;
  userRole: string;
};

export function Sidebar({ items, userName, userRole }: Props) {
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
