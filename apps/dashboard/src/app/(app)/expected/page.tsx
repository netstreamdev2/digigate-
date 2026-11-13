import { plainLabel } from "@digigate/core";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/dialog";
import { FilterBar } from "@/components/filter-bar";
import { Icon } from "@/components/icon";
import { Pagination, Tabs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { PageSkeleton } from "@/components/skeleton";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { shortDate, timeOfDay } from "@/lib/format";
import { canWatchGates } from "@/lib/nav";
import { pageHref, pageParam, textParam, type Query } from "@/lib/paging";
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { isDigiGateStaff } from "@/lib/access";
import { bookingPage, type BookingRow, type BookingTab } from "@/lib/watch-lists";

import { cancelBooking } from "./actions";
import { BookVisitorButton } from "./expected-forms";

const TABS: readonly { tab: BookingTab; label: string }[] = [
  { tab: "coming", label: "Coming" },
  { tab: "arrived", label: "Arrived" },
  { tab: "past", label: "Didn't come or cancelled" },
];

function days(row: BookingRow) {
  const from = shortDate(row.from);
  const until = shortDate(row.until);
  return from === until ? from : `${from} to ${until}`;
}

/**
 * A message for the visitor, opened in WhatsApp for whoever books them to send. Nothing goes anywhere until they choose
 * who it's for and press send: DigiGate keeps no phone numbers and sends nothing itself.
 */
function whatsAppLink(row: BookingRow): string {
  const lines = [
    `Hello ${row.name}. You're expected at ${row.site} on ${days(row)}.`,
    row.plate
      ? `Please bring your ID or driver's licence, and come in the car with plate ${row.plate}, so the gate can let you through quickly.`
      : "Please bring your ID or driver's licence, so the gate can let you through quickly.",
    row.note ?? "",
  ].filter(Boolean);
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n\n"))}`;
}

function Booking({ row, now, tab }: { row: BookingRow; now: number; tab: BookingTab }) {
  const today = Date.parse(row.from) <= now && now <= Date.parse(row.until);
  const knownBy = [row.idLastFour ? `ID ending ${row.idLastFour}` : null, row.plate].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-wrap items-start gap-4 px-5 py-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-pill ${today && tab === "coming" ? "bg-tile-mint text-clear" : "bg-surface-muted text-ink-muted"}`}>
        <Icon name="visitor" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-lg font-semibold tracking-tight">{row.name}</p>
          {tab === "coming" && today ? <StatusChip status="clear" label="Expected today" /> : null}
          {row.arrivedAt ? <StatusChip status="clear" label={`Arrived ${shortDate(row.arrivedAt)}, ${timeOfDay(row.arrivedAt)}`} /> : null}
          {row.cancelledAt ? <StatusChip status="blocked" label="Cancelled" /> : null}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">{[days(row), row.site, row.visitType ? plainLabel(row.visitType) : null].filter(Boolean).join(" · ")}</p>
        {row.note ? <p className="mt-1 text-sm">{row.note}</p> : null}
        <p className="mt-2 text-xs text-ink-subtle">{[knownBy ? `Known by ${knownBy}` : null, row.bookedBy ? `Booked by ${row.bookedBy}` : null].filter(Boolean).join(" · ")}</p>
      </div>
      {tab === "coming" ? (
        <a
          href={whatsAppLink(row)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-pill bg-clear-soft px-3 py-1.5 text-xs font-semibold text-clear transition hover:bg-clear hover:text-ink-inverse"
        >
          <Icon name="external-link" className="size-3.5" />
          Send on WhatsApp
        </a>
      ) : null}
      {tab === "coming" ? (
        <ConfirmAction
          label="Cancel"
          title={`Cancel ${row.name}'s booking?`}
          confirmLabel="Cancel the booking"
          pendingLabel="Cancelling…"
          tone="danger"
          icon="invite"
          action={cancelBooking}
          fields={{ id: row.id }}
        >
          The gates stop expecting them at their next sync. If they arrive anyway, they&apos;re checked like any visitor.
        </ConfirmAction>
      ) : null}
    </li>
  );
}

async function Expected({ searchParams }: { searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || !canWatchGates(user)) return <NoAccess message="Visitors are booked in by your company's administrators, managers and control room." />;

  const query = await searchParams;
  const asked = textParam(query, "tab");
  const tab: BookingTab = asked === "arrived" || asked === "past" ? asked : "coming";
  const search = textParam(query, "q");
  const page = pageParam(query);
  const company = isDigiGateStaff(user) ? textParam(query, "company") : "";
  const now = readClock();
  const [{ rows, total }, brand] = await Promise.all([bookingPage({ tab, search, company }, page, now), company ? companyBrand(company) : null]);
  // The forms open on the company being looked at: the super user's chosen one, or the signed-in person's own.
  const formCompany = brand ?? (user.orgId && !isDigiGateStaff(user) ? await companyBrand(user.orgId) : null);

  return (
    <AppShell
      company={brand}
      eyebrow="Visitors booked in ahead, recognised at the gate"
      title="Expected visitors"
      chips={
        <>
          <BookVisitorButton orgId={formCompany?.id ?? ""} />
        </>
      }
    >
      <div className="mt-6">
        <Tabs
          items={TABS.map((item) => ({
            label: item.label,
            href: pageHref("/expected", { ...query, tab: item.tab === "coming" ? undefined : item.tab }, 1),
            active: item.tab === tab,
            ...(item.tab === tab ? { count: total } : {}),
          }))}
        />
      </div>
      <FilterBar label="Filter the bookings">
        <SearchBox placeholder="Search a name, plate or note" />
      </FilterBar>

      <section className="dg-glass mt-6 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
            <Icon name="invite" className="size-8 text-ink-subtle" />
            <p className="text-sm text-ink-muted">
              {search ? "Nothing matches that search." : tab === "coming" ? "Nobody is booked in. Book a visitor and the gate will know them." : "Nothing here yet."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink/5">
            {rows.map((row) => (
              <Booking key={row.id} row={row} now={now} tab={tab} />
            ))}
          </ul>
        )}
        <Pagination page={page} total={total} hrefFor={(next) => pageHref("/expected", query, next)} />
      </section>
    </AppShell>
  );
}

export default function ExpectedPage({ searchParams }: PageProps<"/expected">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Expected searchParams={searchParams} />
    </Suspense>
  );
}
