import type { ReactNode } from "react";
import { type MarkId } from "@/components/ProductMark";
import type { Region } from "@/lib/region";

/**
 * The module catalogue, in one place.
 *
 * Both the Products page and the navigation menu read this. Keeping the menu's
 * own copy of the names would mean renaming a module in two files and finding
 * out you forgot when a menu link scrolled to nothing.
 */
export type Product = {
  kicker: "Channel" | "Capability" | "Deployment";
  name: string;
  body: string;
  tier: string;
  tint: "accent" | "dark";
  featured?: boolean;
  mark?: MarkId;
  icon?: ReactNode;
};

const bg = "var(--color-bg)";

/* A function of the region: the WhatsApp module names the languages it
   answers in, and that claim is not the same one abroad. */
export const products = (region: Region): Product[] => [
  {
    kicker: "Channel", name: "WhatsApp Agent", tier: "From Starter", tint: "accent", featured: true, mark: "whatsapp",
    body: `The core module. Answers, qualifies and books on the channel your customers already open twenty times a day — in ${region.languagesPhrase}, any hour.`,
  },
  {
    kicker: "Channel", name: "Social Agent", tier: "From Growth", tint: "accent", mark: "social",
    body: "Instagram and Facebook DMs, plus comment-to-DM: a question under a post becomes a qualified conversation before your competitor replies.",
  },
  {
    kicker: "Channel", name: "Website Agent", tier: "From Scale", tint: "accent", mark: "website",
    body: "The embedded assistant on your own site — the widget in the corner of this page. Same brain, same actions, no app to download.",
  },
  {
    kicker: "Channel", name: "Voice Agent", tier: "From Growth", tint: "accent",
    body: "Answers your business phone in a natural voice, handles the same reception and booking as the chat agent, and hands off cleanly when a call needs a person.",
    icon: (<svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-5 0-9 4-9 9v9c0 5 4 9 9 9s9-4 9-9v-9c0-5-4-9-9-9z" fill={bg} /><path d="M14 24c0 6 4.5 10.6 10 11s10-5 10-11" stroke={bg} strokeWidth={4} fill="none" /><rect x="17" y="41" width="14" height="4" fill={bg} /></svg>),
  },
  {
    kicker: "Capability", name: "Booking Agent", tier: "Add-on module", tint: "dark", mark: "booking",
    body: "Checks real availability, writes the appointment into your calendar, sends the reminder, and handles the reschedule when it comes.",
  },
  {
    kicker: "Capability", name: "Catalogue Agent", tier: "Add-on module", tint: "dark", mark: "catalogue",
    body: "Answers stock, size, price and variant questions against live inventory, shares the right product, and holds the item while the customer decides.",
  },
  {
    kicker: "Capability", name: "Lead Qualifier", tier: "From Growth", tint: "dark", mark: "lead",
    body: "Asks the qualifying questions your sales team would ask, scores the lead, and writes it into your CRM with the full transcript attached.",
  },
  {
    kicker: "Capability", name: "Escalation Desk", tier: "In every plan", tint: "dark", mark: "escalation",
    body: "The handover layer. Routes anything needing judgement to the right person with the conversation attached, and folds recurring cases into the next tuning round.",
  },
  {
    kicker: "Capability", name: "Follow-up Agent", tier: "Add-on module", tint: "dark", mark: "followup",
    body: "Abandoned carts, unanswered quotes and half-finished bookings, reopened once and politely at the hour people actually reply.",
  },
  {
    kicker: "Capability", name: "Outreach Agent", tier: "From Growth", tint: "dark", mark: "outreach",
    body: "Reactivation lists, seasonal offers and WhatsApp broadcasts drafted for the segment worth the message. Nothing sends until you approve it.",
  },
  {
    kicker: "Capability", name: "Payments Agent", tier: "Add-on module", tint: "dark", mark: "payments",
    body: "Sends the payment link inside the conversation, confirms receipt, and chases the unpaid invoice on the schedule you set.",
  },
  {
    kicker: "Capability", name: "Insights Digest", tier: "In every plan", tint: "dark", mark: "insights",
    body: "What customers asked, what they abandoned and which hours cost you money — one Monday digest in plain language, not a wall of charts.",
  },
  {
    kicker: "Deployment", name: "Private Deployment", tier: "From Enterprise", tint: "dark", mark: "deployment",
    body: "The whole stack self-hosted on your infrastructure, for strict data-residency requirements. Same agents, nothing leaving your network.",
  },
  {
    kicker: "Deployment", name: "Custom Module", tier: "From Scale", tint: "dark", mark: "custom",
    body: "The one thing only your business does, built during onboarding: your name for it, your tone, your rules, your sign-off before it acts.",
  },
];

/** The anchor a module's card carries, and the menu links to. */
export const productSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const PRODUCT_GROUPS: Product["kicker"][] = ["Channel", "Capability", "Deployment"];
