import ChatDemo from "@/components/ChatDemo";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import SplitHeader from "@/components/SplitHeader";
import { waLink } from "@/lib/whatsapp";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

const STATS = [
  {
    value: "~400%",
    label: "More leads convert when you reply within two minutes instead of hours",
  },
  {
    value: "20–30%",
    label: "Revenue typically lost to after-hours and peak-rush messages that go unanswered",
  },
  {
    value: "24/7",
    label: "The coverage your AI-equipped competitors already have — and you may not",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Engage",
    body: "Replies instantly on WhatsApp, Instagram, or your website — any hour, any volume, no queue.",
  },
  {
    n: "02",
    title: "Execute",
    body: "Books the appointment, shares the catalogue, checks availability, logs the lead in your CRM.",
  },
  {
    n: "03",
    title: "Escalate",
    body: "Hands to your team the moment judgement is needed — with the full conversation attached.",
  },
];

const INDUSTRIES = [
  "E-commerce & Retail",
  "Real Estate",
  "Healthcare",
  "Education",
  "Hospitality",
  "Legal & Consulting",
  "Travel & Tourism",
  "HR & Operations",
  "Marketing Agencies",
  "Logistics",
];

const WHY = [
  {
    title: "Built for you, not off the shelf",
    body: "Every agent is configured to your workflow, catalogue, and tone — not a template with your logo on it.",
  },
  {
    title: "A relationship, not a dashboard",
    body: "A dedicated local team manages, tunes, and improves your agent every single month.",
  },
  {
    title: "Priced in PKR, built for Pakistan",
    body: "No confusing USD billing, no overseas support hours, no timezone gap when something breaks.",
  },
  {
    title: "Enterprise experience, SME flexibility",
    body: "14+ years experience across enterprise and government collaborations, applied to businesses of every size.",
  },
];

const shell = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };

export default function Home() {
  return (
    <>
      <div style={shell}>
        <section style={{ padding: "clamp(56px,9vw,110px) 0 clamp(48px,7vw,90px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(28px,5vw,54px)" }}>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-text)",
                }}
              >
                Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span>
              </span>
              <span style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(38px,6vw,76px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "16ch" }}>
              <span style={{ display: "block" }}>Never miss another</span>
              <span style={{ display: "block", color: "var(--color-accent)" }}>customer message.</span>
            </h1>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
                gap: "24px clamp(24px,5vw,80px)",
                marginTop: "clamp(32px,4vw,56px)",
                alignItems: "end",
              }}
            >
              <p style={{ fontSize: 18, lineHeight: "30px", maxWidth: "48ch", margin: 0 }}>
                AI agents that reply, qualify, and book — 24 hours a day. On WhatsApp, Instagram, and your website, in
                seconds, at any volume.
              </p>
              <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <a
                  className="btn btn-primary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ minHeight: 52, paddingInline: 22, justifyContent: "flex-start", fontSize: 15, letterSpacing: "0.02em" }}
                >
                  Message us on WhatsApp
                </a>
                <a
                  className="btn btn-secondary"
                  href="/how-it-works"
                  style={{ minHeight: 52, paddingInline: 22, justifyContent: "flex-start", fontSize: 15, letterSpacing: "0.02em", borderWidth: 2 }}
                >
                  See how it works
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ borderTop: "2px solid var(--color-divider)", borderBottom: "2px solid var(--color-divider)", background: "var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 2 }}>
          {STATS.map((stat) => (
            <div key={stat.value} className="cell-hover" style={{ background: "var(--color-bg)", padding: "clamp(28px,4vw,52px) clamp(20px,3vw,44px)" }}>
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: "clamp(32px,3.6vw,52px)",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  margin: 0,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {stat.value}
              </p>
              <p
                style={{
                  fontSize: 13,
                  lineHeight: "20px",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "color-mix(in srgb, var(--color-text) 64%, transparent)",
                  margin: "18px 0 0",
                  maxWidth: "26ch",
                }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div style={shell}>
        <section style={{ padding: "clamp(56px,8vw,104px) 0 clamp(24px,3vw,40px)" }}>
          <SplitHeader kicker="Live — the agent answering">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "20ch" }}>
              This is what your customer sees.
            </h2>
            <p style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "50ch", ...bodyMuted }}>
              An exchange replayed at the speed the agent actually answers — no queue, no office hours.
            </p>
            <ChatDemo />
          </SplitHeader>
        </section>

        <section style={{ padding: "clamp(56px,8vw,104px) 0 clamp(32px,4vw,48px)" }}>
          <SplitHeader kicker="01 — The problem">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "20ch" }}>
              Your customers message at midnight. Does anyone reply?
            </h2>
            <p style={{ fontSize: 16, lineHeight: "28px", margin: "24px 0 0", maxWidth: "52ch", ...bodyMuted }}>
              WhatsApp is where business happens in Pakistan — but most businesses still answer it by hand. Every
              missed message is a customer who found someone faster.
            </p>
          </SplitHeader>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
              gap: 2,
              background: "var(--color-divider)",
              borderTop: "2px solid var(--color-divider)",
              borderBottom: "2px solid var(--color-divider)",
            }}
          >
            {STEPS.map((step) => (
              <div key={step.n} className="cell-hover" style={{ background: "var(--color-bg)", padding: "32px 28px 40px" }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "0.1em", color: "var(--color-accent)", margin: "0 0 22px", fontFeatureSettings: "'tnum' 1" }}>
                  {step.n}
                </p>
                <h3 style={{ fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 14px" }}>{step.title}</h3>
                <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, ...bodyMuted }}>{step.body}</p>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "20px 0 0" }}>
            One partner — strategy, build, and ongoing management. <a href="/how-it-works">See what runs under the hood</a>
          </p>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          <SplitHeader kicker="02 — Where it applies">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              Built for your industry
            </h2>
            <p style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 34px", maxWidth: "52ch", ...bodyMuted }}>
              The same core agent, tuned to the workflow of each sector.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {INDUSTRIES.map((name) => (
                <span key={name} className="tag tag-outline" style={{ fontSize: 13, padding: "9px 16px", fontFamily: "var(--font-heading)", fontWeight: 800, letterSpacing: "0.02em" }}>
                  {name}
                </span>
              ))}
            </div>
            <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "24px 0 0" }}>
              Not listed? The agent adapts — <a href="/industries">see the sector workflows</a>.
            </p>
          </SplitHeader>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,104px)" }}>
          <SplitHeader kicker={<>03 — Why <span style={{ color: "var(--color-text)" }}>Vantriq</span>AI</>}>
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 44px", maxWidth: "22ch" }}>
              A local partner, not a faceless subscription
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "36px clamp(24px,4vw,64px)" }}>
              {WHY.map((item) => (
                <div key={item.title} className="why-block" style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 18 }}>
                  <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>{item.title}</h3>
                  <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>{item.body}</p>
                </div>
              ))}
            </div>
          </SplitHeader>
        </section>
      </div>

      <CtaBand
        heading="Let's talk."
        body="Send us a message and see the agent answer. A discovery call maps your customer workflow before anything is built."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Request a quote"
        secondaryHref="/pricing"
      />

      <Footer showLocation={false} />
    </>
  );
}
