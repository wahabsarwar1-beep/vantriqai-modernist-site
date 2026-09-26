import { ImageResponse } from "next/og";

/**
 * The card a shared link renders as.
 *
 * The Twitter card is declared summary_large_image, which without an image
 * is just a bare link — so this generates one at build time rather than
 * leaving the meta tag pointing at nothing. Both region trees inherit it,
 * since /global is a segment below this one.
 *
 * The home page's dark stage, flattened: aurora, the glowing core, the
 * channels feeding it. Drawn rather than photographed, so no font or image
 * file has to ship for it to build.
 */
export const alt = "VantriqAI — AI agents that answer, qualify and book your customers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const NIGHT = "#07070d";
const LIGHT_COBALT = "#a9bbf7";
const PEACH = "#f3b38b";

const CHIPS = [
  { label: "WhatsApp", x: 700, y: 150 },
  { label: "Instagram", x: 745, y: 450 },
  { label: "Calendar", x: 1010, y: 190 },
  { label: "CRM", x: 1040, y: 430 },
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: NIGHT,
          backgroundImage:
            "radial-gradient(circle at 12% 18%, rgba(47,86,217,.55) 0%, rgba(7,7,13,0) 42%), radial-gradient(circle at 88% 14%, rgba(122,91,214,.45) 0%, rgba(7,7,13,0) 38%), radial-gradient(circle at 78% 96%, rgba(224,133,79,.4) 0%, rgba(7,7,13,0) 40%)",
          padding: "64px 72px",
          color: "#fff",
        }}
      >
        {/* The core, with two rings and the channels around it. */}
        <div style={{ position: "absolute", left: 790, top: 205, width: 220, height: 220, display: "flex", borderRadius: 999, border: "1px solid rgba(169,187,247,.25)" }} />
        <div style={{ position: "absolute", left: 750, top: 165, width: 300, height: 300, display: "flex", borderRadius: 999, border: "1px solid rgba(169,187,247,.12)" }} />
        <div
          style={{
            position: "absolute",
            left: 835,
            top: 250,
            width: 130,
            height: 130,
            display: "flex",
            borderRadius: 999,
            backgroundImage: "radial-gradient(circle at 35% 30%, #c5d2ff 0%, #5a7cf0 32%, #2f56d9 58%, #1b1f5c 100%)",
            boxShadow: "0 0 80px rgba(90,124,240,.85)",
          }}
        />
        {CHIPS.map((c) => (
          <div
            key={c.label}
            style={{
              position: "absolute",
              left: c.x,
              top: c.y,
              display: "flex",
              padding: "10px 18px",
              borderRadius: 14,
              fontSize: 22,
              fontWeight: 700,
              color: "rgba(255,255,255,.88)",
              background: "rgba(20,20,34,.9)",
              border: "1px solid rgba(255,255,255,.18)",
            }}
          >
            {c.label}
          </div>
        ))}

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 640, height: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 38, height: 38, borderRadius: 10, background: "#fff" }} />
            {/* Two flex items, not text + span: satori lays a word-space between
                a text node and a sibling element, so the second is pulled back. */}
            <div style={{ display: "flex", gap: 0, fontSize: 32, fontWeight: 700, letterSpacing: -1 }}>
              <div style={{ display: "flex", color: "#fff" }}>Vantriq</div>
              <div style={{ display: "flex", color: LIGHT_COBALT, marginLeft: -5 }}>AI</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2.5, whiteSpace: "nowrap" }}>Never miss another</div>
            <div style={{ display: "flex", fontSize: 66, fontWeight: 700, lineHeight: 1.04, letterSpacing: -2.5, color: LIGHT_COBALT, whiteSpace: "nowrap" }}>customer message.</div>
            <div style={{ display: "flex", fontSize: 25, marginTop: 26, lineHeight: 1.4, maxWidth: 540, color: "rgba(255,255,255,.7)" }}>
              AI agents that reply, qualify and book on WhatsApp, Instagram, your website and the phone — every hour.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#3ddc84" }} />
            <div style={{ display: "flex", fontSize: 22, letterSpacing: 1, color: PEACH }}>vantriqai.com</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
