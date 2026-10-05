import { SECTORS, TIERS } from "@/lib/content";
import { sectorSlug } from "@/lib/industries";
import { productSlug, products } from "@/lib/products";
import { hrefIn, type Region } from "@/lib/region";
import { waLink } from "@/lib/whatsapp";

/**
 * Where a name in an assistant card should link. Cards carry a module,
 * package or industry name — never a URL — and this maps it onto the site's
 * own pages in the visitor's region, so the model cannot invent a link.
 */
const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9+]+/g, " ").trim();

export type CardLink = { href: string; kind: "Module" | "Package" | "Industry" };

export function linkForName(region: Region, name: string): CardLink | null {
  const n = norm(name);
  if (!n) return null;

  const product = products(region).find((p) => norm(p.name) === n);
  if (product) return { href: hrefIn(region, `/products/${productSlug(product.name)}`), kind: "Module" };

  const tier = TIERS.find((t) => norm(t.name) === n || `${norm(t.name)} package` === n || `${norm(t.name)} plan` === n);
  if (tier) return { href: hrefIn(region, `/pricing/${productSlug(tier.name)}`), kind: "Package" };

  const sector = SECTORS.find((s) => norm(s.name) === n || norm(s.name).split(" and ")[0] === n);
  if (sector) {
    const slug = sectorSlug(sector.name);
    if (slug) return { href: hrefIn(region, `/industries/${slug}`), kind: "Industry" };
  }
  return null;
}

/** The fixed destinations an "actions" block may name. */
export function namedLink(region: Region, link: "whatsapp" | "contact" | "pricing" | "products" | "industries"): { href: string; external: boolean } {
  if (link === "whatsapp") return { href: waLink(), external: true };
  return { href: hrefIn(region, `/${link}`), external: false };
}
