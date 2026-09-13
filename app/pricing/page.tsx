import PageHero from "@/components/PageHero";
import HeroOrbitCard from "@/components/HeroOrbitCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import Counter from "@/components/Counter";
import Magnetic from "@/components/Magnetic";
import Link from "next/link";
import { TIERS, USAGE, FAQS } from "@/lib/content";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 62%, transparent)" };

export default function Pricing() {
  return (
    <>
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
        body="A one-time setup fee plus a simple monthly plan, quoted in PKR after we scope your workflow. No hidden surprises, and no charge for normal business volume."
        orbit={
          <HeroOrbitCard label="Growing" delay={0.9} spinDuration={12} orbitDuration={6.5} reverse>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: "8%", height: "44%", width: "70%" }}>
              {[0.4, 0.6, 0.8, 1].map((h, i) => (
                <span key={i} style={{ width: "16%", height: `${h * 100}%`, borderRadius: 4, background: "var(--color-accent)", transformOrigin: "bottom", animation: "growbar 1.6s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </HeroOrbitCard>
        }
      />

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
          {TIERS.map((t) => (
            <div
              key={t.name}
              data-anim=""
              className="hover-lift"
              style={{ background: "var(--color-surface)", padding: "clamp(28px,3vw,40px) clamp(20px,2.5vw,36px)", display: "flex", flexDirection: "column", borderRadius: 28, border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)" }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 16px" }}>{t.tier}</p>
              <h2 style={{ fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 8px" }}>{t.name}</h2>
              <p style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 18px", ...mutedLabel }}>{t.audience}</p>
              <p style={{ fontSize: 15, lineHeight: "26px", margin: "0 0 24px", flex: 1, ...bodyMuted }}>{t.body}</p>
              <Magnetic>
                <Link className="btn btn-secondary" href="/contact" style={{ alignSelf: "start", minHeight: 44, paddingInline: 18, justifyContent: "center", borderWidth: 1 }}>
                  Request a quote
                </Link>
              </Magnetic>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <div style={{ padding: "clamp(18px,2.2vw,28px) 0 0" }}>
          <div data-anim="" style={{ display: "grid", gap: 9, borderBottom: "1px solid var(--color-divider)", paddingBottom: "clamp(18px,2.2vw,26px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 2px", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>Terms &amp; conditions</p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Usage and credits. Every action performed by an agent or tool consumes AI credits. The amount is determined by VantriqAI after the action completes, based on its complexity and the tool used, and is not quoted in advance. Credits are allocated monthly, expire at the end of each billing period, do not roll over, and are neither refundable nor exchangeable for cash or service. Sessions, session counts and headroom figures describe expected capacity, not a guaranteed entitlement; usage beyond the included allowance is billed at the stated overage rate.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Pricing and taxes. All figures are indicative and provided for reference only. Prices and currency vary by location, and any PKR or USD amount shown is illustrative and not an offer. Quoted amounts exclude taxes, duties and payment-processing charges, which are applied according to your billing address. The binding price is the one shown on the purchase page before payment is completed. VantriqAI may revise tier pricing, allowances, overage rates and package contents at any time, at its sole discretion and without notice or obligation to give reasons; changes take effect from your next billing period.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              Performance and third parties. Response times, volumes, conversion figures and any other metrics on this site are illustrative examples drawn from past deployments. They are not warranties, forecasts or guarantees of results for your business. Service delivery depends on third parties outside our control, including messaging platforms, business solution providers, calendar and CRM vendors and AI model providers; their pricing, policies, availability or model behaviour may change, and such changes pass through to you. Unless a separate written agreement states otherwise, the service is provided without service-level guarantees and our aggregate liability is limited to fees you paid in the three months preceding a claim.
            </p>
            <p style={{ fontSize: 11, lineHeight: "19px", margin: 0, maxWidth: "104ch", ...mutedLabel }}>
              General. Nothing on this page constitutes a contract, an offer capable of acceptance, professional advice, or a commitment to supply. Scope, fees, term and support are governed solely by the written agreement signed with VantriqAI, which prevails over anything stated here. Trademarks, product names and materials on this site remain the property of VantriqAI or their respective owners. VantriqAI reserves all rights not expressly granted.
            </p>
          </div>
        </div>

        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 0" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="What each tier carries" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "24ch" }}>The same table your quote is built from</h2>
              <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 36px", maxWidth: "54ch", ...bodyMuted }}>Every plan carries several times the sessions a business its size normally uses, so ordinary months never touch the overage rate. Your quote confirms the tier against your real message history.</p>
              <div data-anim="" style={{ overflowX: "auto" }}>
                <table className="table" style={{ minWidth: 840, fontSize: 15 }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Plan</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Typical use</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Sessions included</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Sessions / day</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Headroom</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Overage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {USAGE.map((r) => (
                      <tr key={r.plan}>
                        <td style={{ padding: "14px 10px", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{r.plan}</td>
                        <td style={{ padding: "14px 10px", whiteSpace: "nowrap", ...bodyMuted }}>{r.typical}</td>
                        <td style={{ padding: "14px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--color-accent-700)", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{r.sessions}</td>
                        <td style={{ padding: "14px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...bodyMuted }}>{r.perday}</td>
                        <td style={{ padding: "14px 10px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{r.head}</td>
                        <td style={{ padding: "14px 10px", whiteSpace: "nowrap", ...bodyMuted }}>{r.over}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(40px,5.2vw,68px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="Questions" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px" }}>Before you ask us</h2>
              <div style={{ display: "grid", maxWidth: 900 }}>
                {FAQS.map((f) => (
                  <details key={f.n} data-anim="" style={{ borderTop: "1px solid var(--color-divider)", padding: "20px 0" }}>
                    <summary style={{ display: "flex", gap: 16, alignItems: "baseline", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, lineHeight: 1.35, letterSpacing: "-0.02em", cursor: "pointer" }}>
                      <span style={{ flex: "none", fontSize: 12, letterSpacing: "0.1em", fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>{f.n}</span>
                      <span data-chev="" style={{ color: "var(--color-accent)", fontSize: 16, flex: "none" }}>+</span>
                      {f.q}
                    </summary>
                    <p style={{ fontSize: 15.5, lineHeight: "28px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "12px 0 0 62px", maxWidth: "56ch" }}>{f.a}</p>
                  </details>
                ))}
                <div data-anim="rule" style={{ height: 1, background: "var(--color-divider)" }} />
              </div>
            </div>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Get your numbers in writing."
        body="A fixed setup fee and monthly plan for your workflow, after one call."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref="/contact"
      />
    </>
  );
}
