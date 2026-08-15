"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandName from "@/components/BrandName";
import { NAV_LINKS } from "@/lib/nav-links";

type FooterProps = {
  /** Home omits the city; the rest of the site still carries it. */
  showLocation?: boolean;
};

export default function Footer({ showLocation = true }: FooterProps) {
  const pathname = usePathname();

  return (
    <footer style={{ borderTop: "2px solid var(--color-divider)" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "36px clamp(20px,5vw,64px)",
          display: "flex",
          flexWrap: "wrap",
          gap: "16px 40px",
          justifyContent: "space-between",
          fontSize: 12.5,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        <span>
          <BrandName inkColor="inherit" /> · Intelligent automation for business
          {showLocation ? " · Islamabad, Pakistan" : ""}
        </span>
        <span style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {NAV_LINKS.filter((link) => link.href !== pathname).map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </span>
      </div>
    </footer>
  );
}
