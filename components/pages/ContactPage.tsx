import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";
import Kicker from "@/components/Kicker";
import LineReveal from "@/components/LineReveal";
import Magnetic from "@/components/Magnetic";
import ContactForm from "@/components/ContactForm";
import { waLink } from "@/lib/whatsapp";
import type { Region } from "@/lib/region";

const infoLabel = {
  fontFamily: "var(--font-heading)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
  color: "color-mix(in srgb, var(--color-text) 62%, transparent)",
  margin: "0 0 8px",
};

const INFO_ROWS = [
  { label: "Where we are", body: "Distributed team, global hours — local support wherever you are." },
  {
    label: "Who you’ll speak to",
    body: (
      <>
        The Vantriq<span style={{ color: "var(--color-accent)" }}>AI</span> team — 14+ years experience across enterprise and government collaborations.
      </>
    ),
  },
  { label: "What happens next", body: "A fifteen-minute discovery call, then a fixed setup fee and monthly plan in writing." },
];

export default function ContactPage({ region }: { region: Region }) {
  return (
    <>
      <JsonLd schema={breadcrumbSchema(region, "/contact", "Contact")} />
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section className="stack-mobile" style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(40px,5.2vw,68px)", position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(340px,100%),1fr))", gap: "clamp(40px,6vw,88px)", alignItems: "start" }}>
          <div aria-hidden="true" data-hero-texture="" style={{ position: "absolute", top: "calc(clamp(72px, 7vw, 92px) * -1)", bottom: 0, left: "50%", width: "calc(100vw + 24px)", marginLeft: "calc(-50vw - 12px)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <Kicker label="Contact" />
            <h1 style={{ fontSize: "clamp(32px,4.8vw,60px)", lineHeight: 0.96, letterSpacing: "-0.03em", margin: 0 }}>
              <LineReveal>
                Let&rsquo;s <span style={{ color: "var(--color-accent)" }}>talk.</span>
              </LineReveal>
            </h1>
            <p data-anim="" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "44ch", margin: "28px 0 0" }}>
              The fastest way to reach us is the same channel we build on. Message us and see the agent answer.
            </p>
            <div data-anim="" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <Magnetic>
                <a className="btn btn-primary" href={waLink()} target="_blank" rel="noopener" style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "center" }}>
                  Message us on WhatsApp
                </a>
              </Magnetic>
            </div>
            <div style={{ marginTop: "clamp(36px,5vw,60px)", display: "grid", maxWidth: "46ch" }}>
              {INFO_ROWS.map((r, i) => (
                <div key={r.label} data-anim="" className="hover-tint" style={{ borderTop: "1px solid var(--color-divider)", borderBottom: i === INFO_ROWS.length - 1 ? "1px solid var(--color-divider)" : undefined, padding: "18px 0" }}>
                  <p style={infoLabel}>{r.label}</p>
                  <p style={{ fontSize: 15.5, lineHeight: "26px", margin: 0 }}>{r.body}</p>
                </div>
              ))}
            </div>
          </div>

          <ContactForm region={region} />
        </section>
      </div>
    </>
  );
}
