import type { ReactNode } from "react";

import { BrandPanel } from "./brand-panel";
import { WelcomeSplash } from "./welcome-splash";

type Props = {
  title: string;
  subtitle: string;
  /** Plays the welcome animation first, and holds the form back until it's done. */
  welcome?: boolean;
  footnote?: string;
  children: ReactNode;
};

/** Sign-in and MFA: the form on the left, the brand on the right. */
export function AuthLayout({ title, subtitle, welcome = false, footnote, children }: Props) {
  return (
    <div className={`grid min-h-screen bg-surface lg:grid-cols-2 ${welcome ? "dg-after-welcome" : ""}`}>
      {welcome ? <WelcomeSplash /> : null}

      <main className="order-2 flex items-center justify-center px-4 py-10 sm:px-8 lg:order-1 lg:px-12">
        <div className="w-full max-w-sm">
          <h1 className="dg-rise font-display text-5xl font-bold tracking-tight">{title}</h1>
          <p className="dg-rise mt-3 text-base text-ink-muted" style={{ animationDelay: "calc(var(--dg-enter) + 70ms)" }}>
            {subtitle}
          </p>
          <div className="dg-rise mt-9" style={{ animationDelay: "calc(var(--dg-enter) + 140ms)" }}>
            {children}
          </div>
          {footnote ? (
            <p className="dg-rise mt-8 text-xs text-ink-subtle" style={{ animationDelay: "calc(var(--dg-enter) + 210ms)" }}>
              {footnote}
            </p>
          ) : null}
        </div>
      </main>

      <div className="order-1 lg:order-2">
        <BrandPanel />
      </div>
    </div>
  );
}
