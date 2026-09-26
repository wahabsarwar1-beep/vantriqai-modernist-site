import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Kicker from "@/components/Kicker";
import ArticleBody from "@/components/ArticleBody";
import PosterCTA from "@/components/PosterCTA";
import JsonLd from "@/components/JsonLd";
import { RESOURCES, getResource, readingMinutes } from "@/lib/resources";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";
import { DEFAULT_REGION } from "@/lib/region";
import { resourceMetadata } from "@/lib/seo";

const bodyMuted = { color: "color-mix(in srgb, var(--color-text) 78%, transparent)" };
const mutedLabel = { color: "color-mix(in srgb, var(--color-text) 55%, transparent)" };

export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) return {};

  return {
    ...resourceMetadata(`/resources/${resource.slug}`, resource.title, resource.description),
    // An article is not a "website"; saying so is what lets a reader see a
    // published date rather than a generic card.
    openGraph: {
      type: "article",
      title: `${resource.title} | VantriqAI`,
      description: resource.description,
      publishedTime: resource.published,
      modifiedTime: resource.updated ?? resource.published,
    },
  };
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  return (
    <>
      <JsonLd schema={breadcrumbSchema(DEFAULT_REGION, `/resources/${resource.slug}`, resource.title, "Resources", "/resources")} />
      <JsonLd schema={articleSchema(resource)} />

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ padding: "clamp(36px,4.6vw,62px) 0 clamp(24px,3vw,40px)", position: "relative" }}>
          <div aria-hidden="true" data-hero-texture="" style={{ position: "absolute", top: "calc(clamp(72px, 7vw, 92px) * -1)", bottom: 0, left: "50%", width: "calc(100vw + 24px)", marginLeft: "calc(-50vw - 12px)", zIndex: 0, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1, maxWidth: "76ch" }}>
            <Kicker label={resource.kind} marginBottom="clamp(22px,3.4vw,38px)" />
            <h1 style={{ fontSize: "clamp(30px,4.2vw,54px)", lineHeight: 1.02, letterSpacing: "-0.03em", margin: 0, maxWidth: "20ch", overflowWrap: "break-word" }}>
              {resource.heading}
            </h1>
            <p data-anim="" style={{ fontSize: 18.5, lineHeight: "32px", margin: "28px 0 0", maxWidth: "58ch" }}>
              {resource.summary}
            </p>
            <p style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "var(--font-heading)", fontWeight: 800, margin: "26px 0 0", ...mutedLabel }}>
              <time dateTime={resource.published}>{dateLabel(resource.published)}</time> · {readingMinutes(resource)} min read
            </p>
          </div>
        </section>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 clamp(20px,5vw,64px)" }}>
        <section style={{ borderTop: "1px solid var(--color-divider)", padding: "clamp(28px,3.6vw,46px) 0 0" }}>
          <ArticleBody body={resource.body} />
        </section>

        <section style={{ padding: "clamp(30px,4vw,50px) 0 clamp(36px,4.6vw,60px)" }}>
          <div style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 22 }}>
            <Kicker label="Where to go next" marginBottom="0" />
            <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(260px,100%),1fr))", gap: 18 }}>
              {resource.related.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  data-anim=""
                  className="hover-lift"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-divider)", borderRadius: 24, boxShadow: "var(--shadow-sm)", padding: "clamp(20px,2.4vw,28px)", display: "block", color: "inherit" }}
                >
                  <p style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", margin: "0 0 8px" }}>{r.label}</p>
                  <p style={{ fontSize: 14, lineHeight: "23px", margin: 0, ...bodyMuted }}>{r.note}</p>
                </Link>
              ))}
            </div>
            <p style={{ marginTop: 26 }}>
              <Link href="/resources" style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 12.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-accent)" }}>
                &larr; All resources
              </Link>
            </p>
          </div>
        </section>
      </div>

      <PosterCTA
        headline="Ask us the hard version."
        body="Bring your own questions to the agent in the corner of this page, or send a brief and we will answer them in writing."
        primaryLabel="Message us on WhatsApp"
        secondaryLabel="Send a brief"
        secondaryHref="/contact"
      />
    </>
  );
}
