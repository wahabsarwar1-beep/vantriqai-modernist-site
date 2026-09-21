"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import Magnetic from "@/components/Magnetic";
import { NAV_LINKS } from "@/lib/nav-links";
import { waLink } from "@/lib/whatsapp";

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedForPathname, setOpenedForPathname] = useState(pathname);
  const [shrunk, setShrunk] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  if (pathname !== openedForPathname) {
    setOpenedForPathname(pathname);
    setOpen(false);
  }

  const ticking = useRef(false);
  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        ticking.current = false;
        setShrunk(window.scrollY > 40);
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
        gap: "clamp(14px,2vw,30px)",
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
      <Link href="/" style={{ display: "inline-flex", alignItems: "center", marginRight: "auto" }}>
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

      <div className="nav-links-desktop" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px clamp(14px,2vw,26px)" }}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-navlink=""
            aria-current={pathname === link.href ? "page" : undefined}
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: pathname === link.href ? "var(--color-accent)" : "var(--color-text)",
              whiteSpace: "nowrap",
            }}
          >
            {link.label}
          </Link>
        ))}
      </div>

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
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              style={pathname === link.href ? { color: "var(--color-accent)" } : undefined}
            >
              {link.label}
            </Link>
          ))}
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
