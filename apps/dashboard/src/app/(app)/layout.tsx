import { Suspense } from "react";

import { CompanyTheme } from "@/components/company-theme";
import { CompanyThemeSync } from "@/components/company-theme-sync";
import { AlertToasts } from "@/components/alert-toasts";
import { Motion } from "@/components/motion";
import { QuickSearch } from "@/components/quick-search";
import { Sidebar } from "@/components/sidebar";
import { SidebarSkeleton } from "@/components/skeleton";
import { companyBrand } from "@/lib/company-brand";
import { appNav } from "@/lib/nav";
import { currentUser, roleLabel } from "@/lib/session";

/**
 * Everyone who works for one company sees the dashboard in that company's colours, with its logo in the sidebar. A
 * super user looks after every company, so their sidebar is DigiGate's own and each company's pages bring its colours.
 */
async function SignedInFrame() {
  const user = await currentUser();
  if (!user) return <SidebarSkeleton />;
  const isSuperUser = user.roles.includes("super_user");
  const company = user.orgId && !isSuperUser ? await companyBrand(user.orgId) : null;
  return (
    <>
      {company ? <CompanyTheme company={company} /> : null}
      {isSuperUser ? <CompanyThemeSync /> : null}
      <Sidebar items={appNav(user)} userName={user.fullName} userRole={roleLabel(user)} company={company} isSuperUser={isSuperUser} />
      <QuickSearch pages={appNav(user)} />
      <AlertToasts />
    </>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <div className="dg-wash" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <Suspense fallback={<SidebarSkeleton />}>
        <SignedInFrame />
      </Suspense>
      <Suspense fallback={null}>
        <Motion />
      </Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">{children}</main>
    </div>
  );
}
