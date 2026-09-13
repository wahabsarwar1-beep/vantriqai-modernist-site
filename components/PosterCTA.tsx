import Link from "next/link";
import LineReveal from "@/components/LineReveal";
import Magnetic from "@/components/Magnetic";
import { waLink } from "@/lib/whatsapp";

type PosterCTAProps = {
  headline: string;
  body: string;
  primaryLabel: string;
  primaryWhatsApp?: boolean;
  primaryHref?: string;
  secondaryLabel: string;
  secondaryHref: string;
};

const actionStyle = {
  minHeight: 52,
  paddingInline: 22,
  fontSize: 15,
  justifyContent: "center" as const,
};

export default function PosterCTA({
  headline,
  body,
  primaryLabel,
  primaryWhatsApp = true,
  primaryHref = "/contact",
  secondaryLabel,
  secondaryHref,
}: PosterCTAProps) {
  return (
    <section
      style={{
        background: "var(--color-accent)",
        color: "var(--color-bg)",
        borderRadius: 44,
        margin: "clamp(8px,2vw,20px) clamp(12px,3vw,28px) clamp(28px,4vw,48px)",
        overflow: "hidden",
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(38px,5vw,68px) clamp(20px,5vw,64px)" }}>
        <h2 style={{ fontSize: "clamp(32px,5.5vw,64px)", lineHeight: 0.94, letterSpacing: "-0.035em", margin: "0 0 28px", color: "var(--color-bg)" }}>
          <LineReveal>{headline}</LineReveal>
        </h2>
        <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: "0 0 34px", maxWidth: "50ch", color: "var(--color-bg)" }}>
          {body}
        </p>
        <div data-anim="" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Magnetic>
            {primaryWhatsApp ? (
              <a className="btn" href={waLink()} target="_blank" rel="noopener" style={{ ...actionStyle, background: "var(--color-text)", color: "var(--color-bg)" }}>
                {primaryLabel}
              </a>
            ) : (
              <Link className="btn" href={primaryHref} style={{ ...actionStyle, background: "var(--color-text)", color: "var(--color-bg)" }}>
                {primaryLabel}
              </Link>
            )}
          </Magnetic>
          <Magnetic>
            <Link className="btn" href={secondaryHref} style={{ ...actionStyle, border: "1px solid var(--color-bg)", color: "var(--color-bg)" }}>
              {secondaryLabel}
            </Link>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
