type BrandNameProps = {
  inkColor?: string;
};

/** "VantriqAI" set in the logo's colors and case — Vantriq in ink, AI in the
 *  accent — immune to any ancestor's text-transform (e.g. uppercase
 *  kickers/footers), so it always matches the logo exactly. */
export default function BrandName({ inkColor = "inherit" }: BrandNameProps) {
  return (
    <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, textTransform: "none" }}>
      <span style={{ color: inkColor }}>Vantriq</span>
      <span style={{ color: "var(--color-accent)" }}>AI</span>
    </span>
  );
}
