import {
  activitySeries,
  activityUnit,
  averageStay,
  canCompare,
  compactCount,
  countLabel,
  entriesOf,
  frequencyLabel,
  hourSeries,
  isReportFrequency,
  periodHeading,
  plainLabel,
  REPORT_FREQUENCIES,
  reportScope,
  reportSubject,
  ruleLines,
  stayLabel,
  type ReportFrequency,
} from "@digigate/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { problemWhen, warningWhen } from "@/components/tile-colour";
import { PageSkeleton } from "@/components/skeleton";
import { DataTable, TwoLine } from "@/components/data-table";
import { ConfirmAction } from "@/components/dialog";
import { GlassPanel, GlassStat, type Trend } from "@/components/glass";
import { Icon } from "@/components/icon";
import { Breadcrumbs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { ColumnChart, RankBars } from "@/components/report-charts";
import { SegmentedLinks } from "@/components/report-controls";
import { FilterSelect } from "@/components/search-box";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { addDays, ago, dayParam, plural, shortDate, siteToday, timeOfDay } from "@/lib/format";
import { pageHref, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { againstPrior, companyClients, reportSchedules, reportSends, reportSummary, trendFor, type ReportSchedule, type ReportSend } from "@/lib/reports";
import { currentUser } from "@/lib/session";

import { deleteSchedule, setScheduleActive } from "../actions";
import { AutomateButton, EmailReportButton } from "../report-forms";

function ScheduleRow({ schedule }: { schedule: ReportSchedule }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{schedule.name}</p>
        <p className="truncate text-xs text-ink-muted">
          {schedule.isActive
            ? `Next ${shortDate(schedule.nextRunAt)} at ${timeOfDay(schedule.nextRunAt)} · ${plural(schedule.recipients, "recipient")}`
            : `Paused · ${plural(schedule.recipients, "recipient")}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <form action={setScheduleActive}>
          <input type="hidden" name="id" value={schedule.id} />
          <input type="hidden" name="active" value={String(!schedule.isActive)} />
          <button type="submit" className="rounded-pill bg-ink/5 px-3 py-1.5 text-xs font-semibold transition hover:bg-ink/10">
            {schedule.isActive ? "Pause" : "Resume"}
          </button>
        </form>
        <ConfirmAction
          label="Delete"
          title={`Delete ${schedule.name}?`}
          confirmLabel="Yes, delete it"
          pendingLabel="Deleting…"
          tone="danger"
          icon="delete"
          action={deleteSchedule}
          fields={{ id: schedule.id }}
        >
          It stops sending straight away. Reports it already sent stay in the history.
        </ConfirmAction>
      </div>
    </li>
  );
}

function SendRow({ send, now }: { send: ReportSend; now: number }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{send.subject}</p>
        <p className="truncate text-xs text-ink-muted">{`${ago(send.sentAt, now)} · ${plural(send.recipients, "recipient")}${send.automatic ? " · Automated" : ""}`}</p>
      </div>
      {send.failed ? <StatusChip status="blocked" label="Failed" /> : <StatusChip status="clear" label="Sent" />}
    </li>
  );
}

async function CompanyReport({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const isSuperUser = user.roles.includes("super_user");
  if (!isSuperUser && !user.roles.includes("admin")) redirect("/control-room");

  const { org } = await params;
  const query = await searchParams;
  const asked = textParam(query, "report");
  const frequency: ReportFrequency = isReportFrequency(asked) ? asked : "daily";
  const now = readClock();
  const today = siteToday(now);
  const day = dayParam(query, today);

  const clients = await companyClients(org);
  const client = clients.find((row) => row.id === textParam(query, "client"))?.id ?? "";
  const [report, schedules, sends] = await Promise.all([reportSummary(org, frequency, day, client), reportSchedules(org), reportSends(org)]);
  if (!report) return <NoAccess message="That company isn't one of yours, or it's no longer there." />;

  const path = `/reports/${org}`;
  const { totals, prior } = report;
  const against = againstPrior(frequency);
  const scope = reportScope(report);
  const period = periodHeading(report);
  const moved = (now: number, then: number, upMeans?: "bad"): { trend?: Trend; note?: string } =>
    canCompare(report) ? { trend: trendFor(now, then, against, upMeans) } : { note: "So far today" };
  const previousDay = addDays(report.from, -1);
  const nextDay = addDays(report.to, 1);
  const count = (value: number | undefined) => value ?? 0;
  const letter = { org, client, frequency, day, scope, period, subject: reportSubject(report) };
  const hasActivity = count(totals.checks) > 0;

  return (
    <AppShell
      company={await companyBrand(org)}
      eyebrow={<Breadcrumbs items={isSuperUser ? [{ label: "Reports", href: `/reports?day=${day}` }, { label: report.company }] : [{ label: "Reports" }, { label: report.company }]} />}
      title={scope}
      actions={
        <>
          <a
            href={pageHref(`${path}/pdf`, { report: frequency, day, client: client || undefined }, 1)}
            download
            className="dg-glass inline-flex h-11 items-center gap-2 rounded-pill px-4 text-sm font-semibold transition hover:bg-surface"
          >
            <Icon name="download" className="size-4" />
            PDF
          </a>
          <AutomateButton letter={letter} />
          <EmailReportButton letter={letter} />
        </>
      }
      chips={
        <>
          <SegmentedLinks
            label="Report period"
            items={REPORT_FREQUENCIES.map((item) => ({ label: frequencyLabel(item), href: pageHref(path, { ...query, report: item }, 1), active: item === frequency }))}
          />
          <div className="dg-glass flex h-11 items-center gap-1 rounded-pill px-1">
            <Link href={pageHref(path, { ...query, day: previousDay }, 1)} aria-label="The period before" className="grid size-9 place-items-center rounded-pill transition-colors hover:bg-ink/5">
              <Icon name="back" className="size-4" />
            </Link>
            <span className="px-1 text-sm font-semibold">{period}</span>
            {nextDay <= today ? (
              <Link href={pageHref(path, { ...query, day: nextDay }, 1)} aria-label="The period after" className="grid size-9 place-items-center rounded-pill transition-colors hover:bg-ink/5">
                <Icon name="chevron-right" className="size-4" />
              </Link>
            ) : (
              <span className="grid size-9 place-items-center text-ink-subtle" aria-hidden="true">
                <Icon name="chevron-right" className="size-4" />
              </span>
            )}
          </div>
          {clients.length > 0 ? <FilterSelect name="client" label="All sites" options={clients.map((row) => ({ value: row.id, label: row.name }))} /> : null}
        </>
      }
    >
      <section aria-label="Key figures" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <GlassStat label="Scans" value={compactCount(count(totals.checks))} icon="visits" {...moved(count(totals.checks), count(prior.checks))} />
        <GlassStat label="Entries" value={compactCount(entriesOf(totals))} icon="entry" meaning="entry" {...moved(entriesOf(totals), entriesOf(prior))} />
        <GlassStat label="Exits" value={compactCount(count(totals.exits))} icon="exit" meaning="exit" {...moved(count(totals.exits), count(prior.exits))} />
        <GlassStat label="Average stay" value={stayLabel(averageStay(totals))} icon="duration" {...moved(averageStay(totals), averageStay(prior))} />
        <GlassStat label="Stopped at the gate" value={compactCount(count(totals.blocked))} icon="result-blocked" meaning={problemWhen(count(totals.blocked))} {...moved(count(totals.blocked), count(prior.blocked), "bad")} />
        <GlassStat label="Warnings" value={compactCount(count(totals.warnings))} icon="result-warning" meaning={warningWhen(count(totals.warnings))} {...moved(count(totals.warnings), count(prior.warnings), "bad")} />
        <GlassStat label="Supervisor overrides" value={compactCount(count(totals.overrides))} icon="override" meaning={warningWhen(count(totals.overrides))} {...moved(count(totals.overrides), count(prior.overrides), "bad")} />
        <GlassStat label="Turned away" value={compactCount(count(totals.turned_away))} icon="exit" meaning={problemWhen(count(totals.turned_away))} {...moved(count(totals.turned_away), count(prior.turned_away))} />
      </section>

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-3">
        <GlassPanel className="min-w-0 xl:col-span-2" title="Scans over the period" subtitle={`All gates, ${activityUnit(frequency)}`}>
          {hasActivity ? <ColumnChart buckets={activitySeries(report)} unit="scans" caption="Scans over the period" /> : <p className="py-16 text-center text-sm text-ink-muted">No scans in this period.</p>}
        </GlassPanel>
        <GlassPanel className="min-w-0" title="What the rules flagged" subtitle="Most frequent first">
          <RankBars lines={ruleLines(report.rules)} empty="No rule fired in this period." />
        </GlassPanel>
        {frequency === "daily" ? null : (
          <GlassPanel className="min-w-0 xl:col-span-2" title="Busiest hours" subtitle="All scans in the period, by time of day">
            {hasActivity ? <ColumnChart buckets={hourSeries(report)} unit="scans" caption="Busiest hours" /> : <p className="py-16 text-center text-sm text-ink-muted">No scans in this period.</p>}
          </GlassPanel>
        )}
        <GlassPanel className={`min-w-0 ${frequency === "daily" ? "xl:col-span-3" : ""}`} title="Who came through" subtitle="Entries by visit type">
          <RankBars lines={report.visit_types.map(({ type, visits }) => ({ label: plainLabel(type), value: visits }))} empty="Nobody entered in this period." />
        </GlassPanel>
      </div>

      <GlassPanel className="mt-6" title="Sites" subtitle="Busiest first">
        {report.sites.length ? (
          <DataTable
            columns={[
              { key: "site", label: "Site" },
              { key: "checks", label: "Scans", align: "right" },
              { key: "entries", label: "Entries", align: "right" },
              { key: "exits", label: "Exits", align: "right" },
              { key: "blocked", label: "Blocked", align: "right" },
              { key: "warnings", label: "Warnings", align: "right" },
              { key: "overrides", label: "Overrides", align: "right" },
            ]}
            rows={report.sites.map((line) => ({
              id: line.site_id,
              cells: {
                site: <TwoLine main={line.site} sub={line.client} />,
                checks: countLabel(line.checks),
                entries: countLabel(line.entries),
                exits: countLabel(line.exits),
                blocked: countLabel(line.blocked),
                warnings: countLabel(line.warnings),
                overrides: countLabel(line.overrides),
              },
            }))}
          />
        ) : (
          <p className="py-10 text-center text-sm text-ink-muted">No site recorded a scan in this period.</p>
        )}
      </GlassPanel>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <GlassPanel title="Automated reports" subtitle="Sent by themselves, on time">
          {schedules.length ? (
            <ul className="divide-y divide-ink/10">
              {schedules.map((schedule) => (
                <ScheduleRow key={schedule.id} schedule={schedule} />
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">Nothing automated yet. Use Automate to send this report on a schedule.</p>
          )}
        </GlassPanel>
        <GlassPanel title="Sent reports" subtitle="The last ten">
          {sends.length ? (
            <ul className="divide-y divide-ink/10">
              {sends.map((send) => (
                <SendRow key={send.id} send={send} now={now} />
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-ink-muted">Nothing sent yet.</p>
          )}
        </GlassPanel>
      </div>
    </AppShell>
  );
}

export default function CompanyReportPage({ params, searchParams }: PageProps<"/reports/[org]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="tiles" />}>
      <CompanyReport params={params} searchParams={searchParams} />
    </Suspense>
  );
}
