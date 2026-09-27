import Link from "next/link";
import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";
import PageHero from "@/components/PageHero";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import Marquee from "@/components/Marquee";
import Counter from "@/components/Counter";
import ProductMark from "@/components/ProductMark";
import { INCLUDED } from "@/lib/content";
import { hrefIn, type Region } from "@/lib/region";
import { PRODUCT_GROUPS, products, productSlug, type Product } from "@/lib/products";
import GlowGrid from "@/components/GlowGrid";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

const GROUP_LABELS: Record<Product["kicker"], { title: string; note: string }> = {
  Channel: { title: "Channels", note: "where customers reach you" },
  Capability: { title: "Capabilities", note: "what the agent does once they have" },
  Insight: { title: "Insight & people", note: "what your conversations tell you, and help for your team" },
  Deployment: { title: "Deployment", note: "where it runs and what only you need" },
};


export default function ProductsPage({ region }: { region: Region }) {
  const catalogue = products(region);
  const count = (k: Product["kicker"]) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][catalogue.filter((p) => p.kicker === k).length];
  return (
    <>
      <JsonLd schema={breadcrumbSchema(region, "/products", "Products")} />
      <PageHero
        kicker="Products"
        maxWidthCh="17ch"
        heading={
          <>
            <LineReveal>
              <Counter target={catalogue.length} /> modules. Assemble
            </LineReveal>
            <LineReveal>
              the <span style={{ color: "var(--color-accent)" }}>one you need.</span>
            </LineReveal>
          </>
        }
        body={`Each product is a module on the same platform: ${count("Channel")} channels, ${count("Capability")} capabilities, ${count("Insight")} for insight and your team, ${count("Deployment")} ways to deploy. Start with one, add as volume grows — nothing is rebuilt when you do.`}
        orbit={
          <HeroChatCard
            time="20:52"
            bubbles={[
              { from: "them", text: "Is the navy kurta available in medium?" },
              { from: "us", text: "Two left in medium. Want me to hold one?" },
            ]}
            speed="Checked live stock"
            outcome={["Item held for 24 h", "Payment link sent"]}
          />
        }
      />

      {/* Grouped the way the menu groups them, so the page and the Platform
          panel describe one catalogue in one order. */}
      {PRODUCT_GROUPS.map((group, gi) => {
        const items = catalogue.filter((p) => p.kicker === group);
        const rest = items.filter((p) => !p.featured).length;
        const cols = rest % 4 === 0 ? 4 : Math.min(rest, 3);
        return (
          <section key={group} style={{ maxWidth: 1280, margin: "0 auto", padding: `${gi === 0 ? "clamp(56px,7vw,96px)" : "clamp(40px,5vw,64px)"} clamp(20px,5vw,64px) 0` }}>
            <div className="mod-head">
              <p data-anim="" className="eyebrow" style={{ margin: 0 }}>
                <span className="eyebrow-n">{String(gi + 1).padStart(2, "0")}</span>
                {GROUP_LABELS[group].title}
              </p>
              <p data-anim="" className="mod-head-note">
                {items.length} {items.length === 1 ? "module" : "modules"} · {GROUP_LABELS[group].note}
              </p>
            </div>
            {/* Columns that divide the group evenly: the featured module takes a
                full row, so what remains always fills whole rows. */}
            <GlowGrid className={`mod-grid mod-cols-${cols}`}>
              {items.map((p) => (
                <div key={p.name} id={productSlug(p.name)} data-anim="" className={`glow mod-card anchor-target${p.featured ? " mod-card-featured" : ""}`}>
                  <div className="mod-card-top">
                    {p.mark ? <ProductMark id={p.mark} size={p.featured ? 64 : 52} /> : null}
                    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {p.isNew ? <span className="mega-new" style={{ margin: 0 }}>New</span> : null}
                      <span className="mod-tier">{p.tier}</span>
                    </span>
                  </div>
                  <h2 className="mod-title">
                    <Link href={hrefIn(region, `/products/${productSlug(p.name)}`)} className="card-link" style={{ color: "inherit" }}>
                      {p.name}
                    </Link>
                  </h2>
                  <p className="mod-body">{p.body}</p>
                  <span aria-hidden="true" className="mod-more">Explore {p.name} →</span>
                  {p.featured ? (
                    <div className="bento-chat mod-feature-chat" aria-hidden="true">
                      <span className="bento-bubble bento-them">Can I come in Saturday morning?</span>
                      <span className="bento-bubble bento-us">Saturday 11:00 is free — booked. I&rsquo;ll remind you Friday.</span>
                      <span className="bento-typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    </div>
                  ) : null}
                </div>
              ))}
            </GlowGrid>
          </section>
        );
      })}

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(20px,2.6vw,34px) 0", overflow: "hidden", marginTop: "clamp(56px,7vw,96px)" }}>
        <Marquee duration={36} reverse>
          {["WhatsApp Business API", "Instagram DM", "Google Calendar", "HubSpot", "Shopify", "Salesforce", "Stripe", "WooCommerce", "Zoho", "Outlook"].map((s) => (
            <span key={s} style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(18px,2.2vw,30px)", letterSpacing: "-0.02em", padding: "0 20px", whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
              {s}
              <span style={{ color: "var(--color-accent)" }}> ·</span>
            </span>
          ))}
        </Marquee>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(40px,5.2vw,68px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="In every product" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px", maxWidth: "24ch" }}>The same foundation, whichever modules you run</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }} data-stagger="">
                {INCLUDED.map((i) => (
                  <div key={i.title} data-anim="" className="hover-border-lift" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
                    <h3 style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{i.title}</h3>
                    <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, maxWidth: "42ch", ...bodyMuted }}>{i.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Not sure which modules?"
        body="One call maps your customer workflow and tells you which two or three actually earn their keep."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="See packages"
        secondaryHref={hrefIn(region, "/pricing")}
      />
    </>
  );
}
