import PageHero from "@/components/PageHero";
import HeroOrbitCard from "@/components/HeroOrbitCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import SpotlightGrid, { SpotlightItem } from "@/components/SpotlightGrid";
import { SECTORS } from "@/lib/content";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

const CHANNEL_STATS = [
  { fig: "3 bn+", body: "People on WhatsApp every month", src: "Meta, confirmed 2025" },
  { fig: "200 m+", body: "Businesses already on WhatsApp Business", src: "Meta, 2023" },
  { fig: "95–98%", body: "Open rate on a WhatsApp business message, against 20–25% for email", src: "Mobilesquared / Infobip · industry estimate" },
];

export default function Industries() {
  return (
    <>
      <PageHero
        kicker="Where it applies"
        heading={
          <>
            <LineReveal>
              <span style={{ color: "var(--color-accent)" }}>Every</span> sector,
            </LineReveal>
            <LineReveal>one platform</LineReveal>
          </>
        }
        body="The same core agent, tuned to the workflow of each sector — your catalogue, your booking rules, your tone."
        maxWidthCh="16ch"
        orbit={
          <HeroOrbitCard label="Everywhere" delay={0.6} orbitDuration={8}>
            <div style={{ position: "relative", width: "44%", aspectRatio: 1 }}>
              <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: "100%", height: "100%", margin: "-50% 0 0 -50%", borderRadius: "50%", border: "2px solid var(--color-accent)", animation: "radarping 2.2s ease-out infinite" }} />
              <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: "50%", width: "100%", height: "100%", margin: "-50% 0 0 -50%", borderRadius: "50%", border: "2px solid var(--color-accent)", animation: "radarping 2.2s ease-out infinite", animationDelay: ".7s" }} />
              <svg width="100%" height="100%" viewBox="0 0 24 24" fill="var(--color-accent)"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" /></svg>
            </div>
          </HeroOrbitCard>
        }
      />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(20px,2.6vw,32px)" }}>
          <Kicker label="Why the channel matters" />
          <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "26ch" }}>
            Whatever the sector, your customers are already messaging.
          </h2>
        </section>

        <section style={{ padding: "0 0 clamp(38px,5vw,66px)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 18 }}>
            {CHANNEL_STATS.map((s) => (
              <div
                key={s.body}
                data-anim=""
                className="hover-lift"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 28, boxShadow: "var(--shadow-sm)", padding: "clamp(26px,3.4vw,44px) clamp(20px,2.6vw,34px)", display: "flex", flexDirection: "column" }}
              >
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(34px,3.8vw,54px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0 }}>{s.fig}</p>
                <p style={{ fontSize: 14.5, lineHeight: "23px", margin: "16px 0 22px", flex: 1, maxWidth: "30ch", ...bodyMuted }}>{s.body}</p>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, color: "color-mix(in srgb, var(--color-text) 50%, transparent)", paddingTop: 12, borderTop: "1px solid var(--color-divider)" }}>{s.src}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <SpotlightGrid gridStyle={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
          {SECTORS.map((s, i) => (
            <SpotlightItem
              key={s.name}
              index={i}
              className="spot-tint"
              style={{
                background: "var(--color-surface)",
                padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)",
                borderRadius: 28,
                border: "1px solid var(--color-divider)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 18px" }}>{s.kicker}</p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>{s.name}</h2>
              <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, ...bodyMuted }}>{s.body}</p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10.5, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: "20px 0 0", paddingTop: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{s.data}</p>
            </SpotlightItem>
          ))}
        </SpotlightGrid>
      </section>

      <PosterCTA
        headline="Tell us how your business runs."
        body="We configure the agent around your workflow, not the other way round."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Request a quote"
        secondaryHref="/contact"
      />
    </>
  );
}
