"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { NAV_LINKS } from "@/lib/nav-links";
import RegionSwitch from "@/components/RegionSwitch";
import { navHref, regionFromPathname } from "@/lib/region";
import { waLink, WHATSAPP_DISPLAY } from "@/lib/whatsapp";

export default function Footer() {
  const region = regionFromPathname(usePathname());

  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)" }}>
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
          <span style={{ textTransform: "none", fontFamily: "var(--font-heading)", fontWeight: 800, letterSpacing: "-0.01em" }}>
            <Wordmark />
          </span>{" "}
          · Intelligent automation for business ·{" "}
          <a href={waLink()} target="_blank" rel="noopener" style={{ textTransform: "none" }}>
            {WHATSAPP_DISPLAY}
          </a>
        </span>
        <span style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={navHref(region, link)}>
              {link.label}
            </Link>
          ))}
          <RegionSwitch />
        </span>
      </div>
    </footer>
  );
}
