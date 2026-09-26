export type ColumnIconId = "channels" | "capabilities" | "deployment" | "sectors" | "tiers" | "guides";

/**
 * A glyph for a menu column heading.
 *
 * Deliberately not the product marks: those are filled tiles that belong to a
 * single module, and thirteen of them stacked beside headings would compete
 * with the items underneath. These are line drawings on a tinted disc — a
 * label for the group, quiet enough that the module names stay the loudest
 * thing in the column.
 */
const GLYPHS: Record<ColumnIconId, React.ReactNode> = {
  channels: (
    <>
      <path d="M4 6.5A2.5 2.5 0 016.5 4h7A2.5 2.5 0 0116 6.5v4A2.5 2.5 0 0113.5 13H9l-3.4 2.6a.5.5 0 01-.8-.4V13h-.3A2.5 2.5 0 014 10.5z" />
      <path d="M18 9h.5A2.5 2.5 0 0121 11.5v4A2.5 2.5 0 0118.5 18H18v1.9a.5.5 0 01-.8.4L14 17.7" />
    </>
  ),
  capabilities: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  deployment: (
    <>
      <path d="M12 3.5l7 2.6v5.2c0 4.2-2.9 7.6-7 9.2-4.1-1.6-7-5-7-9.2V6.1z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </>
  ),
  sectors: (
    <>
      <path d="M4 20V8.5l6-3.5v5l6-3v5l4-2V20z" />
      <path d="M9 20v-4h4v4" />
    </>
  ),
  tiers: (
    <>
      <path d="M4.5 19.5v-4M10 19.5v-8M15.5 19.5v-12M21 19.5v-16" />
    </>
  ),
  guides: (
    <>
      <path d="M5 5.5A1.5 1.5 0 016.5 4H13l5 5v9.5A1.5 1.5 0 0116.5 20h-10A1.5 1.5 0 015 18.5z" />
      <path d="M13 4v5h5M8.5 13h7M8.5 16.5h4.5" />
    </>
  ),
};

export default function ColumnIcon({ id }: { id: ColumnIconId }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "grid",
        placeItems: "center",
        width: 26,
        height: 26,
        flex: "none",
        borderRadius: 9,
        background: "var(--color-accent-100)",
        color: "var(--color-accent-700)",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
        {GLYPHS[id]}
      </svg>
    </span>
  );
}
