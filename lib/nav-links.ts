/**
 * `regionless` links are the same page whichever currency you are browsing
 * in, so they are never prefixed with /global. The guides are one copy linked
 * from both trees — publishing them twice would manufacture exactly the
 * duplicate content the canonical tags work to avoid.
 */
export const NAV_LINKS = [
  /* Home is the wordmark, and How it works opens the Platform panel — both
     were costing width in a bar that has wrapped three times, and neither
     needed a slot of its own. */
  { href: "/products", label: "Platform" },
  { href: "/industries", label: "Industries" },
  { href: "/pricing", label: "Packages" },
  { href: "/resources", label: "Resources", regionless: true },
  { href: "/contact", label: "Contact" },
] as const satisfies readonly { href: string; label: string; regionless?: boolean }[];
