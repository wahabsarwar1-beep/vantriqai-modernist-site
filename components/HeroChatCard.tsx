import type { ReactNode } from "react";

export type ChatBubble = { from: "them" | "us"; text: string };

/**
 * The conversation mock that stands in for the product in every hero.
 *
 * It is a picture of the thing actually working: a customer's message, the
 * agent's answer, how fast it landed, and — the part that matters — what it
 * did afterwards. An abstract orbiting dot said "AI"; this says what you get.
 *
 * Every hero passes its own exchange, so each page argues its own case with
 * the same furniture.
 */
export default function HeroChatCard({
  channel = "WhatsApp",
  time,
  bubbles,
  speed,
  outcome,
}: {
  channel?: string;
  time: string;
  bubbles: ChatBubble[];
  /** The little terracotta stamp, e.g. "Replied in 1.2 s". Optional. */
  speed?: string;
  /** What the agent went on to do. One line per row. Optional. */
  outcome?: ReactNode[];
}) {
  return (
    <div
      data-anim=""
      style={{
        justifySelf: "center",
        width: "min(100%, 340px)",
        background: "var(--color-surface)",
        border: "1px solid var(--color-divider)",
        borderRadius: 28,
        boxShadow: "var(--shadow-lg)",
        padding: "clamp(16px,2vw,20px)",
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
        {/* The one green on the page. It is the universal "this line is open"
            dot, not a brand colour, so it is deliberately local to here. */}
        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: "#25c16a", flex: "none" }} />
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          {channel} · {time}
        </span>
      </div>

      <div data-msgwave="" style={{ display: "grid", gap: 8 }}>
        {bubbles.map((b, i) =>
          b.from === "them" ? (
            <p
              key={i}
              style={{
                justifySelf: "start",
                maxWidth: "88%",
                margin: 0,
                background: "var(--color-neutral-200)",
                borderRadius: "14px 14px 14px 4px",
                padding: "10px 13px",
                fontSize: 14,
                lineHeight: "21px",
              }}
            >
              {b.text}
            </p>
          ) : (
            <p
              key={i}
              style={{
                justifySelf: "end",
                maxWidth: "88%",
                margin: 0,
                background: "var(--color-accent)",
                color: "#fff",
                borderRadius: "14px 14px 4px 14px",
                padding: "10px 13px",
                fontSize: 14,
                lineHeight: "21px",
              }}
            >
              {b.text}
            </p>
          ),
        )}
      </div>

      {speed ? (
        <span
          style={{
            justifySelf: "start",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--color-accent-2-100)",
            color: "var(--color-accent-2-700)",
            borderRadius: 999,
            padding: "6px 12px",
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: 11.5,
            lineHeight: "16px",
          }}
        >
          <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor" aria-hidden="true">
            <path d="M6.3 0 0 7.2h3.6L4.7 13 11 5.8H7.4z" />
          </svg>
          {speed}
        </span>
      ) : null}

      {outcome?.length ? (
        <div
          style={{
            background: "var(--color-accent-100)",
            border: "1px dashed var(--color-accent-300)",
            borderRadius: 14,
            padding: "11px 13px",
            display: "grid",
            gap: 3,
          }}
        >
          {/* Two columns so every row's text starts on the same edge. Only
              the first carries the tick — the rest keep an empty gutter
              rather than running back under it. */}
          {outcome.map((line, i) => (
            <p key={i} style={{ margin: 0, display: "grid", gridTemplateColumns: "12px 1fr", gap: 6, fontSize: 12.5, lineHeight: "19px", color: "var(--color-accent-800)" }}>
              <span aria-hidden="true">{i === 0 ? "✓" : ""}</span>
              <span>{line}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
