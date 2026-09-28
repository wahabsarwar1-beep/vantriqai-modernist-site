import type { ColumnIconId } from "@/components/ColumnIcon";
import type { MarkId } from "@/components/ProductMark";
import type { GlyphId } from "@/components/MenuGlyph";
import { SECTORS, TIERS } from "@/lib/content";
import { PRODUCT_GROUPS, productSlug, products } from "@/lib/products";
import { hrefIn, navHref, type Region } from "@/lib/region";
import { RESOURCES } from "@/lib/resources";
import { sectorSlug } from "@/lib/industries";

/**
 * The navigation menus, built from the same arrays the pages render.
 *
 * Every item goes somewhere distinct. The modules and the sectors live as
 * sections on one page each, so they are anchors — which is a real
 * destination, not a dozen links to the same URL dressed up as depth. The
 * anchors come from productSlug, the same function that stamps the ids onto
 * the cards, so a renamed module cannot leave a menu entry pointing at
 * nothing.
 */

export type MenuLink = { href: string; label: string; note?: string; mark?: MarkId; isNew?: boolean; glyph?: GlyphId };
export type MenuColumn = { title: string; icon?: ColumnIconId; links: MenuLink[] };
/** The promoted card at the end of a panel — one next step, not a link list. */
export type MenuFeature = { title: string; body: string; href: string; cta: string; kicker?: string; bullets?: string[] };

/** The panel's opening statement: a tinted card, not another list item. */
export type MenuHero = { title: string; body: string; href: string; cta: string; kicker?: string };

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
  Insight: "insight",
  Deployment: "deployment",
};

const GROUP_TITLES: Record<string, string> = {
  Channel: "Channels",
  Capability: "Capabilities",
  Insight: "Insight & people",
  Deployment: "Deployment",
};

const GUIDE_GLYPHS: Record<string, GlyphId> = {
  "lead-response-time-benchmarks": "guide-speed",
  "whatsapp-business-app-vs-platform": "guide-compare",
  "choosing-an-ai-agent-checklist": "guide-checklist",
};

export function menuPanels(region: Region): MenuPanel[] {
  const all = products(region);
  const sectorLink = (s: (typeof SECTORS)[number]): MenuLink => {
    const slug = sectorSlug(s.name);
    return { href: hrefIn(region, `/industries/${slug}`), label: s.name, note: s.kicker, glyph: slug as GlyphId };
  };

  return [
    {
      label: "Platform",
      href: navHref(region, { href: "/products" }),
      /* Four module groups leave no room for a closing card, so the panel
         opens with the launch instead — the one thing new in the catalogue. */
      hero: {
        kicker: "Just launched",
        title: "Vantriq Pulse & Echo",
        body: "Live analytics on every conversation, and satisfaction surveys that feed it — plus Human Support, AI agent assist for your team.",
        href: hrefIn(region, "/products/vantriq-pulse"),
        cta: "Meet Pulse",
      },
      columns: PRODUCT_GROUPS.map((group) => ({
        title: GROUP_TITLES[group] ?? group,
        icon: GROUP_ICONS[group],
        links: all
          .filter((p) => p.kicker === group)
          .map((p) => ({
            href: hrefIn(region, `/products/${productSlug(p.name)}`),
            label: p.name,
            note: p.tier,
            mark: p.mark,
            isNew: p.isNew,
          })),
      })),
      footer: { href: navHref(region, { href: "/products" }), label: `All ${all.length} modules` },
    },
    {
      label: "Industries",
      href: navHref(region, { href: "/industries" }),
      hero: {
        title: `${SECTORS.length} sectors, one agent`,
        body: "The same core agent, tuned to how your sector actually sells and supports — your catalogue, your booking rules, your tone.",
        href: navHref(region, { href: "/industries" }),
        cta: "Browse every sector",
      },
      columns: [
        {
          title: "By sector",
          icon: "sectors",
          links: SECTORS.slice(0, 6).map(sectorLink),
        },
        {
          title: " ",
          links: SECTORS.slice(6).map(sectorLink),
        },
      ],
      footer: { href: navHref(region, { href: "/industries" }), label: "Every sector we work in" },
      feature: {
        kicker: "Anything else",
        title: "Your sector not listed?",
        body: "The agent is configured to your workflow, not to an industry template. The list is where we start, not a limit.",
        href: navHref(region, { href: "/contact" }),
        cta: "Talk to us",
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
            href: hrefIn(region, `/pricing/${productSlug(t.name)}`),
            label: t.name,
            note: t.audience,
            glyph: productSlug(t.name) as GlyphId,
          })),
        },
        {
          title: "Before you buy",
          icon: "guides",
          links: [
            { href: `${hrefIn(region, "/pricing")}#find`, label: "Find your package", note: "Volume, channels, needs", glyph: "find" },
            { href: `${hrefIn(region, "/pricing")}#compare`, label: "Compare every package", note: "Modules, features, capacity", glyph: "compare" },
            { href: `${hrefIn(region, "/pricing")}#questions`, label: "Common questions", note: "Seven, answered plainly", glyph: "questions" },
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
            glyph: GUIDE_GLYPHS[r.slug] ?? "guides",
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
