"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import { NAV_LINKS } from "@/lib/nav-links";
import RegionSwitch from "@/components/RegionSwitch";
import { navHref, regionFromPathname } from "@/lib/region";
import { SOCIAL_PROFILES } from "@/lib/social";
import { waLink, WHATSAPP_DISPLAY } from "@/lib/whatsapp";

/* The same list the Organization schema publishes as sameAs, so a profile is
   claimed in the markup and reachable by a person in the same commit. The
   label is derived from the host: a numeric Facebook profile URL has nothing
   readable in its path. */
const SOCIAL_LABELS: Record<string, string> = {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "x.com": "X",
  "twitter.com": "X",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
};

const socialLabel = (url: string) => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return SOCIAL_LABELS[host] ?? host;
};

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
          {SOCIAL_PROFILES.map((url) => (
            <span key={url}>
              {" · "}
              <a href={url} target="_blank" rel="noopener me" style={{ textTransform: "none" }}>
                {socialLabel(url)}
              </a>
            </span>
          ))}
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
