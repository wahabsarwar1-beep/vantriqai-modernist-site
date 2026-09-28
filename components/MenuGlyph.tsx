import type { CSSProperties, ReactNode } from "react";

/**
 * Line icons for menu items that are not product modules: every industry,
 * every package and every guide, plus the "before you buy" tools. Drawn on
 * a gradient tile in the item's own colours — an industry uses the pair its
 * page is themed in — so each row reads at a glance instead of as a letter.
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

const P: Record<GlyphId, ReactNode> = {
  "ecommerce-retail": (
    <>
      <path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  "finance-insurance": (
    <>
      <path d="M12 3l7 2.8v5.4c0 4.3-3 7.8-7 9.3-4-1.5-7-5-7-9.3V5.8z" />
      <path d="M12 8v8M14.2 9.6c-.4-.7-1.2-1.1-2.2-1.1-1.3 0-2.2.7-2.2 1.7 0 2.4 4.6 1.2 4.6 3.6 0 1-1 1.7-2.4 1.7-1 0-1.9-.4-2.3-1.2" />
    </>
  ),
  "real-estate": (
    <>
      <path d="M3.5 11L12 4l8.5 7" />
      <path d="M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  healthcare: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  education: (
    <>
      <path d="M2.5 9.5L12 5l9.5 4.5L12 14z" />
      <path d="M6.5 11.5V16c1.5 1.4 3.3 2 5.5 2s4-.6 5.5-2v-4.5M21.5 9.5v5" />
    </>
  ),
  hospitality: (
    <>
      <path d="M4 10h13v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z" />
      <path d="M17 11h1.5a2.5 2.5 0 0 1 0 5H16.5M8 3.5c-.8 1 .8 2 0 3M12 3.5c-.8 1 .8 2 0 3" />
    </>
  ),
  "legal-consulting": (
    <>
      <path d="M12 4v16M7 20h10M5 7h14" />
      <path d="M5 7l-2.5 6a2.8 2.8 0 0 0 5 0zM19 7l-2.5 6a2.8 2.8 0 0 0 5 0z" />
    </>
  ),
  "travel-tourism": (
    <>
      <path d="M10.5 13.5L4 11l1.5-1.5 7 .5L17 5.5a1.8 1.8 0 0 1 2.5 2.5L15 12.5l.5 7L14 21l-2.5-6.5" />
      <path d="M8 16l-3 3" />
    </>
  ),
  "hr-operations": (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.5-3 2.7-5 5.5-5s5 2 5.5 5" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M16 14.2c2.3.2 4 1.9 4.5 4.3" />
    </>
  ),
  "marketing-agencies": (
    <>
      <path d="M4 10v4h3l7 4.5v-13L7 10z" />
      <path d="M17.5 9a4 4 0 0 1 0 6M7 14l1 5h2.5l-1-4.2" />
    </>
  ),
  logistics: (
    <>
      <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </>
  ),
  starter: (
    <>
      <path d="M12 20v-8" />
      <path d="M12 12c0-3.5-2.5-6-6.5-6 0 3.5 2.5 6 6.5 6zM12 14c0-3 2-5.5 6-5.5 0 3-2 5.5-6 5.5z" />
    </>
  ),
  growth: (
    <>
      <path d="M3.5 17l5.5-5.5 4 4L20.5 8" />
      <path d="M15 8h5.5v5.5" />
    </>
  ),
  scale: (
    <>
      <path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z" />
      <path d="M3.5 12l8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" />
    </>
  ),
  pro: (
    <>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </>
  ),
  enterprise: (
    <>
      <path d="M4 20V6.5L12 3.5v16.5M12 9h8v11" />
      <path d="M7 8h2M7 11.5h2M7 15h2M15 12.5h2M15 16h2M2.5 20h19" />
    </>
  ),
  "enterprise-plus": (
    <>
      <path d="M3.5 8l4 3.5L12 5l4.5 6.5 4-3.5-2 10h-13z" />
      <path d="M6 20.5h12" />
    </>
  ),
  find: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" />
    </>
  ),
  compare: (
    <>
      <rect x="3.5" y="4" width="7" height="16" rx="2" />
      <rect x="13.5" y="4" width="7" height="16" rx="2" />
      <path d="M6 8.5h2M6 12h2M16 8.5h2M16 12h2" />
    </>
  ),
  questions: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2-2.4 3.5M12 17h.01" />
    </>
  ),
  "guide-speed": (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 13l3-3M10 3h4M12 3v2.5" />
    </>
  ),
  "guide-compare": (
    <>
      <path d="M4.5 19.5l1.2-3.6A7.5 7.5 0 1 1 8.4 18.6z" />
      <path d="M9 11.5h6M9 14h3.5" />
    </>
  ),
  "guide-checklist": (
    <>
      <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" />
      <path d="M8 9l1.5 1.5L12 8M8 14.5l1.5 1.5L12 13.5M14.5 9.5H16.5M14.5 15H16.5" />
    </>
  ),
  guides: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </>
  ),
};

export default function MenuGlyph({ id, tint, size = 30 }: { id: GlyphId; tint?: [string, string]; size?: number }) {
  const [a, b] = tint ?? ["#2f56d9", "#7a5bd6"];
  return (
    <span aria-hidden="true" className="mglyph" style={{ "--ga": a, "--gb": b, width: size, height: size } as CSSProperties}>
      <svg width={Math.round(size * 0.56)} height={Math.round(size * 0.56)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {P[id]}
      </svg>
    </span>
  );
}
