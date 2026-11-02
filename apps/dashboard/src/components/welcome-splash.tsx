import Image from "next/image";

/**
 * The opening of the sign-in screen: the logo, a boom gate lifting, then the screen opens onto the form. Pure CSS, so
 * it plays from the first paint and needs no JavaScript. With reduced motion the gate is already up and it only fades.
 */
export function WelcomeSplash() {
  return (
    <div aria-hidden="true" className="dg-splash fixed inset-0 z-50 grid place-items-center bg-brand">
      <div className="flex flex-col items-center gap-10">
        <Image src="/logo.svg" alt="" width={320} height={102} unoptimized priority className="dg-logo-reversed dg-splash-logo h-auto w-48 sm:w-80" />
        {/* The post stands left of the logo, so the arm rises beside it. Overflow stays visible for the raised arm. */}
        <svg viewBox="0 0 460 150" className="w-80 overflow-visible sm:w-md" role="presentation">
          <defs>
            <pattern id="boom-stripes" width="48" height="12" patternUnits="userSpaceOnUse">
              <rect width="24" height="12" fill="var(--dg-color-surface)" />
              <rect x="24" width="24" height="12" fill="var(--dg-color-blocked)" />
            </pattern>
          </defs>
          <rect className="dg-boom-arm" x="20" y="116" width="430" height="12" rx="6" fill="url(#boom-stripes)" />
          <rect x="6" y="104" width="28" height="44" rx="8" fill="var(--dg-color-tile-sky)" />
          <circle cx="20" cy="122" r="7" fill="var(--dg-color-brand)" />
          <circle cx="20" cy="122" r="3" fill="var(--dg-color-clear)" className="dg-boom-light" />
        </svg>
      </div>
    </div>
  );
}
