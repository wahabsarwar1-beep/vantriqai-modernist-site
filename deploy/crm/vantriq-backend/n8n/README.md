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
