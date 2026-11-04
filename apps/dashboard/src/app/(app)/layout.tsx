import { Suspense } from "react";

import { CompanyTheme } from "@/components/company-theme";
import { Motion } from "@/components/motion";
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
  const company = user.orgId && !user.roles.includes("super_user") ? await companyBrand(user.orgId) : null;
  return (
    <>
      {company ? <CompanyTheme company={company} /> : null}
      <Sidebar items={appNav(user)} userName={user.fullName} userRole={roleLabel(user)} company={company} />
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
