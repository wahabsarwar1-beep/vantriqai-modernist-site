# Upgrade the live CRM — v7, the AI agents write into it

`vantriq-backend-v7.zip` is a snapshot of the whole backend, not a patch, so it
carries everything in v6 plus the v7 work. One upload, one rebuild, one
migration. Nothing in v6 is removed.

About 10 minutes, all in your SSH window (`ssh root@76.13.193.8`) except step 2
(drag-and-drop).

**What you get**

| | |
|---|---|
| **Leads from the agents** | `POST /api/webhooks/lead` — the WhatsApp and website agents write a prospect straight into the pipeline at stage `lead`, keyed on their WhatsApp number. Far more forgiving than `/api/clients`: a cold lead has no package, no deal value and often no email, and demanding them would either block the write or invite the agent to make them up. |
| **New-lead email** | The CRM sends the notification itself, through the same Hostinger mailbox it already uses for sign-in codes. The mail token never has to be copied into n8n. |
| **Conversation transcripts** | `POST /api/webhooks/conversation` stores what was actually said, in a new `conversation_messages` table. Until now the only record of a conversation was an n8n memory buffer that a restart wiped. |
| **Blanks-only updates** | A second call from the agent fills empty fields and appends notes. It never overwrites what a person typed, so your correction to a misheard company name survives the next message. |

Both new routes sit on the **webhook** scope — the same key n8n already uses to
post usage. No new API key, nothing to create, nothing to paste.

---

## 1. Back up the database

Do this before anything else.

```bash
docker exec postgres_db pg_dump -U n8n vantriq > /root/vantriq-backup-$(date +%F-%H%M).sql
ls -lh /root/vantriq-backup-*.sql
```

**Expect:** a file of tens of KB or more. If the newest one is 0 bytes, stop.

## 2. Upload the new code

In **WinSCP**: left panel = your PC, right panel = the server.

- Right panel path box: `/root/crm-stack`
- Drag **`vantriq-backend-v7.zip`** from left to right

```bash
ls -lh /root/crm-stack/vantriq-backend-v7.zip
```

## 3. Unpack it

```bash
cd /root/crm-stack
unzip -o vantriq-backend-v7.zip
grep -c "webhooks/lead\|router.post('/lead'" vantriq-backend/src/routes/usage.js
```

**Expect:** a number of `2` or more. If it prints `0`, the upload did not land
where you think — check that `/root/crm-stack/vantriq-backend/package.json`
exists, and re-unzip.

If `Dockerfile` is missing afterwards, the zip does not carry one (it never
has):

```bash
cp /root/app-stack/vantriq-backend/Dockerfile /root/crm-stack/vantriq-backend/ 2>/dev/null \
  || echo "Get Dockerfile from deploy/crm/Dockerfile and upload it with WinSCP."
```

> The folder matters: `docker-compose.yml` builds from `./vantriq-backend`.
> Files spilled loose into `/root/crm-stack/` are not what gets built.

## 4. Rebuild and restart

```bash
cd /root/crm-stack
unset CRM_DB_PASSWORD DOCKER_NET
docker compose up -d --build crm_app
docker compose ps
```

**Expect:** `crm_app` running. If it exits, `docker logs crm_app` names the cause.

> `unset` matters: Compose prefers a shell variable over the one in `.env`, so
> a leftover value from an earlier session silently overrides your settings.

## 5. Run the migration

```bash
docker exec crm_app npm run migrate
```

**Expect:** `Schema applied.` then `Done.`

Now prove it ran against the new code:

```bash
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select to_regclass('public.conversation_messages') as conversation_messages;"
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select column_name from information_schema.columns
    where table_name='settings' and column_name='lead_notify_emails';"
```

**Expect:** the table name printed (not blank), and `lead_notify_emails`.
If either is missing, the container is running old code — go back to step 3.

## 6. Prove the routes are live

This is the check worth doing, and it needs no key:

```bash
curl -s -X POST https://crm.vantriqai.com/api/webhooks/lead
```

| You see | Meaning |
|---|---|
| `{"error":"Please sign in."}` | **Correct.** The route exists and is asking for the webhook key. |
| `{"error":"This endpoint requires admin access"}` | Still the old code. The request fell past the webhook routes to the catch-all admin router. Repeat steps 3–4. |

Same check for the other one:

```bash
curl -s -X POST https://crm.vantriqai.com/api/webhooks/conversation
```

## 7. Say where new-lead emails go

There is no screen for this yet — it is one column.

```bash
docker exec postgres_db psql -U n8n -d vantriq -c \
  "update settings set lead_notify_emails = 'sales@vantriqai.com,you@vantriqai.com';"
```

Use your own addresses, comma-separated, no spaces needed. Leave it blank and
the CRM falls back to `MAIL_FROM`, so a fresh install still reaches somebody.

Confirm the mailbox the CRM sends from is actually configured — without both
of these the lead row is still written, but no email goes out:

```bash
docker exec crm_app printenv HOSTINGER_MAIL_TOKEN | head -c 12
docker exec crm_app printenv HOSTINGER_MAILBOX_ID
```

**Expect:** the first twelve characters of a token, and a mailbox id. A blank
line for either means email is off — the same two variables that send your
sign-in codes.

## 8. Attribute the agents' traffic

Neither agent's traffic is currently billed to anyone, because no client
record carries their reference. Check:

```bash
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select company, external_ref from clients where external_ref in ('vantriqai.com','923411120049');"
```

**Expect, for now:** no rows. That is why the service-status gate answers
`unknown_client` — it serves anyway, by design, but nothing is metered.

If you want VantriqAI's own agents metered like a client's, create a client in
the CRM for VantriqAI and set **External ref** to `923411120049` for the
WhatsApp agent, and a second one to `vantriqai.com` for the website assistant.
If you would rather not meter your own traffic, leave it — the agents keep
working and the usage posts are simply dropped as unknown.

## 9. Check a lead actually lands

Easiest from the server, using the webhook key n8n already holds:

```bash
docker exec crm_app node -e "
fetch('http://localhost:8080/api/webhooks/lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.TEST_KEY },
  body: JSON.stringify({ external_ref: 'test-' + Date.now(), name: 'Deploy Check', company: 'Test Co', channel: 'whatsapp' })
}).then(r => r.json()).then(console.log);
" 2>/dev/null
```

Set `TEST_KEY` to your webhook key first (`export TEST_KEY=vq_...`), or just
open the CRM and watch for the lead the first real conversation creates.

**Expect:** `{ ok: true, created: true, client_id: '...', stage: 'lead' }`, a new
row at the top of the pipeline, and an email to whatever you set in step 7.
Delete the test client afterwards.

---

## If you want to run the tests on the box

The zip carries them, and they need neither Postgres nor a running server —
the database and mailer are stubbed:

```bash
docker exec crm_app npm run test:webhooks
```

**Expect:** eleven ticks and `All webhook lead/conversation tests passed.`

## Rolling back

The v7 migration only adds — a table and a column, both `if not exists`. It
takes nothing away and rewrites no existing row, so rolling back is just
re-uploading the v6 zip and rebuilding. The new table stays behind, harmless
and unread.
