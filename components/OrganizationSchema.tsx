import JsonLd from "@/components/JsonLd";
import { SITE_URL } from "@/lib/region";
import { DEFAULT_DESCRIPTION, SITE_NAME } from "@/lib/seo";
import { ORG_ID, websiteSchema } from "@/lib/schema";
import { SOCIAL_PROFILES } from "@/lib/social";
import { WHATSAPP_DISPLAY } from "@/lib/whatsapp";

/**
 * Organization structured data, so a search engine has something to attach
 * the brand to besides the word in the title tag.
 *
 * Rendered as a plain script in the body, which is what Next recommends over
 * a hand-written <head>. `<` is escaped to \\u003c: JSON.stringify does not
 * sanitise, and a stray "</script>" inside any of these strings would close
 * the tag early.
 *
 * sameAs is omitted while there are no profiles rather than emitted empty —
 * an empty array tells a crawler nothing. The list lives in lib/social.ts.
 */
export default function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/ventriqai-lockup-cobalt.svg`,
    description: DEFAULT_DESCRIPTION,
    // No postal address on purpose. The handoff put a city here and the site
    // named a different one; rather than pick, the company is described by
    // where it works instead of where it sits. Schema.org does not require an
    // address, and a wrong one is worse than none.
    areaServed: "Worldwide",
    // Spread, not assigned: while the list is empty the key should not
    // appear at all.
    ...(SOCIAL_PROFILES.length ? { sameAs: SOCIAL_PROFILES } : {}),
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: WHATSAPP_DISPLAY,
      availableLanguage: ["en"],
      areaServed: "Worldwide",
    },
  };

  return (
    <>
      <JsonLd schema={schema} />
      <JsonLd schema={websiteSchema()} />
    </>
  );
}
