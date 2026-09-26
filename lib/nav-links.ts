/**
 * `regionless` links are the same page whichever currency you are browsing
 * in, so they are never prefixed with /global. The guides are one copy linked
 * from both trees — publishing them twice would manufacture exactly the
 * duplicate content the canonical tags work to avoid.
 */
export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/products", label: "Products" },
  { href: "/industries", label: "Industries" },
  { href: "/pricing", label: "Packages" },
  { href: "/resources", label: "Resources", regionless: true },
  { href: "/contact", label: "Contact" },
] as const satisfies readonly { href: string; label: string; regionless?: boolean }[];
