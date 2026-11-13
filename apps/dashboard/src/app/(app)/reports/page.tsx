import { compactCount, countLabel, shortDay } from "@digigate/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type CSSProperties } from "react";

import { FilterBar } from "@/components/filter-bar";
import { AppShell } from "@/components/app-shell";
import { CompanyMark } from "@/components/company-mark";
import { PageSkeleton } from "@/components/skeleton";
import { GlassStat, type Trend } from "@/components/glass";
import { Icon } from "@/components/icon";
import { problemWhen } from "@/components/tile-colour";
import { Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { Sparkline } from "@/components/report-charts";
import { DayPicker } from "@/components/report-controls";
import { SearchBox } from "@/components/search-box";
import { addDays, dayParam, plural, siteToday } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { BOARD_PAGE_SIZE, dayTotals, reportBoard, trendFor, type CompanyDay } from "@/lib/reports";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";

const AGAINST = "the day before";

function Figure({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs text-ink-muted">{label}</dt>
      <dd className={`mt-0.5 font-display text-lg font-semibold tabular-nums tracking-tight ${alert && value > 0 ? "text-blocked" : ""}`}>{countLabel(value)}</dd>
    </div>
  );
}

function CompanyCard({ company, day, index }: { company: CompanyDay; day: string; index: number }) {
  const quiet = company.checks === 0;
  const style = {
    "--dg-i": index,
    ...(company.brand.color ? { "--dg-card-glow": `color-mix(in srgb, ${company.brand.color} 45%, transparent)` } : {}),
  } as CSSProperties;
  return (
    <Link
      href={`/reports/${company.id}?day=${day}`}
      data-morph={`company-${company.id}`}
      style={style}
      className="dg-glass dg-company-card group flex flex-col p-5"
    >
      <div className="flex items-start gap-4">
        <span className="dg-card-mark">
          <CompanyMark company={company.brand} size={48} morph />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold tracking-tight">{company.company}</h2>
          <p className="mt-0.5 truncate text-sm text-ink-muted">{`${countLabel(company.activeSites)} of ${plural(company.sites, "site")} active`}</p>
        </div>
        <Icon name="chevron-right" className="dg-card-arrow mt-1 size-5 shrink-0 text-ink-subtle" />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={`font-display text-4xl font-semibold tabular-nums tracking-tight ${quiet ? "text-ink-subtle" : ""}`}>{compactCount(company.checks)}</p>
          <p className="text-xs text-ink-muted">{quiet ? "No scans this day" : `scans on ${shortDay(day)}`}</p>
        </div>
        <Sparkline points={company.trend} label={`Scans over the 7 days to ${shortDay(day)}: ${company.trend.join(", ")}`} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-ink/10 pt-4">
        <Figure label="Entries" value={company.entries} />
        <Figure label="Blocked" value={company.blocked} alert />
        <Figure label="Warnings" value={company.warnings} />
      </dl>
    </Link>
  );
}

async function Board({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const acrossCompanies = isDigiGateStaff(user);
  if (!acrossCompanies && !user.roles.includes("admin")) redirect("/control-room");

  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const today = siteToday(readClock());
  const day = dayParam(query, today);

  const [{ companies, total }, { today: figures, before }] = await Promise.all([reportBoard(day, search, page), dayTotals(day)]);

  if (!acrossCompanies && companies[0]) redirect(`/reports/${companies[0].id}?day=${day}`);

  // A day still running can't be fairly compared with a whole one.
  const running = day === today;
  const moved = (now: number, then: number, upMeans?: "bad"): { trend?: Trend; note?: string } => (running ? { note: "So far today" } : { trend: trendFor(now, then, AGAINST, upMeans) });

  return (
    <AppShell
      eyebrow="Every company's day at the gate, busiest first"
      title="Reports"
      chips={
        <>
          <DayPicker day={day} previous={addDays(day, -1)} next={day < today ? addDays(day, 1) : null} label={day === today ? "Today" : shortDay(day)} />
        </>
      }
    >
      <section aria-label="Across every company" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassStat label="Scans" value={compactCount(figures.checks)} icon="visits" {...moved(figures.checks, before.checks)} />
        <GlassStat label="Entries" value={compactCount(figures.entries)} icon="entry" meaning="entry" {...moved(figures.entries, before.entries)} />
        <GlassStat label="Stopped at the gate" value={compactCount(figures.blocked)} icon="result-blocked" meaning={problemWhen(figures.blocked)} {...moved(figures.blocked, before.blocked, "bad")} />
        <GlassStat label="Companies active" value={countLabel(figures.companies)} icon="sites" note={`of ${countLabel(total)} ${total === 1 ? "company" : "companies"}`} />
      </section>

      <FilterBar label="Filter the companies">
        <SearchBox placeholder="Search a company" />
      </FilterBar>

      {companies.length === 0 ? (
        <div className="dg-glass mt-6 px-5 py-14 text-center text-sm text-ink-muted">{search ? "No company matches that." : "No companies yet."}</div>
      ) : (
        <section aria-label="Companies" className="dg-ripple mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((company, index) => (
            <CompanyCard key={company.id} company={company} day={day} index={index} />
          ))}
        </section>
      )}

      <div className="dg-glass mt-6 overflow-hidden empty:hidden">
        <Pagination page={page} total={total} pageSize={BOARD_PAGE_SIZE} hrefFor={(next) => pageHref("/reports", query, next)} />
      </div>
    </AppShell>
  );
}

export default function ReportsPage({ searchParams }: PageProps<"/reports">) {
  return (
    <Suspense fallback={<PageSkeleton variant="cards" />}>
      <Board searchParams={searchParams} />
    </Suspense>
  );
}
