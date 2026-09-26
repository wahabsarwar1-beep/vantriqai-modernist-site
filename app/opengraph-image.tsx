import { ImageResponse } from "next/og";

/**
 * The card a shared link renders as.
 *
 * The Twitter card is declared summary_large_image, which without an image
 * is just a bare link — so this generates one at build time rather than
 * leaving the meta tag pointing at nothing. Both region trees inherit it,
 * since /global is a segment below this one.
 *
 * Drawn rather than photographed: the palette is the site's, and no font
 * file has to ship for it to build.
 */
export const alt = "VantriqAI — AI agents that answer, qualify and book your customers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#16151a";
const CREAM = "#fbf9f6";
const COBALT = "#2f56d9";
const TERRACOTTA = "#e0854f";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CREAM,
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* The hero wash, flattened to two corners. */}
        <div
          style={{
            position: "absolute",
            top: -220,
            right: -180,
            width: 640,
            height: 640,
            borderRadius: 999,
            background: TERRACOTTA,
            opacity: 0.18,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -360,
            left: -280,
            width: 660,
            height: 660,
            borderRadius: 999,
            background: COBALT,
            opacity: 0.13,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", width: 40, height: 40, borderRadius: 10, background: INK }} />
          {/* Two flex items, not text + span: satori lays a word-space between a
              text node and a sibling element. gap 0 keeps the lockup tight. */}
          <div style={{ display: "flex", gap: 0, fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>
            <div style={{ display: "flex", color: INK }}>Vantriq</div>
            {/* Pulled back by a space: satori lays one between sibling flex
                items, and the lockup is a single word. */}
            <div style={{ display: "flex", color: COBALT, marginLeft: -5 }}>AI</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 960 }}>
            AI agents that answer your
          </div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: COBALT, lineHeight: 1.05, letterSpacing: -2.5 }}>
            customers instantly.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: INK, opacity: 0.72, marginTop: 28, maxWidth: 900, lineHeight: 1.35 }}>
            WhatsApp, Instagram and your website — replying, qualifying and booking, 24 hours a day.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 12, height: 12, borderRadius: 999, background: "#25c16a" }} />
          <div style={{ display: "flex", fontSize: 24, color: INK, opacity: 0.6, letterSpacing: 1 }}>
            vantriqai.com
          </div>
        </div>
      </div>
    ),
    size,
  );
}
