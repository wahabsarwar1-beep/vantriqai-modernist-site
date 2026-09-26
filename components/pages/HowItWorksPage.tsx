import PageHero from "@/components/PageHero";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import Marquee from "@/components/Marquee";
import SpotlightGrid, { SpotlightItem } from "@/components/SpotlightGrid";
import Counter from "@/components/Counter";
import { STEPS, BMK, COMPARISON, HOOD } from "@/lib/content";
import { hrefIn, type Region } from "@/lib/region";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 62%, transparent)" };

const RESPONSE_WINDOW = [
  { title: "Inside 1 minute", src: "Velocify", pct: 96, body: "conversion lift on first contact", statTarget: 391, statPrefix: "+", statSuffix: "%" },
  { title: "Inside 5 minutes", src: "MIT / InsideSales.com", pct: 74, body: "more likely to qualify than at 30 minutes", statTarget: 21, statSuffix: "×" },
  { title: "Inside 1 hour", src: "Harvard Business Review", pct: 52, body: "more likely to qualify than after 24 hours", statTarget: 60, statSuffix: "×" },
  { title: "After 24 hours", src: "Harvard Business Review", pct: 14, body: "of firms never reply at all", statTarget: 23, statSuffix: "%" },
];

const BENCHMARK_SOURCES = ["MIT / InsideSales.com", "Harvard Business Review", "SuperOffice", "Salesforce", "HubSpot", "Velocify", "Meta", "Mobilesquared"];

export default function HowItWorksPage({ region }: { region: Region }) {
  return (
    <>
      <PageHero
        kicker="How it works"
        heading={
          <>
            <LineReveal>Three things your agent</LineReveal>
            <LineReveal>
              does, <span style={{ color: "var(--color-accent)" }}>on repeat</span>
            </LineReveal>
          </>
        }
        body="One AI agent, configured around how your business actually runs."
        maxWidthCh="18ch"
        orbit={
          <HeroChatCard
            time="22:10"
            bubbles={[
              { from: "them", text: "Do you have anything free this week?" },
              { from: "us", text: "Thursday 16:00 or Friday 11:30 — which works?" },
            ]}
            speed="Replied in 1.4 s"
            outcome={["Booked · Thu, 16:00", "Added to the calendar, reminder set"]}
          />
        }
      />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          {STEPS.map((s) => (
            <div key={s.n} data-anim="" className="step-row-hover" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: "16px clamp(20px,4vw,64px)", alignItems: "start", borderTop: "1px solid var(--color-divider)", padding: "clamp(28px,3.5vw,44px) 0" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 14, letterSpacing: "0.1em", color: "var(--color-accent)", margin: 0 }}>{s.n}</p>
              <h2 style={{ fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.05, letterSpacing: "-0.02em", margin: 0 }}>{s.title}</h2>
              <p style={{ fontSize: 16, lineHeight: "28px", margin: 0, maxWidth: "52ch", ...bodyMuted }}>{s.body}</p>
            </div>
          ))}
          <div data-anim="rule" style={{ height: 1, background: "var(--color-divider)" }} />
        </section>

        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          <div style={{ display: "grid", gap: 18, borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="The response window" marginBottom="0" />
            <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "24ch" }}>Every minute you wait costs you the odds</h2>
            <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 12px", maxWidth: "52ch", ...bodyMuted }}>The agent replies inside the top band, every time, at any hour. Where your business lands today decides the rest.</p>

            <SpotlightGrid gridStyle={{ display: "grid", gap: 18 }}>
              {RESPONSE_WINDOW.map((item, i) => (
                <SpotlightItem
                  key={item.title}
                  index={i}
                  className="spot-tint-sm"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-divider)",
                    borderRadius: 28,
                    boxShadow: "var(--shadow-sm)",
                    padding: "22px clamp(20px,2.4vw,30px)",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))",
                    gap: "14px clamp(20px,3vw,44px)",
                    alignItems: "center",
                  }}
                >
                  <div>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 17, letterSpacing: "-0.01em", margin: 0 }}>{item.title}</p>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{item.src}</p>
                  </div>
                  <div>
                    <div style={{ height: 10, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
                      <span data-bar={item.pct} style={{ display: "block", "--bar": `${item.pct}%`, width: `${item.pct}%`, height: "100%", borderRadius: 999, background: "var(--color-accent)" } as React.CSSProperties} />
                    </div>
                    <p style={{ fontSize: 14, lineHeight: "22px", margin: "12px 0 0", ...bodyMuted }}>{item.body}</p>
                  </div>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(26px,3vw,40px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0, color: "var(--color-accent-700)", justifySelf: "end" }}>
                    <Counter target={item.statTarget} prefix={item.statPrefix} suffix={item.statSuffix} />
                  </p>
                </SpotlightItem>
              ))}
            </SpotlightGrid>
          </div>
        </section>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(20px,2.6vw,34px) 0", overflow: "hidden" }}>
        <Marquee duration={32}>
          {BENCHMARK_SOURCES.map((src) => (
            <span key={src} style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(18px,2.2vw,30px)", letterSpacing: "-0.02em", padding: "0 20px", whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
              {src}
              <span style={{ color: "var(--color-accent)" }}> ·</span>
            </span>
          ))}
        </Marquee>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="The numbers behind it" marginBottom="0" />
            <div style={{ gridColumn: "1 / -1", marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "24ch" }}>Why speed is the whole argument</h2>
              <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 36px", maxWidth: "54ch", ...bodyMuted }}>Published benchmarks for lead response and business messaging, with the source against each line. These are category figures, not VantriqAI client results.</p>
              <p className="scroll-hint" aria-hidden="true">Swipe the table to see every column &rarr;</p>
              <div data-anim="" style={{ overflowX: "auto" }}>
                <table className="table" style={{ minWidth: 720, fontSize: 15 }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px", width: "46%" }}>Benchmark</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Figure</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BMK.map((r) => (
                      <tr key={r.claim}>
                        <td style={{ padding: "14px 10px" }}>{r.claim}</td>
                        <td style={{ padding: "14px 10px", fontFamily: "var(--font-heading)", fontWeight: 800, whiteSpace: "nowrap", color: "var(--color-accent-700)" }}>{r.fig}</td>
                        <td style={{ padding: "14px 10px", fontSize: 12.5, lineHeight: "19px", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>{r.src}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="The difference" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px" }}>Not a chatbot. Not another hire.</h2>
              <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 36px", maxWidth: "52ch", ...bodyMuted }}>Compared honestly against the two things you&rsquo;re probably weighing instead.</p>
              <p className="scroll-hint" aria-hidden="true">Swipe the table to see every column &rarr;</p>
              <div data-anim="" style={{ overflowX: "auto" }}>
                <table className="table" style={{ minWidth: 760, fontSize: 15 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "22%", padding: "12px 10px" }}></th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>Hiring staff</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px" }}>A generic chatbot</th>
                      <th style={{ fontSize: 12, letterSpacing: "0.1em", padding: "12px 10px", fontFamily: "var(--font-heading)", fontWeight: 800, textTransform: "none" }}>
                        Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((r) => (
                      <tr key={r.a}>
                        <td style={{ padding: "14px 10px", ...mutedLabel }}>{r.a}</td>
                        <td style={{ padding: "14px 10px" }}>{r.b}</td>
                        <td style={{ padding: "14px 10px" }}>{r.c}</td>
                        <td style={{ padding: "14px 10px", fontFamily: "var(--font-heading)", fontWeight: 800 }}>{r.d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="Under the hood" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px", maxWidth: "24ch" }}>Enterprise-grade, without the enterprise headache</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 18 }}>
                {HOOD.map((h) => (
                  <div key={h.n} data-anim="" style={{ background: "var(--color-bg)", padding: "28px 26px 34px" }}>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.1em", color: "var(--color-accent)", margin: "0 0 18px" }}>{h.n}</p>
                    <h3 style={{ fontSize: 21, lineHeight: 1.12, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{h.title}</h3>
                    <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, ...bodyMuted }}>{h.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Start with a discovery call."
        body="Fifteen minutes on how your customers message you today, and where an agent would earn its keep."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief instead"
        secondaryHref={hrefIn(region, "/contact")}
      />
    </>
  );
}
