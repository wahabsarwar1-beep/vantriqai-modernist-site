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
import { hrefIn, navHref, regionFromPathname } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

export default function Nav() {
  const pathname = usePathname();
  /* Every link in the bar stays in the region being read, so a visitor on
     the US$ site never falls back to PKR by using the nav. */
  const region = regionFromPathname(pathname);
  const [open, setOpen] = useState(false);
  /** Which mega panel is showing, by label. One at a time. */
  const [panel, setPanel] = useState<string | null>(null);
  const panels = menuPanels(region);
  const panelFor = (label: string) => panels.find((p) => p.label === label);
  const [openedForPathname, setOpenedForPathname] = useState(pathname);
  const [shrunk, setShrunk] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

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
           in the flow: shrinking it removes 16px of padding, the document
           gets shorter, the page slides up, and scrollY drops back below a
           single threshold — which un-shrinks it, which puts the 16px back.
           That loop is the shudder you see if you stop scrolling right at
           the trigger point. The gap between 72 and 24 is far wider than the
           16px the bar moves, so no layout change can cross it. */
        setShrunk((was) => (was ? window.scrollY > 24 : window.scrollY > 72));
        const doc = document.documentElement;
        const max = (doc.scrollHeight || document.body.scrollHeight) - window.innerHeight;
        setScrollPct(max > 0 ? Math.min(100, Math.max(0, (window.scrollY / max) * 100)) : 0);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "clamp(9px,1vw,18px)",
        padding: shrunk ? "8px clamp(20px,5vw,64px)" : "16px clamp(20px,5vw,64px)",
        borderBottom: "1px solid var(--color-divider)",
        // At rest the bar is mostly transparent so the hero wash carries up
        // behind the wordmark and the page opens in one continuous field.
        // Once shrunk it is scrolling over real content, so it goes opaque
        // enough to keep the links legible against whatever is underneath.
        background: shrunk
          ? "color-mix(in srgb, var(--color-bg) 92%, transparent)"
          : "color-mix(in srgb, var(--color-bg) 55%, transparent)",
        backdropFilter: "blur(12px)",
        transition: "padding .28s ease, box-shadow .28s ease, background-color .28s ease",
        boxShadow: shrunk ? "0 2px 0 0 var(--color-divider)" : "none",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          bottom: -1,
          height: 2,
          width: `${scrollPct}%`,
          background: "var(--color-accent)",
        }}
      />
      <Link href={hrefIn(region, "/")} className="nav-logo" style={{ display: "inline-flex", alignItems: "center", marginRight: "auto" }}>
        <Logo height={shrunk ? 34 : 46} />
      </Link>

      <button
        type="button"
        className="nav-toggle-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
      >
        <span className="nav-burger-line" style={open ? { transform: "translateY(7px) rotate(45deg)" } : undefined} />
        <span className="nav-burger-line" style={open ? { opacity: 0 } : undefined} />
        <span className="nav-burger-line" style={open ? { transform: "translateY(-7px) rotate(-45deg)" } : undefined} />
      </button>

      <div className="nav-links-desktop" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px clamp(9px,1vw,16px)" }}>
        {NAV_LINKS.map((link) => {
          const href = navHref(region, link);
          const isCurrent = pathname === href;
          const mega = panelFor(link.label);
          if (mega) {
            return (
              <MegaMenu
                key={link.href}
                panel={mega}
                active={isCurrent}
                open={panel === link.label}
                onOpen={() => setPanel(link.label)}
                onClose={() => setPanel((cur) => (cur === link.label ? null : cur))}
              />
            );
          }
          return (
            <Link
              key={link.href}
              href={href}
              data-navlink=""
              aria-current={isCurrent ? "page" : undefined}
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 12.5,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: isCurrent ? "var(--color-accent)" : "var(--color-text)",
                whiteSpace: "nowrap",
              }}
            >
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
          <a
            className="btn btn-primary"
            href={waLink()}
            target="_blank"
            rel="noopener"
            style={{ minHeight: 38, padding: "0 16px", fontSize: 11.5, letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap", color: "var(--color-bg)" }}
          >
            WhatsApp us
          </a>
        </Magnetic>
      </span>

      {open && (
        <div className={`nav-mobile-panel${open ? " open" : ""}`}>
          {/* On a phone the sub-links are a disclosure, not a hover panel:
              <details> gives the open/close behaviour, the keyboard handling
              and the semantics without a line of state. */}
          {NAV_LINKS.map((link) => {
            const href = navHref(region, link);
            const current = pathname === href;
            const mega = panelFor(link.label);

            if (!mega) {
              return (
                <Link key={link.href} href={href} aria-current={current ? "page" : undefined} style={current ? { color: "var(--color-accent)" } : undefined}>
                  {link.label}
                </Link>
              );
            }

            return (
              <details key={link.href} className="nav-mobile-group">
                <summary aria-current={current ? "page" : undefined} style={current ? { color: "var(--color-accent)" } : undefined}>
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
                  <Link href={mega.footer.href} style={{ color: "var(--color-accent)" }}>
                    {mega.footer.label} &rarr;
                  </Link>
                </div>
              </details>
            );
          })}
          <a
            className="btn btn-primary"
            href={waLink()}
            target="_blank"
            rel="noopener"
            style={{ marginTop: 12, alignSelf: "flex-start", minHeight: 44 }}
          >
            WhatsApp us
          </a>
        </div>
      )}
    </nav>
  );
}
