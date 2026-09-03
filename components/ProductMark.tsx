export type MarkId =
  | "whatsapp"
  | "social"
  | "website"
  | "booking"
  | "catalogue"
  | "lead"
  | "escalation"
  | "followup"
  | "outreach"
  | "payments"
  | "insights"
  | "deployment"
  | "custom";

/** Channels sit on an accent field; capabilities and deployment sit on ink. */
const FIELD_BG: Record<MarkId, string> = {
  whatsapp: "var(--color-accent)",
  social: "var(--color-accent)",
  website: "var(--color-accent)",
  booking: "var(--color-text)",
  catalogue: "var(--color-text)",
  lead: "var(--color-text)",
  escalation: "var(--color-text)",
  followup: "var(--color-text)",
  outreach: "var(--color-text)",
  payments: "var(--color-text)",
  insights: "var(--color-text)",
  deployment: "var(--color-text)",
  custom: "var(--color-text)",
};

function MarkGlyph({ id }: { id: MarkId }) {
  switch (id) {
    case "whatsapp":
      return (
        <>
          <path d="M6 6h36v24H22l-9 9v-9H6z" fill="var(--color-bg)" />
          <rect x="13" y="14" width="9" height="9" fill="var(--color-text)" />
        </>
      );
    case "social":
      return (
        <>
          <rect x="4" y="4" width="25" height="25" fill="var(--color-bg)" />
          <rect x="21" y="21" width="23" height="23" fill="var(--color-text)" />
        </>
      );
    case "website":
      return (
        <>
          <rect x="4" y="7" width="40" height="9" fill="var(--color-bg)" />
          <rect x="4" y="21" width="21" height="20" fill="var(--color-bg)" />
          <path d="M29 21h15v14h-6l-5 5v-5h-4z" fill="var(--color-text)" />
        </>
      );
    case "booking":
      return (
        <>
          <rect x="4" y="6" width="40" height="9" fill="var(--color-bg)" />
          <rect x="4" y="20" width="11" height="10" fill="var(--color-bg)" />
          <rect x="19" y="20" width="11" height="10" fill="var(--color-bg)" />
          <rect x="34" y="20" width="10" height="10" fill="var(--color-accent)" />
          <rect x="4" y="34" width="11" height="10" fill="var(--color-bg)" />
          <rect x="19" y="34" width="11" height="10" fill="var(--color-bg)" />
        </>
      );
    case "catalogue":
      return (
        <>
          <rect x="4" y="6" width="40" height="10" fill="var(--color-bg)" />
          <rect x="4" y="20" width="40" height="10" fill="var(--color-bg)" />
          <rect x="4" y="34" width="25" height="10" fill="var(--color-accent)" />
        </>
      );
    case "lead":
      return (
        <>
          <path d="M4 5h40L29 23v10h-10V23z" fill="var(--color-bg)" />
          <rect x="19" y="37" width="10" height="7" fill="var(--color-accent)" />
        </>
      );
    case "escalation":
      return (
        <>
          <rect x="4" y="12" width="24" height="32" fill="var(--color-bg)" />
          <path d="M28 4h16v16h-7V15l-9 9-5-5 9-9h-4z" fill="var(--color-accent)" />
        </>
      );
    case "followup":
      // A thread reopened: two settled bars, then an accent one returning.
      return (
        <>
          <rect x="4" y="8" width="30" height="9" fill="var(--color-bg)" />
          <rect x="14" y="21" width="30" height="9" fill="var(--color-bg)" />
          <path d="M4 34h22v10H4zm26 5l10-6v12z" fill="var(--color-accent)" />
        </>
      );
    case "outreach":
      // One message fanning out to a segment.
      return (
        <>
          <rect x="4" y="18" width="14" height="12" fill="var(--color-bg)" />
          <rect x="26" y="4" width="18" height="9" fill="var(--color-accent)" />
          <rect x="26" y="19" width="18" height="9" fill="var(--color-bg)" />
          <rect x="26" y="34" width="18" height="9" fill="var(--color-bg)" />
        </>
      );
    case "payments":
      // A card with the paid stripe called out in accent.
      return (
        <>
          <rect x="4" y="9" width="40" height="30" fill="var(--color-bg)" />
          <rect x="4" y="16" width="40" height="7" fill="var(--color-text)" />
          <rect x="9" y="28" width="16" height="6" fill="var(--color-accent)" />
        </>
      );
    case "insights":
      // The Monday digest: three bars, the last one the week's peak.
      return (
        <>
          <rect x="6" y="28" width="9" height="16" fill="var(--color-bg)" />
          <rect x="20" y="18" width="9" height="26" fill="var(--color-bg)" />
          <rect x="34" y="6" width="9" height="38" fill="var(--color-accent)" />
        </>
      );
    case "deployment":
      return (
        <>
          <path fillRule="evenodd" d="M4 4h40v40H4zm10 10h20v20H14z" fill="var(--color-bg)" />
          <rect x="19" y="19" width="10" height="10" fill="var(--color-accent)" />
        </>
      );
    case "custom":
      // The blank module: a frame with the corner still to be filled in.
      return (
        <>
          <path fillRule="evenodd" d="M4 4h26v10H14v16H4zm14 30h16V18h10v26H18z" fill="var(--color-bg)" />
          <rect x="19" y="19" width="10" height="10" fill="var(--color-accent)" />
        </>
      );
  }
}

/** One of the thirteen product marks: a 76x76 rounded field with a 44px filled-SVG glyph. */
export default function ProductMark({ id }: { id: MarkId }) {
  return (
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 76,
        height: 76,
        flex: "none",
        background: FIELD_BG[id],
        borderRadius: 24,
        marginBottom: 24,
      }}
    >
      <svg data-icon="" width="44" height="44" viewBox="0 0 48 48" aria-hidden="true" style={{ display: "block" }}>
        <MarkGlyph id={id} />
      </svg>
    </span>
  );
}
