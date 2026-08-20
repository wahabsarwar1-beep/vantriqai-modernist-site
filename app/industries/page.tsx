import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";

const SECTORS = [
  {
    name: "E-commerce & Retail",
    kicker: "Catalogue, cart recovery",
    body: "Shares products, answers sizing and stock questions, and follows up on abandoned carts before the customer buys elsewhere.",
  },
  {
    name: "Real Estate",
    kicker: "Matching, site visits",
    body: "Qualifies budget and area, matches listings to the enquiry, and books site visits straight into an agent's calendar.",
  },
  {
    name: "Healthcare",
    kicker: "Booking, follow-up care",
    body: "Handles appointment booking and rescheduling, sends follow-up reminders, and escalates anything clinical to your staff.",
  },
  {
    name: "Education",
    kicker: "Admissions, fee reminders",
    body: "Answers admission queries at scale during intake season and reminds parents about fees and deadlines.",
  },
  {
    name: "Hospitality",
    kicker: "Ordering, reservations",
    body: "Takes orders and table reservations through the dinner rush, when no one is free to watch the phone.",
  },
  {
    name: "Legal & Consulting",
    kicker: "Intake, document collection",
    body: "Runs first-contact intake, collects the documents a matter needs, and books the consultation.",
  },
  {
    name: "Travel & Tourism",
    kicker: "Itineraries, booking status",
    body: "Sends itineraries, answers package questions, and gives booking status without a call to the office.",
  },
  {
    name: "HR & Operations",
    kicker: "Onboarding, leave requests",
    body: "Walks new joiners through onboarding and handles routine leave and policy questions internally.",
  },
  {
    name: "Marketing Agencies",
    kicker: "Comment-to-DM, scoring",
    body: "Turns comments into DMs, qualifies the lead, and scores it before it reaches a human on the account.",
  },
  {
    name: "Logistics",
    kicker: "Shipment tracking",
    body: 'Answers "where is my order" instantly, at any volume, and flags exceptions to the team that can fix them.',
  },
];

function MarqueeTrack({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} style={{ display: "flex" }}>
      {SECTORS.map((sector) => (
        <span
          key={sector.name}
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 800,
            fontSize: "clamp(20px,2.4vw,34px)",
            letterSpacing: "-0.02em",
            padding: "0 22px",
            whiteSpace: "nowrap",
            color: "color-mix(in srgb, var(--color-text) 55%, transparent)",
          }}
        >
          {sector.name}
          <span style={{ color: "var(--color-accent)", paddingLeft: 22 }}>/</span>
        </span>
      ))}
    </div>
  );
}

export default function Industries() {
  return (
    <>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(48px,7vw,88px) 0 clamp(40px,6vw,72px)", position: "relative", overflow: "hidden" }}>
          <MotionBackground />
          <span
            data-par="-0.14"
            aria-hidden="true"
            style={{ position: "absolute", right: "10%", top: "30%", width: 64, height: 64, background: "var(--color-accent)", pointerEvents: "none" }}
          />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(24px,4vw,44px)" }}>
              <span
                data-anim="rise"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--color-accent)",
                }}
              >
                Where it applies
              </span>
              <span data-anim="rule" style={{ flex: 1, height: 2, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(34px,5.4vw,68px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "16ch" }}>
              <span style={{ display: "block", overflow: "hidden" }}>
                <span data-line="" style={{ display: "block" }}>
                  <span style={{ color: "var(--color-accent)" }}>Every</span> sector,
                </span>
              </span>
              <span style={{ display: "block", overflow: "hidden" }}>
                <span data-line="" style={{ display: "block" }}>
                  one platform
                </span>
              </span>
            </h1>
            <p data-anim="rise" style={{ fontSize: 18, lineHeight: "30px", maxWidth: "52ch", margin: "32px 0 0" }}>
              The same core agent, tuned to the workflow of each sector — your catalogue, your booking rules, your tone.
            </p>
          </div>
        </section>
      </div>

      <section style={{ borderTop: "2px solid var(--color-divider)", borderBottom: "2px solid var(--color-divider)", background: "var(--color-divider)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
            gap: 2,
            background: "var(--color-bg)",
            overflow: "hidden",
          }}
        >
          {SECTORS.map((sector) => (
            <div
              key={sector.name}
              data-anim="rise"
              className="cell-hover-5"
              style={{
                background: "var(--color-bg)",
                padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)",
                boxShadow: "2px 2px 0 0 var(--color-divider)",
              }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 18px" }}>
                {sector.kicker}
              </p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>{sector.name}</h2>
              <p style={{ fontSize: 15, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: 0 }}>
                {sector.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderBottom: "2px solid var(--color-divider)", padding: "clamp(24px,3vw,40px) 0", overflow: "hidden" }}>
        <div style={{ display: "flex", width: "max-content", animation: "marquee 30s linear infinite" }}>
          <MarqueeTrack />
          <MarqueeTrack ariaHidden />
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "20px 0 clamp(56px,8vw,96px)" }}>
          <p style={{ fontSize: 13, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 55%, transparent)", margin: 0 }}>
            Not listed? The agent adapts — <a href="/contact">ask us about your workflow</a>.
          </p>
        </section>
      </div>

      <CtaBand
        heading="Tell us how your business runs."
        body="We configure the agent around your workflow, not the other way round."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Request a quote"
        secondaryHref="/pricing"
      />

      <Footer />
    </>
  );
}
