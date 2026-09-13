"use client";

import { useEffect, useRef, useState } from "react";
import Kicker from "@/components/Kicker";

type Step = { n: string; title: string; body: string };

export default function PinnedSteps({ steps }: { steps: Step[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setMobile(window.innerWidth < 760);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (mobile) return;
    const onScroll = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      if (total <= 0) return;
      const progress = Math.min(1, Math.max(0, -rect.top / total));
      const idx = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      setActive(idx);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mobile, steps.length]);

  const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

  if (mobile) {
    return (
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(28px,5vw,52px) clamp(20px,5vw,64px)" }}>
        <Kicker label="02 — What it does" />
        <div style={{ display: "grid", gap: 40 }}>
          {steps.map((s) => (
            <div key={s.n} data-anim="">
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(48px,16vw,90px)", lineHeight: 0.86, letterSpacing: "-0.05em", margin: 0, color: "var(--color-accent)" }}>{s.n}</p>
              <h2 style={{ fontSize: "clamp(30px,8vw,44px)", lineHeight: 1, letterSpacing: "-0.03em", margin: "12px 0 18px" }}>{s.title}</h2>
              <p style={{ fontSize: 17, lineHeight: "29px", margin: 0, ...bodyMuted }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative", height: "210vh", borderTop: "1px solid var(--color-divider)", background: "var(--color-bg)" }}>
      <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "clamp(28px,5vw,52px) 0", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1280, width: "100%", margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-accent-700)", background: "var(--color-accent-100)", borderRadius: 999, padding: "7px 14px", display: "inline-block" }}>
              02 — What it does
            </span>
            <span style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.14em" }}>
              {String(active + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: "clamp(24px,5vw,72px)", alignItems: "center" }}>
            <div style={{ position: "relative", minHeight: 236 }}>
              {steps.map((s, i) => (
                <div
                  key={s.n}
                  style={{
                    position: "absolute",
                    inset: 0,
                    opacity: active === i ? 1 : 0,
                    transform: active === i ? "translateY(0)" : "translateY(34px)",
                    transition: "opacity .4s ease, transform .4s ease",
                    pointerEvents: active === i ? "auto" : "none",
                  }}
                >
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(52px,9vw,120px)", lineHeight: 0.86, letterSpacing: "-0.05em", margin: 0, color: "var(--color-accent)" }}>{s.n}</p>
                  <h2 style={{ fontSize: "clamp(30px,4.4vw,58px)", lineHeight: 1, letterSpacing: "-0.03em", margin: "12px 0 18px" }}>{s.title}</h2>
                  <p style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...bodyMuted }}>{s.body}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gap: 18 }}>
              {steps.map((s, i) => (
                <div
                  key={s.n}
                  style={{
                    background: active === i ? "var(--color-accent)" : "var(--color-surface)",
                    color: active === i ? "var(--color-bg)" : "var(--color-text)",
                    border: "1px solid var(--color-divider)",
                    borderRadius: 20,
                    padding: "22px 24px",
                    display: "flex",
                    alignItems: "baseline",
                    gap: 18,
                    transition: "background-color .35s ease, color .35s ease",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12, letterSpacing: "0.12em" }}>{s.n}</span>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(20px,2.4vw,30px)", letterSpacing: "-0.02em" }}>{s.title}</span>
                </div>
              ))}
              <div style={{ padding: "18px 4px" }}>
                <span
                  style={{
                    display: "block",
                    height: 4,
                    borderRadius: 999,
                    background: "var(--color-accent)",
                    transformOrigin: "left",
                    transform: `scaleX(${(active + 1) / steps.length})`,
                    transition: "transform .35s ease",
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
