import type { CSSProperties } from "react";

/** "{ The workspace }": three phone mockups, each on a rotated tinted
 *  backdrop with two stat tiles overhanging the bezel. The thread bubbles
 *  rise in on scroll ([data-anim]) and the weekly chart draws itself
 *  column by column ([data-bar="y"]). */

const OUT = "calc(var(--tile-out) * -1)";

type Tile = { label?: string; fig: string; sub: string; tone: "surface" | "ink" | "accent"; pos: CSSProperties };

const CARDS: {
  n: string;
  title: string;
  body: string;
  tint: string;
  head: [string, string];
  tiles: [Tile, Tile];
}[] = [
  {
    n: "01",
    title: "Organised by default",
    body: "Every module in one place, each switched on only when your day actually needs it.",
    tint: "var(--blob-peach)",
    head: ["Your modules", "Karachi"],
    tiles: [
      { label: "Branches", fig: "3", sub: "all live", tone: "surface", pos: { top: "17%", right: OUT, transform: "rotate(4deg)" } },
      { fig: "0", sub: "bleed between", tone: "ink", pos: { bottom: "12%", left: OUT, transform: "rotate(-5deg)" } },
    ],
  },
  {
    n: "02",
    title: "One agent, running the show",
    body: "A single thread the customer sees, with the booking, the catalogue and the CRM behind it.",
    tint: "var(--blob-mint)",
    head: ["One thread", "Online"],
    tiles: [
      { label: "Agent", fig: "0.9s", sub: "to reply", tone: "surface", pos: { top: "9%", left: OUT, transform: "rotate(-5deg)" } },
      { fig: "Booked", sub: "no handover", tone: "accent", pos: { bottom: "9%", right: OUT, transform: "rotate(5deg)" } },
    ],
  },
  {
    n: "03",
    title: "Your growth, in full view",
    body: "What was asked, what converted, and which hours cost you money — every Monday.",
    tint: "var(--blob-lilac)",
    head: ["This week", "Mon 01"],
    tiles: [
      { label: "Recovered", fig: "$18.2K", sub: "this week", tone: "ink", pos: { top: "52%", right: OUT, transform: "rotate(5deg)" } },
      { fig: "21×", sub: "better odds", tone: "surface", pos: { bottom: "26%", left: OUT, transform: "rotate(-4deg)" } },
    ],
  },
];

const MODULES: [string, boolean][] = [
  ["Reception", true],
  ["Booking", true],
  ["Catalogue", true],
  ["Follow-up", false],
  ["Payments", false],
];

const THREAD = [
  { mine: false, text: "Do you deliver to Clifton?" },
  { mine: true, text: "Yes — same day before 4pm." },
  { mine: false, text: "Please do. Tomorrow works." },
  { mine: true, text: "Booked. I've sent the confirmation." },
];

const METRICS: [string, string][] = [
  ["Replied", "1.2s"],
  ["Booked", "48 visits"],
  ["Recovered", "$18.2K"],
  ["Escalated", "6 threads"],
];

const SPARK = [26, 34, 22, 48, 66, 54, 38, 64, 58];

const microLabel: CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 8.5,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

function OverhangTile({ tile }: { tile: Tile }) {
  const tone =
    tile.tone === "ink"
      ? { background: "var(--color-neutral-900)", color: "var(--color-bg)" }
      : tile.tone === "accent"
        ? { background: "var(--color-accent-100)", border: "1px solid var(--color-accent-200)", color: "var(--color-accent-800)" }
        : { background: "var(--color-surface)", border: "1px solid var(--color-divider)", color: "var(--color-text)" };
  return (
    <span
      aria-hidden="true"
      style={{
        position: "absolute",
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: "9px 11px",
        borderRadius: 18,
        boxShadow: "var(--shadow-md)",
        ...tone,
        ...tile.pos,
      }}
    >
      {tile.label && <span style={{ ...microLabel, fontSize: 8, opacity: 0.72 }}>{tile.label}</span>}
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "nowrap" }}>
        {tile.fig}
      </span>
      <span style={{ ...microLabel, fontSize: 8, opacity: 0.72 }}>{tile.sub}</span>
    </span>
  );
}

function Screen({ n }: { n: string }) {
  if (n === "01") {
    return (
      <>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {MODULES.map(([name, on]) => (
            <div
              key={name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 11,
                background: on ? "var(--color-accent-100)" : "var(--color-neutral-100)",
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 10,
                color: on ? "var(--color-accent-800)" : "color-mix(in srgb, var(--color-text) 55%, transparent)",
              }}
            >
              {name}
              {on ? (
                <span aria-hidden="true" style={{ width: 19, height: 11, borderRadius: 999, background: "var(--color-accent)", position: "relative", flex: "none" }}>
                  <span style={{ position: "absolute", top: 2, left: 10, width: 7, height: 7, borderRadius: 999, background: "#fff" }} />
                </span>
              ) : (
                <span style={{ ...microLabel, fontSize: 7.5, opacity: 0.6 }}>Off</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--color-divider)", paddingTop: 10, display: "flex", justifyContent: "space-between" }}>
          <span style={{ ...microLabel, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>Live now</span>
          <span style={{ ...microLabel, color: "var(--color-accent-700)" }}>3 of 10</span>
        </div>
      </>
    );
  }

  if (n === "02") {
    return (
      <>
        <p style={{ ...microLabel, margin: "0 0 8px", textAlign: "center", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>Today · 21:38</p>
        <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
          {THREAD.map((msg, i) => (
            <div
              key={i}
              data-anim="rise"
              style={{
                justifySelf: msg.mine ? "end" : "start",
                maxWidth: "88%",
                padding: "7px 10px",
                borderRadius: 12,
                fontSize: 10,
                lineHeight: 1.45,
                background: msg.mine ? "var(--color-accent)" : "var(--color-neutral-200)",
                color: msg.mine ? "#fff" : "var(--color-text)",
              }}
            >
              {msg.text}
            </div>
          ))}
        </div>
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
          <span style={{ ...microLabel, color: "var(--color-accent-700)" }}>Reminder set</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ display: "grid", gap: 13, alignContent: "start" }}>
        {METRICS.map(([label, fig]) => (
          <div key={label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
            <span style={{ ...microLabel, color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>{label}</span>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 13, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{fig}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: "auto", borderTop: "1px solid var(--color-divider)", paddingTop: 10 }}>
        <p style={{ ...microLabel, margin: "0 0 7px", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>Messages by hour</p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 40 }} aria-hidden="true">
          {SPARK.map((h, i) => (
            <span key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
              {/* Motion.tsx reads --bar and grows height from 0, staggered. */}
              <span
                data-bar="y"
                style={{ width: "100%", height: `${h}%`, borderRadius: 2, background: h === Math.max(...SPARK) ? "var(--color-accent)" : "var(--color-accent-200)", "--bar": `${h}%` } as CSSProperties}
              />
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

export default function WorkspaceCards() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(288px,100%),1fr))", gap: "clamp(20px,2.6vw,32px)", alignItems: "stretch" }}>
      {CARDS.map((c) => (
        <div
          key={c.n}
          data-anim="rise"
          style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--color-neutral-100)",
            border: "1px solid var(--color-divider)",
            borderRadius: 28,
            padding: "clamp(22px,2.4vw,30px) clamp(26px,3vw,38px)",
          }}
        >
          {/* The tiles hang outside the phone, so this wrapper must not clip. */}
          <div style={{ position: "relative", alignSelf: "center", width: "100%", maxWidth: 222, margin: "6px 0 18px", "--tile-out": "clamp(12px, 3.5vw, 56px)" } as CSSProperties}>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "22px -14px 40px -16px",
                zIndex: 0,
                background: c.tint,
                borderRadius: 26,
                transform: "rotate(-4deg)",
                opacity: 0.65,
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 2,
                background: "var(--color-neutral-900)",
                border: "1px solid var(--color-neutral-800)",
                padding: 6,
                borderRadius: 34,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div
                style={{
                  background: "var(--color-surface)",
                  borderRadius: 28,
                  overflow: "hidden",
                  aspectRatio: "9 / 15.5",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    flex: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "10px 12px",
                    background: "var(--color-text)",
                    color: "var(--color-bg)",
                  }}
                >
                  <span style={{ ...microLabel, fontSize: 9.5, letterSpacing: "0.11em" }}>{c.head[0]}</span>
                  <span style={{ ...microLabel, fontSize: 9.5, letterSpacing: "0.11em", opacity: 0.6 }}>{c.head[1]}</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "12px 11px" }}>
                  <Screen n={c.n} />
                </div>
              </div>
            </div>
            {c.tiles.map((t, i) => (
              <OverhangTile key={i} tile={t} />
            ))}
          </div>

          <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", color: "var(--color-accent)", margin: "0 0 10px" }}>
            {c.n}
          </p>
          <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{c.title}</h3>
          <p style={{ fontSize: 14.5, lineHeight: "25px", margin: 0, color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>{c.body}</p>
        </div>
      ))}
    </div>
  );
}
