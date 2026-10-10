import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema, faqSchema, serviceSchema } from "@/lib/schema";
import PageHero from "@/components/PageHero";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import Counter from "@/components/Counter";
import Link from "next/link";
import GlowGrid from "@/components/GlowGrid";
import PackageFinder from "@/components/PackageFinder";
import PackageCompare from "@/components/PackageCompare";
import { modulesFor, packages } from "@/lib/packages";
import { products } from "@/lib/products";
import { FAQS } from "@/lib/content";
import { hrefIn, type Region } from "@/lib/region";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 62%, transparent)" };

export default function PricingPage({ region }: { region: Region }) {
  const pkgs = packages();
  // What a package brings over the one below it. Starter's own lines already
  // describe its one module, so it lists those alone.
  const highlightsOf = (index: number) => {
    const p = pkgs[index];
    return (index === 0 ? p.adds : [...p.adds, ...modulesFor(region, index).newHere.map((x) => x.name)]).slice(0, 4);
  };
  const tierOf = (name: string) => pkgs.findIndex((p) => products(region).find((x) => x.name === name)?.tier === `From ${p.name}`);
  const channelOptions = [
    { key: "whatsapp", label: "WhatsApp", from: Math.max(0, tierOf("WhatsApp Agent")) },
    { key: "social", label: "Instagram & Facebook", from: Math.max(0, tierOf("Social Agent")) },
    // The Voice Agent is an add-on on every package, so phone calls never
    // raise the recommendation; the finder names the add-on instead.
    { key: "voice", label: "Phone calls", from: 0, addon: "Voice Agent add-on for phone calls, priced separately" },
    { key: "website", label: "Our website", from: Math.max(0, tierOf("Website Agent")) },
  ];
  const needOptions = [
    { key: "crm", label: "Leads synced to our CRM", from: 1 },
    { key: "locations", label: "More than one location", from: 2 },
    { key: "models", label: "Complex, detailed questions", from: 3 },
    { key: "onprem", label: "Data must stay on our servers", from: 4 },
    { key: "sla", label: "Custom SLA or integrations", from: 5 },
  ];
  return (
    <>
      <JsonLd schema={breadcrumbSchema(region, "/pricing", "Pricing")} />
      <JsonLd schema={serviceSchema(region)} />
      <JsonLd schema={faqSchema()} />
      <PageHero
        kicker="Packages"
        maxWidthCh="17ch"
        heading={
          <>
            <LineReveal>
              <Counter target={6} /> tiers. One clear
            </LineReveal>
            <LineReveal>
              path as you <span style={{ color: "var(--color-accent)" }}>grow.</span>
            </LineReveal>
          </>
        }
        body={region.pricingBody}
        orbit={
          <HeroChatCard
            time="11:06"
            bubbles={[
              { from: "them", text: "We handle around 2,000 messages a month." },
              { from: "us", text: "That sits in Scale. I'll have the team confirm on a short call." },
            ]}
            speed="Scoped in 2 replies"
            outcome={["Volume logged against the tier", "Discovery call requested"]}
          />
        }
      />

      {/* ---------- The six packages ---------- */}
      <section style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(56px,7vw,96px) clamp(20px,5vw,64px) 0" }}>
        <GlowGrid className="tier-grid swipe">
          {pkgs.map((p) => {
            const highlights = highlightsOf(p.index);
            return (
              <div key={p.slug} id={p.slug} data-anim="" className={`glow tier-card anchor-target${p.recommended ? " tier-card-featured" : ""}`}>
                <div className="tier-top">
                  <span className="tier-n">{String(p.index + 1).padStart(2, "0")}</span>
                  {p.recommended ? <span className="tier-badge">Recommended</span> : null}
                </div>
                <h2 className="tier-name">
                  <Link href={hrefIn(region, `/pricing/${p.slug}`)} className="card-link" style={{ color: "inherit" }}>
                    {p.name}
                  </Link>
                </h2>
                <p className="tier-audience">{p.audience}</p>
                <span aria-hidden="true" className="tier-meter">
                  {pkgs.map((_, j) => (
                    <i key={j} data-on={j <= p.index ? "" : undefined} />
                  ))}
                </span>
                <p className="tier-body">{p.line}</p>
                <p className="tier-inc-k">{p.index === 0 ? "Includes" : `Everything in ${pkgs[p.index - 1].name}, plus`}</p>
                <ul className="tier-inc">
                  {highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
                <dl className="tier-cap">
                  <div>
                    <dt>Sized for</dt>
                    <dd>{p.usage.typical}</dd>
                  </div>
                  <div>
                    <dt>Included</dt>
                    <dd>{p.usage.sessions} sessions</dd>
                  </div>
                  <div>
                    <dt>Voice notes</dt>
                    <dd>{p.usage.voice} min</dd>
                  </div>
                </dl>
                <span className="tier-view">
                  View {p.name} <span aria-hidden="true">→</span>
                </span>
              </div>
            );
          })}
        </GlowGrid>
        <p aria-hidden="true" className="swipe-hint">Swipe through all {pkgs.length} packages →</p>
      </section>

      {/* ---------- Find your package ---------- */}
      <section className="dark-band">
        <div aria-hidden="true" className="dark-band-aurora" />
        <div style={{ maxWidth: 1280, margin: "0 auto", position: "relative", padding: "clamp(56px,7vw,96px) clamp(20px,5vw,64px)" }}>
          <span id="find" className="anchor-target" />
          <div className="split-head">
            <div>
              <p data-anim="" className="eyebrow eyebrow-dark">
                <span className="eyebrow-n">01</span>
                Find your package
              </p>
              <h2 data-anim="" style={{ fontSize: "clamp(28px,3.6vw,48px)", lineHeight: 1, letterSpacing: "-0.035em", margin: 0, maxWidth: "15ch", color: "#fff" }}>
                Three questions. <span className="grad-text-light">One clear answer.</span>
              </h2>
            </div>
            <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", color: "rgba(255,255,255,.66)" }}>
              Tell us roughly how busy you are, where customers reach you and what else you need. The package is the one that carries all of it.
            </p>
          </div>
          <PackageFinder
            packages={pkgs.map((p) => ({
              slug: p.slug,
              name: p.name,
              audience: p.audience,
              typical: p.usage.typical,
              href: hrefIn(region, `/pricing/${p.slug}`),
              previous: p.index > 0 ? pkgs[p.index - 1].name : undefined,
              highlights: highlightsOf(p.index),
            }))}
            channels={channelOptions}
            needs={needOptions}
            contactHref={hrefIn(region, "/contact")}
          />
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        {/* ---------- Compare ---------- */}
        <section style={{ padding: "clamp(64px,8vw,112px) 0 0" }}>
          <span id="compare" className="anchor-target" />
          <span id="what-each-tier-carries" className="anchor-target" />
          <p data-anim="" className="eyebrow">
            <span className="eyebrow-n">02</span>
            Compare every package
          </p>
          <h2 data-anim="" style={{ fontSize: "clamp(28px,3.6vw,48px)", lineHeight: 1, letterSpacing: "-0.035em", margin: "0 0 16px", maxWidth: "20ch" }}>
            Every module, feature and allowance, <span className="grad-text">side by side.</span>
          </h2>
          <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "60ch", ...bodyMuted }}>
            Every plan carries several times the sessions a business its size normally uses, so ordinary months never touch the overage rate. Your quote confirms the package against your real message history.
          </p>
          <PackageCompare region={region} />
        </section>

        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(28px,3.4vw,44px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <span id="questions" className="anchor-target" />
            <Kicker label="Questions" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px" }}>Before you ask us</h2>
              {/* The row padding lives on each summary, not on the details:
                  on a phone the padded area is most of the row, and only what
                  is inside the summary responds to a tap. */}
              <div style={{ display: "grid", maxWidth: 900 }}>
                {FAQS.map((f) => (
                  <details key={f.n} data-anim="" style={{ borderTop: "1px solid var(--color-divider)" }}>
                    <summary style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "20px 0", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, lineHeight: 1.35, letterSpacing: "-0.02em" }}>
                      <span style={{ flex: "none", fontSize: 12, letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>{f.n}</span>
                      <span data-chev="" style={{ color: "var(--color-accent)", fontSize: 16, flex: "none" }}>+</span>
                      {f.q}
                    </summary>
                    <p style={{ fontSize: 15.5, lineHeight: "28px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "0 0 22px 62px", maxWidth: "56ch" }}>{f.a}</p>
                  </details>
                ))}
                <div data-anim="rule" style={{ height: 1, background: "var(--color-divider)" }} />
              </div>
            </div>
          </div>
        </section>
        <div id="terms" className="anchor-target" style={{ padding: "0 0 clamp(40px,5.2vw,68px)" }}>
          <div data-anim="" style={{ display: "grid", gap: 9, borderBottom: "1px solid var(--color-divider)", paddingBottom: "clamp(18px,2.2vw,26px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 2px", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>Terms &amp; conditions</p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Usage and credits. Every action performed by an agent or tool consumes AI credits. The amount is determined by VantriqAI after the action completes, based on its complexity and the tool used, and is not quoted in advance. Credits are allocated monthly, expire at the end of each billing period, do not roll over, and are neither refundable nor exchangeable for cash or service. Sessions, session counts and headroom figures describe expected capacity, not a guaranteed entitlement; usage beyond the included allowance is billed at the stated overage rate.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Pricing and taxes. All figures are indicative and provided for reference only. Prices and currency vary by location, and any PKR or USD amount shown is illustrative and not an offer. Quoted amounts exclude taxes, duties and payment-processing charges, which are applied according to your billing address. The binding price is the one shown on the purchase page before payment is completed. VantriqAI may revise published tier pricing, allowances, overage rates and package contents. Changes affecting an existing customer take effect subject to the written agreement and any legally required notice.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Performance and third parties. Statistics on this site are published third-party research, attributed where they appear; they describe the industry, not results achieved by VantriqAI. Response times, volumes and other figures shown in product illustrations and example conversations are illustrative only. None of them are warranties, forecasts or guarantees of results for your business. Service delivery depends on third parties outside our control, including messaging platforms, business solution providers, calendar and CRM vendors and AI model providers; their pricing, policies, availability or model behaviour may change, and such changes pass through to you. Unless a separate written agreement states otherwise, the service is provided without service-level guarantees and our aggregate liability is limited to fees you paid in the three months preceding a claim.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              General. Nothing on this page constitutes a contract, an offer capable of acceptance, professional advice, or a commitment to supply. Scope, fees, term and support are governed solely by the written agreement signed with VantriqAI, which prevails over anything stated here. Trademarks, product names and materials on this site remain the property of VantriqAI or their respective owners. VantriqAI reserves all rights not expressly granted.
            </p>
            <p style={{ fontSize: 14, lineHeight: "24px" }}>All restrictions and liability limits remain subject to mandatory law and your valid written agreement. Read our <Link href="/terms" style={{ textDecoration: "underline" }}>full terms & service information</Link>, including privacy, customer responsibilities, cancellation and non-excludable rights.</p>
          </div>
        </div>

      </div>

      <PosterCTA
        headline="Get your numbers in writing."
        body="A fixed setup fee and monthly plan for your workflow, after one call."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref={hrefIn(region, "/contact")}
      />
    </>
  );
}
