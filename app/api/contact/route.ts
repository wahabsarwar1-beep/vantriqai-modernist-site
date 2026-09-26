/** Receives a "Send a brief" submission and files it as a lead in the CRM.
 *
 *  The CRM is the destination that matters: a brief lands in the pipeline at
 *  stage `lead` tagged `Website Brief`, and the CRM emails the team itself.
 *  That tag is the whole point — it separates a typed brief from a lead the
 *  chat agent captured and from one that came in over WhatsApp, so the
 *  pipeline says where each prospect actually came from.
 *
 *  The webhook key stays here, server-side. Posting to the CRM from the
 *  browser would put a key that can write to the pipeline into the page
 *  source, and would hit CORS besides.
 *
 *  The Google Sheet (docs/contact-form-google-sheet.md) is kept as an
 *  optional second copy for anyone who likes reading briefs in a
 *  spreadsheet. It is best-effort: the Sheet failing never fails the
 *  submission, because the lead is already in the CRM by then.
 */

/** Long enough for a real brief, short enough that nobody can post a novel
 *  at us. Values are truncated rather than rejected so a genuine over-long
 *  message still reaches us. */
const MAX = { name: 120, business: 160, contact: 160, email: 160, notes: 4000 } as const;

const CRM_TIMEOUT_MS = 10_000;
const SHEET_TIMEOUT_MS = 8_000;

/** What this lead is tagged with in the CRM pipeline. The chat agent sends
 *  "Chat Agent" and the WhatsApp agent sends "WhatsApp"; this is the third. */
const SOURCE = "Website Brief";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a field hidden from humans, so anything in it is a bot. Answer
  // 200 so the bot believes it worked and doesn't retry with a variation.
  if (typeof body.company_website === "string" && body.company_website.trim()) {
    return Response.json({ ok: true });
  }

  const name = str(body.name, MAX.name);
  const business = str(body.business, MAX.business);
  const email = str(body.email, MAX.email);
  // The field is labelled "WhatsApp number" on the form; `contact` is the
  // older name the Sheet used, accepted so an older cached page still works.
  const whatsapp = str(body.whatsapp, MAX.contact) || str(body.contact, MAX.contact);
  const notes = str(body.notes, MAX.notes);
  // Which site the brief came from. It decides the currency the quote is
  // written in, so it has to reach whoever writes it — not be inferred later
  // from a phone number.
  const region = body.region === "global" ? "global" : "pk";
  const regionLabel = region === "global" ? "Global (US$)" : "Pakistan (PKR)";

  // Without a name and a way to reply, the record is worthless.
  if (!name || !(whatsapp || email)) {
    return Response.json(
      { error: "Please give your name and a WhatsApp number or email so we can reply." },
      { status: 400 },
    );
  }

  const endpoint = process.env.CRM_WEBHOOK_URL;
  const key = process.env.CRM_WEBHOOK_KEY;
  if (!endpoint || !key) {
    // Fail loudly rather than showing a success message that isn't true —
    // the form used to do exactly that, and lost every brief submitted.
    console.error("[contact] CRM_WEBHOOK_URL / CRM_WEBHOOK_KEY are not set; brief dropped");
    return Response.json({ error: "Form is not configured." }, { status: 503 });
  }

  // Unique per submission, on purpose. The CRM keys clients on external_ref
  // and only emails the team when it CREATES one, so a reusable ref would
  // make a second brief from the same person silently vanish. A duplicate
  // row a human can merge costs far less than a brief nobody hears about.
  // The digits are in the ref so a human can recognise it in the pipeline.
  const digits = (whatsapp || email).replace(/\D/g, "").slice(-11) || "nodigits";
  const externalRef = `brief-${region}-${digits}-${Date.now()}`;

  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/webhooks/lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        external_ref: externalRef,
        name,
        company: business,
        email,
        phone: whatsapp,
        channel: "website",
        source: SOURCE,
        notes: [
          `Submitted via the "Send a brief" form on vantriqai.com`,
          `Site: ${regionLabel} — quote in this currency`,
          `WhatsApp: ${whatsapp || "—"}`,
          `Email: ${email || "—"}`,
          "",
          "What they want the agent to handle:",
          notes || "(not filled in)",
        ].join("\n"),
      }),
      signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error("[contact] CRM returned", res.status, await res.text().catch(() => ""));
      return Response.json({ error: "Could not save your brief." }, { status: 502 });
    }
  } catch (err) {
    console.error("[contact] CRM unreachable:", err);
    return Response.json({ error: "Could not save your brief." }, { status: 502 });
  }

  // Second copy, best-effort. The lead is already safe in the CRM, so a
  // Sheet outage is logged and otherwise ignored.
  const sheet = process.env.CONTACT_SHEET_WEBHOOK_URL;
  if (sheet && !sheet.includes("REPLACE_ME")) {
    try {
      const res = await fetch(sheet, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submittedAt: new Date().toISOString(),
          name,
          business,
          contact: whatsapp || email,
          notes,
          source: SOURCE,
          region: regionLabel,
        }),
        // Apps Script redirects to googleusercontent.com to serve its
        // response; fetch follows that by default, which is what we want.
        signal: AbortSignal.timeout(SHEET_TIMEOUT_MS),
      });
      if (!res.ok) console.error("[contact] sheet copy returned", res.status);
    } catch (err) {
      console.error("[contact] sheet copy failed (lead is already in the CRM):", err);
    }
  }

  return Response.json({ ok: true });
}
