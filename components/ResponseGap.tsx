"use client";

import { useEffect, useRef } from "react";
import { ANSWERED, MISSED } from "@/lib/home-data";
import { prefersReducedMotion } from "@/lib/motion";

const kicker = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  margin: "0 0 6px",
};
const srcLine = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 10,
  lineHeight: "16px",
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  margin: 0,
};

/** The clock that starts when the card scrolls into view. It stands in for a
 *  message arriving while the shop is shut, so it has to be running time
 *  rather than a static figure — but it only starts once the reader can see
 *  it, otherwise the number is meaningless by the time they arrive. */
function GapClock() {
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = "00:00:00";
      return;
    }

    let start: number | null = null;
    let raf = 0;
    let last = "";

    const tick = (t: number) => {
      if (start === null) start = t;
      const s = Math.floor((t - start) / 1000);
      const text = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
        .map((n) => String(n).padStart(2, "0"))
        .join(":");
      // Only touch the DOM when the rendered second actually changes; this
      // runs on every frame otherwise and thrashes layout for nothing.
      if (text !== last) {
        el.textContent = text;
        last = text;
      }
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          raf = requestAnimationFrame(tick);
          io.disconnect();
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <p
      ref={ref}
      style={{
        fontFamily: "var(--font-heading)",
        fontWeight: 800,
        fontSize: "clamp(44px,6.4vw,94px)",
        lineHeight: 0.9,
        letterSpacing: "-0.05em",
        margin: "16px 0 0",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      00:00:00
    </p>
  );
}

function Beat({ t, text, accent }: { t: string; text: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 18,
        alignItems: "baseline",
        borderTop: "1px solid var(--color-divider)",
        padding: "13px 0",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: "0.06em",
          flex: "none",
          width: 44,
          fontVariantNumeric: "tabular-nums",
          color: accent ? "var(--color-accent-700)" : "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        {t}
      </span>
      <span style={{ fontSize: 15, lineHeight: "24px" }}>{text}</span>
    </div>
  );
}

/** "01 — The response gap": the live clock and two published benchmarks,
 *  then the same enquiry played out twice, with and without the agent. */
export default function ResponseGap() {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(20px,3vw,32px)" }}>
        <span data-anim="rise" className="kicker-pill">
          01 — The response gap
        </span>
        <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
      </div>
      <h2
        data-anim="rise"
        style={{
          fontSize: "clamp(24px,3vw,42px)",
          lineHeight: 1.02,
          letterSpacing: "-0.03em",
          margin: "0 0 clamp(28px,4vw,44px)",
          maxWidth: "26ch",
        }}
      >
        Few businesses lose the sale on price. They lose it in the hours nobody answered.
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 18 }}>
        <div
          data-anim="rise"
          style={{
            background: "var(--color-text)",
            color: "var(--color-bg)",
            borderRadius: 36,
            padding: "clamp(28px,3.6vw,48px) clamp(22px,3vw,42px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "clamp(24px,4vw,40px)",
            minHeight: "clamp(300px,30vw,380px)",
          }}
        >
          <div>
            <p style={{ ...kicker, margin: 0, color: "var(--color-accent-400)" }}>Unanswered · live</p>
            <GapClock />
            <p
              style={{
                fontSize: 15,
                lineHeight: "25px",
                margin: "18px 0 0",
                maxWidth: "38ch",
                color: "color-mix(in srgb, var(--color-bg) 72%, transparent)",
              }}
            >
              This clock started when you scrolled here. It stands in for the message that arrived while the shop was
              shut.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px 32px",
              borderTop: "1px solid color-mix(in srgb, var(--color-bg) 30%, transparent)",
              paddingTop: 16,
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span>Industry average first reply — 42 hrs</span>
            <span style={{ color: "var(--color-accent-400)" }}>Your agent — 1.2 s</span>
          </div>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {[
            {
              fig: "23%",
              body: "Of audited firms never replied to the enquiry at all. Not late — never.",
              src: "Harvard Business Review, 2011 · 2,241 firms",
            },
            {
              fig: "83%",
              body: "Of customers expect to engage immediately when they contact a business.",
              src: "Salesforce",
            },
          ].map((card) => (
            <div
              key={card.fig}
              data-anim="rise"
              className="cell-hover"
              style={{
                padding: "clamp(24px,3vw,38px) clamp(20px,2.6vw,36px)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: "clamp(30px,3.4vw,48px)",
                  lineHeight: 1,
                  letterSpacing: "-0.04em",
                  margin: 0,
                }}
              >
                {card.fig}
              </p>
              <p
                style={{
                  fontSize: 14.5,
                  lineHeight: "24px",
                  margin: "12px 0 14px",
                  maxWidth: "34ch",
                  color: "color-mix(in srgb, var(--color-text) 78%, transparent)",
                }}
              >
                {card.body}
              </p>
              <p style={{ ...srcLine, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{card.src}</p>
            </div>
          ))}
        </div>
      </div>

      <p
        data-anim="rise"
        style={{
          fontSize: 12,
          lineHeight: "20px",
          margin: "16px 0 0",
          maxWidth: "74ch",
          color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
        }}
      >
        Every figure on this page is a published third-party benchmark for messaging and lead response, cited where it
        appears. None of them are VantriqAI client results.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          margin: "clamp(48px,7vw,90px) 0 clamp(20px,3vw,32px)",
        }}
      >
        <span data-anim="rise" className="kicker-pill">
          Same message, two businesses
        </span>
        <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
        <div
          data-anim="rise"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: 28,
            boxShadow: "var(--shadow-sm)",
            padding: "clamp(26px,3.2vw,42px) clamp(22px,2.8vw,38px)",
          }}
        >
          <p style={{ ...kicker, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>Without an agent</p>
          <h3 style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 20px" }}>
            The thread nobody saw
          </h3>
          {MISSED.map((r) => (
            <Beat key={r.t + r.text} t={r.t} text={r.text} />
          ))}
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "clamp(24px,2.6vw,34px)",
              lineHeight: 1,
              letterSpacing: "-0.03em",
              margin: "24px 0 8px",
              borderTop: "1px solid var(--color-text)",
              paddingTop: 20,
            }}
          >
            12 h 07 m
          </p>
          <p style={{ ...srcLine, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
            To first reply — the average across 1,000 companies is 12 h 10 m · SuperOffice
          </p>
        </div>

        <div
          data-anim="rise"
          style={{
            background: "var(--color-accent-100)",
            border: "1px solid var(--color-accent-200)",
            borderRadius: 28,
            boxShadow: "var(--shadow-sm)",
            padding: "clamp(26px,3.2vw,42px) clamp(22px,2.8vw,38px)",
          }}
        >
          <p style={{ ...kicker, color: "var(--color-accent-700)" }}>With the agent</p>
          <h3 style={{ fontSize: 22, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 20px" }}>
            The same thread, answered
          </h3>
          {ANSWERED.map((r, i) => (
            <Beat key={r.t + i} t={r.t} text={r.text} accent />
          ))}
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "clamp(24px,2.6vw,34px)",
              lineHeight: 1,
              letterSpacing: "-0.03em",
              margin: "24px 0 8px",
              borderTop: "1px solid var(--color-accent)",
              paddingTop: 20,
              color: "var(--color-accent-700)",
            }}
          >
            3 m
          </p>
          <p style={{ ...srcLine, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
            Message to booked — inside the five-minute window where qualification odds run 21× higher · MIT /
            InsideSales.com
          </p>
        </div>
      </div>
    </>
  );
}
