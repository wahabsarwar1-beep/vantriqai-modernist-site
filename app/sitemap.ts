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
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // The guides exist once, not once per region, so they carry no alternates —
  // and lastModified is the article's own date, not the build's, so a crawler
  // is not told every guide changed every time the site is deployed.
  const resources: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/resources`, lastModified, changeFrequency: "weekly" as const, priority: 0.7 },
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
      lastModified,
      changeFrequency: path === "/" ? ("weekly" as const) : ("monthly" as const),
      priority: path === "/" ? 1 : 0.8,
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
