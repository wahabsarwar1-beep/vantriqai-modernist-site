import { readBoundedBody, limitPublicRequest } from '../../../lib/request-guard';
/** Relays the website assistant's messages to its n8n chat workflow.
 *
 *  The browser used to POST straight to n8n.vantriqai.com. That made every
 *  message depend on a cross-origin request — the chat trigger's allowed
 *  origins, its preflight handling, and whatever sits in front of n8n — and
 *  when any of those refused, the visitor got the offline apology with
 *  nothing reaching n8n at all. Same-origin, server-to-server, none of that
 *  applies. The page's fallback to the direct webhook stays for hosts that
 *  cannot run this route.
 */

const DEFAULT_WEBHOOK_URL = "https://n8n.vantriqai.com/webhook/678305e8-7b54-4a7f-9a04-4662389631b2/chat";
/** n8n's chat trigger only answers origins on its allow-list. */
const UPSTREAM_ORIGIN = "https://www.vantriqai.com";
const TIMEOUT_MS = 90_000;
const PUBLIC_ORIGINS = ["https://www.vantriqai.com", "https://vantriqai.com"];
const SESSION_ID = /^[A-Za-z0-9-]{8,100}$/;


/** The page's own origin, or our public domains. The hosting proxy puts an
 *  internal address in request.url, so the Host header is what the visitor used. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (PUBLIC_ORIGINS.includes(origin)) return true;
  const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host");
  try {
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Same-origin requests only" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "JSON required" }, { status: 415 });
  let raw: string;
  try { raw = await readBoundedBody(request, 4000); }
  catch (error) { return Response.json({ error: 'Invalid or oversized request' }, { status: error instanceof Error && error.message === 'Payload too large' ? 413 : 400 }); }
  if (raw.length > 4000) return Response.json({ error: "Message too long" }, { status: 413 });
  let b: { sessionId?: unknown; chatInput?: unknown };
  try {
    b = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const sessionId = typeof b?.sessionId === "string" ? b.sessionId : "";
  const chatInput = typeof b?.chatInput === "string" ? b.chatInput.trim().slice(0, 2000) : "";
  if (!SESSION_ID.test(sessionId) || !chatInput) return Response.json({ error: "Invalid message" }, { status: 400 });

  // Every message spends model tokens; keep one visitor from spending many.
  const limited = limitPublicRequest(request, "chat", 20, 300);
  if (limited) return limited;

  const webhook = process.env.N8N_CHAT_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_CHAT_WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: UPSTREAM_ORIGIN },
      body: JSON.stringify({ action: "sendMessage", sessionId, chatInput }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[api/chat] n8n answered ${res.status}: ${text.slice(0, 200)}`);
      return Response.json({ error: "Assistant unavailable", upstream: res.status }, { status: 502 });
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      console.error(`[api/chat] n8n sent a non-JSON reply: ${text.slice(0, 200)}`);
      return Response.json({ error: "Assistant unavailable" }, { status: 502 });
    }
    const item = (Array.isArray(data) ? data[0] : data) as { output?: unknown; text?: unknown } | undefined;
    const output = item?.output ?? item?.text;
    if (typeof output !== "string" || !output.trim()) {
      console.error(`[api/chat] n8n reply had no output: ${text.slice(0, 200)}`);
      return Response.json({ error: "Assistant unavailable" }, { status: 502 });
    }
    return Response.json({ output }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/chat] could not reach n8n:", err);
    return Response.json({ error: "Assistant unavailable" }, { status: 504 });
  }
}
