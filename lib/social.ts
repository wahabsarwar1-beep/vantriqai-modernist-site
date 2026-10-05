/**
 * Official profiles, published as the Organization's `sameAs`.
 *
 * This is how a search engine ties the brand on this site to the same brand
 * elsewhere — the thing that turns a name in a title tag into an entity it
 * recognises. Only profiles VantriqAI actually controls belong here; a URL
 * that turns out to be somebody else's is worse than a short list.
 *
 * The footer's icon row and the contact page's "Follow along" row both read
 * this list, so adding one is adding a line. Order is display order.
 */
export const SOCIAL_PROFILES: string[] = [
  "https://www.instagram.com/vantriq_ai/",
  // A numeric profile URL works, but a vanity URL (facebook.com/vantriqai)
  // is a stronger signal and survives a profile being recreated. Worth
  // claiming the username, and swapping this line when it exists.
  "https://www.facebook.com/profile.php?id=61594465987920",
];

const SOCIAL_LABELS: Record<string, string> = {
  "facebook.com": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "x.com": "X",
  "twitter.com": "X",
  "youtube.com": "YouTube",
  "tiktok.com": "TikTok",
};

/** The platform's name for a profile URL, e.g. "Instagram". */
export const socialLabel = (url: string) => {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return SOCIAL_LABELS[host] ?? host;
};

/** "@handle" when the URL carries one (instagram.com/vantriq_ai), otherwise null. */
export const socialHandle = (url: string) => {
  const u = new URL(url);
  const first = u.pathname.split("/").filter(Boolean)[0];
  return first && !first.includes(".") && !u.search ? `@${first}` : null;
};
