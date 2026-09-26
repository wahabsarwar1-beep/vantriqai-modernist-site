import type { Metadata } from "next";
import { hrefIn, REGIONS, type Region } from "@/lib/region";

/**
 * Canonical + hreflang for a page that exists in both regions.
 *
 * Two near-identical trees is exactly the shape a search engine reads as
 * duplicate content, so each page has to name itself as canonical and point
 * at its counterpart. x-default goes to Global: it is the page for a visitor
 * whose language or country we have no better answer for.
 */
export function regionMetadata(region: Region, path: string, title: string, description: string): Metadata {
  return {
    title,
    description,
    alternates: {
      canonical: hrefIn(region, path),
      languages: {
        "en-PK": hrefIn(REGIONS.pk, path),
        en: hrefIn(REGIONS.global, path),
        "x-default": hrefIn(REGIONS.global, path),
      },
    },
  };
}
