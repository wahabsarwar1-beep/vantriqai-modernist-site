import PageHero from "@/components/PageHero";
import HeroOrbitCard from "@/components/HeroOrbitCard";
import LineReveal from "@/components/LineReveal";
import Kicker from "@/components/Kicker";
import PosterCTA from "@/components/PosterCTA";
import Marquee from "@/components/Marquee";
import Counter from "@/components/Counter";
import ProductMark, { type MarkId } from "@/components/ProductMark";
import { INCLUDED } from "@/lib/content";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };

type Product = {
  kicker: "Channel" | "Capability" | "Deployment";
  name: string;
  body: string;
  tier: string;
  tint: "accent" | "dark";
  featured?: boolean;
  mark?: MarkId;
  icon?: React.ReactNode;
};

const bg = "var(--color-bg)";

const PRODUCTS: Product[] = [
  {
    kicker: "Channel", name: "WhatsApp Agent", tier: "From Starter", tint: "accent", featured: true, mark: "whatsapp",
    body: "The core module. Answers, qualifies and books on the channel your customers already open twenty times a day — English or Roman Urdu, any hour.",
  },
  {
    kicker: "Channel", name: "Social Agent", tier: "From Growth", tint: "accent", mark: "social",
    body: "Instagram and Facebook DMs, plus comment-to-DM: a question under a post becomes a qualified conversation before your competitor replies.",
  },
  {
    kicker: "Channel", name: "Website Agent", tier: "From Scale", tint: "accent", mark: "website",
    body: "The embedded assistant on your own site — the widget in the corner of this page. Same brain, same actions, no app to download.",
  },
  {
    kicker: "Channel", name: "Voice Agent", tier: "From Growth", tint: "accent",
    body: "Answers your business phone in a natural voice, handles the same reception and booking as the chat agent, and hands off cleanly when a call needs a person.",
    icon: (<svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-5 0-9 4-9 9v9c0 5 4 9 9 9s9-4 9-9v-9c0-5-4-9-9-9z" fill={bg} /><path d="M14 24c0 6 4.5 10.6 10 11s10-5 10-11" stroke={bg} strokeWidth={4} fill="none" /><rect x="17" y="41" width="14" height="4" fill={bg} /></svg>),
  },
  {
    kicker: "Capability", name: "Booking Agent", tier: "Add-on module", tint: "dark", mark: "booking",
    body: "Checks real availability, writes the appointment into your calendar, sends the reminder, and handles the reschedule when it comes.",
  },
  {
    kicker: "Capability", name: "Catalogue Agent", tier: "Add-on module", tint: "dark", mark: "catalogue",
    body: "Answers stock, size, price and variant questions against live inventory, shares the right product, and holds the item while the customer decides.",
  },
  {
    kicker: "Capability", name: "Lead Qualifier", tier: "From Growth", tint: "dark", mark: "lead",
    body: "Asks the qualifying questions your sales team would ask, scores the lead, and writes it into your CRM with the full transcript attached.",
  },
  {
    kicker: "Capability", name: "Escalation Desk", tier: "In every plan", tint: "dark", mark: "escalation",
    body: "The handover layer. Routes anything needing judgement to the right person with the conversation attached, and folds recurring cases into the next tuning round.",
  },
  {
    kicker: "Capability", name: "Follow-up Agent", tier: "Add-on module", tint: "dark", mark: "followup",
    body: "Abandoned carts, unanswered quotes and half-finished bookings, reopened once and politely at the hour people actually reply.",
  },
  {
    kicker: "Capability", name: "Outreach Agent", tier: "From Growth", tint: "dark", mark: "outreach",
    body: "Reactivation lists, seasonal offers and WhatsApp broadcasts drafted for the segment worth the message. Nothing sends until you approve it.",
  },
  {
    kicker: "Capability", name: "Payments Agent", tier: "Add-on module", tint: "dark", mark: "payments",
    body: "Sends the payment link inside the conversation, confirms receipt, and chases the unpaid invoice on the schedule you set.",
  },
  {
    kicker: "Capability", name: "Insights Digest", tier: "In every plan", tint: "dark", mark: "insights",
    body: "What customers asked, what they abandoned and which hours cost you money — one Monday digest in plain language, not a wall of charts.",
  },
  {
    kicker: "Deployment", name: "Private Deployment", tier: "From Enterprise", tint: "dark", mark: "deployment",
    body: "The whole stack self-hosted on your infrastructure, for strict data-residency requirements. Same agents, nothing leaving your network.",
  },
  {
    kicker: "Deployment", name: "Custom Module", tier: "From Scale", tint: "dark", mark: "custom",
    body: "The one thing only your business does, built during onboarding: your name for it, your tone, your rules, your sign-off before it acts.",
  },
];

export default function Products() {
  return (
    <>
      <PageHero
        kicker="Products"
        maxWidthCh="17ch"
        heading={
          <>
            <LineReveal>
              <Counter target={14} /> agents. Assemble
            </LineReveal>
            <LineReveal>
              the <span style={{ color: "var(--color-accent)" }}>one you need.</span>
            </LineReveal>
          </>
        }
        body="Each product is a module on the same platform: three channels, eight capabilities, two ways to deploy. Start with one, add as volume grows — nothing is rebuilt when you do."
        orbit={
          <HeroOrbitCard label="14 modules" delay={0.3} spinDuration={13} orbitDuration={7} reverse>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "10%", width: "52%" }}>
              {[0, 0.2, 0.4, 0.6].map((d) => (
                <span key={d} style={{ aspectRatio: 1, borderRadius: 9, background: "var(--color-accent)", animation: "blip 1.6s infinite", animationDelay: `${d}s` }} />
              ))}
            </div>
          </HeroOrbitCard>
        }
      />

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))", gap: 18 }}>
          {PRODUCTS.map((p) => (
            <div key={p.name} data-anim="" data-tilt="" className="card hover-lift-5" style={{ padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", ...(p.featured ? { background: "var(--color-accent-100)" } : {}) }}>
              {p.mark ? (
                <ProductMark id={p.mark} />
              ) : (
                <span className="product-mark" style={{ display: "grid", placeItems: "center", width: 76, height: 76, flex: "none", borderRadius: 24, background: p.tint === "accent" ? "var(--color-accent)" : "var(--color-text)", marginBottom: 24 }}>
                  {p.icon}
                </span>
              )}
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "color-mix(in srgb, var(--color-text) 58%, transparent)", margin: "0 0 12px" }}>{p.kicker}</p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>
                {p.name}
                <sup style={{ fontFamily: "var(--font-body)", fontWeight: 400, fontSize: "0.42em", lineHeight: 1, verticalAlign: "super", marginLeft: 3, color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>®</sup>
              </h2>
              <p style={{ fontSize: 15, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "0 0 22px", flex: 1 }}>{p.body}</p>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-accent)" }}>{p.tier}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)", padding: "clamp(20px,2.6vw,34px) 0", overflow: "hidden" }}>
        <Marquee duration={36} reverse>
          {["WhatsApp Business API", "Instagram DM", "Google Calendar", "HubSpot", "Shopify", "Salesforce", "Stripe", "WooCommerce", "Zoho", "Outlook"].map((s) => (
            <span key={s} style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(18px,2.2vw,30px)", letterSpacing: "-0.02em", padding: "0 20px", whiteSpace: "nowrap", color: "color-mix(in srgb, var(--color-text) 62%, transparent)" }}>
              {s}
              <span style={{ color: "var(--color-accent)" }}> ·</span>
            </span>
          ))}
        </Marquee>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(34px,4.4vw,58px) 0 clamp(40px,5.2vw,68px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="In every product" marginBottom="0" />
            <div style={{ marginTop: 20 }}>
              <h2 data-anim="" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 40px", maxWidth: "24ch" }}>The same foundation, whichever modules you run</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: "36px clamp(24px,4vw,64px)" }} data-stagger="">
                {INCLUDED.map((i) => (
                  <div key={i.title} data-anim="" className="hover-border-lift" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 18 }}>
                    <h3 style={{ fontSize: 20, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 10px" }}>{i.title}</h3>
                    <p style={{ fontSize: 15, lineHeight: "26px", margin: 0, maxWidth: "42ch", ...bodyMuted }}>{i.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Not sure which modules?"
        body="One call maps your customer workflow and tells you which two or three actually earn their keep."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="See packages"
        secondaryHref="/pricing"
      />
    </>
  );
}
