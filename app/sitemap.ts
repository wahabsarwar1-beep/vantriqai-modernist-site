import type { MetadataRoute } from "next";
import { hrefIn, REGIONS, REGION_PATHS, SITE_URL } from "@/lib/region";
import { RESOURCES } from "@/lib/resources";

/**
 * Both regions, with each entry naming its counterpart.
 *
 * The two trees are the same pages in two currencies, which is the shape a
 * crawler is most likely to read as duplication. Declaring the pair here as
 * well as in each page's <head> is what tells it they are alternates of one
 * another rather than one copying the other.
 */
/**
 * When the marketing pages last actually changed — not when the site was last
 * built.
 *
 * `new Date()` here would stamp all twelve region pages with every deploy,
 * including deploys that touched nothing they contain. A crawler only trusts
 * lastmod while it stays accurate, so a date that moves for unrelated reasons
 * is worse than no date at all.
 *
 * Bump this when the copy, layout or structure of the marketing pages
 * changes. Leave it alone for a schema tweak, a dependency bump or a CRM
 * deploy. The guides never use it — each carries its own date.
 */
const PAGES_UPDATED = new Date("2026-09-26T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  // The index is a list of the guides, so it genuinely changes whenever one
  // is added — which is the newest publication date on it.
  const indexUpdated = RESOURCES.reduce((latest, r) => {
    const d = new Date(r.updated ?? r.published);
    return d > latest ? d : latest;
  }, PAGES_UPDATED);

  const resources: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/resources`, lastModified: indexUpdated, changeFrequency: "weekly" as const, priority: 0.7 },
    ...RESOURCES.map((resource) => ({
      url: `${SITE_URL}/resources/${resource.slug}`,
      lastModified: new Date(resource.updated ?? resource.published),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];

  const regions = Object.values(REGIONS).flatMap((region) =>
    REGION_PATHS.map((path) => ({
      url: SITE_URL + hrefIn(region, path),
      lastModified: PAGES_UPDATED,
      changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
      // The Pakistan tree is the default one, so its home page is the single
      // highest-priority URL; the global home sits just under it rather than
      // tying with it.
      priority: path === "/" ? (region.key === "pk" ? 1 : 0.9) : 0.8,
      alternates: {
        languages: {
          "en-PK": SITE_URL + hrefIn(REGIONS.pk, path),
          en: SITE_URL + hrefIn(REGIONS.global, path),
        },
      },
    })),
  );

  return [...regions, ...resources];
}
