import type { CSSProperties } from "react";
import Link from "next/link";
import HomeHero from "@/components/HomeHero";
import GlowGrid from "@/components/GlowGrid";
import GapClock from "@/components/GapClock";
import InteractiveDemo from "@/components/InteractiveDemo";
import PinnedRail from "@/components/PinnedRail";
import ProductMark, { type MarkId } from "@/components/ProductMark";
import AgentTrace from "@/components/AgentTrace";
import ModuleVisual from "@/components/ModuleVisual";
import Magnetic from "@/components/Magnetic";
import { AGENTS, INTEGRATIONS, JSTEPS, WHY } from "@/lib/content";
import { industries } from "@/lib/industries";
import { hrefIn, type Region } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

const wrap: CSSProperties = { maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" };
const muted = { color: "color-mix(in srgb, var(--color-text) 72%, transparent)" };
const h2: CSSProperties = { fontSize: "clamp(28px,3.6vw,50px)", lineHeight: 1, letterSpacing: "-0.035em", margin: 0 };

/** The section label: a numbered, monospaced tag — the page's one "system" voice. */
function Eyebrow({ n, label, dark }: { n: string; label: string; dark?: boolean }) {
  return (
    <p data-anim="" className={`eyebrow${dark ? " eyebrow-dark" : ""}`}>
      <span className="eyebrow-n">{n}</span>
      {label}
    </p>
  );
}

const AGENT_MARKS: Record<string, MarkId> = {
  Reception: "whatsapp",
  Booking: "booking",
  Catalogue: "catalogue",
  Qualifier: "lead",
  "Follow-up": "followup",
  Escalation: "escalation",
  Outreach: "outreach",
  Payments: "payments",
  Insights: "insights",
  Yours: "custom",
};

/* The limits the agent works inside. Each is a commitment the configuration
   actually enforces, not a certification. */
const GUARDRAILS = [
  {
    title: "Speaks only from what you approve",
    body: "Answers come from your catalogue, policies and FAQs. When it doesn't know, it says so.",
    icon: <path d="M5 5.5A1.5 1.5 0 016.5 4H13l5 5v9.5a1.5 1.5 0 01-1.5 1.5h-10A1.5 1.5 0 015 18.5zM9 13l2 2 4-4" />,
  },
  {
    title: "Knows when to hand over",
    body: "Complaints, refunds and judgement calls go to a named person, with the whole thread attached.",
    icon: <path d="M4 12h11m0 0l-4-4m4 4l-4 4M20 5v14" />,
  },
  {
    title: "Nothing broadcast without you",
    body: "Offers and outreach are drafted, then wait. Nothing goes to a list until you approve it.",
    icon: <path d="M4 10v4a1 1 0 001 1h2l5 4V5L7 9H5a1 1 0 00-1 1zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />,
  },
  {
    title: "Every conversation on record",
    body: "Each message and outcome is kept, so you can see exactly what was said and what was done.",
    icon: <path d="M12 7v5l3 2M21 12a9 9 0 11-9-9 9 9 0 019 9z" />,
  },
  {
    title: "Only the access you grant",
    body: "It reaches the systems and fields you connect during onboarding — and nothing else.",
    icon: <path d="M7 11V8a5 5 0 0110 0v3M6 11h12a1 1 0 011 1v7a1 1 0 01-1 1H6a1 1 0 01-1-1v-7a1 1 0 011-1z" />,
  },
  {
    title: "Your servers, when you need them",
    body: "A fully private deployment on your own infrastructure for strict data-residency rules.",
    icon: <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v3H4zM4 13h16v5a2 2 0 01-2 2H6a2 2 0 01-2-2zM8 6.5h.01M8 16.5h.01" />,
  },
];

/* Bento sizes by agent: the front door gets the big tile, booking the wide
   one, and the last two close the grid as a pair. */
const BENTO: Record<string, string> = { Reception: "bento-xl", Booking: "bento-wide", Insights: "bento-wide", Yours: "bento-wide" };

export default function HomePage({ region }: { region: Region }) {
  const sectors = industries(region);

  return (
    <>
      <HomeHero region={region} />

      {/* ---------- 01 The response gap ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(64px,8vw,112px)" }}>
        <Eyebrow n="01" label="The response gap" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "22ch", marginBottom: "clamp(28px,4vw,48px)" }}>
          Few businesses lose the sale on price. They lose it in the hours <span className="grad-text">nobody answered.</span>
        </h2>

        <GlowGrid className="gap-bento">
          <div data-anim="" className="glow gap-clock-card">
            <div aria-hidden="true" className="gap-clock-aura" />
            <p className="gap-live">
              <span aria-hidden="true" className="hh-live" />
              Unanswered · live
            </p>
            <GapClock />
            <p style={{ fontSize: 15, lineHeight: "25px", margin: "18px 0 0", maxWidth: "38ch", color: "rgba(255,255,255,.66)" }}>
              This clock started when you scrolled here. It stands in for the message that arrived while the shop was shut.
            </p>
            <div className="gap-compare">
              <span>
                <em>Industry average first reply</em>42 hrs
              </span>
              <span className="gap-compare-us">
                <em>Your agent</em>Seconds
              </span>
            </div>
          </div>
          <div data-anim="" className="glow stat-card">
            <p className="stat-fig">23%</p>
            <p className="stat-body">Of audited firms never replied to the enquiry at all. Not late — never.</p>
            <p className="stat-src">Harvard Business Review, 2011 · 2,241 firms</p>
          </div>
          <div data-anim="" className="glow stat-card">
            <p className="stat-fig">83%</p>
            <p className="stat-body">Of customers expect to engage immediately when they contact a business.</p>
            <p className="stat-src">Salesforce</p>
          </div>
        </GlowGrid>
        <p data-anim="" style={{ fontSize: 12, lineHeight: "20px", margin: "16px 0 0", maxWidth: "74ch", color: "color-mix(in srgb, var(--color-text) 55%, transparent)" }}>
          Every statistic on this page is a published third-party benchmark for messaging and lead response, cited where it appears — none are VantriqAI results. Numbers inside product screens and example conversations are illustrative.
        </p>
      </section>

      {/* ---------- 02 Watch it think ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)" }}>
        {/* The intro sits beside the console rather than above it, so the
            whole section reads in one screen on a desktop. */}
        <AgentTrace
          region={region}
          intro={
            <div className="trace-intro">
              <Eyebrow n="02" label="Watch it think" />
              <h2 data-anim="" style={{ ...h2, fontSize: "clamp(28px,3.1vw,44px)", maxWidth: "18ch" }}>
                Not a chatbot. <span className="grad-text">An agent that reasons, then acts.</span>
              </h2>
              <p data-anim="" style={{ fontSize: 16.5, lineHeight: "28px", margin: 0, maxWidth: "40ch", ...muted }}>
                It works out what was meant, checks your real systems, stays inside your rules — and knows when a person should take over. Pick a case:
              </p>
            </div>
          }
        />
      </section>

      {/* ---------- 03 Try it ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)" }}>
        <div className="demo-split">
          <div>
            <Eyebrow n="03" label="Try it yourself" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "14ch" }}>
              Be the customer for <span className="grad-text">a minute.</span>
            </h2>
            <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: "22px 0 30px", maxWidth: "44ch", ...muted }}>
              Pick a business, then send the messages a customer would. Watch the agent answer — and then do the work behind the answer.
            </p>
            <ol className="demo-steps">
              {[
                ["Checked stock", "Against live inventory, not a canned answer."],
                ["Held the item", "A real action in your system, logged to the lead."],
                ["Booked the visit", "Into the calendar, with the reminder scheduled."],
              ].map(([t, b], i) => (
                <li key={t} data-anim="">
                  <span className="demo-step-n">{String(i + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{t}</strong>
                    {b}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div data-anim="" className="demo-stage">
            <div aria-hidden="true" className="demo-stage-glow" />
            <InteractiveDemo />
          </div>
        </div>
      </section>

      {/* ---------- 04 The agents ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)" }}>
        <div className="split-head">
          <div>
            <Eyebrow n="04" label="The agents" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "15ch" }}>
              One brain. <span className="grad-text">Ten jobs.</span>
            </h2>
          </div>
          <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...muted }}>
            Switch on the ones your day actually needs — the rest stay quiet until you want them. What one learns in a thread, the next uses two messages later.
          </p>
        </div>

        <GlowGrid className="bento">
          {AGENTS.map((a) => (
            <div key={a.n} data-anim="" className={`glow bento-card ${BENTO[a.name] ?? ""}`}>
              <div className="bento-top">
                <ProductMark id={AGENT_MARKS[a.name]} size={a.name === "Reception" ? 56 : 40} />
                <span className="bento-n">{a.n}</span>
              </div>
              <h3 className="bento-title">{a.name === "Yours" ? "Your own agent" : `${a.name} Agent`}</h3>
              <p className="bento-body">{a.body}</p>
              {a.name === "Reception" ? (
                <div className="bento-chat" aria-hidden="true">
                  <span className="bento-bubble bento-them">Are you open on Sunday?</span>
                  <span className="bento-bubble bento-us">We are, 11 to 6. Want me to book you in?</span>
                  <span className="bento-typing">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              ) : null}
              <p className="bento-metric">{a.metric}</p>
            </div>
          ))}
        </GlowGrid>
        <p aria-hidden="true" className="swipe-hint">Swipe to see all ten →</p>
      </section>

      {/* ---------- 05 Insight: Pulse and Echo ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)" }}>
        <div className="split-head">
          <div>
            <Eyebrow n="05" label="Just launched" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "16ch" }}>
              It answers every customer. <span className="grad-text">Then it tells you what they said.</span>
            </h2>
          </div>
          <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...muted }}>
            A chatbot forgets the conversation the moment it ends. Every VantriqAI conversation becomes a number you can act on — leads closed, hours that matter, how satisfied people left.
          </p>
        </div>

        <GlowGrid className="ins swipe">
          <Link data-anim="" href={hrefIn(region, "/products/vantriq-pulse")} className="glow ins-card">
            <div className="ins-copy">
              <p className="ins-k">
                <span className="mega-new">New</span> Vantriq Pulse · analytics
              </p>
              <h3>Every conversation, measured live.</h3>
              <p className="ins-body">Leads made and closed, time to close, busiest hours, satisfaction and what the AI resolved on its own — compared like for like, in plain English.</p>
              <span className="ins-more">Explore Pulse →</span>
            </div>
            <div className="ins-visual">
              <ModuleVisual kind="pulse" />
            </div>
          </Link>
          <Link data-anim="" href={hrefIn(region, "/products/vantriq-echo")} className="glow ins-card">
            <div className="ins-copy">
              <p className="ins-k">
                <span className="mega-new">New</span> Vantriq Echo · surveys
              </p>
              <h3>Hear every customer, not just the loudest.</h3>
              <p className="ins-body">Satisfaction surveys in English and Urdu — after a chat, by QR code or link — with unhappy answers reaching your team the same day.</p>
              <span className="ins-more">Explore Echo →</span>
            </div>
            <div className="ins-visual">
              <ModuleVisual kind="echo" />
            </div>
          </Link>
        </GlowGrid>
        <p aria-hidden="true" className="swipe-hint">Swipe for Echo →</p>

        <Link data-anim="" href={hrefIn(region, "/products/human-support")} className="ins-strip">
          <ProductMark id="human" size={34} />
          <span>
            <strong>Human Support</strong> — AI agent assist. When a person takes over, they get the summary, the customer&rsquo;s history and a drafted reply.
          </span>
          <span aria-hidden="true" className="ins-strip-go">→</span>
        </Link>
        <p className="ins-note">Dashboard and survey figures are illustrative.</p>
      </section>

      <PinnedRail steps={JSTEPS} label="06 — Step by step" />

      {/* ---------- 06 Stack and guardrails ---------- */}
      <section className="dark-band">
        <div aria-hidden="true" className="dark-band-aurora" />
        <div style={{ ...wrap, position: "relative", padding: "clamp(56px,7vw,100px) clamp(20px,5vw,64px)" }}>
          <div className="split-head">
            <div>
              <Eyebrow n="07" label="Stack and guardrails" dark />
              <h2 data-anim="" style={{ ...h2, maxWidth: "16ch", color: "#fff" }}>
                Connected to your stack. <span className="grad-text-light">Bound by your rules.</span>
              </h2>
            </div>
            <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", color: "rgba(255,255,255,.66)" }}>
              Wired into the tools you already pay for during onboarding. It writes into your systems rather than keeping a second copy of the truth — and it never steps outside the limits you set.
            </p>
          </div>

          <div aria-hidden="true" className="bus">
            <span className="bus-core">VantriqAI</span>
          </div>

          <GlowGrid className="int-grid">
            {INTEGRATIONS.map((g) => (
              <div key={g.group} data-anim="" className="glow int-card">
                <p className="int-group">{g.group}</p>
                <ul>
                  {g.items.map((item) => (
                    <li key={item}>
                      <span aria-hidden="true" className="int-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </GlowGrid>

          <div className="guard-head">
            <span className="guard-shield" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l7 2.6v5.3c0 4.3-2.9 7.7-7 9.1-4.1-1.4-7-4.8-7-9.1V5.6z" />
                <path d="M9 12l2.2 2.2L15.5 10" />
              </svg>
            </span>
            <p>Guardrails, built in — not bolted on</p>
          </div>
          <ul className="guard-grid">
            {GUARDRAILS.map((g) => (
              <li key={g.title} data-anim="" className="guard-item">
                <span className="guard-icon" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    {g.icon}
                  </svg>
                </span>
                <strong>{g.title}</strong>
                <span>{g.body}</span>
              </li>
            ))}
          </ul>
          <p aria-hidden="true" className="swipe-hint" style={{ color: "rgba(255,255,255,.45)" }}>
            Swipe through all {GUARDRAILS.length} guardrails →
          </p>
        </div>
      </section>

      {/* ---------- 07 Industries ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)" }}>
        <div className="split-head">
          <div>
            <Eyebrow n="08" label="Where it applies" />
            <h2 data-anim="" style={{ ...h2, maxWidth: "16ch" }}>
              Tuned to how <span className="grad-text">your sector</span> sells.
            </h2>
          </div>
          <p data-anim="" style={{ fontSize: 17, lineHeight: "29px", margin: 0, maxWidth: "44ch", ...muted }}>
            The same core agent, set up around your catalogue, your booking rules and your tone. Pick your sector to see it working.
          </p>
        </div>

        <GlowGrid className="sector-grid">
          {sectors.map((s) => (
            <Link
              key={s.slug}
              href={hrefIn(region, `/industries/${s.slug}`)}
              data-anim=""
              className="glow sector-tile"
              style={{ "--ind-a": s.theme.a, "--ind-b": s.theme.b } as CSSProperties}
            >
              <span aria-hidden="true" className="sector-tile-orb" />
              <span className="sector-tile-name">{s.name}</span>
              <span className="sector-tile-line">
                {s.headline[0]} {s.headline[1]}
              </span>
              <span aria-hidden="true" className="sector-tile-arrow">→</span>
            </Link>
          ))}
          <Link href={hrefIn(region, "/contact")} data-anim="" className="glow sector-tile sector-tile-other">
            <span className="sector-tile-name">Something else?</span>
            <span className="sector-tile-line">The list is where we start, not a limit.</span>
            <span aria-hidden="true" className="sector-tile-arrow">→</span>
          </Link>
        </GlowGrid>
      </section>

      {/* ---------- 08 Why ---------- */}
      <section style={{ ...wrap, paddingTop: "clamp(72px,9vw,120px)", paddingBottom: "clamp(56px,7vw,96px)" }}>
        <Eyebrow n="09" label="Why VantriqAI" />
        <h2 data-anim="" style={{ ...h2, maxWidth: "18ch", marginBottom: "clamp(30px,4vw,52px)" }}>
          A partner, not a <span className="grad-text">faceless subscription.</span>
        </h2>
        <div className="why-grid">
          {WHY.map((w, i) => (
            <div key={w.title} data-anim="" className="why-item">
              <span className="why-n">{String(i + 1).padStart(2, "0")}</span>
              <h3>{w.title}</h3>
              <p>{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="future-cta">
        <div aria-hidden="true" className="future-cta-aurora" />
        <div aria-hidden="true" className="hh-grid" />
        <div style={{ position: "relative", maxWidth: 900, margin: "0 auto", textAlign: "center", padding: "clamp(60px,8vw,112px) clamp(20px,5vw,48px)" }}>
          <p className="hh-eyebrow" style={{ justifyContent: "center" }}>
            <span aria-hidden="true" className="hh-live" />
            Your next customer is typing
          </p>
          <h2 style={{ fontSize: "clamp(34px,5.4vw,72px)", lineHeight: 0.98, letterSpacing: "-0.04em", margin: "20px 0 0", color: "#fff" }}>
            Answer them <span className="grad-text-light">in a second,</span> not a day.
          </h2>
          <p style={{ fontSize: 18, lineHeight: "30px", margin: "24px auto 36px", maxWidth: "48ch", color: "rgba(255,255,255,.7)" }}>
            Send us a message and see the agent answer. A fifteen-minute discovery call maps your workflow before anything is built.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Magnetic>
              <a className="btn hh-btn-primary" href={waLink()} target="_blank" rel="noopener">
                Message us on WhatsApp <span aria-hidden="true">→</span>
              </a>
            </Magnetic>
            <Magnetic>
              <Link className="btn hh-btn-ghost" href={hrefIn(region, "/pricing")}>
                See the packages
              </Link>
            </Magnetic>
          </div>
        </div>
      </section>
    </>
  );
}
