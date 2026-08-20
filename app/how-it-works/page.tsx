import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import SplitHeader from "@/components/SplitHeader";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 62%, transparent)" };

const STEPS = [
  {
    n: "01",
    title: "Engage",
    body: "Replies instantly on WhatsApp, Instagram, or your website — any hour, any volume, no queue. Natural language, not a menu tree: customers ask the way they actually speak, in English or Urdu, and get an answer in seconds.",
  },
  {
    n: "02",
    title: "Execute",
    body: "Books the appointment, shares the catalogue, checks availability, logs the lead in your CRM. Actions actually happen — the agent is connected to your calendar, inventory, and records, not just talking about them.",
  },
  {
    n: "03",
    title: "Escalate",
    body: "Hands to your team the moment judgement is needed — with the full conversation attached. Nothing is lost in the handover, and your staff spend their hours on the conversations that need a person.",
  },
];

const COMPARISON = [
  ["24/7 cost", "Two to three shifts of salary", "A low monthly fee", "Included in your plan"],
  ["Understanding", "Full — but only on shift", "Menu-driven only", "Natural language, any hour"],
  ["Gets things done", "Manually, yes", "Static answers only", "Books, checks stock, updates CRM"],
  ["The unexpected", "Handles it — until hour eight", "Breaks or loops", "Handles new questions gracefully"],
  ["Consistency", "Varies with mood and fatigue", "Consistent but rigid", "Consistent and flexible"],
  ["Long run", "Learns, then eventually leaves", "Frozen until reprogrammed", "Tuned monthly, stays"],
];

const HOOD = [
  {
    n: "01",
    title: "Smart AI models",
    body: "The reasoning behind every reply, matched to your business's complexity and data sensitivity.",
  },
  {
    n: "02",
    title: "Reliable automation",
    body: "Connects to your calendar, CRM, and inventory so actions actually happen — not just chat.",
  },
  {
    n: "03",
    title: "Secure data handling",
    body: "From simple catalogues to enterprise databases, including fully private on-premise options.",
  },
  {
    n: "04",
    title: "Where customers already are",
    body: "WhatsApp, Instagram, Facebook — no app downloads, no new habits to teach.",
  },
];

const ONBOARDING = [
  "Discovery call — we map your customer workflow and where AI adds the most value",
  "Proposal & scope — a fixed setup fee and monthly plan, in writing, no surprises",
  "Build & configure — your agent trained on your catalogue, FAQs, and booking rules",
  "Test & launch — we run it alongside your team before it goes fully live",
  "Ongoing management — monthly tuning, reporting, and support included in your plan",
];

const shell = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };

export default function HowItWorks() {
  return (
    <>
      <div style={shell}>
        <section style={{ padding: "clamp(48px,7vw,88px) 0 clamp(40px,6vw,72px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                }}
              >
                How it works
              </span>
              <span style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(32px,5vw,60px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0, maxWidth: "18ch" }}>
              Three things your agent does, on repeat
            </h1>
            <p style={{ fontSize: 18, lineHeight: "30px", maxWidth: "52ch", margin: "32px 0 0" }}>
              One AI agent, configured around how your business actually runs.
            </p>
          </div>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="row-hover step-row"
              style={{
                borderTop: "2px solid var(--color-divider)",
                borderBottom: i === STEPS.length - 1 ? "2px solid var(--color-divider)" : undefined,
                padding: "clamp(28px,3.5vw,44px) 0",
              }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.1em", color: "var(--color-accent)", margin: 0, fontFeatureSettings: "'tnum' 1" }}>
                {step.n}
              </p>
              <h2 style={{ fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}>{step.title}</h2>
              <p style={{ fontSize: 16, lineHeight: "28px", margin: 0, maxWidth: "52ch", ...bodyMuted }}>{step.body}</p>
            </div>
          ))}
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          <SplitHeader kicker="The difference">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px" }}>
              Not a chatbot. Not another hire.
            </h2>
            <p style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 36px", maxWidth: "52ch", ...bodyMuted }}>
              Compared honestly against the two things you&rsquo;re probably weighing instead.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 760, fontSize: 15 }}>
                <thead>
                  <tr>
                    <th style={{ width: "22%", fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }} />
                    <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Hiring staff</th>
                    <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>A generic chatbot</th>
                    <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px", color: "var(--color-accent)" }}>
                      VantriqAI
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row) => (
                    <tr key={row[0]}>
                      <td style={{ padding: "14px 10px", ...mutedLabel }}>{row[0]}</td>
                      <td style={{ padding: "14px 10px" }}>{row[1]}</td>
                      <td style={{ padding: "14px 10px" }}>{row[2]}</td>
                      <td style={{ padding: "14px 10px", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "20px 0 0" }}>
              Cost comparison based on typical Pakistan market shift-coverage rates.{" "}
              <a href="/pricing">Request a quote</a> for your figures.
            </p>
          </SplitHeader>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,96px)" }}>
          <SplitHeader kicker="Under the hood">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "24ch" }}>
              Enterprise-grade, without the enterprise headache
            </h2>
            <p style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 40px", maxWidth: "52ch", ...bodyMuted }}>
              You never touch the infrastructure — we run, monitor, and tune all of it.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 2, background: "var(--color-divider)", borderBlock: "2px solid var(--color-divider)" }}>
              {HOOD.map((item) => (
                <div key={item.n} className="cell-hover" style={{ background: "var(--color-bg)", padding: "28px 26px 34px" }}>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", color: "var(--color-accent)", margin: "0 0 18px" }}>
                    {item.n}
                  </p>
                  <h3 style={{ fontSize: 21, lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{item.title}</h3>
                  <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, ...bodyMuted }}>{item.body}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: "20px 0 0" }}>
              Private, self-hosted deployment available for strict data-residency requirements.
            </p>
          </SplitHeader>
        </section>

        <section style={{ padding: "0 0 clamp(56px,8vw,104px)" }}>
          <SplitHeader kicker="Getting started">
            <h2 style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px" }}>
              How we get started
            </h2>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid" }}>
              {ONBOARDING.map((step, i) => (
                <li
                  key={step}
                  className="row-hover"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "56px minmax(0,1fr)",
                    gap: 24,
                    padding: "20px 0",
                    borderTop: "2px solid var(--color-divider)",
                    borderBottom: i === ONBOARDING.length - 1 ? "2px solid var(--color-divider)" : undefined,
                  }}
                >
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, color: "var(--color-accent)", fontFeatureSettings: "'tnum' 1" }}>
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 16.5, lineHeight: "28px" }}>{step}</span>
                </li>
              ))}
            </ol>
          </SplitHeader>
        </section>
      </div>

      <CtaBand
        heading="Start with a discovery call."
        body="Fifteen minutes on how your customers message you today, and where an agent would earn its keep."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief instead"
        secondaryHref="/contact"
      />

      <Footer />
    </>
  );
}
