import add from "@digigate/design/icons/add";
import alerts from "@digigate/design/icons/alerts";
import approvals from "@digigate/design/icons/approvals";
import auditLog from "@digigate/design/icons/audit-log";
import back from "@digigate/design/icons/back";
import bell from "@digigate/design/icons/bell";
import calendar from "@digigate/design/icons/calendar";
import check from "@digigate/design/icons/check";
import chevronRight from "@digigate/design/icons/chevron-right";
import close from "@digigate/design/icons/close";
import remove from "@digigate/design/icons/delete";
import device from "@digigate/design/icons/device";
import download from "@digigate/design/icons/download";
import duration from "@digigate/design/icons/duration";
import edit from "@digigate/design/icons/edit";
import entry from "@digigate/design/icons/entry";
import evacuation from "@digigate/design/icons/evacuation";
import exit from "@digigate/design/icons/exit";
import exportIcon from "@digigate/design/icons/export";
import externalLink from "@digigate/design/icons/external-link";
import guard from "@digigate/design/icons/guard";
import idCard from "@digigate/design/icons/id-card";
import info from "@digigate/design/icons/info";
import invite from "@digigate/design/icons/invite";
import lock from "@digigate/design/icons/lock";
import menu from "@digigate/design/icons/menu";
import numberPlate from "@digigate/design/icons/number-plate";
import offline from "@digigate/design/icons/offline";
import onSite from "@digigate/design/icons/on-site";
import override from "@digigate/design/icons/override";
import overviewFilled from "@digigate/design/icons/overview-filled";
import pedestrian from "@digigate/design/icons/pedestrian";
import people from "@digigate/design/icons/people";
import pin from "@digigate/design/icons/pin";
import refresh from "@digigate/design/icons/refresh";
import reports from "@digigate/design/icons/reports";
import resultBlocked from "@digigate/design/icons/result-blocked";
import resultClear from "@digigate/design/icons/result-clear";
import resultWarning from "@digigate/design/icons/result-warning";
import search from "@digigate/design/icons/search";
import settings from "@digigate/design/icons/settings";
import signOut from "@digigate/design/icons/sign-out";
import siteConfig from "@digigate/design/icons/site-config";
import sites from "@digigate/design/icons/sites";
import staff from "@digigate/design/icons/staff";
import supervisor from "@digigate/design/icons/supervisor";
import synced from "@digigate/design/icons/synced";
import unlock from "@digigate/design/icons/unlock";
import upload from "@digigate/design/icons/upload";
import user from "@digigate/design/icons/user";
import users from "@digigate/design/icons/users";
import vehicle from "@digigate/design/icons/vehicle";
import visitor from "@digigate/design/icons/visitor";
import visits from "@digigate/design/icons/visits";
import watchlist from "@digigate/design/icons/watchlist";

// Only the icons the dashboard uses, so the rest of the set stays out of the bundle.
const icons = {
  add,
  alerts,
  approvals,
  "audit-log": auditLog,
  back,
  bell,
  calendar,
  check,
  "chevron-right": chevronRight,
  close,
  delete: remove,
  device,
  download,
  duration,
  edit,
  entry,
  evacuation,
  exit,
  export: exportIcon,
  "external-link": externalLink,
  guard,
  "id-card": idCard,
  info,
  invite,
  lock,
  menu,
  "number-plate": numberPlate,
  offline,
  "on-site": onSite,
  override,
  "overview-filled": overviewFilled,
  pedestrian,
  people,
  pin,
  refresh,
  reports,
  "result-blocked": resultBlocked,
  "result-clear": resultClear,
  "result-warning": resultWarning,
  search,
  settings,
  "sign-out": signOut,
  "site-config": siteConfig,
  sites,
  staff,
  supervisor,
  synced,
  unlock,
  upload,
  user,
  users,
  vehicle,
  visitor,
  visits,
  watchlist,
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
