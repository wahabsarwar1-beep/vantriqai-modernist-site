"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hrefIn, regionFromPathname } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

/**
 * The 404: the agent core with nothing flowing through it, and the three
 * places most people were actually trying to reach. Links stay in whichever
 * region the broken URL was in.
 */
export default function NotFoundStage() {
  const region = regionFromPathname(usePathname() ?? "/");

  const routes = [
    { href: hrefIn(region, "/"), label: "Home", note: "Start from the top" },
    { href: hrefIn(region, "/industries"), label: "Industries", note: "Find your sector" },
    { href: hrefIn(region, "/products"), label: "Platform", note: "All fourteen modules" },
  ];

  return (
    <section className="ph nf">
      <div aria-hidden="true" className="hh-aurora" />
      <div aria-hidden="true" className="hh-grid" />
      <div className="nf-inner">
        <div className="nf-core" aria-hidden="true">
          <span className="hh-core-ring" />
          <span className="hh-core-spin" />
          <span className="nf-orb">404</span>
        </div>
        <p className="hh-eyebrow" style={{ justifyContent: "center" }}>
          <span aria-hidden="true" className="ph-dot" />
          Signal lost
        </p>
        <h1 className="ph-title" style={{ textAlign: "center", margin: "22px auto 0", maxWidth: "16ch" }}>
          This page didn&rsquo;t <span className="grad-text-light">make it through.</span>
        </h1>
        <p className="ph-body" style={{ textAlign: "center", margin: "22px auto 0" }}>
          The link may be old or mistyped. Here is where most people were heading — or ask the agent, which never goes missing.
        </p>
        <div className="nf-routes">
          {routes.map((r) => (
            <Link key={r.href} href={r.href} className="nf-route">
              <strong>{r.label}</strong>
              <span>{r.note}</span>
              <span aria-hidden="true" className="nf-arrow">→</span>
            </Link>
          ))}
        </div>
        <a className="btn hh-btn-primary" href={waLink()} target="_blank" rel="noopener" style={{ marginTop: 28 }}>
          Ask on WhatsApp <span aria-hidden="true">→</span>
        </a>
      </div>
    </section>
  );
}
