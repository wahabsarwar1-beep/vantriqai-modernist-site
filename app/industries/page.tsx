import CtaBand from "@/components/CtaBand";
import Footer from "@/components/Footer";
import MotionBackground from "@/components/MotionBackground";

/** Published figures for the channel itself, cited on the line. The first two
 *  count up; "3 bn+" is left static because it is not a plain integer. */
const CHANNEL_PROOF = [
  { fig: "3 bn+", label: "People on WhatsApp every month", src: "Meta, confirmed 2025" },
  { fig: <><span data-count="200">200</span> m+</>, label: "Businesses already on WhatsApp Business", src: "Meta, 2023" },
  { fig: <><span data-count="95">95</span>–98%</>, label: "Open rate on a WhatsApp business message, against 20–25% for email", src: "Mobilesquared / Infobip · industry estimate" },
];

const SECTORS = [
  {
    name: "E-commerce & Retail",
    kicker: "Catalogue, cart recovery",
    body: "Shares products, answers sizing and stock questions, and follows up on abandoned carts before the customer buys elsewhere.",
    data: "Peak driver — campaign launches and sale weekends",
  },
  {
    name: "Real Estate",
    kicker: "Matching, site visits",
    body: "Qualifies budget and area, matches listings to the enquiry, and books site visits straight into an agent's calendar.",
    data: "Peak driver — new listing drops and portal enquiries",
  },
  {
    name: "Healthcare",
    kicker: "Booking, follow-up care",
    body: "Handles appointment booking and rescheduling, sends follow-up reminders, and escalates anything clinical to your staff.",
    data: "Peak driver — Monday mornings and post-clinic follow-ups",
  },
  {
    name: "Education",
    kicker: "Admissions, fee reminders",
    body: "Answers admission queries at scale during intake season and reminds parents about fees and deadlines.",
    data: "Peak driver — admission and fee-deadline windows",
  },
  {
    name: "Hospitality",
    kicker: "Ordering, reservations",
    body: "Takes orders and table reservations through the dinner rush, when no one is free to watch the phone.",
    data: "Peak driver — the dinner rush and weekend reservations",
  },
  {
    name: "Legal & Consulting",
    kicker: "Intake, document collection",
    body: "Runs first-contact intake, collects the documents a matter needs, and books the consultation.",
    data: "Peak driver — first-contact intake after ad campaigns",
  },
  {
    name: "Travel & Tourism",
    kicker: "Itineraries, booking status",
    body: "Sends itineraries, answers package questions, and gives booking status without a call to the office.",
    data: "Peak driver — season openings and itinerary changes",
  },
  {
    name: "HR & Operations",
    kicker: "Onboarding, leave requests",
    body: "Walks new joiners through onboarding and handles routine leave and policy questions internally.",
    data: "Peak driver — onboarding intakes and leave cycles",
  },
  {
    name: "Marketing Agencies",
    kicker: "Comment-to-DM, scoring",
    body: "Turns comments into DMs, qualifies the lead, and scores it before it reaches a human on the account.",
    data: "Peak driver — comment spikes under paid posts",
  },
  {
    name: "Logistics",
    kicker: "Shipment tracking",
    body: 'Answers "where is my order" instantly, at any volume, and flags exceptions to the team that can fix them.',
    data: "Peak driver — dispatch days and delivery exceptions",
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
            style={{ position: "absolute", right: "10%", top: "30%", width: 64, height: 64, background: "var(--color-accent)", borderRadius: "var(--radius-md)", pointerEvents: "none" }}
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
              <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
            </div>
            <h1 style={{ fontSize: "clamp(34px,5.4vw,68px)", lineHeight: 0.98, letterSpacing: "-0.03em", margin: 0, maxWidth: "16ch", overflowWrap: "break-word" }}>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
                <span data-line="" style={{ display: "block" }}>
                  <span style={{ color: "var(--color-accent)" }}>Every</span> sector,
                </span>
              </span>
              <span style={{ display: "block", overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.12em" }}>
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

      <section style={{ borderTop: "1px solid var(--color-divider)", borderBottom: "1px solid var(--color-divider)" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(min(300px,100%),1fr))",
            gap: 18,
            padding: "clamp(22px,3vw,40px) clamp(20px,5vw,64px)",
          }}
          className="spotlight-grid"
        >
          {SECTORS.map((sector) => (
            <div
              key={sector.name}
              data-anim="rise"
              className="cell-hover-5"
              style={{
                padding: "clamp(26px,3vw,40px) clamp(20px,2.5vw,36px)",
              }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 18px" }}>
                {sector.kicker}
              </p>
              <h2 style={{ fontSize: 24, lineHeight: 1.05, letterSpacing: "-0.025em", margin: "0 0 12px" }}>{sector.name}</h2>
              <p style={{ fontSize: 15, lineHeight: "26px", color: "color-mix(in srgb, var(--color-text) 78%, transparent)", margin: "0 0 18px" }}>
                {sector.body}
              </p>
              <p
                style={{
                  fontFamily: "var(--font-heading)",
                  fontWeight: 800,
                  fontSize: 10,
                  lineHeight: "16px",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  margin: 0,
                  paddingTop: 12,
                  borderTop: "1px solid var(--color-divider)",
                  color: "color-mix(in srgb, var(--color-text) 50%, transparent)",
                }}
              >
                {sector.data}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section style={{ borderBottom: "1px solid var(--color-divider)", padding: "clamp(24px,3vw,40px) 0", overflow: "hidden" }}>
        <div style={{ display: "flex", width: "max-content", animation: "marquee 30s linear infinite" }}>
          <MarqueeTrack />
          <MarqueeTrack ariaHidden />
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(38px,5vw,72px) clamp(20px,5vw,64px) 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: "clamp(20px,3vw,32px)" }}>
          <span data-anim="rise" className="kicker-pill">Why the channel matters</span>
          <span data-anim="rule" style={{ flex: 1, height: 1, background: "var(--color-divider)" }} />
        </div>
        <h2 data-anim="rise" style={{ fontSize: "clamp(24px,3vw,42px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: "0 0 clamp(24px,3vw,36px)", maxWidth: "24ch" }}>
          Whatever the sector, your customers are already messaging.
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 18 }}>
          {CHANNEL_PROOF.map((c) => (
            <div key={c.label} data-anim="rise" className="cell-hover" style={{ padding: "clamp(26px,3.4vw,42px) clamp(20px,2.4vw,32px)", display: "flex", flexDirection: "column" }}>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "clamp(34px,3.8vw,54px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0, fontFeatureSettings: "'tnum' 1" }}>
                {c.fig}
              </p>
              <p style={{ fontSize: 14.5, lineHeight: "23px", margin: "16px 0 22px", flex: 1, maxWidth: "30ch", color: "color-mix(in srgb, var(--color-text) 78%, transparent)" }}>
                {c.label}
              </p>
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 10, lineHeight: "16px", letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, paddingTop: 12, borderTop: "1px solid var(--color-divider)", color: "color-mix(in srgb, var(--color-text) 50%, transparent)" }}>
                {c.src}
              </p>
            </div>
          ))}
        </div>
      </div>

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
