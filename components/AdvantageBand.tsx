import { TILES_BACK, TILES_FRONT, type Tile } from "@/lib/home-data";

/** One tile in the band. Sizes differ between rows, so they come in as props
 *  rather than being baked into the tile itself. */
function BandTile({ tile, size, radius, pad }: { tile: Tile; size: number; radius: number; pad: number }) {
  const shell = {
    flex: "none" as const,
    boxSizing: "border-box" as const,
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "flex-end" as const,
    overflow: "hidden",
    width: size,
    height: size,
    padding: pad,
    borderRadius: radius,
    boxShadow: "var(--shadow-md)",
  };

  if (tile.kind === "bubble") {
    return (
      <div style={{ ...shell, background: "var(--color-text)", color: "var(--color-bg)" }}>
        <span
          style={{
            marginBottom: "auto",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--color-accent-400)",
          }}
        >
          {tile.who}
        </span>
        <p style={{ margin: 0, fontSize: size > 200 ? 15 : 12.5, lineHeight: 1.45 }}>{tile.text}</p>
      </div>
    );
  }

  if (tile.kind === "list") {
    return (
      <div style={{ ...shell, background: "var(--color-surface)", border: "1px solid var(--color-divider)" }}>
        <p
          style={{
            margin: "0 0 auto",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 9.5,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
          }}
        >
          {tile.label}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {tile.items.map((it) => (
            <span
              key={it}
              style={{
                fontFamily: "var(--font-heading)",
                fontWeight: 600,
                fontSize: 10,
                padding: "4px 9px",
                borderRadius: 999,
                background: "var(--color-accent-100)",
                color: "var(--color-accent-700)",
              }}
            >
              {it}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const tone =
    tile.tone === "accent"
      ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" }
      : tile.tone === "ink"
        ? { background: "var(--color-accent)", color: "#fff" }
        : { background: "var(--color-surface)", color: "var(--color-text)", border: "1px solid var(--color-divider)" };

  return (
    <div style={{ ...shell, ...tone }}>
      {tile.chip && (
        <span
          style={{
            alignSelf: "flex-start",
            marginBottom: "auto",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: 10.5,
            letterSpacing: "0.04em",
            padding: "6px 11px",
            borderRadius: 999,
            background: "color-mix(in srgb, currentColor 14%, transparent)",
            color: "inherit",
          }}
        >
          {tile.chip}
        </span>
      )}
      <p
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          letterSpacing: "-0.035em",
          lineHeight: 0.95,
          margin: 0,
          fontSize: size > 200 ? 52 : 38,
        }}
      >
        {tile.fig}
      </p>
      <p
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: size > 200 ? 10.5 : 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          margin: "10px 0 0",
          opacity: 0.72,
        }}
      >
        {tile.label}
      </p>
    </div>
  );
}

/** A marquee row. The list is rendered twice so the -50% translate loops
 *  seamlessly; the duplicate is hidden from assistive tech. */
function BandRow({
  tiles,
  size,
  radius,
  pad,
  seconds,
  reverse,
}: {
  tiles: Tile[];
  size: number;
  radius: number;
  pad: number;
  seconds: number;
  reverse?: boolean;
}) {
  const set = (hidden?: boolean) => (
    <div style={{ display: "flex", gap: 16 }} aria-hidden={hidden || undefined}>
      {tiles.map((tile, i) => (
        <BandTile key={i} tile={tile} size={size} radius={radius} pad={pad} />
      ))}
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        width: "max-content",
        gap: 16,
        animation: `${reverse ? "marquee-rev" : "marquee"} ${seconds}s linear infinite`,
        willChange: "transform",
      }}
    >
      {set()}
      {set(true)}
    </div>
  );
}

/** The "Vantriq's advantage" stage: a phone mockup standing in front of a
 *  viewport-wide, slightly rotated band of tiles that scroll in opposite
 *  directions. The band is decorative — it is hidden from assistive tech, and
 *  CSS drops it entirely below 760px and under reduced motion. */
export default function AdvantageBand() {
  return (
    <div
      data-anim="rise"
      style={{
        position: "relative",
        display: "grid",
        justifyItems: "center",
        alignContent: "center",
        minHeight: "clamp(400px,42vw,520px)",
      }}
    >
      <div
        data-tileband=""
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "50%",
          left: "calc(50% - 50vw)",
          width: "100vw",
          transform: "translateY(-50%)",
          zIndex: 0,
          overflow: "hidden",
          padding: "clamp(20px,3vw,34px) 0",
          pointerEvents: "none",
          // Symmetrical fade so the band dissolves at both edges instead of
          // being chopped off by the viewport.
          maskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)",
        }}
      >
        <div style={{ display: "grid", gap: 16, transform: "rotate(-2deg)" }}>
          <BandRow tiles={TILES_FRONT} size={236} radius={34} pad={20} seconds={64} />
          <div style={{ opacity: 0.6, filter: "saturate(.9)" }}>
            <BandRow tiles={TILES_BACK} size={172} radius={26} pad={15} seconds={82} reverse />
          </div>
        </div>
      </div>

      {/* The phone sits above the band on z-index, so the tiles pass behind it. */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 296,
          justifySelf: "center",
          background: "var(--color-neutral-900)",
          border: "1px solid var(--color-neutral-800)",
          padding: 8,
          borderRadius: 46,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          style={{
            position: "relative",
            background: "var(--color-surface)",
            borderRadius: 38,
            overflow: "hidden",
            aspectRatio: "9 / 17",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 26px 10px",
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
              fontSize: 12.5,
              letterSpacing: "-0.01em",
            }}
          >
            <span>9:41</span>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }} aria-hidden="true">
              <span style={{ width: 15, height: 9, border: "1.5px solid var(--color-text)", borderRadius: 2, display: "block" }} />
              <span style={{ width: 4, height: 9, background: "var(--color-text)", borderRadius: 1, display: "block" }} />
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              padding: "8px 16px 12px",
              borderBottom: "1px solid var(--color-divider)",
            }}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: "var(--color-accent)",
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontFamily: "var(--font-heading)",
                fontWeight: 800,
                fontSize: 12,
              }}
              aria-hidden="true"
            >
              V
            </span>
            <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12.5 }}>VantriqAI</span>
              <span style={{ fontSize: 10, color: "var(--color-accent-700)" }}>online</span>
            </span>
          </div>
          <div style={{ flex: 1, display: "grid", gap: 8, alignContent: "start", padding: "14px 12px" }}>
            {[
              { side: "start", text: "Is the black leather sofa in stock?", mine: false },
              { side: "end", text: "Yes — in stock. Shall I hold one for you?", mine: true },
              { side: "start", text: "Can I see it tomorrow evening?", mine: false },
              { side: "end", text: "Booked: tomorrow 18:30. Reminder set.", mine: true },
            ].map((msg, i) => (
              <div
                key={i}
                style={{
                  justifySelf: msg.side as "start" | "end",
                  maxWidth: "86%",
                  padding: "8px 11px",
                  borderRadius: 14,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  background: msg.mine ? "var(--color-accent)" : "var(--color-neutral-200)",
                  color: msg.mine ? "#fff" : "var(--color-text)",
                }}
              >
                {msg.text}
              </div>
            ))}
          </div>
          <div style={{ padding: "0 12px 14px" }}>
            <div
              style={{
                border: "1px solid var(--color-divider)",
                borderRadius: 999,
                padding: "8px 14px",
                fontSize: 11,
                color: "color-mix(in srgb, var(--color-text) 42%, transparent)",
              }}
            >
              Message…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
