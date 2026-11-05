import { plainLabel } from "@digigate/core";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { Breadcrumbs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { PageSkeleton } from "@/components/skeleton";
import { siteCompanyBrand } from "@/lib/company-brand";
import { gatesAt, siteHeading } from "@/lib/control-room";
import { evacuees } from "@/lib/evacuation";
import { shortDate, timeOfDay } from "@/lib/format";
import { readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";

import { RollCall, type RollCallRow } from "./roll-call";

const NO_VALUE = "—";

async function Evacuation({ params }: { params: Promise<{ site: string }> }) {
  const user = await currentUser();
  if (!user) return <NoAccess message="Your account isn't set up yet. Ask your administrator." />;
  const { site: siteId } = await params;
  const heading = await siteHeading(siteId);
  if (!heading) return <NoAccess message="That site isn't one you look after." />;

  const [{ people, complete }, gates, company] = await Promise.all([evacuees(siteId), gatesAt(siteId), siteCompanyBrand(siteId)]);
  const now = readClock();
  const gateLabel = (post: string | null) => gates.find((gate) => gate.post === post)?.label ?? NO_VALUE;
  const cameIn = (at: string) => `${shortDate(at)}, ${timeOfDay(at)}`;

  const cars: RollCallRow[] = people
    .filter((person) => person.kind === "vehicle")
    .map((person) => ({
      id: person.id,
      name: person.person,
      detail: [person.plate, person.vehicle].filter(Boolean).join(" · ") || "Vehicle",
      others: person.occupants - 1,
      cameIn: cameIn(person.enteredAt),
      gate: gateLabel(person.post),
    }));
  const onFoot: RollCallRow[] = people
    .filter((person) => person.kind === "pedestrian")
    .map((person) => ({
      id: person.id,
      name: person.person,
      detail: person.visitType ? plainLabel(person.visitType) : "Pedestrian",
      others: 0,
      cameIn: cameIn(person.enteredAt),
      gate: gateLabel(person.post),
    }));
  // Gate staff stay at their posts last, but they're people to account for too.
  const staff: RollCallRow[] = gates.flatMap((gate) =>
    gate.onDutySince
      ? [{ id: `post-${gate.post}`, name: gate.guard ?? "Guard on duty", detail: "Gate staff", others: 0, cameIn: cameIn(gate.onDutySince), gate: gate.label }]
      : [],
  );
  const headcount = [...cars, ...onFoot, ...staff].reduce((sum, row) => sum + 1 + row.others, 0);

  return (
    <AppShell
      company={company}
      siteId={siteId}
      eyebrow={<Breadcrumbs items={[{ label: "Control room", href: "/control-room" }, { label: heading.name, href: `/control-room/${siteId}` }, { label: "Evacuation" }]} />}
      title="Evacuation"
    >
      <RollCall
        site={heading.name}
        company={company}
        generatedAt={`${timeOfDay(now)} on ${shortDate(now)}`}
        headcount={headcount}
        complete={complete}
        sections={[
          { title: "In vehicles", icon: "vehicle", rows: cars, empty: "No vehicles inside." },
          { title: "Pedestrians", icon: "pedestrian", rows: onFoot, empty: "No pedestrians inside." },
          { title: "Gate staff on duty", icon: "guard", rows: staff, empty: "No gate staff on duty." },
        ]}
      />
    </AppShell>
  );
}

export default function EvacuationPage({ params }: PageProps<"/control-room/[site]/evacuation">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Evacuation params={params} />
    </Suspense>
  );
}
