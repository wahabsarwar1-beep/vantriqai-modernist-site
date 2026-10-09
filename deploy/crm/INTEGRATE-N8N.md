# Wiring n8n and the CRM together on one VPS

Everything already exists on both sides — this connects them. About 20 minutes,
all of it in your SSH window and the n8n editor.

**The shape of it:**

```
WhatsApp ──► n8n ──► AI reply ──► WhatsApp
                │
                ├──► POST http://crm_app:8080/api/webhooks/usage      (every conversation)
                │         webhook key · records the session, flags quota
                │
                └──► POST http://crm_app:8080/api/invoices            (1st of the month)
                          automation key · retainer + any overage, taxed and numbered

                    CRM ──► Postgres ──► customer portal shows the sessions
```

n8n never touches the CRM's tables. It calls the API, which is what applies
quota flags, invoice numbers, tax and NTN. See `vantriq-backend/n8n/README.md`
for why that matters.

---

## 1. Prove the two containers can talk

```bash
docker exec n8n_app wget -qO- http://crm_app:8080/api/health; echo
```

**Expect** `{"ok":true,"time":"..."}`.

If you get `bad address 'crm_app'`, they are not on the same Docker network:

```bash
docker inspect n8n_app --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect crm_app --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker network connect app-stack_app-network crm_app    # only if they differ
```

Re-run the health check until it answers. **Nothing below works until it does.**

## 2. Create the two keys

```bash
docker exec crm_app npm run create-key -- "n8n usage webhook" webhook
docker exec crm_app npm run create-key -- "n8n automation"    automation
```

Each prints a `vq_...` value **once**. Copy both somewhere safe now.

If you already made a webhook key earlier and still have it, keep using it —
you only need the `automation` one.

## 3. Store them as n8n credentials, not as text in a node

In n8n: **Credentials → Add credential → Custom Auth**.

Create two, named so you can tell them apart — `Vantriq usage (webhook)` and
`Vantriq automation`. For each, set the JSON to:

```json
{ "headers": { "x-api-key": "vq_your_key_here" } }
```

Doing it this way keeps the key out of the workflow itself, so exporting or
sharing a workflow cannot leak it.

## 4. Wire the usage node into your WhatsApp flow

Right after the node that produces the AI reply, add an **HTTP Request** node:

- **Method:** POST
- **URL:** `http://crm_app:8080/api/webhooks/usage`
- **Authentication:** Generic → Custom Auth → `Vantriq usage (webhook)`
- **Body (JSON):**

```json
{
  "external_ref": "{{ $json.from }}",
  "session_id": "{{ $json.from }}-{{ $now.toFormat('yyyy-MM-dd') }}",
  "channel": "whatsapp",
  "ai_model": "{{ $json.model }}",
  "input_tokens": {{ $json.usage.input_tokens }},
  "output_tokens": {{ $json.usage.output_tokens }},
  "messages_count": 1
}
```

Adjust the `{{ }}` expressions to match your own node names. Two rules:

- **`external_ref`** must equal the client's WhatsApp number exactly as it
  appears on their CRM record — no `+`, no spaces. This is what matches usage to
  a client, and the commonest reason nothing shows up.
- **`session_id`** must be the same string for every message in one 24-hour
  conversation. The number-plus-date form above does that: one customer talking
  all day counts as one billable session, which is exactly how the packages are
  priced.

Set the node's **Settings → Always Output Data** off and **On Error →
Continue**, so a hiccup recording usage can never stop a customer getting their
reply.

### Real token counts, not estimates

Send the provider's own counts. With an n8n **AI Agent** node the counts are
not on its output, so the live VantriqAI agents do this (copy it for a client
flow):

1. On the **OpenAI Chat Model** node, turn **Use Responses API** off. With it
   on, n8n never receives OpenAI's usage and stores only its own estimate.
2. In the workflow's settings, turn on **Save execution progress**.
3. Before the usage node, add an **n8n** node (Execution → Get, execution ID
   `{{ $execution.id }}`, *Include execution details* on) using the
   `n8n API (token metering)` credential. It reads this run back, and the usage
   node sums `tokenUsage` over every run of the chat-model node — a tool call
   means more than one model call per reply.
4. Add `"estimated": false` when the counts came from the provider, `true`
   when you had to fall back to an estimate.

### Voice notes (v9.33)

Voice notes are an add-on (**Voice-note transcription**, or **Voice
understanding** with spoken replies). For a turn that started as a voice note,
add the length of the audio and the speech-to-text model:

```json
  "voice_seconds": {{ $('Voice note length').item.json.voice_seconds }},
  "stt_model": "gpt-4o-transcribe"
```

The live WhatsApp agent measures the length in a Code node (**Voice note
length**) that reads the Ogg file's last granule position, then transcribes with
**gpt-4o-transcribe** through an HTTP Request node. Do not use
gpt-4o-mini-transcribe for Pakistani customers: in testing it wrote Urdu in
Hindi script.

Before transcribing, check the client has bought voice:
`GET /api/webhooks/service-status` now returns `"voice": true` only when a
**Voice-note minutes** rate card applies to the client (their own, an agent's,
or their package's). On `voice: false`, reply asking the customer to type
instead of transcribing. Minutes past the rate card's included minutes are
billed on the monthly invoice like any other metered usage.

## 5. Import the billing workflow

In n8n: **Workflows → ⋯ → Import from File** → pick
`vantriq-backend/n8n/vantriq-monthly-billing.json` (it is on the VPS at
`/root/crm-stack/vantriq-backend/n8n/`).

Then open it and:

1. Set both HTTP nodes' credential to **`Vantriq automation`**
2. Leave the URLs alone — they already use `http://crm_app:8080`
3. **Execute Workflow** once by hand and read the *Summarise the run* output

Each active client comes back as `invoiced`, `already invoiced`, or `FAILED`
with a reason. `already invoiced` is a success — it means that client's invoice
for that period exists, so a repeated run cannot double-bill.

Only once that looks right, **activate** it. It then fires at 03:00 on the 1st
and bills the month that just ended.

> If you also have this workflow in the n8n **Cloud** account from earlier,
> delete it there. Two live copies would invoice every client twice.

## 6. Confirm the whole chain

Send one real WhatsApp message to the agent, then:

```bash
docker exec postgres_db psql -U n8n -d vantriq -tAc \
  "select c.company || ' | ' || u.session_id || ' | ' || u.occurred_at
     from usage_events u join clients c on c.id = u.client_id
    order by u.created_at desc limit 5;"
```

A row for the right client means WhatsApp → n8n → CRM → Postgres is live, and
that session is already visible to the customer in their portal under
**Activity**, numbered and marked as included or billable.

If nothing appears, open the n8n execution log for that run. The webhook answers
`404` naming the `external_ref` it could not match — far quicker than guessing.

---

## What each key can do, if you ever wonder

| | webhook | automation | admin |
|---|---|---|---|
| Post usage | yes | no | yes |
| Read packages | no | yes (no delivery cost) | yes |
| Create / update clients | no | yes | yes |
| Create invoices | no | yes | yes |
| Delete anything | no | **no** | yes |
| Portal credentials | no | **no** | yes |
| Financials, procurement, settings, team | no | **no** | yes |

If a workflow gets a `403`, it is using the wrong key for the job — that is the
scoping working, not a bug.
