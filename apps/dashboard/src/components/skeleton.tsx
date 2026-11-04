/**
 * Placeholders shaped like what's coming, so a page opens at once and fills in where it stands instead of jumping.
 * They shimmer gently, and hold still for people with animations off.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`dg-skeleton block rounded-md ${className}`} />;
}

type Variant = "tiles" | "list" | "cards" | "detail";

function Header() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-11 w-80 max-w-full rounded-lg" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-11 w-64 max-w-[60%] rounded-pill" />
        <Skeleton className="h-11 w-32 rounded-pill" />
      </div>
    </div>
  );
}

function Rows({ count }: { count: number }) {
  return (
    <div className="dg-glass mt-6 divide-y divide-ink/5 overflow-hidden">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 px-5 py-4">
          <Skeleton className="size-10 shrink-0 rounded-pill" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-7 w-20 rounded-pill" />
        </div>
      ))}
    </div>
  );
}

function Tiles({ count }: { count: number }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="dg-glass flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-pill" />
            <Skeleton className="h-3.5 w-24" />
          </div>
          <Skeleton className="h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

function Cards({ count }: { count: number }) {
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="dg-glass flex flex-col gap-5 p-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-[28%]" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A whole page's placeholder, in the shape of the page it stands in for. */
export function PageSkeleton({ variant = "list" }: { variant?: Variant }) {
  return (
    <div role="status" aria-live="polite" className="dg-page">
      <span className="sr-only">Loading</span>
      <Header />
      {variant === "tiles" ? (
        <>
          <Tiles count={4} />
          <Rows count={5} />
        </>
      ) : variant === "cards" ? (
        <Cards count={6} />
      ) : variant === "detail" ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="dg-glass flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-40" />
          </div>
          <div className="dg-glass flex flex-col gap-4 p-6">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-24" />
          </div>
        </div>
      ) : (
        <Rows count={7} />
      )}
    </div>
  );
}

/** Stands in for the sidebar while the signed-in person is looked up. */
export function SidebarSkeleton() {
  return (
    <>
      <aside aria-hidden="true" className="dg-sidebar dg-glass-bar sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-3 px-4 py-6 lg:flex">
        <Skeleton className="mx-3 h-9 w-28" />
        <div className="mt-8 flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-11 rounded-pill" />
          ))}
        </div>
      </aside>
      <div aria-hidden="true" className="dg-topbar sticky top-0 z-30 flex h-[4.25rem] items-center px-4 lg:hidden">
        <Skeleton className="h-8 w-24" />
      </div>
    </>
  );
}
