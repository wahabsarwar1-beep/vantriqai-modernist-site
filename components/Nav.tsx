"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { NAV_LINKS } from "@/lib/nav-links";
import { waLink } from "@/lib/whatsapp";

const HORIZONTAL_PADDING = "max(clamp(20px,5vw,64px), calc((100% - 1280px) / 2 + clamp(20px,5vw,64px)))";

export default function Nav() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

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
    </nav>
  );
}
