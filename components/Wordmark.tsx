export default function Wordmark({ bold = true }: { bold?: boolean }) {
  return (
    <span style={{ fontWeight: bold ? 800 : "inherit" }}>
      Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span>
    </span>
  );
}
