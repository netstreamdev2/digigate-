import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddedNotice } from "@/components/added-notice";
import { AppShell } from "@/components/app-shell";
import { Field } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs, ListCard, ListRow, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { appNav } from "@/lib/nav";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, maybe, must } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { addClient } from "../actions";

import { CompanyChecklist } from "./company-checklist";

async function Company({ params, searchParams }: { params: Promise<{ org: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || (!user.roles.includes("super_user") && !user.roles.includes("admin"))) {
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const { org } = await params;
  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);

  const supabase = await supabaseServer();
  const company = maybe(await supabase.from("organisations").select("id, name").eq("id", org).maybeSingle());
  if (!company) notFound();
  const justAdded = textParam(query, "added") === "1";

  let list = supabase.from("clients").select("id, name, sites(count)", { count: "exact" }).eq("org_id", org).order("name").range(from, to);
  if (search) list = list.ilike("name", likePattern(search));
  const listed = await list;
  const clients = must(listed);
  const count = counted(listed);
  const path = `/setup/${org}`;

  return (
    <AppShell
      nav={appNav(user, "setup")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow={<Breadcrumbs items={user.roles.includes("super_user") ? [{ label: "Security companies", href: "/setup" }, { label: company.name }] : [{ label: company.name }]} />}
      title={company.name}
      plain
      chips={
        <>
          <SearchBox placeholder="Search clients" />
          <FormDialog label="Add client" title={`Add a client to ${company.name}`} icon="sites" submitLabel="Add client" pendingLabel="Adding…" action={addClient} fields={{ orgId: org }}>
            <Field label="Client name" name="name" placeholder="A hospital, an estate" autoFocus required />
            <p className="text-sm text-ink-muted">Records stay with the client, even if it changes security company.</p>
          </FormDialog>
        </>
      }
    >
      {justAdded ? <AddedNotice title={`${company.name} is added`} next="Work down the checklist to get its first gate running." /> : null}
      <CompanyChecklist company={company} />
      <ListCard
        isEmpty={clients.length === 0}
        empty={search ? "Nothing matches that search." : "No clients yet. Add the first one."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
      >
        {clients.map((client) => {
          const sites = client.sites[0]?.count ?? 0;
          return <ListRow key={client.id} href={`${path}/${client.id}`} title={client.name} detail={`${sites} site${sites === 1 ? "" : "s"}`} />;
        })}
      </ListCard>
    </AppShell>
  );
}

export default function CompanyPage({ params, searchParams }: PageProps<"/setup/[org]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Company params={params} searchParams={searchParams} />
    </Suspense>
  );
}
