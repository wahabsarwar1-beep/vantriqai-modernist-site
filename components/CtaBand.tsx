import { waLink } from "@/lib/whatsapp";

type CtaBandProps = {
  heading: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
  secondaryHref: string;
};

export default function CtaBand({
  heading,
  body,
  primaryLabel,
  secondaryLabel,
  secondaryHref,
}: CtaBandProps) {
  // A poster, not a full-bleed band: inset from the page edges and rounded to
  // 44px, so it reads as the last card on the page rather than a new section.
  return (
    <section
      style={{
        background: "var(--color-accent)",
        color: "var(--color-bg)",
        overflow: "hidden",
        borderRadius: 44,
        margin: "clamp(8px,2vw,20px) clamp(12px,3vw,28px) clamp(28px,4vw,48px)",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(38px,5vw,68px) clamp(20px,5vw,64px)" }}>
        <h2
          style={{
            fontSize: "clamp(32px,5.5vw,64px)",
            lineHeight: 0.94,
            letterSpacing: "-0.035em",
            margin: "0 0 28px",
            color: "var(--color-bg)",
            overflowWrap: "break-word",
          }}
        >
          <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
            <span data-line="" style={{ display: "block" }}>
              {heading}
            </span>
          </span>
        </h2>
        <p data-anim="rise" style={{ fontSize: 17, lineHeight: "29px", margin: "0 0 34px", maxWidth: "50ch", color: "var(--color-bg)" }}>
          {body}
        </p>
        <div data-anim="rise" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            className="btn cta-btn-ink"
            href={waLink()}
            target="_blank"
            rel="noopener"
            style={{ minHeight: 52, paddingInline: 24, fontSize: 15 }}
          >
            {primaryLabel}
          </a>
          <a
            className="btn cta-btn-outline"
            href={secondaryHref}
            style={{ minHeight: 52, paddingInline: 24, fontSize: 15 }}
          >
            {secondaryLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
