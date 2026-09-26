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

/**
 * The closing stage of every inner page — the same dark aurora the home page
 * ends on, so each page finishes on one consistent, unmistakable next step.
 */
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
    <section className="future-cta" style={{ marginTop: "clamp(8px,2vw,20px)" }}>
      <div aria-hidden="true" className="future-cta-aurora" />
      <div aria-hidden="true" className="hh-grid" />
      <div style={{ position: "relative", maxWidth: 1280, margin: "0 auto", padding: "clamp(48px,6.4vw,92px) clamp(20px,5vw,64px)" }}>
        <p className="hh-eyebrow">
          <span aria-hidden="true" className="hh-live" />
          Replies in seconds, any hour
        </p>
        <h2 style={{ fontSize: "clamp(30px,4.8vw,62px)", lineHeight: 0.98, letterSpacing: "-0.04em", margin: "22px 0 22px", maxWidth: "20ch", color: "#fff" }}>
          <LineReveal>{headline}</LineReveal>
        </h2>
        <p data-anim="" style={{ fontSize: 17.5, lineHeight: "29px", margin: "0 0 34px", maxWidth: "50ch", color: "rgba(255,255,255,.72)" }}>
          {body}
        </p>
        <div data-anim="" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Magnetic>
            {primaryWhatsApp ? (
              <a className="btn hh-btn-primary" href={waLink()} target="_blank" rel="noopener">
                {primaryLabel} <span aria-hidden="true">→</span>
              </a>
            ) : (
              <Link className="btn hh-btn-primary" href={primaryHref}>
                {primaryLabel} <span aria-hidden="true">→</span>
              </Link>
            )}
          </Magnetic>
          <Magnetic>
            <Link className="btn hh-btn-ghost" href={secondaryHref}>
              {secondaryLabel}
            </Link>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
