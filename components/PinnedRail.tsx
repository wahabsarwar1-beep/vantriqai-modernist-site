"use client";

import { useEffect, useRef, useState } from "react";

type JStep = { n: string; title: string; body: string; fig: string; figLabel: string };

export default function PinnedRail({ steps }: { steps: JStep[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [mobile, setMobile] = useState(false);
  const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

  useEffect(() => {
    const checkMobile = () => setMobile(window.innerWidth < 900);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (mobile) return;
    const onScroll = () => {
      const el = containerRef.current;
      const track = trackRef.current;
      if (!el || !track) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      const idx = Math.min(steps.length - 1, Math.round(progress * (steps.length - 1)));
      setActive(idx);
      track.style.transform = `translateX(-${progress * (steps.length - 1) * 100}vw)`;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobile, steps.length]);

  const kicker = (
    <span
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--color-accent-700)",
        background: "var(--color-accent-100)",
        borderRadius: 999,
        padding: "7px 14px",
        display: "inline-block",
      }}
    >
      04 — Step by step
    </span>
  );

  if (mobile) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(28px,5vw,52px) clamp(20px,5vw,64px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          {kicker}
          <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        </div>
        <div style={{ display: "grid", gap: 32 }}>
          {steps.map((s) => (
            <div key={s.n} data-anim="" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 20 }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(40px,10vw,64px)", lineHeight: 0.84, letterSpacing: "-0.05em", margin: 0, color: "var(--color-accent)" }}>{s.n}</p>
              <h2 style={{ fontSize: "clamp(22px,6vw,32px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "10px 0 0" }}>{s.title}</h2>
              <p style={{ fontSize: 16, lineHeight: "26px", margin: "14px 0 0", ...bodyMuted }}>{s.body}</p>
              <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12, marginTop: 14 }}>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(22px,2.6vw,34px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>{s.fig}</p>
                <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{s.figLabel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", height: "230vh", borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "clamp(28px,5vw,52px) 0", minHeight: "100vh", overflow: "hidden" }}>
        <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)", display: "flex", alignItems: "center", gap: "12px 16px", flexWrap: "wrap" }}>
          {kicker}
          <span style={{ flex: 1, height: 1, background: "var(--color-divider)", minWidth: 32 }} />
          <span style={{ display: "flex", gap: 10 }}>
            {steps.map((s, i) => (
              <span
                key={s.n}
                style={{
                  width: 38,
                  height: 28,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: 999,
                  background: active === i ? "var(--color-accent)" : "var(--color-neutral-200)",
                  color: active === i ? "var(--color-bg)" : "var(--color-text)",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  transition: "background-color .3s ease, color .3s ease",
                }}
              >
                {s.n}
              </span>
            ))}
          </span>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em" }}>
            {steps[active].n} <span style={{ color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>/ {steps.length.toString().padStart(2, "0")}</span>
          </span>
        </div>
        <div ref={trackRef} style={{ display: "flex", width: "max-content", marginTop: "clamp(16px,2.6vw,28px)", willChange: "transform" }}>
          {steps.map((s) => (
            <div key={s.n} style={{ width: "100vw", flex: "none", padding: "0 clamp(20px,5vw,64px)", boxSizing: "border-box" }}>
              <div style={{ maxWidth: 1280, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(290px,100%),1fr))", gap: "clamp(16px,3vw,48px)", alignItems: "start", borderTop: "1px solid var(--color-divider)", paddingTop: "clamp(14px,2.2vw,24px)" }}>
                <div>
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(40px,7vw,100px)", lineHeight: 0.84, letterSpacing: "-0.05em", margin: 0, color: "var(--color-accent)" }}>{s.n}</p>
                  <h2 style={{ fontSize: "clamp(22px,3vw,40px)", lineHeight: 1.05, letterSpacing: "-0.03em", margin: "10px 0 0", maxWidth: "16ch" }}>{s.title}</h2>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(14px,2vw,22px)" }}>
                  <p style={{ fontSize: 16, lineHeight: "26px", margin: 0, maxWidth: "46ch", ...bodyMuted }}>{s.body}</p>
                  <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(22px,2.6vw,34px)", lineHeight: 1, letterSpacing: "-0.03em", margin: 0 }}>{s.fig}</p>
                    <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", margin: "8px 0 0", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>{s.figLabel}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
