import { countLabel } from "@digigate/core";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { problemWhen } from "@/components/tile-colour";
import { PageSkeleton } from "@/components/skeleton";
import { FilterBar } from "@/components/filter-bar";
import { GlassStat } from "@/components/glass";
import { Icon } from "@/components/icon";
import { Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { DateRange } from "@/components/report-controls";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { asAuditCategory, AUDIT_CATEGORIES, auditCounts, auditEntries, CATEGORY_LOOK, type AuditEntry } from "@/lib/audit";
import { companyBrand } from "@/lib/company-brand";
import { addDays, dayParam, longDate, siteMidnightUtc, siteToday, timeWithSeconds } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

const DEFAULT_DAYS = 30;
const MOST_COMPANIES = 500;

function EntryRow({ entry }: { entry: AuditEntry }) {
  const look = CATEGORY_LOOK[entry.category];
  return (
    <li className="flex gap-3.5 px-5 py-3.5">
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-pill text-brand ${look.tint}`} title={look.label}>
        <Icon name={look.icon} className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">
          <span className="font-semibold text-ink">{entry.actor}</span> {entry.words}
          {entry.target ? <span className="font-medium text-ink"> {entry.target}</span> : null}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{[entry.detail, entry.company].filter(Boolean).join(" · ")}</p>
      </div>
      <time dateTime={entry.at} className="shrink-0 pt-0.5 text-xs tabular-nums text-ink-subtle">
        {timeWithSeconds(entry.at)}
      </time>
    </li>
  );
}

/** The entries of one page, under a heading for each day they fall on. */
function byDay(entries: readonly AuditEntry[]): { day: string; entries: AuditEntry[] }[] {
  const days: { day: string; entries: AuditEntry[] }[] = [];
  for (const entry of entries) {
    const day = siteToday(new Date(entry.at).getTime());
    const last = days[days.length - 1];
    if (last?.day === day) last.entries.push(entry);
    else days.push({ day, entries: [entry] });
  }
  return days;
}

async function AuditLog({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const isSuperUser = user.roles.includes("super_user");
  if (!isSuperUser && !user.roles.includes("admin")) redirect("/control-room");

  const query = await searchParams;
  const today = siteToday(readClock());
  const toDay = dayParam(query, today, "to");
  const fromDay = dayParam(query, addDays(today, -DEFAULT_DAYS), "from");
  const category = asAuditCategory(textParam(query, "category"));
  const search = textParam(query, "q");
  const page = pageParam(query);

  const supabase = await supabaseServer();
  const companies = isSuperUser ? must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_COMPANIES)) : [];
  const company = companies.find((row) => row.id === textParam(query, "company"))?.id ?? "";

  const range = { company, from: siteMidnightUtc(fromDay), to: siteMidnightUtc(addDays(toDay, 1)) };
  const [{ entries, total }, counts] = await Promise.all([auditEntries({ ...range, search, category }, page), auditCounts(range)]);
  const everything = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <AppShell
      company={company ? await companyBrand(company) : null}
      eyebrow="Everything that happened: at the gates, across each site and on the dashboard. Nothing here can be changed or deleted."
      title="Audit log"
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassStat label="Entries in this range" value={countLabel(everything)} icon="audit-log" note={`${longDate(fromDay)} to ${longDate(toDay)}`} />
        <GlassStat label="At the gate" value={countLabel(counts.gate ?? 0)} icon="guard" note="Overrides, decisions and shifts" />
        <GlassStat label="Dashboard changes" value={countLabel((counts.setup ?? 0) + (counts.people ?? 0) + (counts.devices ?? 0))} icon="settings" note="Setup, people and devices" />
        <GlassStat label="Flags at the sites" value={countLabel(counts.alerts ?? 0)} icon="alerts" meaning={problemWhen(counts.alerts ?? 0)} note="Every mismatch and alarm, and who closed it" />
      </section>

      <div className="mt-6">
        <Tabs
          items={[
            { label: "Everything", href: pageHref("/audit", { ...query, category: undefined }, 1), active: category === null, count: everything },
            ...AUDIT_CATEGORIES.map((item) => ({
              label: CATEGORY_LOOK[item].label,
              href: pageHref("/audit", { ...query, category: item }, 1),
              active: item === category,
              count: counts[item] ?? 0,
            })),
          ]}
        />
      </div>

      <FilterBar label="Filter the log">
        <SearchBox placeholder="Search a person, device, site or rule" />
        {isSuperUser ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
        <DateRange from={fromDay} to={toDay} latest={today} />
      </FilterBar>

      <section aria-label="Log entries" className="dg-glass mt-6 overflow-hidden">
        {entries.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-ink-muted">{search ? "Nothing matches that search." : "Nothing was logged in this range."}</p>
        ) : (
          byDay(entries).map(({ day, entries: dayEntries }) => (
            <div key={day}>
              <h2 className="border-b border-ink/10 bg-ink/[0.03] px-5 py-2 text-xs font-semibold text-ink-muted">{longDate(day)}</h2>
              <ol className="divide-y divide-ink/10">
                {dayEntries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ol>
            </div>
          ))
        )}
        <Pagination page={page} total={total} hrefFor={(next) => pageHref("/audit", query, next)} />
      </section>
    </AppShell>
  );
}

export default function AuditPage({ searchParams }: PageProps<"/audit">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AuditLog searchParams={searchParams} />
    </Suspense>
  );
}
