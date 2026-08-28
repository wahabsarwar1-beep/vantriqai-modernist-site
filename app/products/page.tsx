import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import ProductMark, { type MarkId } from "@/components/ProductMark";
import SplitHeader from "@/components/SplitHeader";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const kickerMuted = { color: "color-mix(in srgb, var(--color-text) 58%, transparent)" };

const PRODUCTS: { id: MarkId; category: string; name: string; body: string; availability: string }[] = [
  {
    id: "whatsapp",
    category: "Channel",
    name: "WhatsApp Agent",
    body: "The core module. Answers, qualifies and books on the channel your customers already open twenty times a day — English or Roman Urdu, any hour.",
    availability: "From Starter",
  },
  {
    id: "social",
    category: "Channel",
    name: "Social Agent",
    body: "Instagram and Facebook DMs, plus comment-to-DM: a question under a post becomes a qualified conversation before your competitor replies.",
    availability: "From Growth",
  },
  {
    id: "website",
    category: "Channel",
    name: "Website Agent",
    body: "The embedded assistant on your own site — the widget in the corner of this page. Same brain, same actions, no app to download.",
    availability: "From Scale",
  },
  {
    id: "booking",
    category: "Capability",
    name: "Booking Agent",
    body: "Checks real availability, writes the appointment into your calendar, sends the reminder, and handles the reschedule when it comes.",
    availability: "Add-on module",
  },
  {
    id: "catalogue",
    category: "Capability",
    name: "Catalogue Agent",
    body: "Answers stock, size, price and variant questions against live inventory, shares the right product, and holds the item while the customer decides.",
    availability: "Add-on module",
  },
  {
    id: "lead",
    category: "Capability",
    name: "Lead Qualifier",
    body: "Asks the qualifying questions your sales team would ask, scores the lead, and writes it into your CRM with the full transcript attached.",
    availability: "From Growth",
  },
  {
    id: "escalation",
    category: "Capability",
    name: "Escalation Desk",
    body: "The handover layer. Routes anything needing judgement to the right person with the conversation attached, and folds recurring cases into the next tuning round.",
    availability: "In every plan",
  },
  {
    id: "deployment",
    category: "Deployment",
    name: "Private Deployment",
    body: "The whole stack self-hosted on your infrastructure, for strict data-residency requirements. Same agents, nothing leaving your network.",
    availability: "From Enterprise",
  },
];

const FOUNDATION = [
  {
    title: "Configured to your workflow",
    body: "Your catalogue, your booking rules, your tone — set during onboarding, not a template with your logo on it.",
  },
  {
    title: "Natural language, both languages",
    body: "Customers write the way they normally write, including Roman Urdu, and the agent replies in kind.",
  },
  {
    title: "Monthly tuning by a local team",
    body: "Escalations and misses are reviewed every month, and the agent is improved — not left to drift.",
  },
  {
    title: "Secure data handling",
    body: "Handling matched to your sensitivity, from a simple catalogue to an enterprise database.",
  },
];

const shell = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };
const lineMask = { display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" };

export default function Products() {
  return (
    <>
      <div style={shell}>
        <section style={{ padding: "clamp(48px,7vw,88px) 0 clamp(40px,6vw,72px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <span
            data-par="0.12"
            aria-hidden="true"
            style={{ position: "absolute", right: "7%", top: "16%", width: 104, height: 104, border: "2px solid var(--color-accent)", pointerEvents: "none" }}
          />
          <span
            data-par="-0.09"
            aria-hidden="true"
            style={{ position: "absolute", right: "22%", top: "44%", width: 44, height: 44, background: "var(--color-accent)", pointerEvents: "none" }}
          />
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
                Products
              </span>
              <span data-anim="rule" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(34px,5.4vw,66px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "17ch", overflowWrap: "break-word" }}>
              <span style={lineMask}>
                <span data-line="" style={{ display: "block" }}>
                  <span data-count="8">8</span> agents. Assemble
                </span>
              </span>
              <span style={lineMask}>
                <span data-line="" style={{ display: "block" }}>
                  the <span style={{ color: "var(--color-accent)" }}>one you need.</span>
                </span>
              </span>
            </h1>
            <p data-anim="rise" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "52ch", margin: "32px 0 0" }}>
              Each product is a module on the same platform. Start with one channel, add capability as volume grows —
              nothing is rebuilt when you do.
            </p>
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
          {PRODUCTS.map((product) => (
            <div
              key={product.name}
              data-anim="rise"
              className="cell-hover-5"
              style={{
                background: "var(--color-bg)",
                padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)",
                display: "flex",
                flexDirection: "column",
                boxShadow: "2px 2px 0 0 var(--color-divider)",
              }}
            >
              <ProductMark id={product.id} />
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 12px", ...kickerMuted }}>
                {product.category}
              </p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
                {product.name}
                <sup
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 400,
                    fontSize: "0.42em",
                    lineHeight: 1,
                    verticalAlign: "super",
                    marginLeft: 3,
                    color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
                  }}
                >
                  &reg;
                </sup>
              </h2>
              <p style={{ fontSize: 15, lineHeight: "26px", margin: "0 0 22px", flex: 1, ...bodyMuted }}>{product.body}</p>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                {product.availability}
              </span>
            </div>
          ))}
        </div>
      </section>

      <div style={shell}>
        <section style={{ padding: "clamp(48px,7vw,88px) 0 clamp(56px,8vw,104px)" }}>
          <SplitHeader kicker="In every product">
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px", maxWidth: "24ch" }}>
              The same foundation, whichever modules you run
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }}>
              {FOUNDATION.map((item) => (
                <div key={item.title} data-anim="rise" className="why-block" style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 18 }}>
                  <h3 style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{item.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, maxWidth: "42ch", ...bodyMuted }}>{item.body}</p>
                </div>
              ))}
            </div>
          </SplitHeader>
        </section>
      </div>

      <CtaBand
        heading="Not sure which modules?"
        body="One call maps your customer workflow and tells you which two or three actually earn their keep."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="See packages"
        secondaryHref="/pricing"
      />

      <Footer />
    </>
  );
}
