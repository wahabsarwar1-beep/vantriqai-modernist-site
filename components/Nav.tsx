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

    const onScroll = () => {
      const small = window.scrollY > 40;
      nav.style.padding = small ? `8px ${HORIZONTAL_PADDING}` : "";
      nav.style.boxShadow = small ? "0 2px 0 0 var(--color-divider)" : "";
      if (logo) logo.style.height = small ? "34px" : "";
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile panel on resize past the breakpoint.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 760) setMenuOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <nav ref={navRef} className="nav" style={{ position: "sticky", top: 0, zIndex: 20 }}>
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
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          minHeight: 40,
          paddingInline: 16,
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
    </nav>
  );
}
