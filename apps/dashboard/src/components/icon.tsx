import alerts from "@digigate/design/icons/alerts";
import approvals from "@digigate/design/icons/approvals";
import auditLog from "@digigate/design/icons/audit-log";
import bell from "@digigate/design/icons/bell";
import chevronRight from "@digigate/design/icons/chevron-right";
import duration from "@digigate/design/icons/duration";
import entry from "@digigate/design/icons/entry";
import exit from "@digigate/design/icons/exit";
import info from "@digigate/design/icons/info";
import onSite from "@digigate/design/icons/on-site";
import overviewFilled from "@digigate/design/icons/overview-filled";
import people from "@digigate/design/icons/people";
import reports from "@digigate/design/icons/reports";
import resultBlocked from "@digigate/design/icons/result-blocked";
import resultClear from "@digigate/design/icons/result-clear";
import resultWarning from "@digigate/design/icons/result-warning";
import search from "@digigate/design/icons/search";
import settings from "@digigate/design/icons/settings";
import sites from "@digigate/design/icons/sites";
import users from "@digigate/design/icons/users";
import vehicle from "@digigate/design/icons/vehicle";
import visits from "@digigate/design/icons/visits";

// Only the icons the dashboard uses, so the rest of the set stays out of the bundle.
const icons = {
  alerts,
  approvals,
  "audit-log": auditLog,
  bell,
  "chevron-right": chevronRight,
  duration,
  entry,
  exit,
  info,
  "on-site": onSite,
  "overview-filled": overviewFilled,
  people,
  reports,
  "result-blocked": resultBlocked,
  "result-clear": resultClear,
  "result-warning": resultWarning,
  search,
  settings,
  sites,
  users,
  vehicle,
  visits,
} satisfies Record<string, string>;

export type IconName = keyof typeof icons;

type Props = {
  name: IconName;
  className?: string;
};

export function Icon({ name, className = "size-5" }: Props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d={icons[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
