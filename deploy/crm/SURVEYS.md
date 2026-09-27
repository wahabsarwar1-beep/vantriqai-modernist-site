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
  the public endpoint, found in its results and in Analytics, then deleted;
  then the after-chat rules are checked against a made-up conversation that
  is rolled back
- `email is set up` or `email is not set up` — whether unhappy answers are emailed
- `our own survey is live: …/s/vantriqai-feedback (Customer feedback)` and
  `…/s/vantriqai-chat (After a WhatsApp chat)`

**Our own surveys.** The deploy makes two live surveys on VantriqAI's
internal account, in English and Urdu: **Customer feedback**
(professional-services template) to open on a phone and try, and **After a
WhatsApp chat** (three taps), which the WhatsApp agent sends after each
conversation. Answer one and it appears in CRM → Surveys within seconds.
Each is made **once**: pause, edit or delete it and no later deploy brings it
back. Unhappy answers are emailed to the address that was in Settings → Tax &
invoicing → "Our own invoice goes to" when they were made
(support@vantriqai.com unless changed); change it in each survey's own
**Settings** tab.

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

WhatsApp has no "conversation closed" event — the customer just stops
writing. So the WhatsApp agent asks after **every** reply, and the CRM answers
yes **once per conversation**, when it is really over:

```
WhatsApp agent: … → Send WhatsApp Reply → After-chat survey (in the background)
                                                   │ fire-and-forget: the reply is already sent
                                                   ▼
"VantriqAI - After-chat survey (WhatsApp)"  (n8n)
  wait 1 hour → ask the CRM "is this chat over?" → yes → send the survey link on WhatsApp
                                               → night → wait until 9 a.m. → ask again → yes → send
                                               → no (still talking, too short, already asked…) → stop
```

The CRM decides from what it already has — every reply the agent sends is a
usage event — and says yes only when all of these hold:

| Rule | Setting in n8n | What it means |
|---|---|---|
| quiet | `quiet_minutes: 55` | the customer has not written for 55 minutes (the wait is 60) |
| long enough | `min_messages: 2` | at least two answered messages — a lone "hi" is not asked about |
| in the window | `within_hours: 23` | WhatsApp lets a business write freely only for 24 hours after the customer's last message |
| not pestered | `once_per_days: 14` | not if this customer was asked in the last 14 days (never twice in a day, whatever this says) |
| awake | `send_from: 9, send_until: 21, timezone: "Asia/Karachi"` | outside 9 a.m.–9 p.m. the answer is "night", with the time to ask again |
| once | — | one yes per conversation, even when several waits end at the same moment |

The survey sent is the client's live **After a WhatsApp or chat conversation**
survey (VantriqAI's own: `/s/vantriqai-chat`, made once by the deploy), or its
newest live survey. The message is in the language the customer wrote in —
Urdu script gets the Urdu message and a survey that opens in Urdu. **To stop
the messages, pause that survey** in CRM → Surveys: with no live survey the
CRM answers 404 and nothing is sent.

The call n8n makes:

```
POST http://crm_app:8080/api/webhooks/survey-invite
x-api-key: <the webhook key n8n already uses for /usage>
Content-Type: application/json

{
  "external_ref": "923411120049",              // the number the chat arrived on, exactly as for /usage
  "session_id":   "923001234567-2026-09-27",   // the same session id the usage post used
  "channel":      "whatsapp",
  "language":     "ur",                        // what the customer wrote in (en | ur)
  "quiet_minutes": 55, "min_messages": 2, "within_hours": 23, "once_per_days": 14,
  "send_from": 9, "send_until": 21, "timezone": "Asia/Karachi"
}
```

Answers:

```json
201 { "due": true, "code": "due", "url": "https://portal.vantriqai.com/s/vantriqai-chat?i=Q2x…&lang=ur",
      "language": "ur", "text": "Vantriq AI سے بات کرنے کا شکریہ! …: <url>",
      "message": { "en": "Thanks for chatting with Vantriq AI! How did we do? …: <url>", "ur": "…" },
      "survey": { "slug": "vantriqai-chat", "title": "After a WhatsApp chat" } }

200 { "due": false, "code": "still_talking", "reason": "The customer wrote 12 minutes ago — …" }
200 { "due": false, "code": "night", "retry_at": "2026-09-28T04:00:00.000Z", … }
```

`code` is one of `due`, `still_talking`, `too_short`, `already_asked`,
`asked_recently`, `window_closed`, `no_conversation` or `night`. Add
`"dry_run": true` to see the answer without making an invite. Without
`quiet_minutes` the call makes a link at once, as it always has.

The customer's number never leaves n8n, which already has it; the CRM only
ever sees the session id n8n itself reported. Links are always the public
portal address, even though n8n calls the CRM by its container name. Each
invite can be answered once, and the answer is tied to the conversation it
rates. WhatsApp's link preview (Meta fetching the page to draw the card) does
not count as the customer opening it.

**For a client's WhatsApp agent**: copy the two pieces — the "After-chat
survey (in the background)" node after the agent's send-reply node, and the
after-chat workflow with that client's WhatsApp number (phone number id and
credential) on its send node. The client needs a live survey.

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
| `SURVEY_TIMEZONE` | `Asia/Karachi` | the time zone for after-chat sending hours when n8n does not send one |

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
node test/after-chat.test.js    # 30 checks: the after-chat rules, one yes per conversation
node test/own-survey.test.js    # 22 checks: our own surveys are made once, and only once
node test/surveys-ui.test.js    # 42 checks in a real browser
```
