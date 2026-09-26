import type { CSSProperties } from "react";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import GlowGrid from "@/components/GlowGrid";
import Magnetic from "@/components/Magnetic";
import PosterCTA from "@/components/PosterCTA";
import ProductMark from "@/components/ProductMark";
import { industries } from "@/lib/industries";
import { modules, type Module } from "@/lib/modules";
import { hrefIn, SITE_URL, type Region } from "@/lib/region";
import { breadcrumbSchema } from "@/lib/schema";
import { SITE_NAME } from "@/lib/seo";
import { TRUST } from "@/lib/trust";
import { waLink } from "@/lib/whatsapp";

const wrap: CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };
const muted = { color: "color-mix(in srgb, var(--color-text) 72%, transparent)" };
const h2: CSSProperties = { fontSize: "clamp(28px,3.6vw,48px)", lineHeight: 1, letterSpacing: "-0.035em", margin: 0 };

/** Each group of modules carries its own pair of colours through the page. */
const GROUP_THEME: Record<Module["kicker"], { a: string; b: string; label: string }> = {
  Channel: { a: "#2f56d9", b: "#7a5bd6", label: "Channels" },
  Capability: { a: "#6a4fd1", b: "#e0854f", label: "Capabilities" },
  Deployment: { a: "#15907f", b: "#2f56d9", label: "Deployment" },
};

function Eyebrow({ n, label, dark }: { n: string; label: string; dark?: boolean }) {
  return (
    <p data-anim="" className={`eyebrow${dark ? " eyebrow-dark" : ""}`}>
      <span className="eyebrow-n">{n}</span>
      {label}
    </p>
  );
}

export default function ModulePage({ region, module: m }: { region: Region; module: Module }) {
  const theme = GROUP_THEME[m.kicker];
  const all = modules(region);
  const sectorsBySlug = new Map(industries(region).map((i) => [i.slug, i]));
  const sectors = m.sectors.flatMap((s) => {
    const ind = sectorsBySlug.get(s.slug);
    return ind ? [{ ...s, ind }] : [];
  });
  const pairs = m.pairs.flatMap((name) => all.filter((x) => x.name === name));
  const path = `/products/${m.slug}`;
  const url = `${SITE_URL}${hrefIn(region, path)}`;

  const schemas = [
    breadcrumbSchema(region, path, m.name, "Platform", hrefIn(region, "/products")),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${url}#service`,
      name: `${m.name} by ${SITE_NAME}`,
      serviceType: m.name,
      description: m.lede,
      url,
      provider: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: m.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="module" style={{ "--ind-a": theme.a, "--ind-b": theme.b } as CSSProperties}>
      {schemas.map((s, i) => (
        <JsonLd key={i} schema={s} />
      ))}

      {/* ---------- Hero ---------- */}
      <section className="ph mod-hero">
        <div aria-hidden="true" className="hh-aurora" />
        <div aria-hidden="true" className="mod-hero-tint" />
        <div aria-hidden="true" className="hh-grid" />
        <div className="hero-split ph-inner">
          <div>
            <nav aria-label="Breadcrumb" className="mod-crumbs">
              <ol>
                <li>
                  <Link href={hrefIn(region, "/products")}>Platform</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>{theme.label}</li>
                <li aria-hidden="true">/</li>
                <li aria-current="page">{m.name}</li>
              </ol>
            </nav>
            <p className="hh-eyebrow mod-eyebrow">
              {m.mark ? <ProductMark id={m.mark} size={24} /> : null}
              {m.name} · {m.tier}
            </p>
            <h1 className="ph-title" style={{ maxWidth: "15ch" }}>
              <LineReveal>
                <span style={{ color: "var(--color-accent)" }}>{m.headline[0]}</span>
              </LineReveal>
              <LineReveal>{m.headline[1]}</LineReveal>
            </h1>
            <p data-anim="" className="ph-body">
              {m.lede}
            </p>
            <div data-anim="" className="hh-actions">
              <Magnetic>
                <a className="btn hh-btn-primary" href={waLink()} target="_blank" rel="noopener">
                  See it on WhatsApp <span aria-hidden="true">→</span>
                </a>
              </Magnetic>
              <Magnetic>
                <Link className="btn hh-btn-ghost" href={hrefIn(region, "/contact")}>
                  Get a scoped quote
                </Link>
              </Magnetic>
            </div>
          </div>
          <div className="ph-orbit mod-stage">
            <HeroChatCard channel={m.hero.channel} time={m.hero.time} bubbles={m.hero.bubbles} speed={m.hero.speed} outcome={m.hero.outcome} />
            <span aria-hidden="true" className="industry-float industry-float-a">
              <span className="industry-float-ico">⟳</span>Synced to your systems
            </span>
            <span aria-hidden="true" className="industry-float industry-float-b">
              <span className="industry-float-ico">✓</span>Illustrative example
            </span>
          </div>
        </div>
      </section>

      {/* ---------- 01 How it works ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <div className="split-head">
          <div>
            <Eyebrow n="01" label="How it works" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "16ch" }}>
              From first message <span className="grad-text">to done.</span>
            </h2>
          </div>
          <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...muted }}>
            {m.body}
          </p>
        </div>
        <ol className="flow">
          {m.steps.map((s, i) => (
            <li key={s.title} data-anim="" className="flow-step">
              <span className="flow-n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------- 02 Capabilities ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="02" label="What it does" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", marginBottom: "clamp(28px,3.6vw,44px)" }}>
          Built to finish the job, <span className="grad-text">not just reply.</span>
        </h2>
        <GlowGrid className="cap-grid">
          {m.capabilities.map((c) => (
            <div key={c.title} data-anim="" className="glow cap-card">
              <span aria-hidden="true" className="cap-check">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </GlowGrid>
      </section>

      {/* ---------- 03 Where it earns its keep ---------- */}
      <section className="dark-band">
        <div aria-hidden="true" className="dark-band-aurora" />
        <div style={{ ...wrap, position: "relative", padding: "clamp(56px,7vw,100px) clamp(20px,5vw,64px)" }}>
          <div className="split-head">
            <div>
              <Eyebrow n="03" label="Where it earns its keep" dark />
              <h2 data-anim="" style={{ ...h2, maxWidth: "16ch", color: "#fff" }}>
                The same module, <span className="grad-text-light">tuned to your sector.</span>
              </h2>
            </div>
            <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", color: "rgba(255,255,255,.66)" }}>
              Configured around how your sector sells and supports — your catalogue, your booking rules, your tone.
            </p>
          </div>
          <GlowGrid className="sector-grid mod-sector-grid">
            {sectors.map((s) => (
              <Link
                key={s.slug}
                href={hrefIn(region, `/industries/${s.slug}`)}
                data-anim=""
                className="glow sector-tile"
                style={{ "--ind-a": s.ind.theme.a, "--ind-b": s.ind.theme.b } as CSSProperties}
              >
                <span aria-hidden="true" className="sector-tile-orb" />
                <span className="sector-tile-name">{s.ind.name}</span>
                <span className="sector-tile-line mod-sector-line">{s.line}</span>
                <span aria-hidden="true" className="sector-tile-arrow">→</span>
              </Link>
            ))}
          </GlowGrid>
        </div>
      </section>

      {/* ---------- 04 Pairs well with ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="04" label="Pairs well with" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", marginBottom: "clamp(28px,3.6vw,44px)" }}>
          One brain. <span className="grad-text">Modules that share it.</span>
        </h2>
        <GlowGrid className="mod-grid mod-cols-3">
          {pairs.map((p) => (
            <Link key={p.name} href={hrefIn(region, `/products/${p.slug}`)} data-anim="" className="glow mod-card mod-card-link">
              <div className="mod-card-top">
                {p.mark ? <ProductMark id={p.mark} size={48} /> : null}
                <span className="mod-tier">{p.tier}</span>
              </div>
              <h3 className="mod-title">{p.name}</h3>
              <p className="mod-body">{p.body}</p>
              <span className="mod-more">
                Explore {p.name} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </GlowGrid>
      </section>

      {/* ---------- 05 Systems + trust ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <div className="industry-split">
          <div className="industry-panel industry-panel-tint">
            <p className="industry-panel-kicker">Connects to</p>
            <h2 style={{ fontSize: "clamp(22px,2.4vw,32px)", lineHeight: 1.08, letterSpacing: "-0.025em", margin: "0 0 22px" }}>The systems you already run</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {m.systems.map((s) => (
                <li key={s} className="industry-system">
                  <span aria-hidden="true" className="industry-system-dot" />
                  {s}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 13.5, lineHeight: "21px", margin: "20px 0 0", ...muted }}>
              Confirmed against your actual stack in the discovery call — we say what connects before you sign.
            </p>
          </div>
          <div className="industry-panel">
            <p className="industry-panel-kicker">Built to be trusted</p>
            <h2 style={{ fontSize: "clamp(22px,2.4vw,32px)", lineHeight: 1.08, letterSpacing: "-0.025em", margin: "0 0 22px" }}>Inside the limits you set</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(210px,100%),1fr))", gap: 18 }}>
              {TRUST.map((t) => (
                <div key={t.title}>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, lineHeight: "21px", margin: "0 0 6px" }}>{t.title}</p>
                  <p style={{ fontSize: 13.5, lineHeight: "21px", margin: 0, ...muted }}>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 06 FAQ ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="05" label="Questions" />
        <div style={{ display: "grid", gap: 12, maxWidth: 880 }}>
          {m.faqs.map((f) => (
            <details key={f.q} className="industry-faq">
              <summary>{f.q}</summary>
              <p style={{ fontSize: 15.5, lineHeight: "26px", margin: "0 0 4px", ...muted }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- Every module ---------- */}
      <section style={{ ...wrap, padding: "clamp(48px,6vw,80px) clamp(20px,5vw,64px) clamp(40px,5vw,64px)" }}>
        <p className="industry-panel-kicker" style={{ marginBottom: 14 }}>
          All {all.length} modules
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {all.map((x) => (
            <li key={x.slug}>
              <Link href={hrefIn(region, `/products/${x.slug}`)} className="industry-other" aria-current={x.slug === m.slug ? "page" : undefined}>
                {x.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <PosterCTA
        headline={`Switch on the ${m.name}.`}
        body="Fifteen minutes on how customers reach you today, and a fixed quote in writing afterwards."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Compare packages"
        secondaryHref={hrefIn(region, "/pricing")}
      />
    </div>
  );
}
