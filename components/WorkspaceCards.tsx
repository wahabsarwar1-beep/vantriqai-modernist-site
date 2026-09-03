/** "{ The workspace }": three small phone mockups on rotated tinted
 *  backdrops, each captioned 01/02/03. The third carries the weekly metric
 *  bars, which grow from 0 via [data-bar] in Motion.tsx. */

const CARDS = [
  { n: "01", title: "Organised by default", body: "Every module in one place, each one switched on only when your day actually needs it.", tint: "var(--blob-peach)" },
  { n: "02", title: "One agent, running the show", body: "A single thread the customer sees, with the booking, the catalogue and the CRM behind it.", tint: "var(--blob-mint)" },
  { n: "03", title: "Your growth, in full view", body: "What was asked, what converted, and which hours cost you money — every Monday.", tint: "var(--blob-lilac)" },
];

const MODULES = ["Reception", "Booking", "Catalogue", "Qualifier"];
const THREAD = [
  { mine: false, text: "Do you deliver to Clifton?" },
  { mine: true, text: "We do — usually next day." },
  { mine: false, text: "Book me in for Saturday?" },
  { mine: true, text: "Saturday 11:00 held." },
];
const BARS = [
  { day: "Mon", pct: 62 },
  { day: "Tue", pct: 48 },
  { day: "Wed", pct: 81 },
  { day: "Thu", pct: 55 },
  { day: "Fri", pct: 94 },
];

function PhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: "100%",
        maxWidth: 222,
        margin: "0 auto",
        background: "var(--color-neutral-900)",
        border: "1px solid var(--color-neutral-800)",
        padding: 6,
        borderRadius: 36,
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 30,
          overflow: "hidden",
          aspectRatio: "9 / 18",
          display: "flex",
          flexDirection: "column",
          padding: "14px 12px",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Screen({ n }: { n: string }) {
  if (n === "01") {
    return (
      <div style={{ display: "grid", gap: 7, alignContent: "start" }}>
        {MODULES.map((m, i) => (
          <div
            key={m}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              padding: "9px 10px",
              borderRadius: 12,
              background: i < 2 ? "var(--color-accent-100)" : "var(--color-neutral-100)",
              fontFamily: "var(--font-heading)",
              fontWeight: 600,
              fontSize: 10.5,
              color: i < 2 ? "var(--color-accent-800)" : "var(--color-text)",
            }}
          >
            {m}
            <span
              aria-hidden="true"
              style={{
                width: 20,
                height: 11,
                borderRadius: 999,
                flex: "none",
                background: i < 2 ? "var(--color-accent)" : "var(--color-neutral-300)",
                position: "relative",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: i < 2 ? 11 : 2,
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "#fff",
                }}
              />
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (n === "02") {
    return (
      <div style={{ display: "grid", gap: 6, alignContent: "start" }}>
        {THREAD.map((m, i) => (
          <div
            key={i}
            style={{
              justifySelf: m.mine ? "end" : "start",
              maxWidth: "88%",
              padding: "7px 10px",
              borderRadius: 12,
              fontSize: 10.5,
              lineHeight: 1.45,
              background: m.mine ? "var(--color-accent)" : "var(--color-neutral-200)",
              color: m.mine ? "#fff" : "var(--color-text)",
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 9, alignContent: "start" }}>
      {BARS.map((b) => (
        <div key={b.day} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: 9.5,
              width: 24,
              flex: "none",
              color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
            }}
          >
            {b.day}
          </span>
          <span style={{ flex: 1, height: 9, borderRadius: 999, background: "var(--color-neutral-200)", overflow: "hidden" }}>
            {/* Motion.tsx reads --bar and animates width from 0 to it. */}
            <span
              data-bar=""
              style={
                {
                  display: "block",
                  height: "100%",
                  borderRadius: 999,
                  background: "var(--color-accent)",
                  width: `${b.pct}%`,
                  "--bar": `${b.pct}%`,
                } as React.CSSProperties
              }
            />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceCards() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(280px,100%),1fr))", gap: 18 }}>
      {CARDS.map((c) => (
        <div
          key={c.n}
          data-anim="rise"
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-divider)",
            borderRadius: 28,
            boxShadow: "var(--shadow-sm)",
            padding: "clamp(24px,3vw,36px) clamp(20px,2.6vw,32px) clamp(26px,3vw,36px)",
          }}
        >
          <div style={{ position: "relative", padding: "18px 0 22px" }}>
            {/* Rotated tinted backdrop the phone sits on. Decorative only. */}
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: "6% 12%",
                background: c.tint,
                borderRadius: 34,
                transform: "rotate(-4deg)",
                opacity: 0.7,
              }}
            />
            <PhoneShell>
              <Screen n={c.n} />
            </PhoneShell>
          </div>
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.14em",
              color: "var(--color-accent)",
              margin: "0 0 10px",
            }}
          >
            {c.n}
          </p>
          <h3 style={{ fontSize: 21, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{c.title}</h3>
          <p
            style={{
              fontSize: 14.5,
              lineHeight: "25px",
              margin: 0,
              color: "color-mix(in srgb, var(--color-text) 78%, transparent)",
            }}
          >
            {c.body}
          </p>
        </div>
      ))}
    </div>
  );
}
