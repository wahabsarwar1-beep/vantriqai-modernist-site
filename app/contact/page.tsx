import Footer from "@/components/Footer";
import ContactForm from "@/components/ContactForm";
import BrandName from "@/components/BrandName";
import { waLink } from "@/lib/whatsapp";

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
  {
    label: "Where we are",
    body: <>Islamabad, Pakistan — local hours, local support, PKR billing.</>,
  },
  {
    label: "Who you’ll speak to",
    body: (
      <>
        The <BrandName /> team — 14+ years experience across enterprise and government collaborations.
      </>
    ),
  },
  {
    label: "What happens next",
    body: (
      <>
        A fifteen-minute discovery call, then a fixed setup fee and monthly plan in writing.{" "}
        <a href="/how-it-works">See the five steps</a>.
      </>
    ),
  },
];

export default function Contact() {
  return (
    <>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section
          style={{
            padding: "clamp(48px,7vw,88px) 0 clamp(56px,8vw,104px)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))",
            gap: "clamp(40px,6vw,88px)",
            alignItems: "start",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                }}
              >
                Contact
              </span>
              <span style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(52px,7.6vw,104px)", lineHeight: 0.92, letterSpacing: "-0.04em", margin: 0 }}>
              Let&rsquo;s talk.
            </h1>
            <p style={{ fontSize: 18, lineHeight: "30px", maxWidth: "44ch", margin: "28px 0 0" }}>
              The fastest way to reach us is the same channel we build on. Message us and see the agent answer.
            </p>
            <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginTop: 28 }}>
              <a
                className="btn btn-primary"
                href={waLink()}
                target="_blank"
                rel="noopener"
                style={{ minHeight: 52, paddingInline: 22, fontSize: 15, justifyContent: "flex-start" }}
              >
                Message us on WhatsApp
              </a>
            </div>
            <div style={{ marginTop: "clamp(36px,5vw,60px)", display: "grid", maxWidth: "46ch" }}>
              {INFO_ROWS.map((row, i) => (
                <div
                  key={row.label}
                  className="row-hover"
                  style={{
                    borderTop: "2px solid var(--color-divider)",
                    borderBottom: i === INFO_ROWS.length - 1 ? "2px solid var(--color-divider)" : undefined,
                    padding: "18px 0",
                  }}
                >
                  <p style={infoLabel}>{row.label}</p>
                  <p style={{ fontSize: 15.5, lineHeight: "26px", margin: 0 }}>{row.body}</p>
                </div>
              ))}
            </div>
          </div>

          <ContactForm />
        </section>
      </div>

      <Footer />
    </>
  );
}
