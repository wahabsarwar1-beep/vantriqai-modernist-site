import JsonLd from "@/components/JsonLd";
import { breadcrumbSchema } from "@/lib/schema";
import PageHero from "@/components/PageHero";
import Magnetic from "@/components/Magnetic";
import ContactForm from "@/components/ContactForm";
import SocialIcon, { socialKey } from "@/components/SocialIcon";
import { SOCIAL_PROFILES, socialHandle, socialLabel } from "@/lib/social";
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
  {
    label: "Follow along",
    body: (
      <span style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
        {SOCIAL_PROFILES.map((url) => {
          const key = socialKey(url);
          const handle = socialHandle(url);
          return (
            <a key={url} href={url} target="_blank" rel="noopener me" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
              {key && <SocialIcon name={key} size={16} />}
              {socialLabel(url)}
              {handle && <span style={{ color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>{handle}</span>}
            </a>
          );
        })}
      </span>
    ),
  },
];

export default function ContactPage({ region }: { region: Region }) {
  return (
    <>
      <JsonLd schema={breadcrumbSchema(region, "/contact", "Contact")} />
      <main className="contact-page">
        <PageHero
          kicker="Contact"
          heading={<>Let&rsquo;s <span style={{ color: "var(--color-accent)" }}>talk.</span></>}
          body="The fastest way to reach us is the same channel we build on. Message us and see the agent answer, or send a brief to the team."
          orbit={
            <aside className="contact-hero-card">
              <span className="tag tag-accent">Start a conversation</span>
              <h2>Your next agent<br />starts <span>here.</span></h2>
              <p>Tell us what your customers need. We&rsquo;ll help you choose the channels and capabilities that fit.</p>
              <Magnetic>
                <a className="btn btn-primary" href={waLink()} target="_blank" rel="noopener noreferrer">Message us on WhatsApp ↗</a>
              </Magnetic>
              <a className="contact-brief-link" href="#send-a-brief">Prefer a form? Send a brief ↓</a>
            </aside>
          }
        />
        <section className="contact-content" aria-labelledby="contact-team-title">
          <div className="contact-team">
            <span className="tag tag-accent">A conversation, then a plan</span>
            <h2 id="contact-team-title">Built around<br /><span>your business.</span></h2>
            <p className="contact-team-intro">Share the questions, bookings or workflows you want to handle. We&rsquo;ll discuss the right setup and put the scope and pricing in writing.</p>
            <div className="contact-info">
              {INFO_ROWS.map((r) => (
                <div key={r.label} className="contact-info-row">
                  <p style={infoLabel}>{r.label}</p>
                  <p>{r.body}</p>
                </div>
              ))}
            </div>
          </div>
          <ContactForm region={region} />
        </section>
      </main>
    </>
  );
}
