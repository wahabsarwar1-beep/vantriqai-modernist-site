import type { CSSProperties } from "react";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import GlowGrid from "@/components/GlowGrid";
import LineReveal from "@/components/LineReveal";
import Magnetic from "@/components/Magnetic";
import PosterCTA from "@/components/PosterCTA";
import ProductMark from "@/components/ProductMark";
import { FAQS } from "@/lib/content";
import { PLATFORM_FEATURES, modulesFor, packages, type Package } from "@/lib/packages";
import { productSlug } from "@/lib/products";
import { hrefIn, SITE_URL, type Region } from "@/lib/region";
import { breadcrumbSchema } from "@/lib/schema";
import { SITE_NAME } from "@/lib/seo";
import { waLink } from "@/lib/whatsapp";

const wrap: CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };
const muted = { color: "color-mix(in srgb, var(--color-text) 72%, transparent)" };
const h2: CSSProperties = { fontSize: "clamp(28px,3.6vw,48px)", lineHeight: 1, letterSpacing: "-0.035em", margin: 0 };

function Eyebrow({ n, label }: { n: string; label: string }) {
  return (
    <p data-anim="" className="eyebrow">
      <span className="eyebrow-n">{n}</span>
      {label}
    </p>
  );
}

export default function PackagePage({ region, pkg }: { region: Region; pkg: Package }) {
  const all = packages();
  const prev = all[pkg.index - 1];
  const next = all[pkg.index + 1];
  const mods = modulesFor(region, pkg.index);
  const channels = mods.included.filter((m) => m.kicker === "Channel");
  const features = PLATFORM_FEATURES.filter((f) => pkg.index >= f.from);
  const overage = pkg.usage[region.overageKey];
  const voiceOver = pkg.usage[region.voiceOverKey];
  const path = `/pricing/${pkg.slug}`;
  const url = `${SITE_URL}${hrefIn(region, path)}`;

  const faqs = [
    { q: `How is the ${pkg.name} price set?`, a: FAQS[0].a },
    {
      q: "What happens if we go over the included sessions?",
      a: `${pkg.name} includes ${pkg.usage.sessions} sessions a month — about ${pkg.usage.head} the volume a business this size normally handles, so an ordinary month does not reach it. Anything beyond is billed at ${overage}, stated in writing in your quote.`,
    },
    {
      q: "Are voice notes included?",
      a: `Yes. ${pkg.name} includes ${pkg.usage.voice} minutes of customers' voice notes a month — understood and answered in text, like any other message. Minutes beyond that are ${voiceOver}, stated in writing in your quote. Spoken replies are a separate add-on.`,
    },
    { q: "Can we change package later?", a: FAQS[5].a },
    { q: "How long until it is live?", a: FAQS[1].a },
  ];

  const schemas = [
    breadcrumbSchema(region, path, `${pkg.name} package`, "Packages", hrefIn(region, "/pricing")),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      "@id": `${url}#service`,
      name: `${SITE_NAME} ${pkg.name}`,
      description: pkg.lede,
      audience: { "@type": "Audience", audienceType: pkg.audience },
      provider: { "@id": `${SITE_URL}/#organization` },
      url,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ];

  return (
    <div className="pkg">
      {schemas.map((s, i) => (
        <JsonLd key={i} schema={s} />
      ))}

      {/* ---------- Hero ---------- */}
      <section className="ph">
        <div aria-hidden="true" className="hh-aurora" />
        <div aria-hidden="true" className="hh-grid" />
        <div className="hero-split ph-inner">
          <div>
            <nav aria-label="Breadcrumb" className="mod-crumbs">
              <ol>
                <li>
                  <Link href={hrefIn(region, "/pricing")}>Packages</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page">{pkg.name}</li>
              </ol>
            </nav>
            <p className="hh-eyebrow">
              <span aria-hidden="true" className="ph-dot" />
              {pkg.tierLabel} · {pkg.audience}
              {pkg.recommended ? <span className="pkg-rec">Recommended</span> : null}
            </p>
            <h1 className="ph-title" style={{ maxWidth: "15ch" }}>
              <LineReveal>
                <span style={{ color: "var(--color-accent)" }}>{pkg.headline[0]}</span>
              </LineReveal>
              <LineReveal>{pkg.headline[1]}</LineReveal>
            </h1>
            <p data-anim="" className="ph-body">
              {pkg.lede}
            </p>
            <div data-anim="" className="hh-actions">
              <Magnetic>
                <Link className="btn hh-btn-primary" href={hrefIn(region, "/contact")}>
                  Get {pkg.name} quoted <span aria-hidden="true">→</span>
                </Link>
              </Magnetic>
              <Magnetic>
                <a className="btn hh-btn-ghost" href={waLink()} target="_blank" rel="noopener">
                  Ask on WhatsApp
                </a>
              </Magnetic>
            </div>
          </div>

          {/* The package at a glance: where it sits, what it carries. */}
          <div className="pkg-card" aria-label={`${pkg.name} at a glance`}>
            <div className="pkg-card-top">
              <span className="pkg-card-name">{pkg.name}</span>
              <span className="pkg-card-tier">{pkg.tierLabel}</span>
            </div>
            <span aria-hidden="true" className="pkg-meter">
              {all.map((p) => (
                <i key={p.slug} data-on={p.index <= pkg.index ? "" : undefined} />
              ))}
            </span>
            <dl className="pkg-stats">
              <div>
                <dt>Sized for</dt>
                <dd>{pkg.usage.typical}</dd>
              </div>
              <div>
                <dt>Sessions included</dt>
                <dd>{pkg.usage.sessions} / mo</dd>
              </div>
              <div>
                <dt>Headroom</dt>
                <dd>{pkg.usage.head}</dd>
              </div>
              <div>
                <dt>Voice notes</dt>
                <dd>{pkg.usage.voice} min / mo</dd>
              </div>
              <div>
                <dt>Overage</dt>
                <dd>{overage}</dd>
              </div>
            </dl>
            <p className="pkg-card-label">Channels</p>
            <div className="pkg-card-channels">
              {channels.map((c) => (
                <span key={c.name} className="pkg-chan">
                  {c.mark ? <ProductMark id={c.mark} size={26} /> : null}
                  {c.name.replace(" Agent", "")}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 01 Built for ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="01" label="Built for" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", marginBottom: "clamp(26px,3.4vw,40px)" }}>
          Who {pkg.name} <span className="grad-text">is made for.</span>
        </h2>
        <div className="pkg-fit">
          {pkg.idealFor.map((f, i) => (
            <div key={f} data-anim="" className="pkg-fit-item">
              <span className="pkg-fit-n">{String(i + 1).padStart(2, "0")}</span>
              {f}
            </div>
          ))}
        </div>
      </section>

      {/* ---------- 02 What's included ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <div className="split-head">
          <div>
            <Eyebrow n="02" label="What's included" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "16ch" }}>
              {prev ? (
                <>
                  Everything in {prev.name}, <span className="grad-text">plus more.</span>
                </>
              ) : (
                <>
                  Everything you need <span className="grad-text">to start.</span>
                </>
              )}
            </h2>
          </div>
          <div className="pkg-new">
            <p className="pkg-new-title">{prev ? `New at ${pkg.name}` : `In ${pkg.name}`}</p>
            <ul>
              {pkg.adds.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {mods.newHere.map((m) => (
                <li key={m.name}>
                  <Link href={hrefIn(region, `/products/${productSlug(m.name)}`)}>{m.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="industry-panel-kicker" style={{ margin: "0 0 14px" }}>
          Modules included · {mods.included.length}
        </p>
        <GlowGrid className="pkg-mods">
          {mods.included.map((m) => (
            <Link key={m.name} href={hrefIn(region, `/products/${productSlug(m.name)}`)} data-anim="" className="glow pkg-mod">
              {m.mark ? <ProductMark id={m.mark} size={40} /> : null}
              <span>
                <strong>{m.name}</strong>
                <em>{m.kicker}</em>
              </span>
              <span aria-hidden="true" className="pkg-mod-arrow">
                →
              </span>
            </Link>
          ))}
        </GlowGrid>

        {mods.addons.length ? (
          <>
            <p className="industry-panel-kicker" style={{ margin: "28px 0 14px" }}>
              Available as add-ons
            </p>
            <div className="pkg-addons">
              {mods.addons.map((m) => (
                <Link key={m.name} href={hrefIn(region, `/products/${productSlug(m.name)}`)} className="pkg-addon">
                  {m.mark ? <ProductMark id={m.mark} size={26} /> : null}
                  {m.name}
                </Link>
              ))}
            </div>
          </>
        ) : null}

        <p className="industry-panel-kicker" style={{ margin: "28px 0 14px" }}>
          On the platform
        </p>
        <ul className="pkg-features">
          {features.map((f) => (
            <li key={f.label}>
              <span aria-hidden="true" className="cap-check">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              {f.label}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- 03 Capacity ---------- */}
      <section className="dark-band">
        <div aria-hidden="true" className="dark-band-aurora" />
        <div style={{ ...wrap, position: "relative", padding: "clamp(56px,7vw,96px) clamp(20px,5vw,64px)" }}>
          <p data-anim="" className="eyebrow eyebrow-dark">
            <span className="eyebrow-n">03</span>
            Capacity
          </p>
          <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", color: "#fff", marginBottom: "clamp(28px,3.6vw,44px)" }}>
            Room to grow, <span className="grad-text-light">no surprise bills.</span>
          </h2>
          <div className="pkg-cap">
            <div>
              <span className="pkg-cap-fig">{pkg.usage.sessions}</span>
              <span className="pkg-cap-label">sessions included every month</span>
            </div>
            <div>
              <span className="pkg-cap-fig">{pkg.usage.perday}</span>
              <span className="pkg-cap-label">sessions a day, on average</span>
            </div>
            <div>
              <span className="pkg-cap-fig">{pkg.usage.head}</span>
              <span className="pkg-cap-label">the volume a business this size normally handles</span>
            </div>
            <div>
              <span className="pkg-cap-fig pkg-cap-fig-sm">{overage}</span>
              <span className="pkg-cap-label">beyond the allowance, stated in your quote</span>
            </div>
            <div>
              <span className="pkg-cap-fig">{pkg.usage.voice}</span>
              <span className="pkg-cap-label">minutes of voice notes included every month, then {voiceOver}</span>
            </div>
          </div>
          <p style={{ margin: "26px 0 0", maxWidth: "70ch", fontSize: 14.5, lineHeight: "24px", color: "rgba(255,255,255,.6)" }}>
            Sized for {pkg.usage.typical} conversations. Your quote confirms the package against your real message history, and every figure — allowance and overage — is stated in writing before you sign.
          </p>
        </div>
      </section>

      {/* ---------- 04 The path ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="04" label="Your path" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", marginBottom: "clamp(26px,3.4vw,40px)" }}>
          A path, <span className="grad-text">not a lock-in.</span>
        </h2>
        <ol className="pkg-ladder">
          {all.map((p) => (
            <li key={p.slug} data-here={p.slug === pkg.slug ? "" : undefined} data-past={p.index < pkg.index ? "" : undefined}>
              <Link href={hrefIn(region, `/pricing/${p.slug}`)} aria-current={p.slug === pkg.slug ? "page" : undefined}>
                <span className="pkg-ladder-n">{String(p.index + 1).padStart(2, "0")}</span>
                <strong>{p.name}</strong>
                <em>{p.audience}</em>
              </Link>
            </li>
          ))}
        </ol>
        <div className="pkg-moves">
          {next ? (
            <Link href={hrefIn(region, `/pricing/${next.slug}`)} className="pkg-move pkg-move-next">
              <span className="pkg-move-k">When to move up to {next.name}</span>
              <span className="pkg-move-body">When {pkg.upgradeWhen}</span>
              <span className="pkg-move-cta">
                See {next.name} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ) : (
            <div className="pkg-move pkg-move-next">
              <span className="pkg-move-k">The top of the path</span>
              <span className="pkg-move-body">Enterprise+ is shaped entirely around your operation — capacity, integrations and service levels are agreed with you in writing.</span>
            </div>
          )}
          {prev ? (
            <Link href={hrefIn(region, `/pricing/${prev.slug}`)} className="pkg-move">
              <span className="pkg-move-k">Starting smaller?</span>
              <span className="pkg-move-body">
                {prev.name}: {prev.line}
              </span>
              <span className="pkg-move-cta">
                See {prev.name} <span aria-hidden="true">→</span>
              </span>
            </Link>
          ) : null}
        </div>
      </section>

      {/* ---------- 05 Questions ---------- */}
      <section style={{ ...wrap, padding: "clamp(64px,8vw,112px) clamp(20px,5vw,64px) clamp(48px,6vw,80px)" }}>
        <Eyebrow n="05" label="Questions" />
        <div style={{ display: "grid", gap: 12, maxWidth: 880 }}>
          {faqs.map((f) => (
            <details key={f.q} className="industry-faq">
              <summary>{f.q}</summary>
              <p style={{ fontSize: 15.5, lineHeight: "26px", margin: "0 0 4px", ...muted }}>{f.a}</p>
            </details>
          ))}
        </div>
        <p style={{ margin: "26px 0 0" }}>
          <Link href={hrefIn(region, "/pricing#compare")} className="mod-more">
            Compare all six packages side by side →
          </Link>
        </p>
      </section>

      <PosterCTA
        headline={`Get ${pkg.name} quoted in writing.`}
        body="Fifteen minutes on how customers reach you today, then a fixed setup fee and monthly plan in writing."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref={hrefIn(region, "/contact")}
      />
    </div>
  );
}
