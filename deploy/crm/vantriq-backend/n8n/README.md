# Wiring n8n to Vantriq Ops

This makes client usage numbers real — every time your agent handles a
WhatsApp message, n8n reports it to the CRM automatically. No manual
data entry.

## 1. Where this step goes in your workflow

Wherever your n8n workflow currently calls Claude / GPT-4o / DeepSeek to
generate a reply, add **one more node right after it**: an **HTTP Request**
node that posts the usage to Vantriq. It runs on every message, in the
background — it doesn't slow down the reply to the customer if you set it
to run in parallel / fire-and-forget (see step 4).

```
[WhatsApp Trigger] -> [Claude/GPT/DeepSeek node] -> [Send WhatsApp reply]
                                  |
                                  +--> [HTTP Request: Vantriq usage webhook]
```

## 2. Get a webhook key

On the server, run:

```
npm run create-key -- "n8n usage webhook" webhook
```

Copy the printed key (starts with `vq_`). This key can **only** write
usage events — it cannot read or edit clients, invoices, or pricing, so
it's safe to paste into n8n.

## 3. Configure the HTTP Request node

- **Method:** POST
- **URL:** `https://YOUR-DEPLOYED-API/api/webhooks/usage`
- **Authentication:** None (we use a custom header instead)
- **Headers:**
  - `Content-Type: application/json`
  - `x-api-key: vq_...` (the webhook key from step 2)
- **Body (JSON):**

```json
{
  "external_ref": "{{ $json.entry[0].changes[0].value.metadata.display_phone_number }}",
  "session_id": "{{ $json.entry[0].changes[0].value.messages[0].from }}-{{ $now.format('yyyy-MM-dd') }}",
  "channel": "whatsapp",
  "ai_model": "{{ $json.model }}",
  "input_tokens": {{ $json.usage.input_tokens }},
  "output_tokens": {{ $json.usage.output_tokens }},
  "messages_count": 1
}
```

Adjust the expressions to match your actual node output field names —
the important parts are:

- **`external_ref`** — **your client's** WhatsApp Business number: the
  number the message arrived *on*, which is
  `value.metadata.display_phone_number` on a WhatsApp Business webhook.
  It must match the "External ref" field you set on the client in the
  Vantriq CRM (Clients -> edit client), so the event gets attributed to
  the right account.

  It is **not** `messages[0].from`. That is the end consumer who wrote
  in — a different number on every message. Using it here would create a
  `404 No client found` on every single conversation, or worse, silently
  bill the wrong account if that number ever matched a client.
- **`session_id`** — one ID per 24-hour WhatsApp conversation window,
  and *this* is where the consumer's number belongs. `{consumer
  number}-{date}` is a simple, reliable pattern since WhatsApp's own
  billing windows reset daily-ish; adjust if your billing logic differs.
  Posting the same `session_id` twice counts as one conversation, so
  retries can never inflate a client's bill.
- **`input_tokens` / `output_tokens`** — every major provider returns
  these automatically:
  - **Claude (Anthropic API):** `response.usage.input_tokens` / `response.usage.output_tokens`
  - **OpenAI (GPT-4o):** `response.usage.prompt_tokens` / `response.usage.completion_tokens`
  - **DeepSeek:** `response.usage.prompt_tokens` / `response.usage.completion_tokens`
  n8n's AI nodes usually expose this under the node's raw output —
  check the node's output panel for a `usage` object if the field names
  above don't match exactly.

## 4. Don't let this slow down the customer reply

Put the node on a branch that runs *after* you've already sent the
WhatsApp reply, never between the customer and their answer. Set its
**On Error** to **Continue (using regular output)** and turn on
**Never Error** under Response options, so a CRM that is down or slow
costs you a usage row rather than a conversation. The wiring kit
workflow below already has both set.

## 5. New client checklist

Every time you onboard a new client in the CRM:

1. Create/move them to **Active** in the Pipeline or Clients tab.
2. Open the client, click **Edit**, and set **"WhatsApp number / external ref"**
   to the exact number their WhatsApp Business account receives on —
   digits only, no `+` and no spaces, matching whatever
   `value.metadata.display_phone_number` resolves to in your n8n workflow.
3. That's it — usage starts flowing in automatically from the next
   message onward, visible on their client page within ~20 seconds
   (the CRM polls for updates automatically).

## 6. Testing the webhook without waiting for a real customer

```bash
curl -X POST https://YOUR-DEPLOYED-API/api/webhooks/usage \
  -H "Content-Type: application/json" \
  -H "x-api-key: vq_YOUR_WEBHOOK_KEY" \
  -d '{
    "external_ref": "923001234567",
    "session_id": "923001234567-2026-08-16",
    "channel": "whatsapp",
    "ai_model": "claude-sonnet-4-6",
    "input_tokens": 800,
    "output_tokens": 300,
    "messages_count": 1
  }'
```

A successful response looks like:

```json
{
  "event_id": "...",
  "client_id": "...",
  "month_to_date": { "sessions": 1, "messages": 1, "input_tokens": 800, "output_tokens": 300 }
}
```

If you get `404 No client found with external_ref`, the number doesn't
match any client yet — go set it on the client record first.

## 7. Optional: quota-warning flow

Since the webhook response includes `month_to_date.sessions`, you can
add an **IF node** right after it in n8n: if `sessions` is close to the
client's quota, trigger a Slack/email alert to yourself, or even have
the bot proactively mention it to the client. The quota number itself
lives on the package (`GET /api/products` -> `quota` field), so fetch
that once and cache it in an n8n variable if you want to avoid an extra
API call per message.

---

# v4 — the automation key, quota signals and monthly billing

Three things changed for n8n in v4. The usage webhook above is untouched: keep
it exactly as it is, on the same webhook key.

## The automation key

Onboarding a client or raising an invoice is more than the webhook scope can
do, and no reason to hand n8n the admin key. There is now a scope in between:

```
npm run create-key -- "n8n automation" automation
```

An automation key can:

- read the package catalogue (`GET /api/products`) — but never
  `delivery_cost_full`, which is what a package costs us to run
- create and update clients (`POST`/`PUT /api/clients`)
- create invoices (`POST /api/invoices`)

It cannot read financials, procurement, settings, the team or the dashboard,
cannot delete anything, and cannot mint customer portal credentials. Those all
answer `403`.

Use it in the same `x-api-key` header the usage node uses. Keep it on the
billing and onboarding workflows only.

## Quota comes back on every usage post

`POST /api/webhooks/usage` now answers with the client's position against
their quota, so a flow can react the moment a client tips over instead of
finding out at month end:

```json
{
  "event_id": "…",
  "client_id": "…",
  "month_to_date": { "sessions": 1504, "messages": 18048 },
  "quota": {
    "period_month": "2026-09-01",
    "quota": 1500,
    "sessions_used": 1504,
    "sessions_remaining": 0,
    "percent_used": 100,
    "over_quota_sessions": 4,
    "overage_rate": 2,
    "estimated_overage_cost": 8,
    "state": "exceeded",
    "flagged": "exceeded"
  }
}
```

- `state` is `ok`, `warning` (80% used), `exceeded`, or `no_quota`.
- `flagged` is set **only on the post that crossed the line** — the first time
  this client hits that threshold this month. Every later post repeats `state`
  with `flagged: null`.

That makes `flagged` the thing to branch on. An IF node on
`{{ $json.quota.flagged === "exceeded" }}` fires exactly once per client per
month, which is what you want for a "your quota is used up" WhatsApp message
or an internal alert. Branching on `state` instead would fire on every
message for the rest of the month.

**Nothing here stops service.** A client past their quota keeps being answered;
the month is flagged in the CRM's **Quota & Overage** screen for an admin to
decide on. Do not add a node that refuses to reply when `state` is `exceeded`.

## Onboarding a client from n8n

```
POST /api/clients
x-api-key: vq_… (automation)

{
  "name": "Ali Khan",
  "company": "Khan Traders",
  "email": "ali@khantraders.pk",
  "phone": "03001234567",
  "external_ref": "923001112222",
  "product_id": "…",
  "stage": "active",
  "est_value": 50000,
  "source": "Website form",
  "ntn": "7654321-0",
  "billing_address": "12 Mall Road, Lahore",
  "parent_client_id": null
}
```

`external_ref` is what the usage webhook matches on later — it must be the
client's WhatsApp number, and it must be unique.

Creating a client straight into `"stage": "active"` raises the setup fee and
the first retainer for you; they come back in `invoices_created`. That is
deliberate: the same thing happens whether a client is activated here or
dragged across the board in the CRM.

A client cannot be activated without `ntn` and `billing_address` — the
activation is what issues the first invoice, and an invoice without them is
not compliant. Leave `stage` as `"lead"` if you do not have those yet.

`parent_client_id` makes this a sub-account of another client, for grouping
only: it still gets its own package, its own quota and its own invoices.

## The monthly billing run

Once a month, raise each active client's retainer priced off their real usage:

```
POST /api/invoices
x-api-key: vq_… (automation)

{ "client_id": "…", "type": "retainer", "auto_from_usage": true, "month": "2026-09-01" }
```

The server works out `retainer + (sessions over quota × overage rate)` from
that month's usage, applies the client's sales tax rate, allocates the next
invoice number, and stamps the due date. You do not compute anything.

Billing the same client for the same period twice answers `409` with
`existing_invoice_id`, so a workflow that runs twice by accident cannot
double-bill anyone. Treat `409` as success-already-done, not as an error to
retry.

That workflow already exists in your self-hosted n8n — **Vantriq — monthly
billing run**, `n8n.vantriqai.com/workflow/xlEO0ypQbpduh7CP`. It is **inactive**
and will stay that way until you publish it. `vantriq-monthly-billing.json` in
this folder is the same workflow as a file, kept only as a backup: if the VPS is
rebuilt, import it rather than rebuilding the flow by hand.

> A draft of it also exists in the n8n **Cloud** account
> (`wahabsarwar.app.n8n.cloud`) from an earlier session. That is a different
> instance from the `n8n_app` container on this VPS. The VPS one is production,
> per the business model — **delete the Cloud draft**. Running both would bill
> every client twice.

Before publishing it:

1. Create the credential it asks for. Both HTTP nodes are set to **Custom Auth
   (templated)** but have no credential attached yet — n8n cannot create one for
   you. Make it with the template

   ```json
   { "headers": { "x-api-key": "{{api_key}}" } }
   ```

   and `api_key` set to the automation key from `create-key`. Name it
   **Vantriq automation key**. Putting the key in a credential rather than in
   the node keeps it out of the workflow JSON and out of exports.
2. Run it once by hand and read the **Summarise the run** output. Each client
   comes back as `invoiced`, `already invoiced`, or `FAILED` with the reason.
   Nothing is billed twice if you run it again — a repeat answers `409`.

Only then publish it. It fires on the 1st at 03:00 and bills the month that
just ended.

## The wiring kit for consumer workflows

**Vantriq — CRM wiring kit (copy these nodes)**,
`n8n.vantriqai.com/workflow/nGQkFd2GZ9yD4DFY`, is not meant to run. It holds the
three nodes every consumer workflow needs, wired in the right order and
annotated: open it, select the nodes, copy them, and paste them into the
WhatsApp or website-chat workflow you are onboarding.

```
[trigger] -> [identify the conversation] -> [may we answer?] -> [paused?]
                                                                  |  |
                        your reply generation  <-------------------  +--> [holding reply]
                                 |
                                 +--> [record this conversation] -> [crossed a threshold?] -> [alert]
```

Two things about it are deliberate and should survive being pasted:

- **The gate goes first, the meter goes last.** The service-status check runs
  before you spend a token; the usage post runs *after* the customer already has
  their reply, with `onError: continueRegularOutput`, so a CRM outage costs you
  a usage row and never a conversation.
- **`external_ref` is the number the message arrived on**
  (`metadata.display_phone_number`), not `messages[0].from`. It identifies *your
  client* in the CRM. `from` is their customer, and it belongs in `session_id`,
  not in `external_ref`. Getting these the wrong way round attributes every
  conversation to the wrong account — or to no account, and the webhook answers
  `404`.

`vantriq-crm-wiring-kit.json` in this folder is the same kit as a file.

## What is wired, and what is not

| Workflow | State |
|---|---|
| Vantriq Assistant — WhatsApp AI Sales Consultant | **Gate and meter wired.** Needs the credential. |
| Shop AI — Website Chatbot | Not wired — MCP access is still off on it. |
| Business Growth Engine (V3 Final / Importable) | Not wired — see below. |
| Digital Marketing Manager | Not wired — see below. |

The WhatsApp flow already had a usage node, and it had `external_ref` set to
`contacts[0].wa_id` — the prospect writing in. Every conversation would have
come back `404 No client found`. It now sends `metadata.display_phone_number`
and calls `http://crm_app:8080` rather than the public domain.

Three things were added to it:

- **`Vantriq: may we answer?`** — the gate, ahead of the agent, so nothing is
  spent on a suspended client.
- **`Paused: holding reply`** — feeds the existing send node, so a paused
  client's customer gets an answer instead of silence.
- **`Vantriq: did we actually serve this?`** — sits between the send node and
  the usage post. Without it a refused conversation would still be reported as
  usage, and a blocked client would accrue overage for replies they never got.

The Growth Engine and Marketing Manager flows are Vantriq's own machinery —
daily growth, SEO, ads, analytics, weekly reporting — not agents delivered to a
paying client, so there is no client to attribute their usage to. If any of them
is resold as a product, it needs the same three nodes and a client whose
`external_ref` matches.

---

# Running n8n on the same VPS as the CRM

This is the deployment the business model assumes: n8n Community and the CRM in
containers on one box, sharing a Docker network and one Postgres instance.
Three things follow from that.

## 1. Reach the CRM by container name, not by domain

Every workflow in this folder calls **`http://crm_app:8080`**. That is the CRM
container's name on `app-stack_app-network`, which Docker's embedded DNS
resolves for any container on that network.

Do not use `https://crm.vantriqai.com` from n8n on this box. Going out to the
public domain and back in through Nginx Proxy Manager adds a TLS handshake and
a round trip to every call, and it makes your billing run depend on the
certificate and the public DNS still being healthy. The internal call depends on
neither.

Prove n8n can actually reach it — this is the one check worth running before
anything else:

```bash
docker exec n8n_app wget -qO- http://crm_app:8080/api/health; echo
```

**Expect** `{"ok":true,"time":"..."}`. If instead you get
`bad address 'crm_app'`, the two containers are not on the same network:

```bash
docker inspect n8n_app  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect crm_app  --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

They must share a name. If they don't, attach the CRM to n8n's network:

```bash
docker network connect app-stack_app-network crm_app
```

## 2. Talk to the API, never to the CRM's tables

n8n and the CRM share a Postgres server, so it is tempting to point an n8n
**Postgres** node straight at the `vantriq` database. Don't — not for writes.

Posting a usage event through `/api/webhooks/usage` does work the database
cannot do on its own:

- resolves `external_ref` to the right client
- records the 80% and over-quota flags, once per client per month
- returns the client's live quota position so the flow can react

and raising an invoice through `/api/invoices` allocates the sequential invoice
number, applies the client's tax rate, snapshots their NTN onto the invoice and
stamps the due date. An `INSERT` does none of it. You would get usage rows that
never trigger a quota flag and invoices with no number and no tax — silently
wrong, and only discovered at an audit.

**Reads are fine.** A Postgres node running `select` against `v_monthly_usage`
or `products` for a dashboard is harmless. It is writes that must go through the
API.

## 3. One key per job

```bash
docker exec crm_app npm run create-key -- "n8n usage webhook" webhook
docker exec crm_app npm run create-key -- "n8n automation"    automation
```

- **webhook key** — the usage node, and nothing else. It can only write usage.
- **automation key** — onboarding and billing. Clients, invoices, packages;
  never financials, procurement, settings, the team or delivery costs.

Store both as n8n **credentials** (Custom Auth, templated), not as literal text
in a node. A credential stays out of the workflow JSON, so exporting or sharing
a workflow cannot leak the key:

```json
{ "headers": { "x-api-key": "{{api_key}}" } }
```

## 4. End-to-end check

With the usage node wired into your WhatsApp flow, send one real message to the
agent, then:

```bash
docker exec postgres_db psql -U n8n -d vantriq -tAc \
  "select c.company, u.session_id, u.messages_count, u.occurred_at
     from usage_events u join clients c on c.id = u.client_id
    order by u.created_at desc limit 5;"
```

A row for the client whose `external_ref` matches that WhatsApp number means the
whole chain is live: WhatsApp → n8n → CRM → Postgres → the customer's portal.

If nothing appears, the usual cause is `external_ref`. It must be the client's
own WhatsApp Business number exactly as n8n sends it — no `+`, no spaces — and
not the number of the person who wrote in. The webhook answers `404` with the
ref it could not match, so check the n8n execution log for that message rather
than guessing.

---

# Blocking service when a client is over quota

`GET /api/webhooks/service-status?external_ref=923001234567` answers whether
this client's customers should be answered right now. Call it at the **top** of
the WhatsApp flow, before generating a reply, and branch on `allow`.

```json
{ "allow": true,  "reason": "ok", "quota": 1500, "sessions_used": 812, "percent_used": 54 }
{ "allow": false, "reason": "suspended",  "detail": "Invoice VAI-2026-000004 unpaid since August." }
{ "allow": false, "reason": "over_quota", "detail": "Used 2000 of 1500 included conversations this month; the block policy stops at 1500." }
```

Use the **webhook** key — the same credential as the usage node.

Two things decide the answer, and they are deliberately separate:

- **An admin suspended that client** in the CRM. A decision about one account,
  usually non-payment. It always wins.
- **The company-wide over-quota policy** in Settings, which is `serve` by
  default: keep answering past the allowance and settle it on the invoice. An
  admin can switch it to `grace` (stop at a multiple of quota) or `block` (stop
  at the allowance).

**Out of the box this endpoint always answers `allow: true`.** It only starts
refusing once someone changes one of those two things, so wiring it in now is
safe and costs nothing.

## It fails open, and your flow should too

If the lookup throws, the endpoint answers `allow: true` rather than an error —
a database hiccup must never take a client's agent off the air. Build the same
instinct into the IF node: branch on `{{ $json.allow === false }}` and let
everything else through. That way a timeout or a bad response serves the
customer instead of silencing them.

## What to send when the answer is no

Don't leave the customer with silence — they are your client's customer, and
they did nothing wrong. Reply with something plain:

> Thanks for your message. We can't respond automatically right now, but the
> team has your message and will come back to you.

Then notify your client, not their customer, that their agent is paused.
