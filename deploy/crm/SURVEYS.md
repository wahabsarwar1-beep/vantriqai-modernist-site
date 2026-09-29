# Customer-satisfaction surveys (v9.14)

A survey app for any customer who wants to know how their own customers feel
— a restaurant, an FMCG brand, a telco, a clinic, a shop. Built into the CRM,
the customer portal and the public site, so every answer lands in three places
at once.

**It is an add-on, off for every client until an admin switches it on**
(v9.15) — see [Switching surveys on for a client](#switching-surveys-on-for-a-client-admin).

| Where | Who sees it | What they see |
|---|---|---|
| `https://portal.vantriqai.com/s/<address>` | the end customer | the survey — phone-first, English or Urdu, in the business's colours |
| Portal → **Surveys** | the business | their surveys, results, every response, follow-ups, sharing |
| CRM → **Surveys** | VantriqAI staff | the same, for every client |
| Portal and CRM → **Analytics** | both | CSAT, NPS and resolution rate now include survey answers |
| Portal and CRM → **Vantriq Pulse → Download report (Excel)** | both | every figure, and the contacts, conversations and survey answers behind them (v9.16) |
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

## What Echo costs a client, and why (v9.20.1)

Echo is an add-on on any package, priced in the CRM's add-ons catalogue
(Products & Pricing → Add-ons catalogue):

| | Setup (one-time) | Monthly |
|---|---|---|
| Vantriq Echo — first location, unlimited surveys and responses | PKR 12,000 | PKR 6,000 |
| Each additional location (branch, outlet, site) | PKR 2,000 | PKR 1,500 |
| More than 10 locations | priced on scope | priced on scope |

So one branch pays PKR 6,000 a month, five pay 12,000 and ten pay 19,500.

**Why it is priced this way.** Echo has no AI or messaging cost of its own.
Its themes are counted words, not generated. Survey messages go out on the
client's own WhatsApp number and their provider bills them. What it costs
us is time:
- about 2.5 hours to set up: branding, the first survey, QR posters, the
  after-chat hook and a handover;
- about 30 minutes a month of results review and support;
- about 30 minutes more to set up each extra location, plus a few minutes a
  month to look after it.

Costed as in the business model (founder and contracted time split evenly,
PKR 2,250 an hour), that is:

| | Setup margin | Monthly margin |
|---|---|---|
| First location | 53% | 75% |
| Each extra location | 44% | 80% |

At any size the monthly margin stays at 75% or more. Even if the founder
does all of it (PKR 3,000 an hour), the margins stay near 69% monthly and
38% on setup.

The entry price sits below every capability add-on: image recognition is
9,000 a month, web chat 10,000 and voice 12,000. That makes Echo an easy
yes for a single-branch Starter client (+30% on a 20,000 plan). A chain
pays in step with what it gets and with what it takes to serve.

If a deal needs a sweetener, waive the setup rather than cut the monthly.
Waiving it costs about PKR 5,600 once; a lower monthly costs the same
every month.

## Switching surveys on for a client (admin)

Surveys are a service a client signs up for, not something every account has.
For a client who has:

1. CRM → **Clients** → open the client.
2. **Customer-satisfaction surveys** → tick **Surveys switched on for this
   customer**. Only an admin sees the tick box; staff see whether it is on.

From that moment:

| | Off (the default) | On |
|---|---|---|
| Their portal | no **Surveys** tab | a **Surveys** tab: build, share, results, follow-ups |
| CRM → Surveys → New survey | the client is not in the list | the client can be chosen |
| Their survey pages `/s/<address>` | show "This survey is paused", take no answers | live |
| After-chat surveys from their agent (n8n) | refused (`403 surveys_disabled`), nothing is sent | sent once per conversation |
| Their own API `GET /api/external/surveys…` | refused (`403`) | answers |

Switching it **off** again pauses every survey they have straight away — the
surveys and every answer already given are kept, and it all comes back as it
was when it is switched on again. The client's page shows when it was
switched on and by whom. VantriqAI's own account was switched on with v9.15,
because its WhatsApp agent already sends the after-chat survey.

Behind the tick box: `PATCH /api/clients/:id/surveys  { "enabled": true | false }`,
admin only (an admin's session or the admin key; staff and automation keys get 403).

**Industry and a starter survey (v9.19).** The same card has an **Industry**
list (any staff member can set it: restaurant, pharmacy, bank, school… 25 in
all). It puts that industry's templates first in the Echo library, in the CRM
and in the client's portal. When an admin ticks Echo on, a second box —
ticked by default — also creates the client's **first survey from their
industry's template** (General satisfaction when no industry is set): live,
in English and Urdu, in their name, unhappy answers emailed to the client's
email, its link and QR code ready. It is only made when they have no survey
yet, so switching Echo off and on again never makes a second.
API: `PATCH /api/clients/:id/industry { "industry": "pharmacy" }` (`""` clears it);
`PATCH /api/clients/:id/surveys { "enabled": true, "starter_survey": true[, "industry": "…"] }`
— the reply's `starter_survey` names the survey made, or is `null`.

## Making a survey

CRM → **Surveys** → **New survey** (choose the client — only clients with
surveys switched on are listed), or the customer does it themselves in their
portal. Pick the template closest to the business from the library (see
[The template library](#the-template-library-v919)):

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
| Pharmacy & medical store (v9.19) | CSAT, NPS, medicines in stock, pharmacist's advice, genuine products, prices, delivery |
| Insurance & takaful · Software, IT & SaaS (v9.19) | CSAT, resolved, effort, NPS |
| Events & conferences · Home services & repairs (v9.19) | CSAT, NPS (+ resolved for repairs) |
| Government & public services · NGO & non-profit (v9.19) | CSAT, resolved, effort / NPS |
| Manufacturing & B2B supplier · Website & app experience (v9.19) | CSAT, effort, NPS / resolved |
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

**Where to find it (v9.19.2).** As soon as a survey is live, the top of the
Echo page — in the client's portal, and in the CRM once a client is picked —
is a **Share your survey** panel: its QR code (click it for the printable
poster), the link with **Copy link**, **Send on WhatsApp**, **QR poster**,
**Table cards**, **Kiosk link** (for a tablet at the counter) and **Website
code**, for the newest survey still waiting for its first answer (or any
live survey, chosen from the list). Every survey card has **Copy link** and
**Share · QR**; a survey with no answers yet opens straight on its Share tab,
and every survey has a **Share · QR code** button at the top. In the CRM the
client's page (Clients → the client → Vantriq Echo) lists their surveys with
Copy link, QR poster, WhatsApp and **All sharing options**.

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

## The template library (v9.19)

28 ready-made surveys, one for each industry, on eight shelves — Food, hotels
& travel · Shops & products · Health & wellbeing · Finance, property & cars ·
Services & B2B · Education, public & non-profit · Chats, websites & apps · Any
business. The same library in the CRM and in every client's portal (and so in
the app):

- **Where:** Echo → **New survey** (step 1 of 2), the whole Echo page while a
  client has no survey yet (with *how it works*), and under *Your surveys*
  afterwards (recommended ones and a way into every shelf). The portal's
  Overview points to it.
- **Your industry:** the customer picks theirs at the top of the library (in
  the CRM: the client's, when a client is chosen). Their template then comes
  first under **Recommended**, with the three that suit that industry best
  (a pharmacy sees clinics, online delivery and the after-chat survey).
- **Shelves and search** — "clinic", "delivery", "school", "courier parcel";
  every word must match a name, description, question or common word for it.
- **Preview** opens the template on a phone exactly as a customer sees it, in
  the business's own name, in English or Urdu, tappable all the way through —
  nothing answered there is saved or sent — beside every question it asks and
  when follow-on questions appear. Arrows step through the other templates.
- **A real phone (v9.19.1).** The preview — and the live preview beside the
  question builder — is a true-to-life phone: the page is laid out on a
  390 × 844 screen (an everyday iPhone; most Androids are within a few
  points), under a status bar and camera island and above the home bar, with
  no desktop scroll bar, and the whole phone is drawn smaller to fit the
  window. What is on its screen is exactly what a customer sees; "preview" is
  said underneath instead. (The survey app only does this for a preview
  opened with `device=1`; a live link never does.) A long business name now
  wraps to a second line on every phone rather than being cut short.
- **Use this template** goes to step 2: name, languages, colours, branches,
  review link and who gets unhappy answers; then **Create and go live**.

API: `GET /api/surveys/templates` (every template: shelf, minutes, measures,
questions in outline, related templates), `GET /api/surveys/templates/library
[?client_id=]` (the same, with the shelves and the client's industry — portal:
`/api/portal/surveys/templates/library`), `PATCH /api/surveys/industry
{ industry, client_id }` (portal: `/api/portal/surveys/industry { industry }`,
always their own). The preview page is `/s/_template/<template>?business=`
— never recorded, and not indexed by search engines.

## The Echo dashboard (v9.18)

The top of the Echo page (portal and CRM — pick a client, or all) is a full dashboard over every survey, by day, week, month, quarter or year, compared with the previous period at the same point — the same controls as Pulse:

- **Headline tiles** with trend lines: answers, % satisfied, NPS, % resolved, unhappy customers, invites answered, customer effort, time to answer.
- **Charts:** answers over time, satisfaction over time, NPS over time, how people scored (1–5), the 0–10 spread with promoters / passives / detractors.
- **Breakdowns** with satisfaction, average and NPS for each: every survey, channel, location (or language), gender, age group, city.
- **Personal links funnel** (sent → opened → answered) and page visits → answers.
- **Words** that set unhappy and happy comments apart; **closing the loop** (waiting, contacted, resolved, typical time to reply, over 48 hours); **when people answer** (day × hour); latest comments; plain-English findings; every figure as a table; and **Download Echo report (Excel)** at the chosen period.

API: `GET /api/surveys/dashboard?grain=&client_id=` (staff), `GET /api/portal/surveys/dashboard?grain=` (the client).

## Customers, and separate Pulse / Echo reports (v9.17)

- **Customers** — CRM → Customers (pick a client, or all) and a **Customers** tab in every client's portal: search, segments (new, returning, regulars 5+, at risk, unhappy, no name, with email), city filter; each customer's page shows their profile (editable: name, phone, email, city, gender, age group, company, tags, notes, do-not-contact), every conversation with its transcript, and their survey answers. **All customers (Excel)** downloads everyone ever with every detail.
- Where details come from: the WhatsApp profile name on each usage call (`contact_name`), `POST /api/webhooks/contact` (what the agent learned), survey answers, and edits. Automatic sources only fill blanks; a person's edit wins.
- **Pulse** shows *Where your customers are* (cities, countries) and downloads the **Pulse report** only. **Echo** downloads the **Echo report** (`/api/surveys/report.xlsx`, portal `/api/portal/surveys/report.xlsx`) with a *Who answered* tab.
- Surveys can ask **About you** questions — gender, age group, city (in consumer templates by default; Questions → Add a question → About you). Results split by each, and answers fill the customer's profile.

## The Pulse & Echo report (v9.16)

**Download report (Excel)** — on every Vantriq Pulse view, in the CRM (one
customer, all customers, Sales) and on the customer's portal — replaces the
old one-table CSV. It builds a workbook for the period on screen (day, week,
month, quarter or year), with a tab per subject:

| Tab | What it holds |
|---|---|
| Summary | every dashboard figure against the previous period at the same point, the window's totals, how often people come back, who comes back most, the package pace, satisfaction and NPS, and the plain-English findings |
| Trend | each period of the window: conversations, messages, people, new and returning contacts, satisfaction, NPS |
| Customers | all-customers report only: each customer side by side |
| Contacts | everyone who wrote in the window — number, name when known, New / New, came back / Returning, first and last contact, conversations, messages, days active, days since, channel, agent, their last satisfaction score and NPS |
| New contacts | people whose first ever conversation was in the window, with the period they first wrote |
| Returning contacts | everyone who came back: how many times, days from first to last, average days between visits |
| Conversations | every conversation: start, last reply, minutes, contact, first contact or visit N, channel, agent, messages, hand-off |
| Channels, Agents, Busiest times | the split by channel and agent, and a day × hour grid |
| Echo summary, Echo responses | score distribution, NPS groups, every survey's results and response rate, and every answer question by question |
| All answers, Comments | every satisfaction answer from any source, and everything customers wrote |
| Follow-ups | unhappy answers: who, what they said, how long they have waited, where each stands |
| Definitions | how each figure is worked out — the dashboard's own rules |

The numbers come from the same engine as the dashboards, so the workbook and
the screen agree. **Unlike the dashboards, the report names people**: a
WhatsApp contact is shown by the number they wrote from, a web visitor by a
short tag. A customer's report holds only their own customers. A customer
without Vantriq Echo gets the satisfaction answers other tools post, but no
survey, survey-answer or follow-up tabs; staff always see them.

Routes: `GET /api/analytics/clients/:id/report.xlsx`,
`/api/analytics/platform/report.xlsx`, `/api/analytics/sales/report.xlsx`
(staff), and `GET /api/portal/analytics/report.xlsx` (the customer), each
with `?grain=day|week|month|quarter|year`.

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
node test/surveys.test.js       # 142 checks through the API
node test/after-chat.test.js    # 30 checks: the after-chat rules, one yes per conversation
node test/own-survey.test.js    # 24 checks: our own surveys are made once, and only once
node test/survey-access.test.js # 28 checks: off by default, only an admin switches it, what off and on mean
node test/surveys-ui.test.js    # 45 checks in a real browser
node test/templates.test.js     # 64 checks: the library, industries, the starter survey, the preview page, share links in the list
node test/templates-ui.test.js  # 72 checks: the library, its phone preview, sharing from the Echo page and the client's page — portal, phone, small laptop, CRM
node test/report.test.js        # the Pulse & Echo workbook, tab by tab, against known contacts
```
