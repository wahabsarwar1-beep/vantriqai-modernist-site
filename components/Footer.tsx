"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import RegionSwitch from "@/components/RegionSwitch";
import SocialIcon, { socialKey } from "@/components/SocialIcon";
import VantriqMark from "@/components/VantriqMark";
import { TIERS } from "@/lib/content";
import { menuPanels } from "@/lib/menu";
import { productSlug } from "@/lib/products";
import { hrefIn, navHref, regionFromPathname, type Region } from "@/lib/region";
import { RESOURCES } from "@/lib/resources";
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

type FooterLink = { href: string; label: string; external?: boolean; isNew?: boolean };

/**
 * The columns, built from the same data as the menus, so every module,
 * sector, package and guide the site has is one tap from the bottom of any
 * page — and a new one appears here without anyone editing the footer.
 */
function columns(region: Region): { title: string; links: FooterLink[] }[] {
  const panels = menuPanels(region);
  const panel = (label: string) => panels.find((p) => p.label === label)!;
  const platform = panel("Platform");
  const industries = panel("Industries");

  return [
    {
      title: "Platform",
      links: [
        ...platform.columns
          .filter((c) => c.title === "Channels" || c.title === "Insight & people")
          .flatMap((c) => c.links.map((l) => ({ href: l.href, label: l.label, isNew: l.isNew }))),
        { href: navHref(region, { href: "/how-it-works" }), label: "How it works" },
        { href: platform.footer.href, label: platform.footer.label },
      ],
    },
    {
      title: "Industries",
      links: [...industries.columns.flatMap((c) => c.links.map((l) => ({ href: l.href, label: l.label }))), { href: industries.footer.href, label: "Every sector" }],
    },
    {
      title: "Packages",
      links: [
        ...TIERS.map((t) => ({ href: hrefIn(region, `/pricing/${productSlug(t.name)}`), label: t.name })),
        { href: `${hrefIn(region, "/pricing")}#find`, label: "Find your package" },
        { href: `${hrefIn(region, "/pricing")}#compare`, label: "Compare every package" },
      ],
    },
    {
      title: "Resources",
      links: [...RESOURCES.map((r) => ({ href: `/resources/${r.slug}`, label: r.title })), { href: "/resources", label: "All guides" }],
    },
    {
      title: "Company",
      links: [
        { href: navHref(region, { href: "/contact" }), label: "Send a brief" },
        { href: waLink(), label: "WhatsApp us", external: true },
        ...SOCIAL_PROFILES.map((url) => ({ href: url, label: socialLabel(url), external: true })),
        { href: "/terms", label: "Terms & service information" },
        { href: "/privacy", label: "Privacy policy" },
        { href: "/data-deletion", label: "Data deletion" },
        { href: "/cookies", label: "Cookies & storage" },
      ],
    },
  ];
}

export default function Footer() {
  const region = regionFromPathname(usePathname());
  const year = new Date().getFullYear();
  /** On a phone the columns are an accordion; on wider screens all are open. */
  const [open, setOpen] = useState<string | null>(null);

  return (
    <footer className="ft">
      <div aria-hidden="true" className="ft-aurora" />
      <div aria-hidden="true" className="ft-grid-bg" />

      <div className="ft-inner">
        {/* The last word: what we do, that we are here now, and two ways in. */}
        <div className="ft-top">
          <div>
            <p className="ft-status">
              <span aria-hidden="true" className="ft-status-dot" />
              Agents online · replying in seconds
            </p>
            <p className="ft-statement">
              Every customer, <span className="ft-statement-grad">answered.</span>
            </p>
          </div>
          <div className="ft-actions">
            <a className="ft-btn ft-btn-primary" href={waLink()} target="_blank" rel="noopener">
              <span aria-hidden="true" className="ft-btn-dot" />
              {WHATSAPP_DISPLAY}
              <span aria-hidden="true">→</span>
            </a>
            <Link className="ft-btn ft-btn-ghost" href={navHref(region, { href: "/contact" })}>
              Send a brief
            </Link>
          </div>
        </div>

        <div className="ft-cols">
          {columns(region).map((col, i) => {
            const isOpen = open === col.title;
            const id = `ft-col-${i}`;
            return (
              <nav key={col.title} aria-label={col.title} className="ft-col" data-open={isOpen ? "" : undefined}>
                <button type="button" className="ft-col-head" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : col.title)}>
                  {col.title}
                  <span aria-hidden="true" className="ft-chev" />
                </button>
                <div id={id} className="ft-col-body">
                  <ul>
                    {col.links.map((l) => (
                      <li key={l.href + l.label}>
                        {l.external ? (
                          <a href={l.href} target="_blank" rel="noopener me" className="ft-link">
                            {l.label}
                          </a>
                        ) : (
                          <Link href={l.href} className="ft-link">
                            {l.label}
                            {l.isNew ? <span className="mega-new">New</span> : null}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </nav>
            );
          })}
        </div>

        {/* The name, as large as the page allows, lit by a slow sweep. */}
        <div aria-hidden="true" className="ft-word">
          <VantriqMark size={0} className="ft-word-mark" frame="currentColor" notch="#7f9bf2" />
          <span>
            Vantriq<em>AI</em>
          </span>
        </div>

        <div className="ft-bottom">
          <p className="ft-legal">
            &copy; {year} VantriqAI · Intelligent automation for business
          </p>
          <div className="ft-bottom-right">
            {SOCIAL_PROFILES.map((url) => {
              const key = socialKey(url);
              const label = socialLabel(url);
              return (
                <a key={url} href={url} target="_blank" rel="noopener me" aria-label={label} title={label} className="ft-social">
                  {key ? <SocialIcon name={key} /> : <span style={{ fontSize: 11 }}>{label}</span>}
                </a>
              );
            })}
            <button className="ft-privacy" onClick={() => window.dispatchEvent(new Event("vantriq:manage-privacy"))}>Privacy preferences</button>
            <span className="ft-region">
              <RegionSwitch />
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
