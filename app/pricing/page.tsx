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
];

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
              <div data-anim="rise" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <a
                  className="btn btn-primary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "flex-start" }}
                >
                  Request a quote on WhatsApp
                </a>
                <a
                  className="btn btn-secondary"
                  href="/contact"
                  style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "flex-start", borderWidth: 2 }}
                >
                  Send a brief
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ borderTop: "2px solid var(--color-divider)", borderBottom: "2px solid var(--color-divider)", background: "var(--color-divider)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))",
            gap: 2,
            background: "var(--color-bg)",
            overflow: "hidden",
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
                  padding: "clamp(28px,3vw,40px) clamp(20px,2.5vw,36px)",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "2px 2px 0 0 var(--color-divider)",
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
                  boxShadow: "2px 2px 0 0 var(--color-divider)",
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
                    borderTop: "2px solid var(--color-divider)",
                    padding: "20px 0",
                  }}
                >
                  <summary style={{ display: "flex", gap: 20, alignItems: "baseline", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 19, lineHeight: 1.35, letterSpacing: "-0.02em" }}>
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
              <div data-anim="rule" style={{ height: 2, background: "var(--color-divider)" }} />
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
