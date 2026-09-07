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
  "external_ref": "{{ $json.from }}",
  "session_id": "{{ $json.from }}-{{ $now.format('yyyy-MM-dd') }}",
  "channel": "whatsapp",
  "ai_model": "{{ $json.model }}",
  "input_tokens": {{ $json.usage.input_tokens }},
  "output_tokens": {{ $json.usage.output_tokens }},
  "messages_count": 1
}
```

Adjust the expressions to match your actual node output field names —
the important parts are:

- **`external_ref`** — the customer's WhatsApp number (or however you
  identify them). This must match the "External ref" field you set on
  the client in the Vantriq CRM (Clients -> edit client), so the event
  gets attributed to the right account.
- **`session_id`** — one ID per 24-hour WhatsApp conversation window.
  Using `{customer number}-{date}` is a simple, reliable pattern since
  WhatsApp's own billing windows reset daily-ish; adjust if your billing
  logic differs.
- **`input_tokens` / `output_tokens`** — every major provider returns
  these automatically:
  - **Claude (Anthropic API):** `response.usage.input_tokens` / `response.usage.output_tokens`
  - **OpenAI (GPT-4o):** `response.usage.prompt_tokens` / `response.usage.completion_tokens`
  - **DeepSeek:** `response.usage.prompt_tokens` / `response.usage.completion_tokens`
  n8n's AI nodes usually expose this under the node's raw output —
  check the node's output panel for a `usage` object if the field names
  above don't match exactly.

## 4. Don't let this slow down the customer reply

Set the HTTP Request node's **"Always Output Data"** on and put it on a
branch that runs *after* you've already sent the WhatsApp reply, not
before — or use n8n's built-in **"Execute Once"** / parallel branching so
usage logging never blocks the actual conversation.

## 5. New client checklist

Every time you onboard a new client in the CRM:

1. Create/move them to **Active** in the Pipeline or Clients tab.
2. Open the client, click **Edit**, and set **"WhatsApp number / external ref"**
   to the exact number their WhatsApp Business account uses (matching
   whatever value `{{ $json.from }}` resolves to in your n8n workflow).
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
  "month_to_date": { "sessions": 224, "messages": 448 },
  "quota": {
    "period_month": "2026-09-01",
    "quota": 220,
    "sessions_used": 224,
    "sessions_remaining": 0,
    "percent_used": 102,
    "over_quota_sessions": 4,
    "overage_rate": 110,
    "estimated_overage_cost": 440,
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

That workflow already exists in your n8n as a **draft**, called
**Vantriq — monthly billing run**. It is not active and will not fire until you
publish it. `vantriq-monthly-billing.json` in this folder is the same workflow,
for import elsewhere or as a backup.

Before publishing it:

1. Check both URLs point at your CRM (they default to
   `https://crm.vantriqai.com`).
2. Create the credential it asks for — a **Custom Auth (templated)** credential
   with the template

   ```json
   { "headers": { "x-api-key": "{{api_key}}" } }
   ```

   and `api_key` set to the automation key from `create-key`. Putting the key in
   a credential rather than in the node keeps it out of the workflow JSON and
   out of exports.
3. Run it once by hand and read the **Summarise the run** output. Each client
   comes back as `invoiced`, `already invoiced`, or `FAILED` with the reason.

Only then publish it. It fires on the 1st at 03:00 and bills the month that
just ended.
