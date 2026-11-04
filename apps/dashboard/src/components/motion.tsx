"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/** How long a page change may hold the old page on screen while the new one arrives, before it simply cuts over. */
const LONGEST_HOLD_MS = 1200;
/** How long to wait for a logo to arrive on the new page, so it can grow out of the card that was clicked. */
const MORPH_WAIT_MS = 700;

const isPlainClick = (event: MouseEvent) =>
  !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/**
 * The dashboard's motion, in one place.
 *
 * Page changes run through the browser's view transitions: the page underneath glides across while the sidebar stays
 * still, its pill slides to the new page, and a company's logo grows out of the card you clicked into the header of
 * the page it opens. A link marks that with `data-morph`, naming the mark it should become.
 *
 * Glass catches the light: the panel under the pointer gets a soft highlight where the pointer is.
 *
 * Browsers without view transitions, and people with animations off, get plain instant page changes.
 */
export function Motion() {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const arrived = useRef<(() => void) | null>(null);
  const here = `${path}?${search.toString()}`;

  // The new page has been put on screen.
  useEffect(() => {
    const finish = arrived.current;
    arrived.current = null;
    finish?.();
  }, [here]);

  useEffect(() => {
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    const onClick = (event: MouseEvent) => {
      if (!isPlainClick(event) || calm.matches || typeof document.startViewTransition !== "function") return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      if (link.dataset.motion === "off") return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      event.preventDefault();
      event.stopPropagation();
      const morph = link.dataset.morph;
      document.documentElement.setAttribute("data-gliding", "");

      document.startViewTransition(
        () =>
          new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(cap);
              resolve();
            };
            const cap = setTimeout(finish, LONGEST_HOLD_MS);
            arrived.current = () => {
              if (!morph) return finish();
              const started = performance.now();
              const look = () => {
                if (document.querySelector(`[data-morph-target="${CSS.escape(morph)}"]`) || performance.now() - started > MORPH_WAIT_MS) finish();
                else requestAnimationFrame(look);
              };
              look();
            };
            router.push(`${url.pathname}${url.search}${url.hash}`);
          }),
      );
    };

    // A company card also tips a few degrees towards the pointer.
    const TILT_DEGREES = 5;
    let lit: HTMLElement | null = null;
    const putOut = (glass: HTMLElement) => {
      glass.removeAttribute("data-lit");
      glass.style.removeProperty("--dg-tilt-x");
      glass.style.removeProperty("--dg-tilt-y");
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const glass = event.target instanceof Element ? event.target.closest<HTMLElement>(".dg-glass") : null;
      if (lit && lit !== glass) putOut(lit);
      lit = glass;
      if (!glass) return;
      const box = glass.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      glass.style.setProperty("--dg-mx", `${x}px`);
      glass.style.setProperty("--dg-my", `${y}px`);
      glass.setAttribute("data-lit", "");
      if (glass.classList.contains("dg-company-card") && !calm.matches) {
        glass.style.setProperty("--dg-tilt-x", `${((0.5 - y / box.height) * TILT_DEGREES).toFixed(2)}deg`);
        glass.style.setProperty("--dg-tilt-y", `${((x / box.width - 0.5) * TILT_DEGREES).toFixed(2)}deg`);
      }
    };
    const onLeave = () => {
      if (lit) putOut(lit);
      lit = null;
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [router]);

  return null;
}
