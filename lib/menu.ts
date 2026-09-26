import { SECTORS, TIERS } from "@/lib/content";
import { PRODUCT_GROUPS, productSlug, products } from "@/lib/products";
import { hrefIn, navHref, type Region } from "@/lib/region";
import { RESOURCES } from "@/lib/resources";

/**
 * The navigation menus, built from the same arrays the pages render.
 *
 * Every item goes somewhere distinct. The modules and the sectors live as
 * sections on one page each, so they are anchors — which is a real
 * destination, not fourteen links to the same URL dressed up as depth. The
 * anchors come from productSlug, the same function that stamps the ids onto
 * the cards, so a renamed module cannot leave a menu entry pointing at
 * nothing.
 */

export type MenuLink = { href: string; label: string; note?: string };
export type MenuColumn = { title: string; links: MenuLink[] };
/** The promoted card at the end of a panel — one next step, not a link list. */
export type MenuFeature = { title: string; body: string; href: string; cta: string };

export type MenuPanel = {
  /** The nav item that opens it. */
  label: string;
  /** Where the trigger itself goes, for anyone who clicks the word. */
  href: string;
  columns: MenuColumn[];
  /** The panel's closing line, pointing at the whole page. */
  footer: MenuLink;
  feature?: MenuFeature;
};

const GROUP_TITLES: Record<string, string> = {
  Channel: "Channels",
  Capability: "Capabilities",
  Deployment: "Deployment",
};

export function menuPanels(region: Region): MenuPanel[] {
  const all = products(region);

  return [
    {
      label: "Products",
      href: navHref(region, { href: "/products" }),
      columns: PRODUCT_GROUPS.map((group) => ({
        title: GROUP_TITLES[group] ?? group,
        links: all
          .filter((p) => p.kicker === group)
          .map((p) => ({
            href: `${hrefIn(region, "/products")}#${productSlug(p.name)}`,
            label: p.name,
            note: p.tier,
          })),
      })),
      footer: { href: navHref(region, { href: "/products" }), label: `All ${all.length} modules` },
      feature: {
        title: "Not sure which you need?",
        body: "Describe how customers reach you today and we will say which modules that actually takes.",
        href: navHref(region, { href: "/contact" }),
        cta: "Send a brief",
      },
    },
    {
      label: "Industries",
      href: navHref(region, { href: "/industries" }),
      columns: [
        {
          title: "By sector",
          links: SECTORS.slice(0, 5).map((s) => ({
            href: `${hrefIn(region, "/industries")}#${productSlug(s.name)}`,
            label: s.name,
            note: s.kicker,
          })),
        },
        {
          title: " ",
          links: SECTORS.slice(5).map((s) => ({
            href: `${hrefIn(region, "/industries")}#${productSlug(s.name)}`,
            label: s.name,
            note: s.kicker,
          })),
        },
      ],
      footer: { href: navHref(region, { href: "/industries" }), label: "Every sector we work in" },
      feature: {
        title: "Your sector not listed?",
        body: "The agent is configured to your workflow, not to an industry template. The list is where we have done it before, not a limit.",
        href: navHref(region, { href: "/contact" }),
        cta: "Tell us how you work",
      },
    },
    {
      label: "Packages",
      href: navHref(region, { href: "/pricing" }),
      columns: [
        {
          title: "Tiers",
          links: TIERS.map((t) => ({
            href: `${hrefIn(region, "/pricing")}#${productSlug(t.name)}`,
            label: t.name,
            note: t.audience,
          })),
        },
        {
          title: "Before you buy",
          links: [
            { href: `${hrefIn(region, "/pricing")}#what-each-tier-carries`, label: "What each tier carries", note: "Sessions, headroom, overage" },
            { href: `${hrefIn(region, "/pricing")}#questions`, label: "Common questions", note: "Seven, answered plainly" },
          ],
        },
      ],
      footer: { href: navHref(region, { href: "/pricing" }), label: "Compare every package" },
      feature: {
        title: "Not sure which tier?",
        body: "Send us a month of message volume and we will confirm the tier in writing, with the setup fee.",
        href: navHref(region, { href: "/contact" }),
        cta: "Get it in writing",
      },
    },
    {
      label: "Resources",
      href: "/resources",
      columns: [
        {
          title: "Guides",
          links: RESOURCES.map((r) => ({
            href: `/resources/${r.slug}`,
            label: r.title,
            note: r.kind,
          })),
        },
      ],
      footer: { href: "/resources", label: "All guides" },
      feature: {
        title: RESOURCES[0].heading,
        body: RESOURCES[0].summary,
        href: `/resources/${RESOURCES[0].slug}`,
        cta: "Read the guide",
      },
    },
  ];
}
