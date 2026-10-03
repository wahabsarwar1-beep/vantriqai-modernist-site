export const CONSENT_KEY = "vantriq.preferences.v1";
export const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;
export type Preferences = { version: 1; analytics: boolean; savedAt: number };
let volatileChoice: Preferences | null = null;
export function readPreferences(): Preferences | null {
  if (typeof window === "undefined") return null;
  let choice = volatileChoice;
  try { const raw = localStorage.getItem(CONSENT_KEY); if (raw) choice = JSON.parse(raw); } catch { /* Storage can be disabled. */ }
  return choice?.version === 1 && typeof choice.analytics === "boolean" && Number.isFinite(choice.savedAt) && choice.savedAt <= Date.now() && Date.now() - choice.savedAt < CONSENT_LIFETIME ? choice : null;
}
export function savePreferences(analytics: boolean) {
  volatileChoice = { version: 1, analytics, savedAt: Date.now() };
  try { localStorage.setItem(CONSENT_KEY, JSON.stringify(volatileChoice)); volatileChoice = null; } catch { /* Keep the choice for this page. */ }
  window.dispatchEvent(new Event("vantriq:preferences"));
}
export function analyticsContext(pathname: string) {
  const region = pathname === "/global" || pathname.startsWith("/global/") ? "global" : "pk";
  const path = region === "global" ? pathname.slice(7) : pathname;
  const first = path.split("/").filter(Boolean)[0] || "home";
  const section = ["home", "products", "pricing", "industries", "contact", "how-it-works", "resources", "privacy", "cookies"].includes(first) ? first : "other";
  return { region, section };
}
export function trackSiteEvent(event: "page_view" | "chat_open" | "whatsapp_click" | "brief_sent") {
  if (readPreferences()?.analytics !== true) return;
  // No URL queries, referrers, contact fields, session IDs or fingerprints.
  void fetch("/api/analytics", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "omit", body: JSON.stringify({ consent: true, event, ...analyticsContext(location.pathname) }), keepalive: true }).catch(() => {});
}
