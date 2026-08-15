type BrandNameProps = {
  inkColor?: string;
};

/** "VentriqAI" set in the logo's colors — Ventriq in ink, AI in the accent. */
export default function BrandName({ inkColor = "inherit" }: BrandNameProps) {
  return (
    <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800 }}>
      <span style={{ color: inkColor }}>Ventriq</span>
      <span style={{ color: "var(--color-accent)" }}>AI</span>
    </span>
  );
}
