type BrandNameProps = {
  inkColor?: string;
};

/** "VantriqAI" set in the logo's colors — Vantriq in ink, AI in the accent. */
export default function BrandName({ inkColor = "inherit" }: BrandNameProps) {
  return (
    <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800 }}>
      <span style={{ color: inkColor }}>Vantriq</span>
      <span style={{ color: "var(--color-accent)" }}>AI</span>
    </span>
  );
}
