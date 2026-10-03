// Same-origin browser endpoint; only fixed aggregate dimensions reach the CRM.
const events = ["page_view", "chat_open", "whatsapp_click", "brief_sent"];
const sections = ["home", "products", "pricing", "industries", "contact", "how-it-works", "resources", "privacy", "cookies", "other"];
const buckets = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // The hosting proxy uses an internal HTTP origin in request.url. Trust only
  // our explicit public HTTPS origins, or an exact local development origin.
  const url = new URL(request.url);
  const allowed = origin === "https://www.vantriqai.com" || origin === "https://vantriqai.com" || (["localhost", "127.0.0.1"].includes(url.hostname) && origin === url.origin);
  if (!allowed) return Response.json({ error: "Same-origin requests only" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  const raw = await request.text();
  if (raw.length > 512) return Response.json({ error: "Payload too large" }, { status: 413 });
  let b;
  try { b = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!b || Array.isArray(b) || b.consent !== true || !events.includes(b.event) || !sections.includes(b.section) || !["pk", "global"].includes(b.region) || Object.keys(b).some(k => !["consent", "event", "section", "region"].includes(k))) return Response.json({ error: "Invalid event" }, { status: 400 });
  // Best-effort per-process abuse guard. IP is transient, never sent to analytics.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until < now) buckets.delete(key);
  const bucket = buckets.get(ip) || { count: 0, until: now + 60000 };
  if (++bucket.count > 60 || buckets.size > 10000) return Response.json({ error: "Rate limited" }, { status: 429 });
  buckets.set(ip, bucket);
  const endpoint = process.env.CRM_WEBHOOK_URL, key = process.env.CRM_WEBHOOK_KEY;
  if (!endpoint || !key) return Response.json({ error: "Analytics unavailable" }, { status: 503 });
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/webhooks/site-event`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify({ event: b.event, section: b.section, region: b.region }), signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ error: "Analytics unavailable" }, { status: 502 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Analytics unavailable" }, { status: 502 }); }
}
