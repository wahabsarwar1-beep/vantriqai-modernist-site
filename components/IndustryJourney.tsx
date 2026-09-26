"use client";

import { useId, useRef, useState } from "react";
import type { JourneyStage } from "@/lib/industries";

/**
 * The customer's journey through one sector, one stage at a time.
 *
 * Tabs rather than a long list: each stage is a claim plus a picture of it
 * working, and four of those stacked read as a wall. The pattern is the ARIA
 * tablist — arrow keys move between stages, Home and End jump — so it is as
 * usable from a keyboard as by tapping.
 */
export default function IndustryJourney({ stages }: { stages: JourneyStage[] }) {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const stage = stages[active];

  const move = (to: number) => {
    const next = (to + stages.length) % stages.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Customer journey"
        className="journey-tabs"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") move(active + 1);
          else if (e.key === "ArrowLeft") move(active - 1);
          else if (e.key === "Home") move(0);
          else if (e.key === "End") move(stages.length - 1);
          else return;
          e.preventDefault();
        }}
      >
        {stages.map((s, i) => {
          const on = i === active;
          return (
            <button
              key={s.label}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`${baseId}-tab-${i}`}
              aria-selected={on}
              aria-controls={`${baseId}-panel`}
              tabIndex={on ? 0 : -1}
              onClick={() => setActive(i)}
              className="journey-tab"
              data-on={on ? "" : undefined}
            >
              <span className="journey-tab-n">{String(i + 1).padStart(2, "0")}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        key={active}
        className="journey-panel"
      >
        <div>
          <h3 style={{ fontSize: "clamp(24px,2.8vw,38px)", lineHeight: 1.04, letterSpacing: "-0.03em", margin: "0 0 18px", color: "#fff", maxWidth: "18ch" }}>
            {stage.title}
          </h3>
          <p style={{ fontSize: 16.5, lineHeight: "28px", margin: "0 0 26px", maxWidth: "46ch", color: "rgba(255,255,255,.74)" }}>{stage.body}</p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
            {stage.points.map((pt) => (
              <li key={pt} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 12, alignItems: "start", fontSize: 15, lineHeight: "22px", color: "rgba(255,255,255,.88)" }}>
                <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 7, background: "color-mix(in srgb, var(--ind-a) 40%, transparent)", color: "#fff", fontSize: 12, fontWeight: 800 }}>
                  ✓
                </span>
                {pt}
              </li>
            ))}
          </ul>
        </div>

        {/* The stage working: one exchange and what the agent did with it. */}
        <div className="journey-device" aria-label={`Example conversation: ${stage.label}`} role="group">
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 12, borderBottom: "1px solid var(--color-divider)" }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg, var(--ind-a), var(--ind-b))", flex: "none" }} />
            <span style={{ display: "grid" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13 }}>Your business</span>
              <span style={{ fontSize: 11, color: "#25a35c" }}>online · replies instantly</span>
            </span>
          </div>
          <p className="journey-bubble journey-bubble-them">{stage.chat.them}</p>
          <p className="journey-bubble journey-bubble-us">{stage.chat.us}</p>
          <p className="journey-done">
            <span aria-hidden="true">✓</span>
            {stage.chat.done}
          </p>
        </div>
      </div>
    </div>
  );
}
