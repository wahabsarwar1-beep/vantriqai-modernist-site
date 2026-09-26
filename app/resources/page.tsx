import type { Metadata } from "next";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import HeroChatCard from "@/components/HeroChatCard";
import LineReveal from "@/components/LineReveal";
import PosterCTA from "@/components/PosterCTA";
import JsonLd from "@/components/JsonLd";
import { RESOURCES, readingMinutes } from "@/lib/resources";
import { breadcrumbSchema, resourceListSchema } from "@/lib/schema";
import { DEFAULT_REGION } from "@/lib/region";
import { resourceMetadata } from "@/lib/seo";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 55%, transparent)" };

export const metadata: Metadata = resourceMetadata(
  "/resources",
  "Resources",
  "Guides on lead response time, WhatsApp Business, and choosing an AI customer agent — written from published research, with every figure attributed.",
);

export default function Resources() {
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

      <section style={{ borderTop: "1px solid var(--color-divider)" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "clamp(28px,3.6vw,48px) clamp(20px,5vw,64px)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 18 }} data-stagger="">
          {RESOURCES.map((r) => (
            <article
              key={r.slug}
              data-anim=""
              className="hover-lift"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 28, boxShadow: "var(--shadow-sm)", padding: "clamp(26px,3vw,38px) clamp(22px,2.6vw,34px)", display: "flex", flexDirection: "column" }}
            >
              <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--color-accent)", margin: "0 0 16px" }}>
                {r.kind} · {readingMinutes(r)} min read
              </p>
              <h2 style={{ fontSize: 23, lineHeight: 1.1, letterSpacing: "-0.025em", margin: "0 0 14px" }}>
                <Link href={`/resources/${r.slug}`} style={{ color: "inherit" }}>
                  {r.heading}
                </Link>
              </h2>
              <p style={{ fontSize: 15, lineHeight: "26px", margin: "0 0 24px", flex: 1, ...bodyMuted }}>{r.summary}</p>
              <Link
                href={`/resources/${r.slug}`}
                style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)", paddingTop: 16, borderTop: "1px solid var(--color-divider)" }}
              >
                Read the guide &rarr;
              </Link>
            </article>
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
