import { hrefIn, SITE_URL, type Region } from "@/lib/region";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { FAQS, TIERS } from "@/lib/content";

/**
 * schema.org graphs for the pages that have something concrete to declare.
 *
 * This is the part of SEO a small site can win outright: structured data is
 * read the same way whoever publishes it, so a correct, specific graph earns
 * the same treatment as a large competitor's. Every claim below is drawn from
 * copy already on the page — nothing is invented for the crawler that a
 * visitor cannot also read.
 */

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

const abs = (region: Region, path: string) => {
  const href = hrefIn(region, path);
  return href === "/" ? SITE_URL : SITE_URL + href;
};

/** The site itself, tied to the organization that publishes it. */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

/**
 * The trail a result can show in place of a bare URL.
 *
 * Home is always the first crumb, in whichever region the page belongs to, so
 * the US$ tree's breadcrumbs stay inside the US$ tree.
 */
export function breadcrumbSchema(region: Region, path: string, label: string) {
  const items = [
    { name: region.key === "global" ? "Home (US$)" : "Home", item: abs(region, "/") },
    { name: label, item: abs(region, path) },
  ];

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

/**
 * What is actually sold, as a catalogue of the six tiers.
 *
 * No price: the site does not quote one before a discovery call, and a
 * structured price that contradicts the page would be worse than none. The
 * catalogue still says what the offers are and who each is for.
 */
export function serviceSchema(region: Region) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "AI customer agents for WhatsApp, Instagram and the web",
    serviceType: "Conversational AI automation",
    provider: { "@id": ORG_ID },
    areaServed: region.key === "global" ? "Worldwide" : "PK",
    description: DEFAULT_DESCRIPTION,
    url: abs(region, "/pricing"),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "VantriqAI packages",
      itemListElement: TIERS.map((tier, i) => ({
        "@type": "Offer",
        position: i + 1,
        name: tier.name,
        description: tier.body,
        category: tier.audience,
        priceCurrency: region.key === "global" ? "USD" : "PKR",
        availability: "https://schema.org/InStock",
        url: abs(region, "/pricing"),
      })),
    },
  };
}

/**
 * The seven questions already answered on the Packages page.
 *
 * Worth knowing: Google narrowed FAQ rich results to government and health
 * sites in 2023, so this is unlikely to draw the expandable answers it once
 * did. It is still valid, still parsed, and still describes the page to
 * anything else reading it — it just should not be expected to change how the
 * listing looks.
 */
export function faqSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };
}

export { ORG_ID };
