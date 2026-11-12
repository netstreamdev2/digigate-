import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AppShell } from "@/components/app-shell";
import { PageSkeleton } from "@/components/skeleton";
import { Breadcrumbs } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { StatusChip } from "@/components/status-chip";
import { companyBrand } from "@/lib/company-brand";
import { longDate, siteToday } from "@/lib/format";
import { callPeople } from "@/lib/people-api";
import { maybe, must, readClock } from "@/lib/reads";
import { currentUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { ResetPinButton } from "../../../../reset-pin";
import { GuardRecordEditor, type GuardRecordView } from "../../../guard-record-editor";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The record as digigate-people sends it, checked field by field. */
function recordOf(value: unknown): GuardRecordView {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    phone: text(record.phone),
    homeAddress: text(record.homeAddress),
    psiraNumber: text(record.psiraNumber),
    psiraGrade: text(record.psiraGrade),
    nextOfKinName: text(record.nextOfKinName),
    nextOfKinRelationship: text(record.nextOfKinRelationship),
    nextOfKinPhone: text(record.nextOfKinPhone),
    idType: record.idType === "sa_id" || record.idType === "passport" ? record.idType : null,
    idLastFour: typeof record.idLastFour === "string" ? record.idLastFour : null,
  };
}

async function Guard({ params }: { params: Promise<{ org: string; guard: string }> }) {
  const user = await currentUser();
  const { org, guard: guardId } = await params;
  const isSuper = user?.roles.includes("super_user") ?? false;
  if (!user || (!isSuper && !(user.roles.includes("admin") && user.orgId === org))) {
    return <NoAccess message="Guard records are for your company's administrators." />;
  }

  const supabase = await supabaseServer();
  const [companyRead, guardRead] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", org).maybeSingle(),
    supabase.from("gate_users").select("id, employee_number, first_name, last_name, role, site_ids, is_active").eq("id", guardId).eq("org_id", org).maybeSingle(),
  ]);
  const company = maybe(companyRead);
  const guard = maybe(guardRead);
  if (!company || !guard) notFound();
  const sites = guard.site_ids.length ? must(await supabase.from("sites").select("name").in("id", guard.site_ids).order("name")) : [];

  // Opening a record is logged, in digigate-people, which alone can read it.
  const { status, data } = await callPeople({ action: "guard-record", gateUserId: guard.id });
  const name = `${guard.first_name} ${guard.last_name}`;
  const crumbs = [
    ...(isSuper ? [{ label: "Admin", href: "/admin" }] : []),
    { label: company.name, href: `/admin/${org}` },
    { label: name },
  ];

  return (
    <AppShell
      company={await companyBrand(org)}
      eyebrow={<Breadcrumbs items={crumbs} />}
      title={name}
      actions={
        guard.is_active ? (
          <ResetPinButton
            guard={{ id: guard.id, name, employeeNumber: guard.employee_number, role: guard.role === "supervisor" ? "supervisor" : "guard", company: company.name }}
          />
        ) : null
      }
      chips={
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>{`${guard.employee_number} · ${guard.role === "supervisor" ? "Supervisor" : "Guard"} · ${sites.map((site) => site.name).join(", ") || "No site yet"}`}</span>
          {guard.is_active ? null : <StatusChip status="blocked" label="Deactivated" />}
        </div>
      }
    >
      {status === 200 ? (
        <GuardRecordEditor
          gateUserId={guard.id}
          record={recordOf(data.record)}
          photoUrl={typeof data.photoUrl === "string" ? data.photoUrl : null}
          card={{
            company: company.name,
            name,
            role: guard.role === "supervisor" ? "Security supervisor" : "Security officer",
            employeeNumber: guard.employee_number,
            cardNumber: `${initialsOf(company.name)}-${guard.employee_number}`,
            sites: sites.map((site) => site.name).join(", "),
            issuedOn: longDate(siteToday(readClock())),
          }}
        />
      ) : (
        <div role="alert" className="mt-6 dg-glass px-5 py-4 text-sm">
          <p className="font-semibold">{status === 403 ? "Your account can't open this record." : "Their record didn't load."}</p>
          <p className="text-ink-muted">{status === 403 ? "Guard records are for the company's administrators." : "Reload the page to try again. If it keeps happening, guard records may not be switched on yet."}</p>
        </div>
      )}
    </AppShell>
  );
}

export default function GuardRecordPage({ params }: PageProps<"/admin/[org]/guards/[guard]">) {
  return (
    <Suspense fallback={<PageSkeleton variant="detail" />}>
      <Guard params={params} />
    </Suspense>
  );
}
