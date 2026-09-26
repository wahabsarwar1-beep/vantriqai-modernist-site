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
import { products, productSlug } from "@/lib/products";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };


export default function ProductsPage({ region }: { region: Region }) {
  return (
    <>
      <JsonLd schema={breadcrumbSchema(region, "/products", "Products")} />
      <PageHero
        kicker="Products"
        maxWidthCh="17ch"
        heading={
          <>
            <LineReveal>
              <Counter target={14} /> agents. Assemble
            </LineReveal>
            <LineReveal>
              the <span style={{ color: "var(--color-accent)" }}>one you need.</span>
            </LineReveal>
          </>
        }
        body="Each product is a module on the same platform: three channels, eight capabilities, two ways to deploy. Start with one, add as volume grows — nothing is rebuilt when you do."
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

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
          {products(region).map((p) => (
            <div key={p.name} id={productSlug(p.name)} className="card hover-lift-5 anchor-target" data-anim="" data-tilt="" style={{ padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", ...(p.featured ? { background: "var(--color-accent-100)" } : {}) }}>
              {p.mark ? (
                <ProductMark id={p.mark} />
              ) : (
                <span className="product-mark" style={{ display: "grid", placeItems: "center", width: 76, height: 76, flex: "none", borderRadius: 24, background: p.tint === "accent" ? "var(--color-accent)" : "var(--color-text)", marginBottom: 24 }}>
                  {p.icon}
                </span>
              )}
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 58%, transparent)", margin: "0 0 12px" }}>{p.kicker}</p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
                {p.name}
                <sup style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.42em", lineHeight: 1, verticalAlign: "super", marginLeft: 3, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>®</sup>
              </h2>
              <p style={{ fontSize: 15, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "0 0 22px", flex: 1 }}>{p.body}</p>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent)" }}>{p.tier}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(20px,2.6vw,34px) 0", overflow: "hidden" }}>
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
