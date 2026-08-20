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
  return (
    <section style={{ background: "var(--color-accent)", color: "var(--color-bg)" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(56px,8vw,104px) clamp(20px,5vw,64px)" }}>
        <h2
          style={{
            fontSize: "clamp(32px,5.5vw,64px)",
            lineHeight: 0.94,
            letterSpacing: "-0.035em",
            margin: "0 0 28px",
            color: "var(--color-bg)",
          }}
        >
          {heading}
        </h2>
        <p style={{ fontSize: 17, lineHeight: "29px", margin: "0 0 34px", maxWidth: "50ch", color: "var(--color-bg)" }}>
          {body}
        </p>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          <a
            className="btn cta-btn-ink"
            href={waLink()}
            target="_blank"
            rel="noopener"
            style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "flex-start" }}
          >
            {primaryLabel}
          </a>
          <a
            className="btn cta-btn-outline"
            href={secondaryHref}
            style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "flex-start" }}
          >
            {secondaryLabel}
          </a>
        </div>
      </div>
    </section>
  );
}
