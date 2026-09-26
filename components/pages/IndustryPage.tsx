import type { CSSProperties } from "react";
import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import Kicker from "@/components/Kicker";
import LineReveal from "@/components/LineReveal";
import HeroChatCard from "@/components/HeroChatCard";
import IndustryJourney from "@/components/IndustryJourney";
import PosterCTA from "@/components/PosterCTA";
import ProductMark from "@/components/ProductMark";
import { SECTORS } from "@/lib/content";
import { sectorSlug, type Industry } from "@/lib/industries";
import { productSlug, products } from "@/lib/products";
import { hrefIn, SITE_URL, type Region } from "@/lib/region";
import { breadcrumbSchema } from "@/lib/schema";
import { waLink } from "@/lib/whatsapp";
import { TRUST } from "@/lib/trust";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 76%, transparent)" };
const wrap: CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };

/** The sector colour, darkened enough to carry text on the cream ground. */
const INK_A = "color-mix(in srgb, var(--ind-a) 78%, #000)";

const CHANNELS = ["WhatsApp", "Instagram", "Facebook", "Website", "Voice"];


export default function IndustryPage({ region, industry }: { region: Region; industry: Industry }) {
  const catalogue = products(region);
  const modules = industry.modules
    .map((name) => catalogue.find((p) => p.name === name))
    .filter((p): p is NonNullable<typeof p> => !!p);
  const path = `/industries/${industry.slug}`;
  const others = SECTORS.filter((s) => s.name !== industry.name);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${SITE_URL}${hrefIn(region, path)}#faq`,
    mainEntity: industry.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="industry" style={{ "--ind-a": industry.theme.a, "--ind-b": industry.theme.b } as CSSProperties}>
      <JsonLd schema={breadcrumbSchema(region, path, industry.name, "Industries", hrefIn(region, "/industries"))} />
      <JsonLd schema={faqSchema} />

      {/* ---------- Hero ---------- */}
      <div style={wrap}>
        <section style={{ padding: "clamp(24px,3.4vw,44px) 0 clamp(30px,4vw,52px)", position: "relative" }}>
          <div aria-hidden="true" className="industry-wash" />
          <nav aria-label="Breadcrumb" style={{ position: "relative", marginBottom: "clamp(20px,3vw,34px)" }}>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 8, fontSize: 12.5, fontWeight: 700, ...bodyMuted }}>
              <li><Link href={hrefIn(region, "/industries")} style={{ color: "inherit" }}>Industries</Link></li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" style={{ color: INK_A }}>{industry.name}</li>
            </ol>
          </nav>

          <div className="hero-split" style={{ position: "relative", alignItems: "center" }}>
            <div>
              <span className="industry-pill">
                <span aria-hidden="true" className="industry-dot" />
                AI agents for {industry.name}
              </span>
              <h1 style={{ fontSize: "clamp(34px,5vw,66px)", lineHeight: 0.98, letterSpacing: "-0.035em", margin: "22px 0 0", maxWidth: "15ch" }}>
                <LineReveal><span style={{ color: INK_A }}>{industry.headline[0]}</span></LineReveal>
                <LineReveal>{industry.headline[1]}</LineReveal>
              </h1>
              <p data-anim="" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "50ch", margin: "26px 0 0" }}>{industry.lede}</p>
              <div data-anim="" style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
                <a className="btn industry-btn" href={waLink()} target="_blank" rel="noopener">
                  See it on WhatsApp
                </a>
                <Link className="btn btn-secondary" href={hrefIn(region, "/contact")} style={{ minHeight: 52, paddingInline: 22 }}>
                  Get a scoped quote
                </Link>
              </div>
              <ul aria-label="Channels" style={{ listStyle: "none", padding: 0, margin: "30px 0 0", display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CHANNELS.map((c) => (
                  <li key={c} className="industry-chip">{c}</li>
                ))}
              </ul>
            </div>

            {/* The stage: the conversation on a tinted field, with the two
                systems it writes to floating off its corners. */}
            <div className="industry-stage">
              <div aria-hidden="true" className="industry-stage-grid" />
              <HeroChatCard
                channel={industry.hero.channel}
                time={industry.hero.time}
                bubbles={industry.hero.bubbles}
                speed={industry.hero.speed}
                outcome={industry.hero.outcome}
              />
              <span aria-hidden="true" className="industry-float industry-float-a">
                <span className="industry-float-ico">⟳</span>Synced to your systems
              </span>
              <span aria-hidden="true" className="industry-float industry-float-b">
                <span className="industry-float-ico">★</span>Handover ready
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- The cost of today ---------- */}
      <div style={wrap}>
        <section style={{ padding: "clamp(26px,3.6vw,48px) 0 clamp(40px,5vw,68px)" }}>
          <Kicker label="The problem" />
          <h2 data-anim="" style={{ fontSize: "clamp(26px,3.2vw,44px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 clamp(24px,3vw,38px)", maxWidth: "24ch" }}>
            Where it breaks down today
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(270px,100%),1fr))", gap: 18 }}>
            {industry.pains.map((p, i) => (
              <div key={p.title} data-anim="" className="industry-pain">
                <span className="industry-pain-n">{String(i + 1).padStart(2, "0")}</span>
                <h3 style={{ fontSize: 21, lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{p.title}</h3>
                <p style={{ fontSize: 15, lineHeight: "25px", margin: 0, ...bodyMuted }}>{p.body}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* ---------- The journey ---------- */}
      <section className="industry-dark">
        <div aria-hidden="true" className="industry-dark-glow" />
        <div style={{ ...wrap, position: "relative", padding: "clamp(44px,6vw,86px) clamp(20px,5vw,64px)" }}>
          <p className="industry-dark-kicker">Across the customer journey</p>
          <h2 data-anim="" style={{ fontSize: "clamp(28px,3.8vw,52px)", lineHeight: 1, letterSpacing: "-0.035em", margin: "0 0 clamp(26px,3.4vw,44px)", maxWidth: "20ch", color: "#fff" }}>
            One agent, from the first question to the last follow-up
          </h2>
          <IndustryJourney stages={industry.stages} />
        </div>
      </section>

      {/* ---------- Modules ---------- */}
      <div style={wrap}>
        <section style={{ padding: "clamp(46px,6vw,84px) 0 clamp(26px,3vw,40px)" }}>
          <Kicker label="What runs it" />
          <h2 data-anim="" style={{ fontSize: "clamp(26px,3.2vw,44px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 clamp(24px,3vw,38px)", maxWidth: "24ch" }}>
            The modules {industry.name.toLowerCase()} teams switch on
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(196px,100%),1fr))", gap: 16 }}>
            {modules.map((m) => (
              <Link key={m.name} href={`${hrefIn(region, "/products")}#${productSlug(m.name)}`} data-anim="" className="industry-module">
                {m.mark ? <ProductMark id={m.mark} size={44} /> : null}
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.015em", color: "var(--color-text)" }}>{m.name}</span>
                <span style={{ fontSize: 13.5, lineHeight: "21px", ...bodyMuted }}>{m.body}</span>
                <span className="industry-module-tier">{m.tier} →</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* ---------- Systems + trust ---------- */}
      <div style={wrap}>
        <section className="industry-split" style={{ padding: "clamp(26px,3vw,40px) 0 clamp(46px,6vw,80px)" }}>
          <div className="industry-panel industry-panel-tint">
            <p className="industry-panel-kicker">Connects to</p>
            <h2 style={{ fontSize: "clamp(22px,2.4vw,32px)", lineHeight: 1.08, letterSpacing: "-0.025em", margin: "0 0 22px" }}>
              The systems you already run
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10 }}>
              {industry.systems.map((s) => (
                <li key={s} className="industry-system">
                  <span aria-hidden="true" className="industry-system-dot" />
                  {s}
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 13.5, lineHeight: "21px", margin: "20px 0 0", ...bodyMuted }}>
              Confirmed against your actual stack in the discovery call — we say what connects before you sign.
            </p>
          </div>
          <div className="industry-panel">
            <p className="industry-panel-kicker">Built to be trusted</p>
            <h2 style={{ fontSize: "clamp(22px,2.4vw,32px)", lineHeight: 1.08, letterSpacing: "-0.025em", margin: "0 0 22px" }}>
              Safe to put in front of your customers
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(210px,100%),1fr))", gap: 18 }}>
              {TRUST.map((t) => (
                <div key={t.title}>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 15, lineHeight: "21px", margin: "0 0 6px" }}>{t.title}</p>
                  <p style={{ fontSize: 13.5, lineHeight: "21px", margin: 0, ...bodyMuted }}>{t.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ---------- FAQ ---------- */}
      <div style={wrap}>
        <section style={{ padding: "0 0 clamp(46px,6vw,80px)" }}>
          <Kicker label="Questions" />
          <div style={{ display: "grid", gap: 12, maxWidth: 880 }}>
            {industry.faqs.map((f) => (
              <details key={f.q} className="industry-faq">
                <summary>{f.q}</summary>
                <p style={{ fontSize: 15.5, lineHeight: "26px", margin: "0 0 4px", ...bodyMuted }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>

      {/* ---------- Other sectors ---------- */}
      <div style={wrap}>
        <section style={{ padding: "0 0 clamp(40px,5vw,64px)" }}>
          <p className="industry-panel-kicker" style={{ marginBottom: 14 }}>Other industries</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexWrap: "wrap", gap: 10 }}>
            {others.map((s) => (
              <li key={s.name}>
                <Link href={hrefIn(region, `/industries/${sectorSlug(s.name)}`)} className="industry-other">
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <PosterCTA
        headline={`Put an agent on your ${industry.name.toLowerCase()} front line.`}
        body="Fifteen minutes on how customers reach you today, and a fixed quote in writing afterwards."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Request a quote"
        secondaryHref={hrefIn(region, "/contact")}
      />
    </div>
  );
}
