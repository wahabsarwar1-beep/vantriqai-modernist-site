import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ArticleBody, { headingId } from "@/components/ArticleBody";
import ArticleToc from "@/components/ArticleToc";
import GuideCover from "@/components/GuideCover";
import ShareBar from "@/components/ShareBar";
import PosterCTA from "@/components/PosterCTA";
import JsonLd from "@/components/JsonLd";
import { RESOURCES, getResource, readingMinutes } from "@/lib/resources";
import { articleSchema, breadcrumbSchema } from "@/lib/schema";
import { DEFAULT_REGION, SITE_URL } from "@/lib/region";
import { resourceMetadata } from "@/lib/seo";


export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) return {};

  return resourceMetadata(`/resources/${resource.slug}`, resource.title, resource.description, {
    publishedTime: resource.published,
    modifiedTime: resource.updated ?? resource.published,
  });
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default async function ResourcePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const resource = getResource(slug);
  if (!resource) notFound();

  const toc = resource.body.flatMap((b) => (b.t === "h2" ? [{ id: headingId(b.text), text: b.text }] : []));
  const others = RESOURCES.filter((r) => r.slug !== resource.slug);
  const url = `${SITE_URL}/resources/${resource.slug}`;

  return (
    <>
      <JsonLd schema={breadcrumbSchema(DEFAULT_REGION, `/resources/${resource.slug}`, resource.title, "Resources", "/resources")} />
      <JsonLd schema={articleSchema(resource)} />

      {/* ---------- Hero ---------- */}
      <section className="ph">
        <div aria-hidden="true" className="hh-aurora" />
        <div aria-hidden="true" className="hh-grid" />
        <div className="ph-inner art-hero">
          <div>
            <nav aria-label="Breadcrumb" className="mod-crumbs">
              <ol>
                <li>
                  <Link href="/resources">Resources</Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>{resource.topic}</li>
              </ol>
            </nav>
            <p className="hh-eyebrow">
              <span aria-hidden="true" className="ph-dot" />
              {resource.kind} · {readingMinutes(resource)} min read
            </p>
            <h1 className="ph-title" style={{ maxWidth: "20ch" }}>
              {resource.heading}
            </h1>
            <p data-anim="" className="ph-body">
              {resource.summary}
            </p>
            <p className="art-meta">
              <span>By the VantriqAI team</span>
              <span aria-hidden="true">·</span>
              <time dateTime={resource.published}>{dateLabel(resource.published)}</time>
              {resource.updated ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Updated <time dateTime={resource.updated}>{dateLabel(resource.updated)}</time>
                  </span>
                </>
              ) : null}
            </p>
          </div>
          <GuideCover resource={resource} large />
        </div>
      </section>

      {/* ---------- Body ---------- */}
      <div className="art-layout">
        <aside className="art-side">
          <ArticleToc items={toc} />
        </aside>
        <article className="art-main">
          <aside className="takeaways" aria-label="Key takeaways">
            <p className="takeaways-title">
              <span aria-hidden="true" className="takeaways-icon">
                ✦
              </span>
              Key takeaways
            </p>
            <ol>
              {resource.takeaways.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </aside>
          <ArticleBody body={resource.body} />
          <ShareBar url={url} title={resource.title} />

          <div className="art-next">
            <p className="industry-panel-kicker">Where to go next</p>
            <div className="art-next-grid">
              {resource.related.map((r) => (
                <Link key={r.href} href={r.href} className="art-next-card">
                  <strong>{r.label}</strong>
                  <span>{r.note}</span>
                  <span aria-hidden="true" className="art-next-arrow">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </article>
      </div>

      {/* ---------- More guides ---------- */}
      <section className="art-more">
        <div className="split-head" style={{ marginBottom: 28 }}>
          <div>
            <p className="eyebrow">
              <span className="eyebrow-n">＋</span>
              Keep reading
            </p>
            <h2 style={{ fontSize: "clamp(26px,3.2vw,42px)", lineHeight: 1.02, letterSpacing: "-0.035em", margin: 0 }}>
              More from <span className="grad-text">Resources</span>
            </h2>
          </div>
          <p style={{ margin: 0 }}>
            <Link href="/resources" className="mod-more">
              All guides →
            </Link>
          </p>
        </div>
        <div className="guide-grid">
          {others.map((r) => (
            <Link key={r.slug} href={`/resources/${r.slug}`} className="guide-card">
              <GuideCover resource={r} />
              <span className="guide-meta">
                {r.kind} · {readingMinutes(r)} min read
              </span>
              <strong className="guide-title">{r.heading}</strong>
              <span className="guide-sum">{r.summary}</span>
            </Link>
          ))}
        </div>
      </section>

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
