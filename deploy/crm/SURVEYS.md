# Customer-satisfaction surveys (v9.14)

A survey app for any customer who wants to know how their own customers feel
— a restaurant, an FMCG brand, a telco, a clinic, a shop. Built into the CRM,
the customer portal and the public site, so every answer lands in three places
at once:

| Where | Who sees it | What they see |
|---|---|---|
| `https://portal.vantriqai.com/s/<address>` | the end customer | the survey — phone-first, English or Urdu, in the business's colours |
| Portal → **Surveys** | the business | their surveys, results, every response, follow-ups, sharing |
| CRM → **Surveys** | VantriqAI staff | the same, for every client |
| Portal and CRM → **Analytics** | both | CSAT, NPS and resolution rate now include survey answers |
| `GET /api/external/surveys…` | the business's own systems | surveys, responses and results as JSON |

## Is it on, and working?

Nothing needs switching on. It ships inside the CRM container: deploying
v9.14 or later (**Actions → Deploy CRM → apply**) puts it online at the
addresses above, and the deploy log proves it before it finishes:

- `the survey app answers at /s/<address>` and `the survey API is mounted behind sign-in`
- `surveys work end to end` — a temporary survey is made, answered through
  the public endpoint, found in its results and in Analytics, then deleted
- `email is set up` or `email is not set up` — whether unhappy answers are emailed
- `our own survey is live: https://portal.vantriqai.com/s/vantriqai-feedback`

**Our own survey.** The first deploy makes one live survey on VantriqAI's
internal account ("Customer feedback", professional-services template,
English and Urdu). Open it on a phone, answer it, and the answer appears in
CRM → Surveys within seconds. It is made **once**: pause, edit or delete it
and no later deploy brings it back. Unhappy answers to it are emailed to the
address that was in Settings → Tax & invoicing → "Our own invoice goes to"
when it was made (support@vantriqai.com unless changed); change it in the
survey's own **Settings** tab.

From outside the server, **Actions → Site check** requests the survey
addresses over the public internet and prints what a visitor gets.

---

## Making a survey

CRM → **Surveys** → **New survey** (choose the client), or the customer does
it themselves in their portal. Pick the template closest to the business:

| Template | Measures |
|---|---|
| Restaurant & café | CSAT, NPS, food / service / speed / cleanliness / value |
| FMCG — product feedback | CSAT, NPS, quality, packaging, value, where bought, buy again |
| FMCG — retailer & distributor | CSAT, effort, NPS, stock, delivery, order accuracy, sales rep, schemes |
| Telecom & internet | CSAT, resolved, effort, NPS, coverage, speed, billing |
| Hospital & clinic | CSAT, NPS, doctor, nursing, waiting time, hygiene, fees |
| Retail store · Online store & delivery · Hotel & guest house | CSAT, NPS (+ effort online) |
| Bank & financial services | CSAT, resolved, effort, NPS |
| School, college & university · Real estate · Car sales & service | CSAT, NPS (+ resolved for workshops) |
| Courier & logistics · Salon, spa & fitness · Travel & tourism · Professional services | CSAT, NPS (+ effort / resolved) |
| After a WhatsApp or chat conversation | CSAT, resolved, one comment — three taps |
| General satisfaction · Start from scratch | CSAT, NPS / CSAT only |

Every template is in **English and Urdu**; the respondent switches with one tap
and a phone set to Urdu starts in Urdu. The survey is live the moment it is
created (or save it as a draft).

Then, in the survey:

- **Questions** — reword, reorder, add or delete. Ten question types: faces or
  stars (CSAT), 0–10 (NPS), 1–7 effort, star rating, rate-several-things,
  one choice, several choices, yes/no, written answer, contact details.
  **Logic** asks a question only to some people ("what could we do better?"
  only to those who would not recommend). A phone on the right shows every
  change as it is typed.
- **Settings** — status (live / paused / closed / draft), colours, logo,
  welcome and thank-you text, **locations** (branches), who gets emailed about
  unhappy answers, the Google review link, a closing date or a response limit.

## Sharing it

**Share** tab:

- **The link** — for WhatsApp, SMS, email, receipts.
- **QR code** — "Print a poster" (A4) or "Print table cards" (four to a
  sheet). With locations, each branch has its own QR code, so results compare
  branches.
- **Kiosk link** (`?kiosk=1`) — for a tablet at the counter: it starts over
  for the next customer, and after a minute of inactivity.
- **On your website** — an `<iframe>` to paste.
- **Personal one-time links** — one per customer, each answerable once; the
  response rate shows under Results.

## After every WhatsApp conversation (n8n)

When a conversation closes, the agent's flow asks the CRM for a personal link
and sends it back to the customer:

```
POST http://crm_app:8080/api/webhooks/survey-invite
x-api-key: <the webhook key n8n already uses for /usage>
Content-Type: application/json

{
  "external_ref": "{{ the client's (or agent's) ref, exactly as for /usage }}",
  "session_id":   "{{ the conversation's session id }}",
  "channel":      "whatsapp"
}
```

Answer (201):

```json
{
  "url": "https://portal.vantriqai.com/s/khan-kitchen-3f2a1?i=Q2x…",
  "survey": { "slug": "khan-kitchen-3f2a1", "title": "After chat" },
  "message": { "en": "Thank you for choosing Khan Kitchen! …: <url>", "ur": "…: <url>" }
}
```

Send `message.en` (or `message.ur`) as the WhatsApp reply. The CRM picks the
client's live **"After a WhatsApp or chat conversation"** survey, or its newest
live survey; add `"survey_slug"` to choose one. `404` means the client has no
live survey yet — create one first.

Links are always the public portal address, even though n8n calls the CRM by
its container name. Each invite can be answered once; the answer is tied to
the conversation it rates.

## Results and follow-ups

**Results** — responses, % satisfied, NPS, effort and resolution against the
previous period up to the same point (day / week / month / quarter / year),
plain-English findings, trends, every question broken down, results by
location and by channel, the words unhappy customers use most, and Excel export.

**Follow-ups** — every unhappy answer (CSAT 1–2, NPS 0–6, or "not resolved")
opens a follow-up. It sits at the top of the Surveys page until someone marks
it **contacted** and **resolved**, with a note. If the survey has alert
addresses, the email goes out the moment the answer arrives — which needs
`HOSTINGER_MAIL_TOKEN` set on `crm_app`, like invoice email.

A delighted customer (NPS 9–10, or CSAT 5) is offered the Google review link
on the thank-you screen.

## Settings on the server

All optional:

| Variable | Default | What it does |
|---|---|---|
| `SURVEY_BASE_URL` | `https://portal.vantriqai.com` | the address survey links and QR codes point at |
| `SURVEY_RATE_LIMIT` | `30` | answers per device per survey per 10 minutes |

## What protects it

The survey pages need no sign-in, by design. Instead: a respondent receives only
the survey's public fields; every answer is checked against its question on
the server, with branching re-applied there; a retry from a patchy connection
is recognised rather than counted twice; a hidden honeypot field catches
bots; each device is rate-limited per survey; nothing a respondent types is
ever rendered as markup. A customer only ever reaches their own surveys —
another customer's are "not found", in the portal and the API alike.

## The 502 Bad Gateway fix that ships with this

Before v9.14, any database error inside most API routes — a malformed id in a
URL was enough — crashed the whole CRM process. Docker restarted it within
seconds, and in between Nginx Proxy Manager showed everyone **502 Bad
Gateway**. Now such a request gets a 400 or 404 with a reason, and the server
keeps running; a database outage returns 500s and recovers by itself. The
deploy's preflight also reports how often the running container has crashed
since the last deploy.

## Tests

```bash
node test/surveys.test.js       # 133 checks through the API
node test/own-survey.test.js    # 16 checks: our own survey is made once, and only once
node test/surveys-ui.test.js    # 42 checks in a real browser
```
