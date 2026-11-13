import { Suspense } from "react";

import { FilterBar } from "@/components/filter-bar";
import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/dialog";
import { Icon, type IconName } from "@/components/icon";
import { Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { companyBrand } from "@/lib/company-brand";
import { shortDate } from "@/lib/format";
import { canWatchGates } from "@/lib/nav";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { hotlistPage, type HotlistRow, type HotlistTab } from "@/lib/watch-lists";

import { takeOffHotlist } from "./actions";
import { AddToHotlistButton } from "./hotlist-forms";

const KIND: Record<HotlistRow["kind"], { icon: IconName; word: string }> = {
  person: { icon: "user", word: "Person" },
  plate: { icon: "number-plate", word: "Plate" },
  vin: { icon: "vehicle", word: "VIN" },
};

function Entry({ row, showCompany, inForce }: { row: HotlistRow; showCompany: boolean; inForce: boolean }) {
  const kind = KIND[row.kind];
  const where = [showCompany ? row.company : null, row.site ?? "Every site"].filter(Boolean).join(" · ");
  const ends = row.removedAt ? `Taken off ${shortDate(row.removedAt)}` : row.expiresAt ? `Until ${shortDate(row.expiresAt)}` : "Until taken off";
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-pill ${inForce ? "bg-blocked-soft text-blocked" : "bg-surface-muted text-ink-muted"}`}>
        <Icon name={kind.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="font-display text-lg font-semibold tracking-tight">{row.label}</p>
          <p className="text-sm text-ink-muted">{row.idLastFour ? `${kind.word} · ID ending ${row.idLastFour}` : kind.word}</p>
        </div>
        <p className="mt-1 text-sm">{row.reason}</p>
        <p className="mt-1 text-sm text-ink-muted">
          <span className="font-semibold text-ink">The guard is told: </span>
          {row.guardNote}
        </p>
        <p className="mt-2 text-xs text-ink-subtle">{[where, ends, `Added ${shortDate(row.addedAt)}${row.addedBy ? ` by ${row.addedBy}` : ""}`].join(" · ")}</p>
      </div>
      {inForce ? (
        <ConfirmAction
          label="Take off"
          title={`Take ${row.label} off the hotlist?`}
          confirmLabel="Take it off"
          pendingLabel="Taking off…"
          tone="danger"
          icon="watchlist"
          action={takeOffHotlist}
          fields={{ id: row.id }}
        >
          Gates stop matching it at their next sync. The entry stays in the record for three years, then it&apos;s erased.
        </ConfirmAction>
      ) : null}
    </li>
  );
}

async function Hotlist({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || !canWatchGates(user)) return <NoAccess message="The hotlist is kept by your company's administrators, managers and control room." />;

  const query = await searchParams;
  const tab: HotlistTab = textParam(query, "tab") === "off" ? "off" : "in-force";
  const search = textParam(query, "q");
  const page = pageParam(query);
  const company = isDigiGateStaff(user) ? textParam(query, "company") : "";
  const now = readClock();
  const [{ rows, total }, brand] = await Promise.all([hotlistPage({ tab, search, company }, page, now), company ? companyBrand(company) : null]);
  // The forms open on the company being looked at: the super user's chosen one, or the signed-in person's own.
  const formCompany = brand ?? (user.orgId && !isDigiGateStaff(user) ? await companyBrand(user.orgId) : null);

  const tabHref = (next: HotlistTab) => pageHref("/hotlist", { ...query, tab: next === "in-force" ? undefined : next }, 1);

  return (
    <AppShell
      company={brand}
      eyebrow="People and cars your gates stop, even offline"
      title="Hotlist"
      chips={
        <>
          <AddToHotlistButton company={formCompany ? { id: formCompany.id, name: formCompany.name } : null} />
        </>
      }
    >
      <div className="mt-6">
        <Tabs
          items={[
            { label: "In force", href: tabHref("in-force"), active: tab === "in-force", ...(tab === "in-force" ? { count: total } : {}) },
            { label: "Taken off or ended", href: tabHref("off"), active: tab === "off", ...(tab === "off" ? { count: total } : {}) },
          ]}
        />
      </div>
      <FilterBar label="Filter the hotlist">
        <SearchBox placeholder="Search a name, plate or reason" />
      </FilterBar>

      <section className="dg-glass mt-6 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Icon name="watchlist" className="size-8 text-ink-subtle" />
            <p className="text-sm text-ink-muted">
              {search ? "Nothing matches that search." : tab === "in-force" ? "Nobody is on the hotlist. Add someone the gates should stop." : "Nothing has come off the hotlist yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {rows.map((row) => (
              <Entry key={row.id} row={row} showCompany={isDigiGateStaff(user) && !company} inForce={tab === "in-force"} />
            ))}
          </ul>
        )}
        <Pagination page={page} total={total} hrefFor={(next) => pageHref("/hotlist", query, next)} />
      </section>
    </AppShell>
  );
}

export default function HotlistPage({ searchParams }: PageProps<"/hotlist">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Hotlist searchParams={searchParams} />
    </Suspense>
  );
}
