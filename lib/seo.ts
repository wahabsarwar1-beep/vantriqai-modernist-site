import type { Metadata } from "next";
import { hrefIn, REGIONS, type Region } from "@/lib/region";

/** The generated card at app/opengraph-image.tsx. */
const OG_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "VantriqAI — AI agents that answer, qualify and book your customers",
};

export const SITE_NAME = "VantriqAI";

export const DEFAULT_TITLE = "VantriqAI — AI Agents That Answer Your Customers Instantly";

export const DEFAULT_DESCRIPTION =
  "VantriqAI builds AI agents that answer, qualify and book customers on WhatsApp, Instagram and your website — for businesses of any size, worldwide.";

/**
 * Every page's title and description, in one table.
 *
 * Both region trees read from here, so a description is written once rather
 * than kept in step across twelve route files. `title` is the segment the
 * root layout's "%s | VantriqAI" template wraps; the home page overrides the
 * whole title instead, since "VantriqAI … | VantriqAI" reads badly.
 *
 * The global tree needs its own titles rather than a suffix bolted on: the
 * currency only distinguishes the pricing page, so "Contact (US$)" would be
 * noise, and a blanket suffix pushed the global home title to 72 characters —
 * past the point a result list truncates it.
 */
type PageSeo = {
  title: string;
  description: string;
  globalTitle?: string;
  globalDescription?: string;
};

const PAGES: Record<string, PageSeo> = {
  "/": {
    title: DEFAULT_TITLE,
    globalTitle: "VantriqAI Global — AI Agents That Answer Instantly",
    description: DEFAULT_DESCRIPTION,
    globalDescription:
      "VantriqAI builds AI agents that answer, qualify and book customers on WhatsApp, Instagram and your website — quoted in US dollars, for any business size.",
  },
  "/how-it-works": {
    title: "How It Works",
    globalTitle: "How It Works — Global",
    description:
      "How VantriqAI builds and deploys your AI agent: discovery, build, integration with your tools, and go-live — typically 2–4 weeks.",
  },
  "/products": {
    title: "Products",
    globalTitle: "Products — Global",
    description:
      "VantriqAI's AI agent modules — reception, booking, catalogue, qualifier, follow-up, escalation, payments and insights — on WhatsApp, Instagram and the web.",
  },
  "/industries": {
    title: "Industries",
    globalTitle: "Industries — Global",
    description:
      "AI agents built for how each industry actually sells and supports on WhatsApp, Instagram and the web — retail, real estate, clinics, services and more.",
  },
  "/pricing": {
    title: "Pricing",
    globalTitle: "Pricing in US Dollars",
    description:
      "VantriqAI pricing for AI agents that handle WhatsApp, Instagram and website conversations — plans for businesses of every size, quoted in PKR.",
    globalDescription:
      "VantriqAI pricing in US dollars for AI agents handling WhatsApp, Instagram and website conversations — plans for every size, from solo founder to enterprise.",
  },
  "/contact": {
    title: "Contact",
    globalTitle: "Contact — Global",
    description:
      "Talk to VantriqAI about an AI agent for your business — WhatsApp, Instagram and website automation, for any business size, worldwide.",
  },
};

/**
 * Canonical, hreflang, Open Graph and Twitter for a page that exists in both
 * regions.
 *
 * Two near-identical trees is exactly the shape a search engine reads as
 * duplicate content, so each page names itself canonical and points at its
 * counterpart. x-default goes to Global: it is the page for a visitor whose
 * country we have no better answer for. The global titles carry "(US$)" so
 * the two are told apart in a result list by a human, not just a crawler.
 */
export function regionMetadata(region: Region, path: string): Metadata {
  const page = PAGES[path];
  if (!page) throw new Error(`No SEO entry for ${path}`);

  const isGlobal = region.key === "global";
  const isHome = path === "/";
  const description = (isGlobal && page.globalDescription) || page.description;

  const segment = (isGlobal && page.globalTitle) || page.title;
  const fullTitle = isHome ? segment : `${segment} | ${SITE_NAME}`;

  const url = hrefIn(region, path);

  return {
    // Named explicitly rather than inherited: a page that sets `openGraph`
    // replaces the layout's whole object, and the opengraph-image file
    // convention only merges into the segment it sits in. Leave this out and
    // every page but the home page shares a card with no picture on it.
    // The home page replaces the whole title; everything else is a segment
    // the root template wraps.
    title: isHome ? { absolute: fullTitle } : segment,
    description,
    alternates: {
      canonical: url,
      languages: {
        "en-PK": hrefIn(REGIONS.pk, path),
        en: hrefIn(REGIONS.global, path),
        "x-default": hrefIn(REGIONS.global, path),
      },
    },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: isGlobal ? "en_US" : "en_PK",
      type: "website",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [OG_IMAGE],
    },
  };
}
