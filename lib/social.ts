/**
 * Official profiles, published as the Organization's `sameAs`.
 *
 * This is how a search engine ties the brand on this site to the same brand
 * elsewhere — the thing that turns a name in a title tag into an entity it
 * recognises. Only profiles VantriqAI actually controls belong here; a URL
 * that turns out to be somebody else's is worse than a short list.
 *
 * Adding one is adding a line. Order does not matter.
 */
export const SOCIAL_PROFILES: string[] = [
  // A numeric profile URL works, but a vanity URL (facebook.com/vantriqai)
  // is a stronger signal and survives a profile being recreated. Worth
  // claiming the username, and swapping this line when it exists.
  "https://www.facebook.com/profile.php?id=61594465987920",
];
