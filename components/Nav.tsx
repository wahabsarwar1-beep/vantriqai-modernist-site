"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import Magnetic from "@/components/Magnetic";
import { NAV_LINKS } from "@/lib/nav-links";
import RegionSwitch from "@/components/RegionSwitch";
import MegaMenu from "@/components/MegaMenu";
import { menuPanels } from "@/lib/menu";
import { useActiveSection } from "@/lib/use-active-section";
import { hrefIn, navHref, regionFromPathname } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

/**
 * The top bar: a floating glass capsule.
 *
 * The outer <nav> is the sticky, full-width layer and lets clicks through
 * (pointer-events: none); only the capsule inside it is interactive, so the
 * transparent margin around it never swallows a click meant for the page.
 * The mega panels and the phone sheet hang from the capsule.
 */
export default function Nav() {
  const pathname = usePathname();
  /* Every link in the bar stays in the region being read, so a visitor on
     the US$ site never falls back to PKR by using the nav. */
  const region = regionFromPathname(pathname);
  const [open, setOpen] = useState(false);
  /** Which mega panel is showing, by label. One at a time. */
  const [panel, setPanel] = useState<string | null>(null);
  const panels = menuPanels(region);
  const currentSection = useActiveSection(pathname);
  const panelFor = (label: string) => panels.find((p) => p.label === label);
  const [openedForPathname, setOpenedForPathname] = useState(pathname);
  const [shrunk, setShrunk] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLSpanElement>(null);

  if (pathname !== openedForPathname) {
    setOpenedForPathname(pathname);
    setOpen(false);
    setPanel(null);
  }

  const ticking = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        /* Two thresholds, not one. The bar is sticky, so it takes up space
           in the flow: shrinking it takes height out of the page, the page
           slides up, and scrollY drops back below a single threshold — which
           un-shrinks it, which puts the height back. That loop is the shudder
           you see if you stop scrolling right at the trigger point. The gap
           between 72 and 24 is far wider than the ~18px the bar moves, so no
           layout change can cross it. */
        setShrunk((was) => (was ? window.scrollY > 24 : window.scrollY > 72));
        /* Written straight to the element, not through state: re-rendering
           the whole bar on every scroll frame just to move a hairline was the
           most expensive thing on the page while scrolling. */
        const doc = document.documentElement;
        const max = (doc.scrollHeight || document.body.scrollHeight) - window.innerHeight;
        const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
        progressRef.current?.style.setProperty("transform", `scaleX(${pct})`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* One highlight that glides to whichever item the pointer or focus is on,
     rather than each item lighting up by itself — the row reads as a single
     control. Positioned by writing custom properties, no re-render.

     It lives on the capsule, not the link row, on purpose: the mega panels
     centre on their nearest positioned ancestor, and that has to stay the
     capsule — a positioned link row would pull a 1120px panel off-centre
     and off the screen at the narrowest desktop width. */
  const moveHover = (target: EventTarget | null) => {
    const wrap = linksRef.current;
    const box = capsuleRef.current;
    const pill = hoverRef.current;
    if (!wrap || !box || !pill || !(target instanceof Element)) return;
    const item = target.closest("[data-navlink]");
    if (!item || !wrap.contains(item)) return;
    const a = box.getBoundingClientRect();
    const b = item.getBoundingClientRect();
    pill.style.setProperty("--x", `${b.left - a.left}px`);
    pill.style.setProperty("--y", `${b.top - a.top}px`);
    pill.style.setProperty("--w", `${b.width}px`);
    pill.style.setProperty("--h", `${b.height}px`);
    pill.dataset.on = "";
  };
  const hideHover = () => {
    if (hoverRef.current) delete hoverRef.current.dataset.on;
  };

  return (
    <nav className="bn" data-shrunk={shrunk ? "" : undefined}>
      <div className="bn-capsule" ref={capsuleRef}>
        <span aria-hidden="true" className="bn-progress" ref={progressRef} />
        <span aria-hidden="true" className="bn-hover" ref={hoverRef} />

        <Link href={hrefIn(region, "/")} className="nav-logo" style={{ display: "inline-flex", alignItems: "center", marginRight: "auto" }}>
          <Logo height={shrunk ? 32 : 38} />
        </Link>

        <button type="button" className="nav-toggle-btn" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
          <span className="nav-burger-line" style={open ? { transform: "translateY(7px) rotate(45deg)" } : undefined} />
          <span className="nav-burger-line" style={open ? { opacity: 0 } : undefined} />
          <span className="nav-burger-line" style={open ? { transform: "translateY(-7px) rotate(-45deg)" } : undefined} />
        </button>

        <div
          ref={linksRef}
          className="nav-links-desktop"
          onPointerOver={(e) => moveHover(e.target)}
          onFocus={(e) => moveHover(e.target)}
          onPointerLeave={hideHover}
          onBlur={(e) => {
            if (!linksRef.current?.contains(e.relatedTarget as Node)) hideHover();
          }}
        >
          {NAV_LINKS.map((link) => {
            const href = navHref(region, link);
            const mega = panelFor(link.label);
            // A page reached from inside a panel (How it works, under
            // Platform) marks that panel's item as where you are.
            const isCurrent = pathname === href || pathname.startsWith(`${href}/`) || mega?.hero?.href === pathname;
            if (mega) {
              return (
                <MegaMenu
                  key={link.href}
                  panel={mega}
                  active={isCurrent}
                  currentSection={currentSection}
                  open={panel === link.label}
                  switching={panel !== null && panel !== link.label}
                  onOpen={() => setPanel(link.label)}
                  onClose={() => setPanel((cur) => (cur === link.label ? null : cur))}
                />
              );
            }
            return (
              <Link key={link.href} href={href} data-navlink="" className="bn-link" aria-current={isCurrent ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Always in the bar, at every width. On a phone the burger sits
            after it (CSS order: 3), so the marks stay visible without the menu
            having to be opened to find them. */}
        <span className="nav-region">
          <RegionSwitch />
        </span>

        <span className="nav-whatsapp-desktop">
          <Magnetic>
            <a className="bn-cta" href={waLink()} target="_blank" rel="noopener" aria-label="Try the agent on WhatsApp">
              <span aria-hidden="true" className="bn-cta-dot" />
              Try the agent
              <span aria-hidden="true" className="bn-cta-arrow">→</span>
            </a>
          </Magnetic>
        </span>

        {open && (
          <div className="nav-mobile-panel open">
            {/* On a phone the sub-links are a disclosure, not a hover panel:
                <details> gives the open/close behaviour, the keyboard handling
                and the semantics without a line of state. */}
            {NAV_LINKS.map((link) => {
              const href = navHref(region, link);
              const current = pathname === href || pathname.startsWith(`${href}/`);
              const mega = panelFor(link.label);

              if (!mega) {
                return (
                  <Link key={link.href} href={href} aria-current={current ? "page" : undefined}>
                    {link.label}
                  </Link>
                );
              }

              return (
                <details key={link.href} className="nav-mobile-group">
                  <summary aria-current={current ? "page" : undefined}>
                    {link.label}
                    <svg width="11" height="7" viewBox="0 0 10 6" aria-hidden="true" style={{ flex: "none" }}>
                      <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </summary>
                  <div className="nav-mobile-sub">
                    {mega.columns.flatMap((col) => col.links).map((l) => (
                      <Link key={l.href} href={l.href}>
                        {l.label}
                      </Link>
                    ))}
                    <Link href={mega.footer.href} className="nav-mobile-all">
                      {mega.footer.label} &rarr;
                    </Link>
                  </div>
                </details>
              );
            })}
            <a className="bn-cta bn-cta-block" href={waLink()} target="_blank" rel="noopener">
              <span aria-hidden="true" className="bn-cta-dot" />
              Try the agent on WhatsApp
              <span aria-hidden="true" className="bn-cta-arrow">→</span>
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}
