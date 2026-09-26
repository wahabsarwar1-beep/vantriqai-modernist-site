import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import GuideCover from "@/components/GuideCover";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import PosterCTA from "@/components/PosterCTA";
import JsonLd from "@/components/JsonLd";
import { RESOURCES, readingMinutes } from "@/lib/resources";
import { breadcrumbSchema, resourceListSchema } from "@/lib/schema";
import { DEFAULT_REGION } from "@/lib/region";
import { resourceMetadata } from "@/lib/seo";

const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 55%, transparent)" };

export const metadata: Metadata = resourceMetadata(
  "/resources",
  "Resources",
  "Guides on lead response time, WhatsApp Business, and choosing an AI customer agent — written from published research, with every figure attributed.",
);

export default function Resources() {
  const [featured, ...rest] = RESOURCES;
  return (
    <>
      <JsonLd schema={breadcrumbSchema(DEFAULT_REGION, "/resources", "Resources")} />
      <JsonLd schema={resourceListSchema()} />

      <PageHero
        kicker="Resources"
        maxWidthCh="17ch"
        heading={
          <>
            <LineReveal>Guides, and the</LineReveal>
            <LineReveal>
              <span style={{ color: "var(--color-accent)" }}>evidence</span> behind them
            </LineReveal>
          </>
        }
        body="What the published research says about response time, how the two WhatsApp Business products differ, and the questions worth asking any vendor before you sign. Every figure is third-party and named where it appears."
        orbit={
          <HeroChatCard
            channel="Website"
            time="14:02"
            bubbles={[
              { from: "them", text: "How fast should we be replying, really?" },
              { from: "us", text: "Five minutes is the cliff — I'll send you the study." },
            ]}
            speed="Answered from the guides"
            outcome={["Guide shared · response-time benchmarks", "Follow-up scheduled"]}
          />
        }
      />

      {/* The newest guide leads as a banner; the rest follow as cover cards. */}
      <section className="res-wrap">
        <Link href={`/resources/${featured.slug}`} className="res-featured">
          <GuideCover resource={featured} large />
          <span className="res-featured-copy">
            <span className="res-featured-tag">Featured guide · {readingMinutes(featured)} min read</span>
            <strong>{featured.heading}</strong>
            <span className="res-featured-sum">{featured.summary}</span>
            <span className="res-featured-cta">
              Read the guide <span aria-hidden="true">→</span>
            </span>
          </span>
        </Link>

        <div className="res-bar">
          <p className="eyebrow" style={{ margin: 0 }}>
            <span className="eyebrow-n">{String(RESOURCES.length).padStart(2, "0")}</span>
            All guides
          </p>
          <ul className="res-topics" aria-label="Topics">
            {[...new Set(RESOURCES.map((r) => r.topic))].map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>

        <div className="guide-grid">
          {rest.map((r) => (
            <Link key={r.slug} href={`/resources/${r.slug}`} className="guide-card">
              <GuideCover resource={r} />
              <span className="guide-meta">
                {r.kind} · {r.topic} · {readingMinutes(r)} min read
              </span>
              <strong className="guide-title">{r.heading}</strong>
              <span className="guide-sum">{r.summary}</span>
              <span className="guide-read">
                Read the guide <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(30px,4vw,52px) 0 clamp(36px,4.6vw,60px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22, maxWidth: "76ch" }}>
            <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", margin: "0 0 10px", color: "color-mix(in srgb, var(--color-text) 45%, transparent)" }}>
              About the figures on this site
            </p>
            <p style={{ fontSize: 13, lineHeight: "23px", margin: 0, ...mutedLabel }}>
              Every statistic in these guides is published third-party research, named on the line where it appears — MIT/InsideSales.com, Harvard Business Review, SuperOffice, Salesforce, HubSpot, Salesmate and Meta among them. They describe the category, not VantriqAI client results, and several of the strongest are more than a decade old; each guide says so where that matters. We quote figures and attribute them, and reproduce nobody&rsquo;s text or charts. Case studies will appear here only when there is real work to describe and the client has agreed to it being described.
            </p>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Run the checklist against us."
        body="Bring your own questions to the agent in the corner of this page, or send a brief and we will answer them in writing."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref="/contact"
      />
    </>
  );
}
