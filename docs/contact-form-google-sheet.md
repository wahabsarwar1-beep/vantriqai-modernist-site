# Contact form → Google Sheet

The "Send a brief" form on `/contact` posts to `/api/contact` (a Next.js Route
Handler), which forwards the submission to a Google Apps Script web app. Each
brief becomes one row in a Google Sheet.

```
Browser ──POST /api/contact──▶ Next.js server ──POST──▶ Apps Script ──▶ Google Sheet
```

**The script creates the Sheet itself**, headers and all, the first time it
runs — there is nothing to build by hand and no ID to copy between steps. It
remembers the Sheet in Script Properties, so it only ever creates one.

The web-app URL lives in `CONTACT_SHEET_WEBHOOK_URL`, a **server-only** env var
(no `NEXT_PUBLIC_` prefix), so it never ships in the browser bundle and can't be
found and spammed by anyone reading the page source. The hop also has to be
server-side for a second reason: Apps Script can't answer a CORS preflight, so a
`fetch` straight from the browser would be blocked.

---

## Setup — about 4 minutes

### 1. New Apps Script project

Go to **[script.google.com](https://script.google.com)** → **New project**.
Name it `VantriqAI contact form` (click "Untitled project" at the top).

Delete the placeholder `myFunction` and paste this in full:

```javascript
/** Where briefs land.
 *
 *  Leave EXISTING_SPREADSHEET_ID blank and the script creates its own
 *  spreadsheet in your Drive the first time it runs, then remembers it.
 *  To use a workbook you already have instead, paste its id — the long
 *  middle part of its URL:
 *    https://docs.google.com/spreadsheets/d/THIS_PART_HERE/edit
 */
const EXISTING_SPREADSHEET_ID = '';
const SPREADSHEET_NAME = 'VantriqAI — Contact briefs';
const TAB_NAME = 'Briefs';

const HEADERS = ['Submitted at', 'Name', 'Business', 'WhatsApp or email', 'Industry', 'Notes'];

/** Resolves the tab to append to, creating the spreadsheet and/or the tab on
 *  first use. Always call this inside the lock: two simultaneous first-ever
 *  requests would otherwise each create their own spreadsheet. */
function briefSheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;

  if (EXISTING_SPREADSHEET_ID) {
    // Deliberately not wrapped in a try: if an id you configured by hand can't
    // be opened, that is a mistake to surface, not something to paper over by
    // quietly creating a second spreadsheet on every single submission.
    ss = SpreadsheetApp.openById(EXISTING_SPREADSHEET_ID);
  } else {
    const remembered = props.getProperty('SPREADSHEET_ID');
    // If the file was deleted or unshared, make a fresh one rather than
    // failing every submission from then on.
    if (remembered) {
      try { ss = SpreadsheetApp.openById(remembered); } catch (err) { ss = null; }
    }
    if (!ss) {
      ss = SpreadsheetApp.create(SPREADSHEET_NAME);
      props.setProperty('SPREADSHEET_ID', ss.getId());
    }
  }

  let sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    // A brand-new spreadsheet arrives with one default tab; rename that
    // instead of leaving an empty "Sheet1" sitting next to the real one.
    const sheets = ss.getSheets();
    sheet = (sheets.length === 1 && sheets[0].getLastRow() === 0)
      ? sheets[0].setName(TAB_NAME)
      : ss.insertSheet(TAB_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    [150, 160, 180, 200, 170, 520].forEach(function (w, i) {
      sheet.setColumnWidth(i + 1, w);
    });
  }
  return sheet;
}

function doPost(e) {
  // One writer at a time, so two submissions in the same second can't land on
  // the same row and overwrite each other.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const data = JSON.parse(e.postData.contents);
    briefSheet_().appendRow([
      // Stored as a real date, so the column sorts and filters properly
      // instead of sorting as text.
      data.submittedAt ? new Date(data.submittedAt) : new Date(),
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

/** Opening the deployment URL in a browser creates the Sheet if it doesn't
 *  exist yet and links straight to it — so you can confirm the deployment
 *  works before wiring the site to it. */
function doGet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const url = briefSheet_().getParent().getUrl();
    return HtmlService.createHtmlOutput(
      '<p style="font:16px system-ui;padding:24px">Contact form endpoint is live.<br><br>' +
      '<a href="' + url + '" target="_blank">Open the briefs sheet →</a></p>'
    );
  } finally {
    lock.releaseLock();
  }
}
```

Save (the disk icon).

### 2. Deploy it

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
> row; it reads nothing back out and returns nothing about the Sheet's
> contents. The Sheet itself stays private to your account — "Anyone" applies
> to the script endpoint, not the document.

Copy the **Web app URL**. It looks like:

```
https://script.google.com/macros/s/AKfycb.................../exec
```

### 3. Check it — and get your Sheet

Paste that URL into a browser tab. You should see *"Contact form endpoint is
live"* with a link to the sheet it just created in your Drive. That link is
your briefs sheet; bookmark it.

If you instead get an error page, the deployment isn't right — the usual cause
is **Who has access** left on *Only myself*.

### 4. Set the env var

This is the step that actually switches the form on. Until it is set the route
returns 503 and the form shows its error state — deliberately, so a broken form
is visible rather than silently swallowing leads.

**Locally**, in `.env.local`:

```
CONTACT_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfycb.../exec
```

**On Hostinger** (where vantriqai.com is deployed — hPanel, Node.js app):

1. hPanel → **Websites → vantriqai.com → Node.js** (or *Advanced → Node.js*).
2. Find **Environment variables** for the app and add:
   - name `CONTACT_SHEET_WEBHOOK_URL`
   - value the `/exec` URL from step 2
3. **Restart** the Node app. Next.js reads the variable when the server
   process starts, so a running app will not pick it up on its own.

If that panel is not available on your plan, put the value in a `.env` file in
the deployed app's root instead — Next.js loads it at startup. Do **not** commit
that file; `.gitignore` excludes every `.env*` except `.env.example`, so this is
safe by default, but keep the secret out of the repo regardless.

> **Why it is server-only.** The name has no `NEXT_PUBLIC_` prefix, so it never
> reaches the browser bundle. That matters: anyone could otherwise read the
> endpoint out of the page source and post junk straight into your Sheet.

### 5. Test end to end

Submit a brief on `/contact`. A row should appear in the Sheet within a second
or two.

---

## Changing the script later

Editing the script alone does **not** update the live web app — this is the
single most common reason a change appears to do nothing. After editing:

**Deploy → Manage deployments → pencil → Version: New version → Deploy.**

The URL stays the same, so nothing on the site needs changing.

## Getting notified on each brief

Add this inside `doPost`, just after the `appendRow([...])` call:

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

Then re-deploy as above.

---

## Using n8n instead

The route doesn't care what's on the other end — it just POSTs JSON. To route
briefs through the n8n instance that runs the chat agent (worth doing if you
want to hang extra steps off it later — WhatsApp ping, CRM row — without
touching the site):

1. New workflow → **Webhook** trigger, method `POST`, copy the Production URL.
2. **Google Sheets → Append row**, mapping `{{ $json.body.name }}`,
   `{{ $json.body.business }}`, `{{ $json.body.contact }}`,
   `{{ $json.body.industry }}`, `{{ $json.body.notes }}`,
   `{{ $json.body.submittedAt }}`.
3. Activate, then set `CONTACT_SHEET_WEBHOOK_URL` to that webhook URL instead.

No code change needed. Note that this needs an n8n plan that permits executions
— on an expired trial the instance accepts the webhook config but refuses to
run it, and briefs would be dropped.

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
