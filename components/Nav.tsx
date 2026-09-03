"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { NAV_LINKS } from "@/lib/nav-links";
import { waLink } from "@/lib/whatsapp";

const HORIZONTAL_PADDING = "max(clamp(20px,5vw,64px), calc((100% - 1280px) / 2 + clamp(20px,5vw,64px)))";

export default function Nav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const logo = nav.querySelector<HTMLElement>(".nav-logo");

    let lastSmall: boolean | null = null;
    const apply = () => {
      const small = window.scrollY > 40;
      if (small === lastSmall) return;
      lastSmall = small;
      nav.style.padding = small ? `8px ${HORIZONTAL_PADDING}` : "";
      nav.style.boxShadow = small ? "0 2px 0 0 var(--color-divider)" : "";
      if (logo) logo.style.height = small ? "34px" : "";
    };
    // RAF-coalesced: a burst of scroll events between frames still does at
    // most one read-then-write pass, and re-applying the same padding value
    // on every raw scroll tick was invalidating the nav's backdrop-filter
    // and repainting the blur continuously.
    let rafPending = false;
    const onScroll = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        apply();
      });
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile panel on resize past the breakpoint. Must match the
  // 1000px media query in globals.css that swaps the links for the burger.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1000) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav ref={navRef} className="nav" style={{ position: "sticky", top: 0, zIndex: 40 }}>
      <Link href="/" className="nav-brand">
        <Logo className="nav-logo" />
      </Link>

      <div className="nav-links">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={pathname === link.href ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <a
        className="btn btn-primary nav-cta"
        href={waLink()}
        target="_blank"
        rel="noopener"
        style={{
          minHeight: 38,
          padding: "0 16px",
          fontSize: 11.5,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          justifyContent: "center",
          whiteSpace: "nowrap",
          flex: "none",
          color: "var(--color-bg)",
        }}
      >
        WhatsApp us
      </a>

      <button
        type="button"
        className="nav-burger"
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="mobile-nav-panel"
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span className="nav-burger-line" />
        <span className="nav-burger-line" />
        <span className="nav-burger-line" />
      </button>

      <div id="mobile-nav-panel" className={menuOpen ? "nav-mobile-panel is-open" : "nav-mobile-panel"}>
        {/* The gutter lives on this inner wrapper, not the panel: padding on a
            max-height:0 element still paints, so the closed panel would show
            as a stripe under the nav. */}
        <div className="nav-mobile-inner">
          <div className="nav-mobile-links">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <a
            className="btn btn-primary nav-mobile-cta"
            href={waLink()}
            target="_blank"
            rel="noopener"
            onClick={() => setMenuOpen(false)}
          >
            WhatsApp us
          </a>
        </div>
      </div>
    </nav>
  );
}
