/**
 * Two versions of one site.
 *
 * The Global pages are the Pakistan pages word for word. What changes is the
 * currency the plans are quoted in, the handful of illustrative lines that
 * name a Pakistani place or amount, and the links — which stay inside
 * whichever region the visitor is reading, so nobody is bounced back to PKR
 * by clicking "Products".
 *
 * Every page is one component rendered twice with a different record from
 * here, so there is no second copy of the copy to keep in sync. Adding a
 * third region is adding a record below and a folder under app/.
 */

export type RegionKey = "pk" | "global";

export type Region = {
  key: RegionKey;
  /** Prefix for every in-region link. The Pakistan site is the root. */
  base: "" | "/global";
  /** Shown in the region switcher. */
  label: string;
  /** The currency badge in the switcher. */
  currency: string;
  /** hreflang for this region's pages. */
  hreflang: string;
  /** Which column of USAGE carries this region's overage rate. */
  overageKey: "over" | "overUsd";
  /** The one sentence on Packages that names the currency. */
  pricingBody: string;
  /** Hero card outcomes and asks that would otherwise name PKR or a PK city. */
  quoteOutcome: string;
  propertyAsk: string;
  phonePlaceholder: string;
  /**
   * The language claim. Roman Urdu is a selling point at home and a
   * narrowing one abroad, where naming one country's language reads as a
   * limit rather than a feature.
   */
  languagesFigure: string;
  languagesLabel: string;
  languagesPhrase: string;
};

export const REGIONS: Record<RegionKey, Region> = {
  pk: {
    key: "pk",
    base: "",
    label: "Pakistan",
    currency: "PKR",
    hreflang: "en-PK",
    overageKey: "over",
    pricingBody:
      "A one-time setup fee plus a simple monthly plan, quoted in PKR after we scope your workflow. No hidden surprises, and no charge for normal business volume.",
    quoteOutcome: "Quote accepted · PKR value logged",
    propertyAsk: "Looking for a 2-bed in DHA, under 3 crore.",
    phonePlaceholder: "+92 341 1120049",
    languagesFigure: "EN·UR",
    languagesLabel: "english & roman urdu",
    languagesPhrase: "English or Roman Urdu",
  },
  global: {
    key: "global",
    base: "/global",
    label: "Global",
    currency: "US$",
    hreflang: "en",
    overageKey: "overUsd",
    pricingBody:
      "A one-time setup fee plus a simple monthly plan, quoted in US dollars after we scope your workflow. No hidden surprises, and no charge for normal business volume.",
    quoteOutcome: "Quote accepted · US$ value logged",
    propertyAsk: "Looking for a 2-bed downtown, under $400k.",
    phonePlaceholder: "+1 555 0143",
    languagesFigure: "ANY",
    languagesLabel: "language they write in",
    languagesPhrase: "whatever language they write in",
  },
};

export const DEFAULT_REGION = REGIONS.pk;

/**
 * The host the site is actually served from, and therefore the only host
 * canonicals, hreflang and the sitemap may name. The live site runs on www,
 * so pointing canonicals at the apex would point them at a redirect.
 *
 * If that ever flips, set NEXT_PUBLIC_SITE_URL at BUILD time and rebuild —
 * a restart will not pick it up, since NEXT_PUBLIC_* is inlined at compile.
 * Whichever host wins, the other must 301 to it, or the two are duplicates
 * of each other and the canonical tag alone will not settle it.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.vantriqai.com").replace(/\/$/, "");

/** The paths each region publishes, in nav order. */
export const REGION_PATHS = ["/", "/how-it-works", "/products", "/industries", "/pricing", "/contact"] as const;

/** An in-region link: hrefIn(REGIONS.global, "/pricing") === "/global/pricing". */
export function hrefIn(region: Region, path: string): string {
  if (path === "/") return region.base || "/";
  return region.base + path;
}

/** Which region a pathname belongs to. Anything unprefixed is Pakistan. */
export function regionFromPathname(pathname: string): Region {
  return pathname === "/global" || pathname.startsWith("/global/") ? REGIONS.global : REGIONS.pk;
}

/** The same page in the other region, for the switcher. */
export function pathInRegion(pathname: string, region: Region): string {
  const current = regionFromPathname(pathname);
  const bare = current.base ? pathname.slice(current.base.length) || "/" : pathname;
  return hrefIn(region, bare);
}

/** A nav entry's href: region-prefixed unless the page lives outside the trees. */
export function navHref(region: Region, link: { href: string; regionless?: boolean }): string {
  return link.regionless ? link.href : hrefIn(region, link.href);
}
