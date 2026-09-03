import AdvantageBand from "@/components/AdvantageBand";
import BrandName from "@/components/BrandName";
import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";
import ResponseGap from "@/components/ResponseGap";
import SplitHeader from "@/components/SplitHeader";
import StepRail from "@/components/StepRail";
import WorkspaceCards from "@/components/WorkspaceCards";
import { AGENTS, BENCH, INTEGRATIONS } from "@/lib/home-data";
import { waLink } from "@/lib/whatsapp";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

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
            style={{ position: "absolute", right: "6%", top: "12%", width: 120, height: 120, border: "1px solid var(--color-accent)", borderRadius: "var(--radius-lg)", pointerEvents: "none" }}
          />
          <span
            data-par="-0.10"
            aria-hidden="true"
            style={{ position: "absolute", right: "13%", top: "30%", width: 56, height: 56, background: "var(--color-accent)", borderRadius: "var(--radius-md)", opacity: 0.9, pointerEvents: "none" }}
          />
          <span
            data-par="-0.08"
            aria-hidden="true"
            style={{ position: "absolute", right: "2%", top: "70%", width: 180, height: 1, background: "var(--color-text)", opacity: 0.5, pointerEvents: "none" }}
          />

          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(28px,5vw,54px)" }}>
              <span data-anim="rise" style={{ fontSize: 13, letterSpacing: "0.08em" }}>
                <BrandName inkColor="var(--color-text)" />
              </span>
              <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
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
              <div data-anim="rise" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <a
                  className="btn btn-primary"
                  href={waLink()}
                  target="_blank"
                  rel="noopener"
                  style={{ minHeight: 52, paddingInline: 24, fontSize: 15, letterSpacing: "0.02em" }}
                >
                  Message us on WhatsApp
                </a>
                <a
                  className="btn btn-secondary"
                  href="/how-it-works"
                  style={{ minHeight: 52, paddingInline: 24, fontSize: 15, letterSpacing: "0.02em" }}
                >
                  See how it works
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
            gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))",
            gap: 18,
            padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)",
          }}
        >
          {BENCH.map((b) => (
            <div
              key={b.fig}
              data-anim="rise"
              className="cell-hover"
              style={{ padding: "clamp(26px,3.4vw,46px) clamp(18px,2.4vw,34px)", display: "flex", flexDirection: "column" }}
            >
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: "clamp(34px,3.8vw,54px)",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  margin: 0,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {b.fig}
              </p>
              <p style={{ fontSize: 14.5, lineHeight: "23px", margin: "16px 0 22px", flex: 1, maxWidth: "30ch", ...bodyMuted }}>
                {b.claim}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 10,
                  lineHeight: "16px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  margin: 0,
                  paddingTop: 12,
                  borderTop: "1px solid var(--color-divider)",
                  color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                }}
              >
                {b.src}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 01 — the response gap, then the same enquiry answered twice */}
      <div style={{ ...shell, paddingTop: "clamp(34px,4.4vw,58px)" }}>
        <ResponseGap />
      </div>

      {/* { Vantriq's advantage } — the phone in front of the tile band */}
      <div style={shell}>
        <section style={{ padding: "clamp(38px,4.8vw,64px) 0 clamp(16px,2.2vw,28px)" }}>
          <SplitHeader kicker={<>{"{ Vantriq\u2019s advantage }"}</>}>
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "20ch" }}>
              The growth engine for local business.
            </h2>
            <p data-anim="rise" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "50ch", ...bodyMuted }}>
              One agent, plugged into your channels and your calendar, answering every hour you are closed. Below: a
              real exchange replayed at the speed it actually runs.
            </p>
            <AdvantageBand />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(272px,100%),1fr))",
                gap: "28px clamp(24px,4vw,64px)",
                marginTop: "clamp(32px,4vw,56px)",
              }}
            >
              {[
                { title: "Trained on real conversations", body: "Configured against your own message history, not a generic script with your logo on it." },
                { title: "Modules in sync", body: "Booking, catalogue and qualification share one memory of the customer, so nothing is asked twice." },
                { title: "Connected to your whole stack", body: "It acts inside your calendar, CRM and inventory rather than keeping a second copy of the truth." },
              ].map((item) => (
                <div key={item.title} data-anim="rise" className="why-block">
                  <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>{item.title}</h3>
                  <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>{item.body}</p>
                </div>
              ))}
            </div>
          </SplitHeader>
        </section>
      </div>

      {/* scroll-pinned three-step stage */}
        <div data-pin="" style={{ position: "relative", height: "320vh", borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
          <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                  02 — What it does
                </span>
                <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
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
                <div style={{ display: "grid", background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
                  {STEPS.map((step) => (
                    <div
                      key={step.n}
                      data-pin-row=""
                      style={{ padding: "22px 24px", display: "flex", alignItems: "baseline", gap: 18, borderBottom: "1px solid var(--color-divider)", transition: "background-color .35s ease, color .35s ease" }}
                    >
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.12em" }}>{step.n}</span>
                      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(20px,2.4vw,30px)", letterSpacing: "-0.02em" }}>{step.title}</span>
                    </div>
                  ))}
                  <div style={{ padding: "18px 24px" }}>
                    <span data-pin-rail="" style={{ display: "block", height: 4, background: "var(--color-accent)", transformOrigin: "left", transform: "scaleX(0.04)" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 03 — the ten agent modules */}
        <div style={{ ...shell, padding: "clamp(34px,4.4vw,58px) clamp(20px,5vw,64px) clamp(18px,2.4vw,30px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(20px,3vw,32px)" }}>
            <span data-anim="rise" className="kicker-pill">03 — The agents</span>
            <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>
          <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "24ch" }}>
            One brain, ten jobs. Switch on the ones your day actually needs — the rest stay quiet until you want them.
          </h2>
        </div>

        <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(272px,100%),1fr))",
              gap: 18,
              padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)",
            }}
          >
            {AGENTS.map((a) => (
              <div
                key={a.n}
                data-anim="rise"
                className="cell-hover-5"
                style={{ padding: "clamp(24px,3vw,38px) clamp(20px,2.5vw,34px)", display: "flex", flexDirection: "column" }}
              >
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", color: "var(--color-accent)", margin: "0 0 18px" }}>
                  {a.n}
                </p>
                <h3 style={{ fontSize: 23, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>{a.name} Agent</h3>
                <p style={{ fontSize: 14.5, lineHeight: "25px", margin: "0 0 22px", flex: 1, ...bodyMuted }}>{a.body}</p>
                <p
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    margin: 0,
                    paddingTop: 14,
                    borderTop: "1px solid var(--color-divider)",
                    color: "var(--color-accent)",
                  }}
                >
                  {a.metric}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* { The workspace } — a full-width ruled band, so all three cards sit
            on one row. Inside a split header the content column is only 9/12
            of the page and the third card wrapped underneath. */}
        <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(36px,4.6vw,62px) clamp(20px,5vw,64px)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(20px,3vw,32px)" }}>
              <span data-anim="rise" className="kicker-pill">{"{ The workspace }"}</span>
              <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))",
                gap: "20px clamp(24px,4vw,56px)",
                marginBottom: "clamp(26px,3.4vw,44px)",
              }}
            >
              <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "22ch" }}>
                For work that is bigger than one inbox.
              </h2>
              <p data-anim="rise" style={{ fontSize: 16, lineHeight: "28px", margin: 0, maxWidth: "46ch", ...bodyMuted }}>
                Switch on the modules you need, watch one thread carry a customer to a booking, and read the week in a
                minute.
              </p>
            </div>
            <WorkspaceCards />
          </div>
        </section>

        {/* 04 — the horizontally pinned five-step rail */}
        <StepRail />

        {/* 05 — what it plugs into */}
        <div style={{ ...shell, padding: "clamp(34px,4.4vw,60px) clamp(20px,5vw,64px) clamp(18px,2.4vw,30px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(20px,3vw,32px)" }}>
            <span data-anim="rise" className="kicker-pill">05 — What it plugs into</span>
            <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
          </div>
          <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "24ch" }}>
            It acts inside the tools you already pay for.
          </h2>
        </div>

        <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
          <div
            style={{
              maxWidth: 1280,
              margin: "0 auto",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(min(272px,100%),1fr))",
              gap: 18,
              padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)",
            }}
          >
            {INTEGRATIONS.map((g) => (
              <div
                key={g.group}
                data-anim="rise"
                className="cell-hover"
                style={{ padding: "clamp(24px,3vw,36px) clamp(20px,2.5vw,32px)" }}
              >
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 18px" }}>
                  {g.group}
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
                  {g.items.map((it) => (
                    <li key={it} style={{ fontSize: 15, lineHeight: "24px", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* industries marquee */}
        <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(28px,4vw,48px) 0", overflow: "hidden" }}>
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
            06 — Where it applies
          </p>
          <div style={{ display: "flex", width: "max-content", animation: "marquee 40s linear infinite" }}>
            <MarqueeTrack />
            <MarqueeTrack ariaHidden />
          </div>
        </section>

      <div style={shell}>
        <section style={{ padding: "clamp(56px,8vw,96px) 0" }}>
          <SplitHeader
            kicker={
              <>
                07 — Why <BrandName inkColor="var(--color-text)" />
              </>
            }
          >
            <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 44px", maxWidth: "22ch" }}>
              A local partner, not a faceless subscription
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }}>
              {WHY.map((item) => (
                <div key={item.title} data-anim="rise" className="why-block">
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
