import { countLabel } from "@digigate/core";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { FilterBar } from "@/components/filter-bar";
import { GlassStat } from "@/components/glass";
import { Icon } from "@/components/icon";
import { Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { DateRange } from "@/components/report-controls";
import { FilterSelect, SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { checkRowOf } from "@/lib/check-rows";
import { checkPage, type CheckDirection, type CheckLane, type CheckResult } from "@/lib/checks";
import { companyBrand } from "@/lib/company-brand";
import { addDays, dayParam, longDate, siteToday } from "@/lib/format";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { supabaseServer } from "@/lib/supabase/server";

import { CheckActivity } from "../control-room/check-activity";

const DEFAULT_DAYS = 7;
/** A wider range is cut to this many days, so a search stays quick however busy the gates are. */
const LONGEST_DAYS = 92;
const MOST_CHOICES = 300;

const RESULTS = [
  { value: "clear", label: "Clear" },
  { value: "warning", label: "Warnings" },
  { value: "blocked", label: "Blocked" },
] as const;

const LANES = [
  { value: "vehicle", label: "Vehicles" },
  { value: "pedestrian", label: "Pedestrians" },
] as const;

const pick = <T extends string>(value: string, options: readonly { value: T }[]): T | "" => options.find((option) => option.value === value)?.value ?? "";

async function Checks({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const acrossCompanies = isDigiGateStaff(user);

  const query = await searchParams;
  const now = readClock();
  const today = siteToday(now);
  const toDay = dayParam(query, today, "to");
  const asked = dayParam(query, addDays(today, -(DEFAULT_DAYS - 1)), "from");
  const fromDay = asked < addDays(toDay, -(LONGEST_DAYS - 1)) ? addDays(toDay, -(LONGEST_DAYS - 1)) : asked;
  const directionParam = textParam(query, "direction");
  const direction: CheckDirection = directionParam === "in" || directionParam === "out" ? directionParam : "";
  const result: CheckResult = pick(textParam(query, "result"), RESULTS);
  const lane: CheckLane = pick(textParam(query, "lane"), LANES);
  const search = textParam(query, "q");
  const page = pageParam(query);
  const supabase = await supabaseServer();
  const companies = acrossCompanies ? must(await supabase.from("organisations").select("id, name").order("name").limit(MOST_CHOICES)) : [];
  const company = companies.find((row) => row.id === textParam(query, "company"))?.id ?? "";
  // Sites to narrow to: one company's when a super user is inside it, otherwise the ones this person looks after.
  let siteList = supabase.from("sites").select("id, name").eq("is_active", true).order("name").limit(MOST_CHOICES);
  if (company) siteList = siteList.eq("org_id", company);
  const sites = acrossCompanies && !company ? [] : must(await siteList);
  const site = sites.find((row) => row.id === textParam(query, "site"))?.id ?? "";

  // DigiGate's own checks and those brought over from a site's old gate system, in one list.
  const [{ checks, total }, brand] = await Promise.all([
    checkPage({ fromDay, toDay, search, direction, result, lane, company, site }, page),
    company ? companyBrand(company) : null,
  ]);
  const severalDays = fromDay !== toDay;
  const showSite = sites.length !== 1 && !site;
  const tabHref = (next: CheckDirection) => pageHref("/checks", { ...query, direction: next || undefined }, 1);

  return (
    <AppShell
      company={brand}
      eyebrow="Everyone who came in and went out, searched by name, plate or day"
      title="Checks"
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassStat
          label={direction === "in" ? "Entries" : direction === "out" ? "Exits" : "Checks"}
          value={countLabel(total)}
          icon="visits"
          meaning={direction === "in" ? "entry" : direction === "out" ? "exit" : "neutral"}
          note={severalDays ? `${longDate(fromDay)} to ${longDate(toDay)}` : longDate(fromDay)}
        />
      </section>


      <div className="mt-6">
        <Tabs
          items={[
            { label: "In and out", href: tabHref(""), active: direction === "" },
            { label: "Coming in", href: tabHref("in"), active: direction === "in" },
            { label: "Going out", href: tabHref("out"), active: direction === "out" },
          ]}
        />
      </div>

      <FilterBar label="Filter the checks">
        <SearchBox placeholder="Name, plate or car: white hatchback" />
        {acrossCompanies ? <FilterSelect name="company" label="All companies" options={companies.map((row) => ({ value: row.id, label: row.name }))} /> : null}
        {sites.length > 1 ? <FilterSelect name="site" label="All sites" options={sites.map((row) => ({ value: row.id, label: row.name }))} /> : null}
        <FilterSelect name="lane" label="Vehicles and pedestrians" options={LANES} />
        <FilterSelect name="result" label="Every result" options={RESULTS} />
        <DateRange from={fromDay} to={toDay} latest={today} />
      </FilterBar>

      <section className="dg-glass mt-6 overflow-hidden">
        {checks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Icon name="visits" className="size-8 text-ink-subtle" />
            <p className="text-sm text-ink-muted">
              {search || result || lane || site ? "No check matches all of that. Try fewer filters or more days." : "No checks on these days."}
            </p>
          </div>
        ) : (
          <div className="px-2 pt-2 sm:px-4">
            <CheckActivity rows={checks.map((check) => checkRowOf(check, showSite ? `${check.gate} · ${check.siteName}` : check.gate, now, severalDays))} />
          </div>
        )}
        <Pagination page={page} total={total} hrefFor={(next) => pageHref("/checks", query, next)} />
      </section>
    </AppShell>
  );
}

export default function ChecksPage({ searchParams }: PageProps<"/checks">) {
  return (
    <Suspense fallback={<PageSkeleton variant="tiles" />}>
      <Checks searchParams={searchParams} />
    </Suspense>
  );
}
