import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import SplitHeader from "@/components/SplitHeader";
import { waLink } from "@/lib/whatsapp";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 62%, transparent)" };

const TIERS = [
  {
    tier: "Tier 01",
    name: "Starter",
    audience: "Small business",
    body: "WhatsApp only. One agent, your catalogue and FAQs, replying around the clock.",
    featured: false,
  },
  {
    tier: "Tier 02",
    name: "Growth",
    audience: "Medium corporate",
    body: "Everything in Starter, plus CRM sync so every lead lands in your pipeline.",
    featured: false,
  },
  {
    tier: "Tier 03 · Most chosen",
    name: "Scale",
    audience: "Multi-location business",
    body: "Adds your website as a channel, with location-aware routing and availability.",
    featured: true,
  },
  {
    tier: "Tier 04",
    name: "Pro",
    audience: "Established corporate",
    body: "Top-tier AI models across every channel your customers already use.",
    featured: false,
  },
  {
    tier: "Tier 05",
    name: "Enterprise",
    audience: "Large enterprise",
    body: "Adds a private on-premise deployment option for strict data residency.",
    featured: false,
  },
  {
    tier: "Tier 06",
    name: "Enterprise+",
    audience: "Highest volume, custom",
    body: "Custom SLA, custom integrations, and capacity for the highest message volumes.",
    featured: false,
  },
];

const FAQS = [
  {
    q: "Why don't you list prices?",
    a: "Because the setup fee depends on what the agent has to connect to. We quote a fixed setup fee and a fixed monthly plan in writing after a fifteen-minute discovery call — nothing is estimated after that.",
  },
  {
    q: "How long until it is live?",
    a: "Most agents are built, tested alongside your team, and live within a few weeks of scope sign-off. Complex integrations and on-premise deployments take longer, and we say so up front.",
  },
  {
    q: "Will it answer in Urdu?",
    a: "Yes — customers write the way they normally write, including Roman Urdu, and the agent replies in kind. Tone and vocabulary are tuned to your brand during configuration.",
  },
  {
    q: "What happens when it doesn't know?",
    a: "It escalates to your team with the full conversation attached, rather than guessing or looping. Recurring escalations are folded into the next monthly tuning round.",
  },
  {
    q: "Where does our data live?",
    a: "From simple catalogues to enterprise databases, we match handling to your sensitivity — including fully private, self-hosted deployment for strict data-residency requirements.",
  },
  {
    q: "Can we move up a tier later?",
    a: "Yes. Tiers are a path, not a lock-in — most clients start on the channel that matters most and add CRM, website, or extra channels as volume grows.",
  },
  {
    q: "Where do the figures on this site come from?",
    a: "Every benchmark is published third-party research — MIT/InsideSales.com, Harvard Business Review, SuperOffice, Salesforce, HubSpot, Meta and Mobilesquared — cited on the line where it appears. They describe the category, not our client results.",
  },
];

/** Capacity per tier — the figures a quote is built from. Prices are
 *  deliberately not published; the site promises a quote after a call. */
const USAGE = [
  { plan: "Starter", typical: "300–600 / mo", sessions: "1,500", perday: "50", head: "5.0×", over: "PKR 2 / session" },
  { plan: "Growth", typical: "800–1,500 / mo", sessions: "4,000", perday: "133", head: "5.0×", over: "PKR 2 / session" },
  { plan: "Scale", typical: "2,000–4,000 / mo", sessions: "9,000", perday: "300", head: "4.5×", over: "PKR 3 / session" },
  { plan: "Pro", typical: "4,000–8,000 / mo", sessions: "15,000", perday: "500", head: "3.8×", over: "PKR 4 / session" },
  { plan: "Enterprise", typical: "8,000–15,000 / mo", sessions: "25,000", perday: "833", head: "3.1×", over: "PKR 4 / session" },
  { plan: "Enterprise+", typical: "15,000+ / mo", sessions: "40,000", perday: "1,333", head: "2.7×", over: "PKR 5 / session" },
];

/** Legal text. Client-approved and shipped verbatim — do not paraphrase. */
const TERMS = [
  "Usage and credits. Every action performed by an agent or tool consumes AI credits. The amount is determined by VantriqAI after the action completes, based on its complexity and the tool used, and is not quoted in advance. Credits are allocated monthly, expire at the end of each billing period, do not roll over, and are neither refundable nor exchangeable for cash or service. Sessions, session counts and headroom figures describe expected capacity, not a guaranteed entitlement; usage beyond the included allowance is billed at the stated overage rate.",
  "Pricing and taxes. All figures are indicative and provided for reference only. Prices and currency vary by location, and any PKR or USD amount shown is illustrative and not an offer. Quoted amounts exclude taxes, duties and payment-processing charges, which are applied according to your billing address. The binding price is the one shown on the purchase page before payment is completed. VantriqAI may revise tier pricing, allowances, overage rates and package contents at any time, at its sole discretion and without notice or obligation to give reasons; changes take effect from your next billing period.",
  "Performance and third parties. Response times, volumes, conversion figures and any other metrics on this site are illustrative examples drawn from past deployments. They are not warranties, forecasts or guarantees of results for your business. Service delivery depends on third parties outside our control, including messaging platforms, business solution providers, calendar and CRM vendors and AI model providers; their pricing, policies, availability or model behaviour may change, and such changes pass through to you. Unless a separate written agreement states otherwise, the service is provided without service-level guarantees and our aggregate liability is limited to fees you paid in the three months preceding a claim.",
  "General. Nothing on this page constitutes a contract, an offer capable of acceptance, professional advice, or a commitment to supply. Scope, fees, term and support are governed solely by the written agreement signed with VantriqAI, which prevails over anything stated here. Trademarks, product names and materials on this site remain the property of VantriqAI or their respective owners. VantriqAI reserves all rights not expressly granted.",
];

const termsLabel = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
};
const termsBody = {
  fontSize: 11,
  lineHeight: "19px",
  margin: 0,
  maxWidth: "104ch",
  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
};
const figureAccent = { color: "var(--color-accent-700)", fontWeight: 600 };

const shell = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };

export default function Pricing() {
  return (
    <>
      <div style={shell}>
        <section style={{ padding: "clamp(48px,7vw,88px) 0 clamp(40px,6vw,72px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
              <span
                data-anim="rise"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                }}
              >
                Packages
              </span>
              <span data-anim="rule" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(32px,5vw,62px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0, maxWidth: "17ch", overflowWrap: "break-word" }}>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
                <span data-line="" style={{ display: "block" }}>
                  <span data-count="6">6</span> tiers. One clear
                </span>
              </span>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
                <span data-line="" style={{ display: "block" }}>
                  path as you <span style={{ color: "var(--color-accent)" }}>grow</span>.
                </span>
              </span>
            </h1>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))",
                gap: "24px clamp(24px,5vw,80px)",
                marginTop: "clamp(28px,4vw,48px)",
                alignItems: "end",
              }}
            >
              <p data-anim="rise" style={{ fontSize: 17, lineHeight: "29px", maxWidth: "52ch", margin: 0 }}>
                A one-time setup fee plus a simple monthly plan, quoted in PKR after we scope your workflow. No USD
                surprises, and no charge for normal business volume.
              </p>
              <div data-anim="rise" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  className="btn btn-primary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ minHeight: 52, paddingInline: 22, fontSize: 15 }}
                >
                  Request a quote on WhatsApp
                </a>
                <a
                  className="btn btn-secondary"
                  href="/contact"
                  style={{ minHeight: 52, paddingInline: 22, fontSize: 15, borderWidth: 2 }}
                >
                  Send a brief
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))",
            gap: 18,
            padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)",
          }}
        >
          {TIERS.map((tier) =>
            tier.featured ? (
              <div
                key={tier.name}
                data-anim="rise"
                style={{
                  background: "var(--color-text)",
                  color: "var(--color-bg)",
                  border: "1px solid var(--color-text)",
                  borderRadius: "var(--radius-lg)",
                  padding: "clamp(28px,3vw,40px) clamp(20px,2.5vw,36px)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent-400)", margin: "0 0 16px" }}>
                  {tier.tier}
                </p>
                <h2 style={{ fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 8px", color: "var(--color-bg)" }}>{tier.name}</h2>
                <p style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-bg) 62%, transparent)", margin: "0 0 18px" }}>
                  {tier.audience}
                </p>
                <p style={{ fontSize: 15, lineHeight: "26px", color: "color-mix(in srgb, var(--color-bg) 82%, transparent)", margin: "0 0 24px", flex: 1 }}>{tier.body}</p>
                <a
                  className="btn btn-primary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ alignSelf: "start", minHeight: 44, paddingInline: 18, justifyContent: "flex-start" }}
                >
                  Request a quote
                </a>
              </div>
            ) : (
              <div
                key={tier.name}
                data-anim="rise"
                className="cell-hover-5"
                style={{
                  padding: "clamp(28px,3vw,40px) clamp(20px,2.5vw,36px)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 16px" }}>
                  {tier.tier}
                </p>
                <h2 style={{ fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.03em", margin: "0 0 8px" }}>{tier.name}</h2>
                <p style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 18px", ...mutedLabel }}>{tier.audience}</p>
                <p style={{ fontSize: 15, lineHeight: "26px", margin: "0 0 24px", flex: 1, ...bodyMuted }}>{tier.body}</p>
                <a
                  className="btn btn-secondary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ alignSelf: "start", minHeight: 44, paddingInline: 18, justifyContent: "flex-start", borderWidth: 2 }}
                >
                  Request a quote
                </a>
              </div>
            )
          )}
        </div>
      </section>

      <div style={shell}>
        <section style={{ padding: "28px 0 clamp(56px,8vw,96px)" }}>
          <p style={{ fontSize: 15.5, lineHeight: "28px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: 0, maxWidth: "64ch" }}>
            Every plan includes a generous monthly conversation allowance, monthly tuning, and support — no surprise
            charges for normal business volume.
          </p>
          <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "8px 0 0" }}>
            The WhatsApp Business API subscription is billed to you directly by the provider.
          </p>
        </section>

        {/* Legal block — client-approved copy, shipped verbatim. */}
        <section data-anim="rise" style={{ padding: "0 0 clamp(44px,6vw,72px)", display: "grid", gap: 12 }}>
          <p style={{ ...termsLabel, margin: "0 0 6px" }}>Terms &amp; conditions</p>
          {TERMS.map((para) => (
            <p key={para.slice(0, 24)} style={termsBody}>
              {para}
            </p>
          ))}
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          <SplitHeader kicker="What each tier carries">
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              The same table your quote is built from
            </h2>
            <p data-anim="rise" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "60ch", ...bodyMuted }}>
              Every plan carries several times the sessions a business its size normally uses, so ordinary months never
              touch the overage rate. Your quote confirms the tier against your real message history.
            </p>
            {/* Six columns do not fit a phone; the table scrolls inside its own
                box rather than forcing the page to scroll sideways. */}
            <div data-anim="rise" style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Typical use</th>
                    <th>Sessions included</th>
                    <th>Sessions / day</th>
                    <th>Headroom</th>
                    <th>Overage</th>
                  </tr>
                </thead>
                <tbody>
                  {USAGE.map((row) => (
                    <tr key={row.plan}>
                      <td style={{ fontFamily: "var(--font-heading)", fontWeight: 600 }}>{row.plan}</td>
                      <td className="num" style={bodyMuted}>{row.typical}</td>
                      <td className="num" style={figureAccent}>{row.sessions}</td>
                      <td className="num" style={bodyMuted}>{row.perday}</td>
                      <td className="num" style={figureAccent}>{row.head}</td>
                      <td className="num" style={bodyMuted}>{row.over}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SplitHeader>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,104px)" }}>
          <SplitHeader kicker="Questions">
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px" }}>
              Before you ask us
            </h2>
            <div style={{ display: "grid", maxWidth: 900 }}>
              {FAQS.map((faq) => (
                <details
                  key={faq.q}
                  data-anim="rise"
                  style={{
                    borderTop: "1px solid var(--color-divider)",
                    padding: "20px 0",
                  }}
                >
                  <summary style={{ display: "flex", gap: 20, alignItems: "baseline", minHeight: 44, paddingBlock: 9, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, lineHeight: 1.35, letterSpacing: "-0.02em" }}>
                    <span data-chev="" style={{ color: "var(--color-accent)", fontSize: 16 }}>
                      +
                    </span>
                    {faq.q}
                  </summary>
                  <p style={{ fontSize: 15.5, lineHeight: "28px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "12px 0 0 36px", maxWidth: "56ch" }}>
                    {faq.a}
                  </p>
                </details>
              ))}
              <div data-anim="rule" style={{ height: 1, background: "var(--color-divider)" }} />
            </div>
          </SplitHeader>
        </section>
      </div>

      <CtaBand
        heading="Get your numbers in writing."
        body="A fixed setup fee and monthly plan for your workflow, after one call."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref="/contact"
      />

      <Footer />
    </>
  );
}
