export default function Kicker({ label, marginBottom = "clamp(20px,3vw,32px)" }: { label: string; marginBottom?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom }}>
      <span
        data-anim=""
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-accent-700)",
          background: "var(--color-accent-100)",
          borderRadius: 999,
          padding: "7px 14px",
          display: "inline-block",
        }}
      >
        {label}
      </span>
      <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
    </div>
  );
}
