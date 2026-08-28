import BrandName from "@/components/BrandName";
import ChatDemo from "@/components/ChatDemo";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import SplitHeader from "@/components/SplitHeader";
import { waLink } from "@/lib/whatsapp";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

const STATS = [
  {
    value: (
      <>
        ~<span data-count="400">400</span>%
      </>
    ),
    label: "More leads convert when you reply within two minutes instead of hours",
  },
  {
    value: (
      <>
        <span data-count="20">20</span>–<span data-count="30">30</span>%
      </>
    ),
    label: "Revenue typically lost to after-hours and peak-rush messages that go unanswered",
  },
  {
    value: (
      <>
        <span data-count="24">24</span>/<span data-count="7">7</span>
      </>
    ),
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

function MarqueeTrack({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} style={{ display: "flex", alignItems: "center" }}>
      {INDUSTRIES.map((name) => (
        <span
          key={name}
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "clamp(26px,3.6vw,50px)",
            letterSpacing: "-0.03em",
            padding: "0 26px",
            whiteSpace: "nowrap",
          }}
        >
          {name}
          <span style={{ color: "var(--color-accent)", paddingLeft: 26 }}>/</span>
        </span>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <>
      <div style={shell}>
        <section style={{ padding: "clamp(56px,9vw,110px) 0 clamp(48px,7vw,90px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <span
            data-par="0.10"
            aria-hidden="true"
            style={{ position: "absolute", right: "6%", top: "12%", width: 120, height: 120, border: "2px solid var(--color-accent)", pointerEvents: "none" }}
          />
          <span
            data-par="-0.10"
            aria-hidden="true"
            style={{ position: "absolute", right: "13%", top: "30%", width: 56, height: 56, background: "var(--color-accent)", opacity: 0.9, pointerEvents: "none" }}
          />
          <span
            data-par="0.22"
            aria-hidden="true"
            style={{ position: "absolute", right: "34%", top: "8%", width: 22, height: 22, background: "var(--color-text)", pointerEvents: "none" }}
          />
          <span
            data-par="-0.08"
            aria-hidden="true"
            style={{ position: "absolute", right: "2%", top: "70%", width: 180, height: 2, background: "var(--color-text)", opacity: 0.5, pointerEvents: "none" }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(28px,5vw,54px)" }}>
              <span data-anim="rise" style={{ fontSize: 13, letterSpacing: "0.08em" }}>
                <BrandName inkColor="var(--color-text)" />
              </span>
              <span data-anim="rule" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(38px,6vw,76px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "16ch", overflowWrap: "break-word" }}>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
                <span data-line="" style={{ display: "block" }}>
                  Never miss another
                </span>
              </span>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
                <span data-line="" style={{ display: "block", color: "var(--color-accent)" }}>
                  customer message.
                </span>
              </span>
            </h1>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))",
                gap: "24px clamp(24px,5vw,80px)",
                marginTop: "clamp(32px,4vw,56px)",
                alignItems: "end",
              }}
            >
              <p data-anim="rise" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "48ch", margin: 0 }}>
                AI agents that reply, qualify, and book — 24 hours a day. On WhatsApp, Instagram, and your website, in
                seconds, at any volume.
              </p>
              <div data-anim="rise" style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
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
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))",
            gap: 2,
            background: "var(--color-bg)",
            overflow: "hidden",
          }}
        >
          {STATS.map((stat, i) => (
            <div
              key={i}
              data-anim="rise"
              className="cell-hover"
              style={{ background: "var(--color-bg)", padding: "clamp(28px,4vw,52px) clamp(20px,3vw,44px)", boxShadow: "2px 2px 0 0 var(--color-divider)" }}
            >
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
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "20ch" }}>
              This is what your customer sees.
            </h2>
            <p data-anim="rise" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "50ch", ...bodyMuted }}>
              An exchange replayed at the speed the agent actually answers — no queue, no office hours.
            </p>
            <div data-anim="rise">
              <ChatDemo />
            </div>
          </SplitHeader>
        </section>
      </div>

      {/* scroll-pinned three-step stage */}
        <div data-pin="" style={{ position: "relative", height: "320vh", borderTop: "2px solid var(--color-divider)", background: "var(--color-bg)" }}>
          <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                  01 — What it does
                </span>
                <span style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
                <span data-pin-count="" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em" }}>
                  01 / 03
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: "clamp(24px,5vw,72px)", alignItems: "center" }}>
                <div style={{ position: "relative", minHeight: "min(46vh,340px)" }}>
                  {STEPS.map((step) => (
                    <div key={step.n} data-pin-panel="" style={{ position: "absolute", inset: 0 }}>
                      <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(64px,12vw,150px)", lineHeight: 0.86, letterSpacing: "-0.05em", margin: 0, color: "var(--color-accent)" }}>
                        {step.n}
                      </p>
                      <h2 style={{ fontSize: "clamp(30px,4.4vw,58px)", lineHeight: 1, letterSpacing: "-0.03em", margin: "12px 0 18px" }}>{step.title}</h2>
                      <p style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>{step.body}</p>
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gap: 2, background: "var(--color-divider)", border: "2px solid var(--color-divider)" }}>
                  {STEPS.map((step) => (
                    <div
                      key={step.n}
                      data-pin-row=""
                      style={{ background: "var(--color-bg)", padding: "22px 24px", display: "flex", alignItems: "baseline", gap: 18, transition: "background-color .35s ease, color .35s ease" }}
                    >
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.12em" }}>{step.n}</span>
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(20px,2.4vw,30px)", letterSpacing: "-0.02em" }}>{step.title}</span>
                    </div>
                  ))}
                  <div style={{ background: "var(--color-bg)", padding: "18px 24px" }}>
                    <span data-pin-rail="" style={{ display: "block", height: 4, background: "var(--color-accent)", transformOrigin: "left", transform: "scaleX(0.04)" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* industries marquee */}
        <section style={{ borderTop: "2px solid var(--color-divider)", borderBottom: "2px solid var(--color-divider)", padding: "clamp(28px,4vw,48px) 0", overflow: "hidden" }}>
          <p
            data-anim="rise"
            style={{
              maxWidth: 1280,
              margin: "0 auto 22px",
              padding: "0 clamp(20px,5vw,64px)",
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--color-accent)",
            }}
          >
            02 — Where it applies
          </p>
          <div style={{ display: "flex", width: "max-content", animation: "marquee 34s linear infinite" }}>
            <MarqueeTrack />
            <MarqueeTrack ariaHidden />
          </div>
        </section>

      <div style={shell}>
        <section style={{ padding: "clamp(56px,8vw,96px) 0" }}>
          <SplitHeader
            kicker={
              <>
                03 — Why <BrandName inkColor="var(--color-text)" />
              </>
            }
          >
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 44px", maxWidth: "22ch" }}>
              A local partner, not a faceless subscription
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }}>
              {WHY.map((item) => (
                <div key={item.title} data-anim="rise" className="why-block" style={{ borderTop: "2px solid var(--color-divider)", paddingTop: 18 }}>
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
