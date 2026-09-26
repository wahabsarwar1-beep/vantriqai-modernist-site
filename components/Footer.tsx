"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Wordmark from "@/components/Wordmark";
import RegionSwitch from "@/components/RegionSwitch";
import SocialIcon, { socialKey } from "@/components/SocialIcon";
import { RESOURCES } from "@/lib/resources";
import { navHref, regionFromPathname, type Region } from "@/lib/region";
import { SOCIAL_PROFILES } from "@/lib/social";
import { waLink, WHATSAPP_DISPLAY } from "@/lib/whatsapp";

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

/**
 * Columns, built only from pages that exist.
 *
 * The temptation with a footer this shape is to list all fourteen modules and
 * all ten industries. They live on one page each, so that would be fourteen
 * links to /products — a padded column, not a deeper site. When per-module and
 * per-industry pages exist they slot in here, and the depth is earned.
 */
const columns = (region: Region) => [
  {
    title: "Platform",
    links: [
      { href: navHref(region, { href: "/products" }), label: "Products" },
      { href: navHref(region, { href: "/how-it-works" }), label: "How it works" },
      { href: navHref(region, { href: "/industries" }), label: "Industries" },
      { href: navHref(region, { href: "/pricing" }), label: "Packages" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/resources", label: "All guides" },
      ...RESOURCES.map((r) => ({ href: `/resources/${r.slug}`, label: r.title })),
    ],
  },
];

const colTitle = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  color: "var(--color-accent)",
  margin: "0 0 18px",
};

const linkStyle = {
  fontSize: 14.5,
  lineHeight: "22px",
  color: "color-mix(in srgb, var(--color-text) 72%, transparent)",
};

export default function Footer() {
  const region = regionFromPathname(usePathname());
  const year = new Date().getFullYear();

  return (
    <footer style={{ borderTop: "1px solid var(--color-divider)", background: "var(--color-surface)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(40px,5vw,66px) clamp(20px,5vw,64px) 0" }}>
        <div className="footer-grid">
          {/* Brand block: who this is, how to reach them, where else they are. */}
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>
              <Wordmark />
            </div>
            <p style={{ fontSize: 14.5, lineHeight: "24px", margin: "16px 0 22px", maxWidth: "34ch", color: "color-mix(in srgb, var(--color-text) 68%, transparent)" }}>
              AI agents that reply, qualify and book on WhatsApp, Instagram and your website — every hour, at any volume.
            </p>

            <a
              href={waLink()}
              target="_blank"
              rel="noopener"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}
            >
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "#25c16a", flex: "none" }} />
              {WHATSAPP_DISPLAY}
            </a>

            {SOCIAL_PROFILES.length ? (
              <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
                {SOCIAL_PROFILES.map((url) => {
                  const key = socialKey(url);
                  const label = socialLabel(url);
                  return (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noopener me"
                      aria-label={label}
                      title={label}
                      className="footer-social"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 44,
                        height: 44,
                        borderRadius: 14,
                        border: "1px solid var(--color-divider)",
                        background: "var(--color-bg)",
                        color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
                        flex: "none",
                      }}
                    >
                      {key ? <SocialIcon name={key} /> : <span style={{ fontSize: 12 }}>{label}</span>}
                    </a>
                  );
                })}
              </div>
            ) : null}
          </div>

          {columns(region).map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p style={colTitle}>{col.title}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 13 }}>
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="footer-link" style={linkStyle}>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav aria-label="Talk to us">
            <p style={colTitle}>Talk to us</p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 13 }}>
              <li>
                <Link href={navHref(region, { href: "/contact" })} className="footer-link" style={linkStyle}>
                  Send a brief
                </Link>
              </li>
              <li>
                <a href={waLink()} target="_blank" rel="noopener" className="footer-link" style={linkStyle}>
                  Message us on WhatsApp
                </a>
              </li>
              {SOCIAL_PROFILES.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener me" className="footer-link" style={linkStyle}>
                    {socialLabel(url)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* Bottom bar: the legal line, and the currency everything above is in. */}
        <div
          className="footer-bottom"
          style={{
            marginTop: "clamp(32px,4vw,54px)",
            paddingTop: 22,
            borderTop: "1px solid var(--color-divider)",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            /* Both to the left, not spread. The chat launcher is fixed to the
               bottom right of every page and sat directly on top of the
               region control when this row justified to space-between. */
            justifyContent: "flex-start",
            gap: "14px 24px",
            paddingRight: "clamp(0px, 14vw, 190px)",
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, letterSpacing: "0.03em", color: "color-mix(in srgb, var(--color-text) 52%, transparent)" }}>
            &copy; {year} Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span> &middot; Intelligent automation for business
          </p>
          <RegionSwitch />
        </div>
      </div>
    </footer>
  );
}
