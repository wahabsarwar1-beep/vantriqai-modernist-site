import type { ReactNode } from "react";

/**
 * Marks for menu items that are not product modules: every industry, every
 * package, every guide and the "before you buy" tools.
 *
 * Drawn in the same language as the product marks (components/ProductMark):
 * flat geometric shapes in cream on an ink tile, with one detail picked out
 * in the accent — so an industry sits next to a module and reads as the
 * same family. Packages share one mark, a six-step ladder, with the steps up
 * to that package lit, so the tiers read as a climb.
 */
export type GlyphId =
  | "ecommerce-retail"
  | "finance-insurance"
  | "real-estate"
  | "healthcare"
  | "education"
  | "hospitality"
  | "legal-consulting"
  | "travel-tourism"
  | "hr-operations"
  | "marketing-agencies"
  | "logistics"
  | "starter"
  | "growth"
  | "scale"
  | "pro"
  | "enterprise"
  | "enterprise-plus"
  | "find"
  | "compare"
  | "questions"
  | "guide-speed"
  | "guide-compare"
  | "guide-checklist"
  | "guides";

const BG = "var(--color-bg)";
const AC = "var(--color-accent)";
const TIERS = ["starter", "growth", "scale", "pro", "enterprise", "enterprise-plus"];

/** Six rising steps; the ones up to this package are lit, its own in accent. */
function Ladder({ level }: { level: number }) {
  return (
    <>
      {Array.from({ length: 6 }, (_, i) => {
        const h = 10 + i * 6.4;
        return <rect key={i} x={4 + i * 7} y={44 - h} width="5" height={h} fill={i === level ? AC : BG} opacity={i <= level ? 1 : 0.22} />;
      })}
    </>
  );
}

function Glyph({ id }: { id: GlyphId }): ReactNode {
  const tier = TIERS.indexOf(id);
  if (tier !== -1) return <Ladder level={tier} />;
  switch (id) {
    case "ecommerce-retail":
      // A shopping bag, its handle in accent.
      return (
        <>
          <path d="M7 16h34l-3 28H10z" fill={BG} />
          <path d="M16 18v-6a8 8 0 0 1 16 0v6" stroke={AC} strokeWidth="4" fill="none" />
        </>
      );
    case "finance-insurance":
      // A shield holding the coin it protects.
      return (
        <>
          <path d="M24 3l19 7v12c0 11-8 19-19 23C13 41 5 33 5 22V10z" fill={BG} />
          <circle cx="24" cy="23" r="7" fill={AC} />
        </>
      );
    case "real-estate":
      // A house with the door open in accent.
      return (
        <>
          <path d="M24 4l20 17v23H4V21z" fill={BG} />
          <rect x="19" y="29" width="10" height="15" fill={AC} />
        </>
      );
    case "healthcare":
      // A cross, the centre lit.
      return (
        <>
          <path d="M17 4h14v13h13v14H31v13H17V31H4V17h13z" fill={BG} />
          <rect x="19" y="19" width="10" height="10" fill={AC} />
        </>
      );
    case "education":
      // A mortarboard with its tassel.
      return (
        <>
          <path d="M24 6l22 11-22 11L2 17z" fill={BG} />
          <path d="M11 24v11c3 4 8 6 13 6s10-2 13-6V24l-13 6.5z" fill={BG} opacity=".55" />
          <rect x="40" y="18" width="4" height="16" fill={AC} />
        </>
      );
    case "hospitality":
      // A cup, steam rising in accent.
      return (
        <>
          <path d="M5 20h30v8a14 14 0 0 1-14 14h-2A14 14 0 0 1 5 28z" fill={BG} />
          <path d="M35 23h3a6 6 0 0 1 0 12h-4" stroke={BG} strokeWidth="4" fill="none" />
          <rect x="12" y="5" width="4" height="10" fill={AC} />
          <rect x="21" y="3" width="4" height="12" fill={AC} />
        </>
      );
    case "legal-consulting":
      // Scales: pillar and beam, the pans in accent.
      return (
        <>
          <rect x="22" y="6" width="4" height="34" fill={BG} />
          <rect x="6" y="10" width="36" height="4" fill={BG} />
          <rect x="12" y="40" width="24" height="5" fill={BG} />
          <path d="M3 26h14a7 7 0 0 1-14 0zM31 26h14a7 7 0 0 1-14 0z" fill={AC} />
        </>
      );
    case "travel-tourism":
      // A plane heading up and right, its trail in accent.
      return (
        <>
          <path d="M44 6c2 2 0 6-3 9l-7 7 4 17-4 4-8-13-7 7v6l-3 3-3-8-8-3 3-3h6l7-7-13-8 4-4 17 4 7-7c3-3 7-5 9-3z" fill={BG} />
          <rect x="4" y="39" width="12" height="4" fill={AC} transform="rotate(-45 10 41)" />
        </>
      );
    case "hr-operations":
      // Two colleagues, one in accent.
      return (
        <>
          <circle cx="17" cy="14" r="8" fill={BG} />
          <path d="M3 44c0-10 6-17 14-17s14 7 14 17z" fill={BG} />
          <circle cx="35" cy="17" r="6" fill={AC} />
          <path d="M28 44c0-6 1-11 7-15 6 1 10 7 10 15z" fill={AC} />
        </>
      );
    case "marketing-agencies":
      // A megaphone, its sound in accent.
      return (
        <>
          <path d="M4 18h10l18-12v36L14 30H4z" fill={BG} />
          <rect x="9" y="30" width="7" height="12" fill={BG} opacity=".55" />
          <rect x="37" y="15" width="4" height="18" fill={AC} />
        </>
      );
    case "logistics":
      // A truck, wheels in accent.
      return (
        <>
          <rect x="2" y="9" width="28" height="24" fill={BG} />
          <path d="M30 17h9l7 8v8H30z" fill={BG} />
          <circle cx="11" cy="37" r="5" fill={AC} />
          <circle cx="37" cy="37" r="5" fill={AC} />
        </>
      );
    case "find":
      // A magnifier, the lens lit.
      return (
        <>
          <path d="M20 3a17 17 0 1 1 0 34 17 17 0 0 1 0-34zm0 7a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill={BG} />
          <circle cx="20" cy="20" r="6" fill={AC} />
          <rect x="31" y="29" width="8" height="18" fill={BG} transform="rotate(-45 35 38)" />
        </>
      );
    case "compare":
      // Two columns, one row lit across both.
      return (
        <>
          <rect x="4" y="4" width="17" height="40" fill={BG} />
          <rect x="27" y="4" width="17" height="40" fill={BG} />
          <rect x="4" y="20" width="40" height="8" fill={AC} />
        </>
      );
    case "questions":
      // A speech bubble with the question mark's dot in accent.
      return (
        <>
          <path d="M4 5h40v28H24l-10 10V33H4z" fill={BG} />
          <rect x="21" y="25" width="6" height="6" fill={AC} />
          <path d="M18 16a6 6 0 0 1 12 0c0 3-3 4-4 5" stroke="var(--color-text)" strokeWidth="4" fill="none" />
        </>
      );
    case "guide-speed":
      // A stopwatch, the hand in accent.
      return (
        <>
          <rect x="19" y="2" width="10" height="5" fill={BG} />
          <path d="M24 8a18 18 0 1 1 0 36 18 18 0 0 1 0-36zm0 6a12 12 0 1 0 0 24 12 12 0 0 0 0-24z" fill={BG} />
          <path d="M22 26l8-9 3 3-9 8z" fill={AC} />
        </>
      );
    case "guide-compare":
      // Two conversations side by side, the business one in accent.
      return (
        <>
          <path d="M3 5h26v19H14l-7 7v-7H3z" fill={BG} />
          <path d="M19 20h26v19h-4v7l-7-7H19z" fill={AC} />
        </>
      );
    case "guide-checklist":
      // A page of ticked rows, the last tick in accent.
      return (
        <>
          <rect x="7" y="3" width="34" height="42" fill={BG} />
          <rect x="13" y="11" width="6" height="6" fill="var(--color-text)" />
          <rect x="23" y="12" width="12" height="4" fill="var(--color-text)" opacity=".5" />
          <rect x="13" y="21" width="6" height="6" fill="var(--color-text)" />
          <rect x="23" y="22" width="12" height="4" fill="var(--color-text)" opacity=".5" />
          <rect x="13" y="31" width="6" height="6" fill={AC} />
          <rect x="23" y="32" width="12" height="4" fill="var(--color-text)" opacity=".5" />
        </>
      );
    case "guides":
    default:
      return (
        <>
          <rect x="4" y="6" width="18" height="36" fill={BG} />
          <rect x="26" y="6" width="18" height="36" fill={AC} />
        </>
      );
  }
}

/** Same tile as ProductMark: ink field, rounded to a third of its size. */
export default function MenuGlyph({ id, size = 30 }: { id: GlyphId; size?: number }) {
  return (
    <span aria-hidden="true" className="mglyph" style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }}>
      <svg width={Math.round(size * 0.58)} height={Math.round(size * 0.58)} viewBox="0 0 48 48">
        <Glyph id={id} />
      </svg>
    </span>
  );
}
