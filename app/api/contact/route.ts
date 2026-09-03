/** Receives a "Send a brief" submission and forwards it to the Google Sheet.
 *
 *  The Sheet is written by a Google Apps Script web app (see
 *  docs/contact-form-google-sheet.md); this route holds its URL so the
 *  endpoint never reaches the browser bundle. Posting to Apps Script from
 *  the client would also hit CORS — Apps Script can't answer a preflight —
 *  so the hop has to be server-side regardless.
 */

const FIELDS = ["name", "business", "contact", "industry", "notes"] as const;
type Field = (typeof FIELDS)[number];

/** Long enough for a real brief, short enough that nobody can post a novel
 *  into the Sheet. Values are truncated rather than rejected so a genuine
 *  over-long message still reaches us. */
const MAX_LENGTH: Record<Field, number> = {
  name: 120,
  business: 160,
  contact: 160,
  industry: 80,
  notes: 4000,
};

export async function POST(request: Request) {
  const endpoint = process.env.CONTACT_SHEET_WEBHOOK_URL;
  if (!endpoint) {
    // Fail loudly instead of showing the visitor a success message that isn't
    // true — the old form did exactly that and lost every submission.
    console.error("[contact] CONTACT_SHEET_WEBHOOK_URL is not set; submission dropped");
    return Response.json({ error: "Form is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a field hidden from humans, so anything in it is a bot. Answer
  // 200 so the bot believes it succeeded and doesn't retry with a variation.
  if (typeof body.company_website === "string" && body.company_website.trim()) {
    return Response.json({ ok: true });
  }

  const clean = (field: Field) =>
    typeof body[field] === "string" ? body[field].trim().slice(0, MAX_LENGTH[field]) : "";

  const payload = {
    submittedAt: new Date().toISOString(),
    ...(Object.fromEntries(FIELDS.map((f) => [f, clean(f)])) as Record<Field, string>),
  };

  // Name and contact are the two the form marks required; without a way to
  // reply the row is worthless.
  if (!payload.name || !payload.contact) {
    return Response.json({ error: "Name and a way to reach you are required." }, { status: 400 });
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // Apps Script redirects to googleusercontent.com to serve the response;
      // fetch follows that by default, which is what we want.
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      console.error("[contact] sheet endpoint returned", res.status, await res.text().catch(() => ""));
      return Response.json({ error: "Could not save your brief." }, { status: 502 });
    }
  } catch (err) {
    console.error("[contact] sheet endpoint unreachable:", err);
    return Response.json({ error: "Could not save your brief." }, { status: 502 });
  }

  return Response.json({ ok: true });
}
