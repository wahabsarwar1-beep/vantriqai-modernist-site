"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "@/components/Logo";
import { NAV_LINKS } from "@/lib/nav-links";
import { waLink } from "@/lib/whatsapp";

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav" style={{ position: "sticky", top: 0, zIndex: 20 }}>
      <Link href="/" className="nav-brand">
        <Logo height={46} />
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
        className="btn btn-primary"
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
