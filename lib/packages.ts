import { TIERS, USAGE } from "@/lib/content";
import { productSlug, products, type Product } from "@/lib/products";
import type { Region } from "@/lib/region";

/**
 * The six packages, assembled from what the site already states elsewhere:
 * the tier lines in TIERS, the capacity table in USAGE, and each module's
 * "From <tier>" in lib/products. Which modules a package includes is worked
 * out from that catalogue, never listed by hand, so a module moving tier
 * moves on every package page and in the comparison at once.
 *
 * The only new words here are the per-package framing (who it suits, when
 * to move up), and they restate the tier lines rather than adding promises.
 */

export type Availability = "included" | "addon" | "none";

export type Package = {
  slug: string;
  index: number;
  name: string;
  tierLabel: string;
  audience: string;
  line: string;
  recommended: boolean;
  usage: (typeof USAGE)[number];
  headline: [string, string];
  lede: string;
  idealFor: string[];
  /** What this package adds over the one below it, beyond modules. */
  adds: string[];
  upgradeWhen?: string;
};

const COPY: Record<string, Omit<Package, "slug" | "index" | "name" | "tierLabel" | "audience" | "line" | "recommended" | "usage">> = {
  Starter: {
    headline: ["WhatsApp,", "answered around the clock"],
    lede: "One agent on your WhatsApp Business number, answering from your catalogue and FAQs at any hour — the simplest way to stop missing messages.",
    idealFor: ["A single shop, clinic or studio", "Customers who mostly reach you on WhatsApp", "A few hundred conversations a month"],
    adds: ["One agent on your WhatsApp Business number", "Answers from your catalogue and FAQs", "Replies around the clock"],
    upgradeWhen: "leads start slipping between the chat and your records, or customers begin reaching you on Instagram, Facebook or the phone.",
  },
  Growth: {
    headline: ["Every lead,", "into your pipeline"],
    lede: "Everything in Starter, plus CRM sync so every lead lands in your pipeline — with Instagram, Facebook and phone calls answered by the same agent.",
    idealFor: ["A growing team with a sales pipeline", "Customers on WhatsApp, Instagram, Facebook and the phone", "Around a thousand conversations a month"],
    adds: ["CRM sync — every lead lands in your pipeline"],
    upgradeWhen: "you want your website as a channel too, or you run more than one location and need bookings routed by branch.",
  },
  Scale: {
    headline: ["More locations,", "one agent"],
    lede: "Adds your website as a channel, with location-aware routing and availability — so each branch's calendar and stock stay right.",
    idealFor: ["Two or more locations or branches", "Website visitors you want to convert", "A few thousand conversations a month"],
    adds: ["Location-aware routing and availability"],
    upgradeWhen: "your customers' questions are complex enough to need top-tier AI models on every channel.",
  },
  Pro: {
    headline: ["Top-tier models,", "every channel"],
    lede: "Top-tier AI models across every channel your customers already use — for established businesses with complex products and high volume.",
    idealFor: ["An established corporate", "Complex products and detailed questions", "High volume across several channels"],
    adds: ["Top-tier AI models across every channel"],
    upgradeWhen: "data-residency rules mean the whole stack has to run on your own infrastructure.",
  },
  Enterprise: {
    headline: ["Your servers,", "your rules"],
    lede: "Adds a private on-premise deployment option for strict data residency — the same agents, with nothing leaving your network.",
    idealFor: ["Large enterprises", "Regulated sectors such as finance, healthcare and legal", "Strict data-residency requirements"],
    adds: ["Private on-premise deployment option"],
    upgradeWhen: "you need a custom SLA, integrations no standard connector covers, or capacity for the very highest volumes.",
  },
  "Enterprise+": {
    headline: ["Built around", "your operation"],
    lede: "Custom SLA, custom integrations and capacity for the highest message volumes — the package shaped entirely around how you run.",
    idealFor: ["The highest message volumes", "Integrations no standard connector covers", "Contractual service levels"],
    adds: ["Custom SLA", "Custom integrations", "Capacity for the highest message volumes"],
  },
};

export function packages(): Package[] {
  return TIERS.map((t, index) => ({
    slug: productSlug(t.name),
    index,
    name: t.name,
    tierLabel: t.tier.split(" · ")[0],
    audience: t.audience,
    line: t.body,
    recommended: t.tier.includes("Recommended"),
    usage: USAGE.find((u) => u.plan === t.name)!,
    ...COPY[t.name],
  }));
}

export const PACKAGE_SLUGS = () => packages().map((p) => p.slug);
export const getPackage = (slug: string) => packages().find((p) => p.slug === slug);

/** A module's availability on the package at `index`, read from its tier line. */
export function availability(product: Product, index: number): Availability {
  const tier = product.tier;
  if (tier === "In every plan") return "included";
  if (tier === "Add-on module") return "addon";
  const from = TIERS.findIndex((t) => tier === `From ${t.name}`);
  return from !== -1 && index >= from ? "included" : "none";
}

/** Platform features that are not modules, with the package they start at. */
export const PLATFORM_FEATURES: { label: string; from: number; only?: boolean }[] = [
  { label: "Natural language, in your customers' language", from: 0 },
  { label: "Configured to your workflow, catalogue and tone", from: 0 },
  { label: "Monthly tuning with our team", from: 0 },
  { label: "Voice notes understood and answered, up to the voice-minute allowance", from: 0 },
  { label: "CRM sync", from: 1 },
  { label: "Location-aware routing and availability", from: 2 },
  { label: "Top-tier AI models across every channel", from: 3 },
  { label: "Custom SLA and custom integrations", from: 5 },
];

export function modulesFor(region: Region, index: number) {
  const all = products(region);
  return {
    included: all.filter((p) => availability(p, index) === "included"),
    addons: all.filter((p) => availability(p, index) === "addon"),
    /** Modules that become included at exactly this package. */
    newHere: all.filter((p) => availability(p, index) === "included" && (index === 0 || availability(p, index - 1) !== "included")),
  };
}
