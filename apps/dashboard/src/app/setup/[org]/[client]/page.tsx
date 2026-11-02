import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddedNotice } from "@/components/added-notice";
import { AppShell } from "@/components/app-shell";
import { Field, SelectField } from "@/components/form";
import { FormDialog } from "@/components/form-dialog";
import { Breadcrumbs, ListCard, ListRow, Pagination } from "@/components/list";
import { NoAccess } from "@/components/no-access";
import { SearchBox } from "@/components/search-box";
import { appNav } from "@/lib/nav";
import { likePattern, pageHref, pageParam, rangeOf, textParam, type Query } from "@/lib/paging";
import { counted, maybe, must } from "@/lib/reads";
import { currentUser, roleLabel } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";

import { addSite } from "../../actions";

const SITE_TYPES: Record<string, string> = { hospital: "Hospital", estate: "Residential estate" };

async function Client({ params, searchParams }: { params: Promise<{ org: string; client: string }>; searchParams: Promise<Query> }) {
  const user = await currentUser();
  if (!user || (!user.roles.includes("super_user") && !user.roles.includes("admin"))) {
    return <NoAccess message="Setting up gates needs an administrator. Your own dashboard is on the way." />;
  }

  const { org, client: clientId } = await params;
  const query = await searchParams;
  const search = textParam(query, "q");
  const page = pageParam(query);
  const [from, to] = rangeOf(page);

  const supabase = await supabaseServer();
  const [companyRead, clientRead] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", org).maybeSingle(),
    supabase.from("clients").select("name").eq("id", clientId).eq("org_id", org).maybeSingle(),
  ]);
  const company = maybe(companyRead);
  const client = maybe(clientRead);
  if (!company || !client) notFound();
  const justAdded = textParam(query, "added") === "1";

  let list = supabase.from("sites").select("id, name, site_type, posts(count)", { count: "exact" }).eq("client_id", clientId).order("name").range(from, to);
  if (search) list = list.ilike("name", likePattern(search));
  const listed = await list;
  const sites = must(listed);
  const count = counted(listed);
  const path = `/setup/${org}/${clientId}`;
  const crumbs = [{ label: company.name, href: `/setup/${org}` }, { label: client.name }];

  return (
    <AppShell
      nav={appNav(user, "setup")}
      user={{ name: user.fullName, role: roleLabel(user) }}
      eyebrow={<Breadcrumbs items={user.roles.includes("super_user") ? [{ label: "Security companies", href: "/setup" }, ...crumbs] : crumbs} />}
      title={client.name}
      plain
      chips={
        <>
          <SearchBox placeholder="Search sites" />
          <FormDialog label="Add site" title={`Add a site to ${client.name}`} icon="sites" submitLabel="Add site" pendingLabel="Adding…" action={addSite} fields={{ orgId: org, clientId }}>
            <Field label="Site name" name="name" placeholder="Main Campus" autoFocus required />
            <SelectField label="Site type" name="siteType" defaultValue="hospital">
              {Object.entries(SITE_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </FormDialog>
        </>
      }
    >
      {justAdded ? <AddedNotice title={`${client.name} is added`} next="Next, add the site where its gates are." /> : null}
      <ListCard
        isEmpty={sites.length === 0}
        empty={search ? "Nothing matches that search." : "No sites yet. Add the first one."}
        footer={<Pagination page={page} total={count ?? 0} hrefFor={(next) => pageHref(path, query, next)} />}
      >
        {sites.map((site) => {
          const posts = site.posts[0]?.count ?? 0;
          return (
            <ListRow
              key={site.id}
              href={`${path}/${site.id}`}
              title={site.name}
              detail={`${SITE_TYPES[site.site_type] ?? site.site_type} · ${posts} post${posts === 1 ? "" : "s"}`}
            />
          );
        })}
      </ListCard>
    </AppShell>
  );
}

export default function ClientPage({ params, searchParams }: PageProps<"/setup/[org]/[client]">) {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-ink-muted">Loading…</p>}>
      <Client params={params} searchParams={searchParams} />
    </Suspense>
  );
}
