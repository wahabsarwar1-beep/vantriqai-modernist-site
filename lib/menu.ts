import type { ColumnIconId } from "@/components/ColumnIcon";
import type { MarkId } from "@/components/ProductMark";
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

export type MenuLink = { href: string; label: string; note?: string; mark?: MarkId };
export type MenuColumn = { title: string; icon?: ColumnIconId; links: MenuLink[] };
/** The promoted card at the end of a panel — one next step, not a link list. */
export type MenuFeature = { title: string; body: string; href: string; cta: string; kicker?: string; bullets?: string[] };

/** The panel's opening statement: a tinted card, not another list item. */
export type MenuHero = { title: string; body: string; href: string; cta: string };

export type MenuPanel = {
  /** The nav item that opens it. */
  label: string;
  hero?: MenuHero;
  /** Where the trigger itself goes, for anyone who clicks the word. */
  href: string;
  columns: MenuColumn[];
  /** The panel's closing line, pointing at the whole page. */
  footer: MenuLink;
  feature?: MenuFeature;
};

const GROUP_ICONS: Record<string, ColumnIconId> = {
  Channel: "channels",
  Capability: "capabilities",
  Deployment: "deployment",
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
      label: "Platform",
      href: navHref(region, { href: "/products" }),
      hero: {
        title: "One platform, fourteen modules",
        body: "Switch on what your day needs. The rest stay quiet until you want them, and nothing is rebuilt when you add one.",
        href: navHref(region, { href: "/how-it-works" }),
        cta: "See how it works",
      },
      columns: PRODUCT_GROUPS.map((group) => ({
        title: GROUP_TITLES[group] ?? group,
        icon: GROUP_ICONS[group],
        links: all
          .filter((p) => p.kicker === group)
          .map((p) => ({
            href: `${hrefIn(region, "/products")}#${productSlug(p.name)}`,
            label: p.name,
            note: p.tier,
            mark: p.mark,
          })),
      })),
      footer: { href: navHref(region, { href: "/products" }), label: `All ${all.length} modules` },
      feature: {
        kicker: "Start here",
        title: "Not sure which you need?",
        body: "Describe how customers reach you today and we will say which modules that actually takes.",
        bullets: ["Fifteen-minute discovery call", "Scoped against your real message history", "Fixed setup fee, in writing"],
        href: navHref(region, { href: "/contact" }),
        cta: "Send a brief",
      },
    },
    {
      label: "Industries",
      href: navHref(region, { href: "/industries" }),
      hero: {
        title: "Ten sectors, one agent",
        body: "The same core agent, tuned to how your sector actually sells and supports — your catalogue, your booking rules, your tone.",
        href: navHref(region, { href: "/industries" }),
        cta: "Browse every sector",
      },
      columns: [
        {
          title: "By sector",
          icon: "sectors",
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
        kicker: "Anything else",
        title: "Your sector not listed?",
        body: "The agent is configured to your workflow, not to an industry template. The list is where we have done it before, not a limit.",
        href: navHref(region, { href: "/contact" }),
        cta: "Tell us how you work",
      },
    },
    {
      label: "Packages",
      href: navHref(region, { href: "/pricing" }),
      hero: {
        title: "Six tiers, one clear path",
        body: "A one-time setup fee plus a monthly plan, quoted after we scope your workflow. No charge for normal business volume.",
        href: navHref(region, { href: "/pricing" }),
        cta: "Compare the tiers",
      },
      columns: [
        {
          title: "Tiers",
          icon: "tiers",
          links: TIERS.map((t) => ({
            href: `${hrefIn(region, "/pricing")}#${productSlug(t.name)}`,
            label: t.name,
            note: t.audience,
          })),
        },
        {
          title: "Before you buy",
          icon: "guides",
          links: [
            { href: `${hrefIn(region, "/pricing")}#what-each-tier-carries`, label: "What each tier carries", note: "Sessions, headroom, overage" },
            { href: `${hrefIn(region, "/pricing")}#questions`, label: "Common questions", note: "Seven, answered plainly" },
          ],
        },
      ],
      footer: { href: navHref(region, { href: "/pricing" }), label: "Compare every package" },
      feature: {
        kicker: "Get a number",
        title: "Not sure which tier?",
        body: "Send us a month of message volume and we will confirm the tier in writing.",
        bullets: ["Volume checked against the tier", "Overage rate stated up front", "No charge for a normal month"],
        href: navHref(region, { href: "/contact" }),
        cta: "Get it in writing",
      },
    },
    {
      label: "Resources",
      href: "/resources",
      hero: {
        title: "The evidence, not the pitch",
        body: "Guides built from published research, with every figure attributed on the line it appears.",
        href: "/resources",
        cta: "All guides",
      },
      columns: [
        {
          title: "Guides",
          icon: "guides",
          links: RESOURCES.map((r) => ({
            href: `/resources/${r.slug}`,
            label: r.title,
            note: r.kind,
          })),
        },
      ],
      footer: { href: "/resources", label: "All guides" },
      feature: {
        kicker: "Newest guide",
        title: RESOURCES[0].heading,
        body: RESOURCES[0].summary,
        href: `/resources/${RESOURCES[0].slug}`,
        cta: "Read the guide",
      },
    },
  ];
}
