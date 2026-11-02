import { Icon, type IconName } from "./icon";

const statuses = {
  clear: { label: "Clear", icon: "result-clear", className: "bg-clear-soft text-clear" },
  warning: { label: "Warning", icon: "result-warning", className: "bg-warning-soft text-warning" },
  blocked: { label: "Blocked", icon: "result-blocked", className: "bg-blocked-soft text-blocked" },
  info: { label: "Info", icon: "info", className: "bg-tile-sky text-brand" },
} as const satisfies Record<string, { label: string; icon: IconName; className: string }>;

export type Status = keyof typeof statuses;

/** `label` replaces the default word, e.g. "Online" on a clear chip; the colour and icon still carry the status. */
export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const { label: defaultLabel, icon, className } = statuses[status];
  return (
    <span className={`inline-flex h-7 items-center gap-1.5 rounded-pill px-2.5 text-xs font-semibold ${className}`}>
      <Icon name={icon} className="size-4" />
      {label ?? defaultLabel}
    </span>
  );
}
