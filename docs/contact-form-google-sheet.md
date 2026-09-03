# Contact form → Google Sheet

The "Send a brief" form on `/contact` posts to `/api/contact` (a Next.js Route
Handler), which forwards the submission to a Google Apps Script web app bound to
a Google Sheet. Each brief becomes one row.

```
Browser ──POST /api/contact──▶ Next.js server ──POST──▶ Apps Script ──▶ Google Sheet
```

The Apps Script URL lives in `CONTACT_SHEET_WEBHOOK_URL`, a **server-only** env
var (no `NEXT_PUBLIC_` prefix), so it never ships in the browser bundle and
can't be found and spammed by anyone reading the page source. The hop also has
to be server-side for a second reason: Apps Script can't answer a CORS
preflight, so a `fetch` straight from the browser would be blocked.

---

## Setup — about 5 minutes

### 1. Create the Sheet

New Google Sheet, name it something like `VantriqAI — Contact briefs`. Leave
row 1 empty; the script writes the header row itself on the first submission.

### 2. Add the script

In that Sheet: **Extensions → Apps Script**. Delete the placeholder `myFunction`
and paste this in full:

```javascript
const HEADERS = ['Submitted at', 'Name', 'Business', 'WhatsApp or email', 'Industry', 'Notes'];

function doPost(e) {
  // One writer at a time, so two submissions in the same second can't land on
  // the same row and overwrite each other.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      // Stored as a real date, in your own timezone, so the column sorts and
      // filters properly instead of sorting as text.
      new Date(data.submittedAt),
      data.name || '',
      data.business || '',
      data.contact || '',
      data.industry || '',
      data.notes || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    // Surfaces in the Next.js server logs via the 502 the route returns.
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

Save (the disk icon).

### 3. Deploy it

**Deploy → New deployment → gear icon → Web app**, then:

| Setting | Value |
| --- | --- |
| Description | `Contact form` |
| Execute as | **Me** |
| Who has access | **Anyone** |

**Deploy**. Google asks you to authorise it — go through **Advanced → Go to
(project name)** if it warns the app isn't verified; that warning is normal for
your own unpublished script.

> **"Anyone" is required and is safe here.** The web app only ever appends a
> row; it reads nothing and returns nothing about the Sheet. The Sheet itself
> stays private — "Anyone" applies to the script endpoint, not the document.

Copy the **Web app URL**. It looks like:

```
https://script.google.com/macros/s/AKfycb.................../exec
```

### 4. Set the env var

Locally, in `.env.local`:

```
CONTACT_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb.../exec
```

On Vercel: **Project → Settings → Environment Variables**, add
`CONTACT_SHEET_WEBHOOK_URL` with the same value for Production, Preview and
Development, then **redeploy** — env vars are read at build/run time, so an
existing deployment won't pick it up on its own.

### 5. Test

Submit a brief on `/contact`. A row should appear in the Sheet within a second
or two.

---

## Getting notified

Apps Script can email you on each new brief. Add this inside `doPost`, just
after `sheet.appendRow([...])`:

```javascript
MailApp.sendEmail({
  to: 'you@yourdomain.com',
  subject: 'New brief from ' + (data.name || 'someone'),
  body: [
    'Name:     ' + data.name,
    'Business: ' + data.business,
    'Contact:  ' + data.contact,
    'Industry: ' + data.industry,
    '',
    data.notes,
  ].join('\n'),
});
```

Re-deploy afterwards (**Deploy → Manage deployments → pencil → Version: New
version → Deploy**). Editing the script alone does *not* update the live web
app — this is the single most common reason a change appears to do nothing.

---

## Using n8n instead

The route doesn't care what's on the other end — it just POSTs JSON. To route
briefs through the n8n instance that already runs the chat agent:

1. New workflow → **Webhook** trigger, method `POST`, copy the Production URL.
2. **Google Sheets → Append row**, mapping `{{ $json.body.name }}`,
   `{{ $json.body.business }}`, `{{ $json.body.contact }}`,
   `{{ $json.body.industry }}`, `{{ $json.body.notes }}`,
   `{{ $json.body.submittedAt }}`.
3. Activate, then set `CONTACT_SHEET_WEBHOOK_URL` to that webhook URL instead.

No code change needed. The upside is you can hang extra steps off it later
(Slack ping, WhatsApp notification, CRM row) without touching the site.

---

## The JSON the route sends

```json
{
  "submittedAt": "2026-09-01T10:04:11.812Z",
  "name": "Ayesha Khan",
  "business": "Khan Textiles",
  "contact": "03001234567",
  "industry": "E-commerce & Retail",
  "notes": "Order tracking and catalogue questions on WhatsApp."
}
```

`submittedAt` is server-generated ISO 8601 (UTC) — not client-supplied, so it
can't be forged. Every other field is trimmed and length-capped by the route.

## Spam handling

The form carries a hidden honeypot field (`company_website`). Humans never see
it; bots that fill every input do. The route silently returns `200` on those
without writing a row, so the bot thinks it succeeded and doesn't retry with a
variation. Nothing else is needed unless volume gets bad, at which point a
Turnstile or reCAPTCHA check in the route is the next step.
