import { readBoundedBody, limitPublicRequest } from '../../../lib/request-guard';
import { isIP } from "node:net";

// Browser payloads contain fixed dimensions only. The server adds the proxy IP
// for a local CRM lookup; the CRM stores country/city counters, never the IP.
const events = ["page_view", "chat_open", "whatsapp_click", "brief_sent"];
const sections = ["home", "products", "pricing", "industries", "contact", "how-it-works", "resources", "privacy", "cookies", "other"];
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // The hosting proxy uses an internal HTTP origin in request.url. Trust only
  // our explicit public HTTPS origins, or an exact local development origin.
  const url = new URL(request.url);
  const allowed = origin === "https://www.vantriqai.com" || origin === "https://vantriqai.com" || (["localhost", "127.0.0.1"].includes(url.hostname) && origin === url.origin);
  if (!allowed) return Response.json({ error: "Same-origin requests only" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  let raw: string;
  try { raw = await readBoundedBody(request, 512); }
  catch (error) { return Response.json({ error: 'Invalid or oversized request' }, { status: error instanceof Error && error.message === 'Payload too large' ? 413 : 400 }); }
  if (raw.length > 512) return Response.json({ error: "Payload too large" }, { status: 413 });
  let b;
  try { b = JSON.parse(raw); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!b || Array.isArray(b) || b.consent !== true || !events.includes(b.event) || !sections.includes(b.section) || !["pk", "global"].includes(b.region) || Object.keys(b).some(k => !["consent", "event", "section", "region"].includes(k))) return Response.json({ error: "Invalid event" }, { status: 400 });
  // Hosting must overwrite X-Forwarded-For with its trusted client address.
  // IP is transient: rate limiting here, then a local lookup inside our CRM.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const limited = limitPublicRequest(request, "analytics", 60, 1000);
  if (limited) return limited;

  const endpoint = process.env.CRM_WEBHOOK_URL, key = process.env.CRM_WEBHOOK_KEY;
  if (!endpoint || !key) return Response.json({ error: "Analytics unavailable" }, { status: 503 });
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/webhooks/site-event`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify({ event: b.event, section: b.section, region: b.region, ...(isIP(ip) ? { client_ip: ip } : {}) }), signal: AbortSignal.timeout(5000) });
    if (!res.ok) return Response.json({ error: "Analytics unavailable" }, { status: 502 });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ error: "Analytics unavailable" }, { status: 502 }); }
}
