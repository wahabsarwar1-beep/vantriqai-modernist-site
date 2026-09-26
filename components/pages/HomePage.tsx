import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import HeroRotator from "@/components/HeroRotator";
import GapClock from "@/components/GapClock";
import InteractiveDemo from "@/components/InteractiveDemo";
import TileBand from "@/components/TileBand";
import PinnedSteps from "@/components/PinnedSteps";
import PinnedRail from "@/components/PinnedRail";
import Marquee from "@/components/Marquee";
import WorkspaceCards from "@/components/WorkspaceCards";
import { BENCH, MISSED, ANSWERED, AGENTS, JSTEPS, INTEGRATIONS, MARQUEE_ITEMS, WHY, STEPS } from "@/lib/content";
import { hrefIn, type Region } from "@/lib/region";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

export default function HomePage({ region }: { region: Region }) {
  return (
    <>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(44px,6vw,78px) 0 clamp(30px,4.2vw,54px)", position: "relative" }}>
          {/* Bleeds up behind the sticky nav, which sits at 90% opacity over a
              blur — so the page opens in colour rather than against a hard
              cream band above the wash. */}
          <div aria-hidden="true" data-hero-texture="" style={{ position: "absolute", top: "calc(clamp(72px, 7vw, 92px) * -1)", bottom: 0, left: "50%", width: "calc(100vw + 24px)", marginLeft: "calc(-50vw - 12px)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <HeroRotator region={region} />
          </div>
        </section>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 18 }} data-stagger="">
          {BENCH.map((b) => (
            <div key={b.fig} data-anim="" data-tilt="" className="hover-lift" style={{ background: "var(--color-surface)", padding: "clamp(26px,3.4vw,46px) clamp(18px,2.4vw,34px)", borderRadius: 28, border: "1px solid var(--color-divider)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(34px,3.8vw,54px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0, fontVariantNumeric: "tabular-nums" }}>{b.fig}</p>
              <p style={{ fontSize: 14.5, lineHeight: "23px", margin: "16px 0 22px", flex: 1, maxWidth: "30ch", ...bodyMuted }}>{b.claim}</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, paddingTop: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{b.src}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(34px,4.4vw,58px) clamp(20px,5vw,64px) 0" }}>
        <Kicker label="01 — The response gap" />
        <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 clamp(28px,4vw,44px)", maxWidth: "26ch" }}>
          Few businesses lose the sale on price. They lose it in the hours nobody answered.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 18 }}>
          <div data-anim="" style={{ background: "var(--color-text)", color: "var(--color-bg)", borderRadius: 36, padding: "clamp(28px,3.6vw,48px) clamp(22px,3vw,42px)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "clamp(24px,4vw,40px)", minHeight: "clamp(300px,30vw,380px)" }}>
            <div>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: 0, color: "var(--color-accent-400)" }}>Unanswered · live</p>
              <GapClock />
              <p style={{ fontSize: 15, lineHeight: "25px", margin: "18px 0 0", maxWidth: "38ch", color: "color-mix(in srgb, var(--color-bg) 72%, transparent)" }}>
                This clock started when you scrolled here. It stands in for the message that arrived while the shop was shut.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", borderTop: "1px solid color-mix(in srgb, var(--color-bg) 30%, transparent)", paddingTop: 16, fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              <span>Industry average first reply — 42 hrs</span>
              <span style={{ color: "var(--color-accent-400)" }}>Your agent — 1.2 s</span>
            </div>
          </div>
          <div style={{ display: "grid", gap: 18 }}>
            <div data-anim="" className="hover-tint-solid" style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 28, padding: "clamp(24px,3vw,38px) clamp(20px,2.6vw,36px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(30px,3.4vw,48px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0 }}>23%</p>
              <p style={{ fontSize: 14.5, lineHeight: "24px", margin: "12px 0 14px", maxWidth: "34ch", ...bodyMuted }}>Of audited firms never replied to the enquiry at all. Not late — never.</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>Harvard Business Review, 2011 · 2,241 firms</p>
            </div>
            <div data-anim="" className="hover-tint-solid" style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 28, padding: "clamp(24px,3vw,38px) clamp(20px,2.6vw,36px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(30px,3.4vw,48px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0 }}>83%</p>
              <p style={{ fontSize: 14.5, lineHeight: "24px", margin: "12px 0 14px", maxWidth: "34ch", ...bodyMuted }}>Of customers expect to engage immediately when they contact a business.</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>Salesforce</p>
            </div>
          </div>
        </div>
        <p data-anim="" style={{ fontSize: 12, lineHeight: "20px", margin: "16px 0 0", maxWidth: "74ch", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          Every figure on this page is a published third-party benchmark for messaging and lead response, cited where it appears. None of them are VantriqAI client results.
        </p>

        <div style={{ margin: "clamp(48px,7vw,90px) 0 clamp(20px,3vw,32px)" }}>
          <Kicker label="Same message, two businesses" marginBottom="0" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
          <div data-anim="" style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 28, boxShadow: "var(--shadow-sm)", padding: "clamp(26px,3.2vw,42px) clamp(22px,2.8vw,38px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 6px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Without an agent</p>
            <h3 style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 20px" }}>The thread nobody saw</h3>
            {MISSED.map((r) => (
              <div key={r.t + r.text} style={{ display: "flex", gap: 18, alignItems: "baseline", borderTop: "1px solid var(--color-divider)", padding: "13px 0" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", flex: "none", width: 44, fontVariantNumeric: "tabular-nums", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{r.t}</span>
                <span style={{ fontSize: 15, lineHeight: "24px" }}>{r.text}</span>
              </div>
            ))}
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1, letterSpacing: "-0.03em", margin: "24px 0 8px", borderTop: "1px solid var(--color-text)", paddingTop: 20 }}>12 h 07 m</p>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>To first reply — the average across 1,000 companies is 12 h 10 m · SuperOffice</p>
          </div>
          <div data-anim="" style={{ background: "var(--color-accent-100)", border: "1px solid var(--color-accent-200)", borderRadius: 28, boxShadow: "var(--shadow-sm)", padding: "clamp(26px,3.2vw,42px) clamp(22px,2.8vw,38px)" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", margin: "0 0 6px", color: "var(--color-accent-700)" }}>With the agent</p>
            <h3 style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 20px" }}>The same thread, answered</h3>
            {ANSWERED.map((r) => (
              <div key={r.t + r.text} style={{ display: "flex", gap: 18, alignItems: "baseline", borderTop: "1px solid var(--color-divider)", padding: "13px 0" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.06em", flex: "none", width: 44, fontVariantNumeric: "tabular-nums", color: "var(--color-accent-700)" }}>{r.t}</span>
                <span style={{ fontSize: 15, lineHeight: "24px" }}>{r.text}</span>
              </div>
            ))}
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(24px,2.6vw,34px)", lineHeight: 1, letterSpacing: "-0.03em", margin: "24px 0 8px", borderTop: "1px solid var(--color-accent)", paddingTop: 20, color: "var(--color-accent-700)" }}>3 m</p>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Message to booked — inside the five-minute window where qualification odds run 21× higher · MIT / InsideSales.com</p>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(38px,4.8vw,64px) 0 clamp(16px,2.2vw,28px)" }}>
          <div className="stack-mobile" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: "20px clamp(24px,5vw,72px)", borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <p data-anim="" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: 0 }}>{"{ Vantriq's advantage }"}</p>
            <div>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 16px", maxWidth: "20ch" }}>The growth engine for local business.</h2>
              <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: "0 0 32px", maxWidth: "50ch", ...bodyMuted }}>One agent, plugged into your channels and your calendar, answering every hour you are closed. Below: pick a business, then send the messages a customer would.</p>
            </div>
            {/* Spans both columns: the demo is the point of this section, and
                in the right-hand column it sat off-centre and collided with
                the marquee running behind it. */}
            <div data-anim="" style={{ gridColumn: "1 / -1" }}>
                <div style={{ position: "relative", display: "grid", justifyItems: "center", alignContent: "center", padding: "clamp(18px,3vw,34px) 0" }}>
                  <TileBand region={region} />
                  <InteractiveDemo />
                </div>
                <div style={{ position: "relative", zIndex: 1, background: "var(--color-bg)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(228px,100%),1fr))", gap: "0 clamp(24px,4vw,56px)", marginTop: "clamp(28px,4vw,44px)" }}>
                  <div style={{ borderTop: "1px solid var(--color-divider)", padding: "16px 0" }}>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 62%, transparent)", margin: "0 0 8px" }}>Checked stock</p>
                    <p style={{ fontSize: 15, lineHeight: "25px", margin: 0 }}>Against live inventory, not a canned answer.</p>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-divider)", padding: "16px 0" }}>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 62%, transparent)", margin: "0 0 8px" }}>Held the item</p>
                    <p style={{ fontSize: 15, lineHeight: "25px", margin: 0 }}>A real action in your system, logged to the lead.</p>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-divider)", padding: "16px 0" }}>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 62%, transparent)", margin: "0 0 8px" }}>Booked the visit</p>
                    <p style={{ fontSize: 15, lineHeight: "25px", margin: 0 }}>Into the calendar, with the reminder scheduled.</p>
                  </div>
                </div>
            </div>
          </div>
        </section>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px) clamp(28px,3.6vw,46px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }}>
          <div data-anim="" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
            <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>Trained on real conversations</h3>
            <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>Vantriq is built on thousands of genuine customer threads — retail, clinics, schools, agencies — so it knows the questions that repeat and the answers that close.</p>
          </div>
          <div data-anim="" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
            <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>Modules in sync</h3>
            <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>Reception, booking, catalogue and follow-up run as one brain. What one module learns in a thread, the next one uses two messages later.</p>
          </div>
          <div data-anim="" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
            <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>Connected to your whole stack</h3>
            <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>WhatsApp, Instagram, your website, Google Calendar, your CRM and your payment links — wired up during onboarding, not months later.</p>
          </div>
        </div>
      </div>

      <PinnedSteps steps={STEPS} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(12px,2vw,22px) clamp(20px,5vw,64px) clamp(18px,2.4vw,30px)" }}>
        <Kicker label="03 — The agents" />
        <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "24ch" }}>
          One brain, ten jobs. Switch on the ones your day actually needs — the rest stay quiet until you want them.
        </h2>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(272px,100%),1fr))", gap: 18 }}>
          {AGENTS.map((a) => (
            <div key={a.n} data-anim="" className="card hover-lift-5" style={{ padding: "clamp(24px,3vw,38px) clamp(20px,2.5vw,34px)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", color: "var(--color-accent)", margin: "0 0 18px" }}>{a.n}</p>
              <h3 style={{ fontSize: 23, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>{a.name} Agent</h3>
              <p style={{ fontSize: 14.5, lineHeight: "25px", margin: "0 0 22px", flex: 1, ...bodyMuted }}>{a.body}</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, paddingTop: 14, borderTop: "1px solid var(--color-divider)", color: "var(--color-accent)" }}>{a.metric}</p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(36px,4.6vw,62px) clamp(20px,5vw,64px)" }}>
          <Kicker label="{ The workspace }" />
          <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: "20px clamp(24px,4vw,56px)", alignItems: "end", marginBottom: "clamp(32px,4vw,52px)" }}>
            <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "22ch" }}>For work that is bigger than one inbox.</h2>
            <p data-anim="" style={{ fontSize: 16, lineHeight: "28px", margin: 0, maxWidth: "46ch", ...bodyMuted }}>Switch on the modules you need, watch one thread carry a customer to a booking, and read the week in a minute.</p>
          </div>
          <WorkspaceCards region={region} />
        </div>
      </section>

      <PinnedRail steps={JSTEPS} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(12px,2vw,22px) clamp(20px,5vw,64px) clamp(18px,2.4vw,30px)" }}>
        <Kicker label="05 — What it plugs into" />
        <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "24ch" }}>It acts inside the tools you already pay for.</h2>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: 18 }}>
          {INTEGRATIONS.map((g) => (
            <div key={g.group} data-anim="" className="card" style={{ padding: "clamp(24px,3vw,38px) clamp(20px,2.5vw,32px)" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 16px" }}>{g.group}</p>
              <div style={{ display: "grid", gap: 0 }}>
                {g.items.map((item) => (
                  <span key={item} style={{ display: "block", borderTop: "1px solid var(--color-divider)", padding: "12px 0", fontSize: 15, lineHeight: "22px" }}>{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(28px,4vw,48px) 0", overflow: "hidden" }}>
        <p data-anim="" style={{ maxWidth: 1280, margin: "0 auto 22px", padding: "0 clamp(20px,5vw,64px)" }}>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)", background: "var(--color-accent-100)", borderRadius: 999, padding: "7px 14px", display: "inline-block" }}>
            05 — Where it applies
          </span>
        </p>
        <Marquee duration={34}>
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {MARQUEE_ITEMS.map((item) => (
              <span key={item} style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(26px,3.6vw,50px)", letterSpacing: "-0.03em", padding: "0 26px", whiteSpace: "nowrap" }}>
                {item}
                <span style={{ color: "var(--color-accent)", paddingLeft: 26 }}>/</span>
              </span>
            ))}
          </div>
        </Marquee>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(40px,5vw,68px) 0" }}>
          <div className="stack-mobile" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(240px,100%),1fr))", gap: "20px clamp(24px,5vw,72px)", borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <p data-anim="" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: 0 }}>
              07 — Why Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span>
            </p>
            <div>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 44px", maxWidth: "22ch" }}>A local partner, not a faceless subscription</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }} data-stagger="">
                {WHY.map((w) => (
                  <div key={w.title} data-anim="" className="hover-border-lift" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
                    <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 12px" }}>{w.title}</h3>
                    <p style={{ fontSize: 15.5, lineHeight: "27px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>{w.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Let's talk."
        body="Send us a message and see the agent answer. A discovery call maps your customer workflow before anything is built."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Request a quote"
        secondaryHref={hrefIn(region, "/pricing")}
      />
    </>
  );
}
