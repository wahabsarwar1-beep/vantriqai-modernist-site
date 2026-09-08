# Upgrade the live CRM — everything since v3

**This is the only upgrade runbook you need, and there is only one zip.**
`vantriq-backend-v6.zip` is a snapshot of the whole backend, not a patch, so it
carries the v4 work (sub-accounts, quotas, FBR invoicing, passwords), the v5
work (business-model pricing, the portal's session detail) and the v6 work
(service suspension, the over-quota policy, `/api/webhooks/service-status`) in
one upload. One upload, one rebuild, one migration.

The file is named for the newest version inside it. If you are looking for a
"v6 file" and only see a different number, the zip was renamed and this line
was not — check the version list above against what you expect, and trust the
contents over the filename.

Nothing in v3 is removed; every change adds to what is already there.

**What you get**

| | |
|---|---|
| **Sub-accounts** | A client can sit under a parent for grouping and reporting. Each sub-account keeps its own package, its own quota and its own invoices — nothing is pooled. |
| **Quota flagging** | At 80% and again at 100% of a client's included conversations, the month is flagged in a new **Quota & Overage** screen. Service never stops. You decide per client: bill the overage, move them up a tier, or waive it. |
| **FBR-compliant invoicing** | Your NTN/STRN and the client's, a per-client sales tax rate, sequential invoice numbers, the value split into amount-excluding-tax / tax / total payable, and a printable tax invoice for you and for the customer. |
| **Server-side activation billing** | The setup fee and first retainer are now raised by the server when a client goes Active — so a client onboarded by n8n is billed exactly like one dragged across the board. |
| **Manual passwords** | You can type a password for a customer or an employee instead of accepting a generated one. |
| **Forgot password** | Both the CRM and the customer portal have a "Forgot your password?" link. The emailed link is single-use and expires in an hour. Whatever the customer chooses becomes the password the CRM holds. |
| **Automation key** | A new `automation` API scope for n8n: it can create clients and invoices, but never reads financials, procurement, settings, the team or your delivery costs. |
| **Business-model pricing** | All six tiers reset to the August 2026 model — Starter goes from a 220-session allowance at PKR 110 overage to 1,500 at PKR 2, and so on up the ladder. Airtable and Google Sheets are gone; this CRM's own Postgres is the data layer. |
| **Sessions in the customer portal** | Every conversation is listed with its number for the month, and that number shows whether it is inside the allowance or charged at the overage rate. |

Everything below runs in your SSH window (`ssh root@76.13.193.8`) except
step 2 (drag-and-drop) and steps 7–9 (in the browser). About 20 minutes.

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
- Drag **`vantriq-backend-v6.zip`** from left to right

Then confirm it arrived:

```bash
ls -lh /root/crm-stack/vantriq-backend-v6.zip
```

## 3. Unpack it

```bash
cd /root/crm-stack
unzip -o vantriq-backend-v6.zip
ls -1 vantriq-backend/src/routes/quota.js vantriq-backend/public/reset.html vantriq-backend/Dockerfile
```

**Expect:** all three file names printed back. If you get "No such file" for
the first two, the zip unpacked into the wrong place — check that
`vantriq-backend/` exists and holds `package.json`, and re-unzip.

If only `Dockerfile` is missing, the zip does not carry one (it never has);
copy the one already on the server back into place:

```bash
cp /root/app-stack/vantriq-backend/Dockerfile /root/crm-stack/vantriq-backend/ 2>/dev/null \
  || echo "Get Dockerfile from deploy/crm/Dockerfile and upload it with WinSCP."
```

> The folder matters: `docker-compose.yml` builds from `./vantriq-backend`.
> Files spilled loose into `/root/crm-stack/` are not what gets built.

## 4. Add the reset-link settings

The password reset email has to know which address to send people to.

```bash
cd /root/crm-stack
cat >> .env <<'EOF'
APP_BASE_URL=https://crm.vantriqai.com
PORTAL_BASE_URL=https://portal.vantriqai.com
EOF
echo "settings added"
```

## 5. Rebuild and restart

```bash
cd /root/crm-stack
unset CRM_DB_PASSWORD DOCKER_NET
docker compose up -d --build crm_app
docker compose ps
```

**Expect:** `crm_app` running. If it exits, `docker logs crm_app` names the cause.

> `unset` matters: Compose prefers a shell variable over the one in `.env`, so
> a leftover value from an earlier session silently overrides your settings.

## 6. Run the migration

```bash
docker exec crm_app npm run migrate
```

**Expect:** `Schema applied.` then `Done.`

Now prove it actually ran against the new code — this is the check that
caught a bad upload last time:

```bash
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select column_name from information_schema.columns
    where table_name='invoices' and column_name in ('invoice_number','tax_amount','total_amount');"
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select to_regclass('public.quota_events') as quota_events, to_regclass('public.password_resets') as password_resets;"
```

**Expect:** three column names, and both table names printed (not blank).
If anything is missing, the container is running old code — go back to step 3.

## 6b. Check the new package figures

The migration also realigns the six tiers to the August 2026 business model —
new setup fees, monthly plans, allowances and overage rates, and the stack
description (there is no Airtable or Google Sheets any more; this CRM's own
Postgres is the data layer). It runs **once** and records itself, so re-pricing
a package afterwards is safe: a later migrate will not put the old numbers back.

```bash
docker exec postgres_db psql -U n8n -d vantriq -c \
  "select name, setup_fee, retainer, quota, overage_rate from products order by sort_order;"
```

**Expect** Starter 25000 / 20000 / 1500 / 2, through to Enterprise+ 190000 /
257000 / 40000 / 5.

Two consequences worth knowing before you look at the CRM:

- **Allowances are several times larger** (Starter goes from 220 to 1,500
  sessions), so clients who looked close to their limit will now look
  comfortably inside it. That is the point — the model sets allowances at 2.7 to
  5 times typical use so nobody rations conversations.
- **Overage is far cheaper** (Starter goes from PKR 110 to PKR 2 a session), so
  a busy month is a conversation about upgrading rather than a disputed invoice.
- Any quota flag still awaiting your decision was raised against the *old*
  allowance and is closed automatically as waived, with a note saying why.
  Nothing is billed by that.

## 7. Fill in your tax details

In the browser, open **https://crm.vantriqai.com** → **Settings** →
**Tax & invoicing**:

- **Your NTN** and **Your STRN** — as registered with FBR
- **Registered address** — printed on every invoice as the seller's address
- **Default sales tax rate %** — applied to any client without a rate of their own
- **Payment terms (days)** — sets the due date on each invoice
- **Invoice number prefix** — invoices run `VAI-2026-000001`, `-000002`, and so on

Press **Save tax details**.

**Do this before raising any more invoices.** An invoice keeps the details it
was issued with, so anything raised before this step will print without your
NTN and cannot be corrected after the fact — it would have to be cancelled and
re-issued.

## 8. Fill in each active client's NTN

Open each client → **Edit client** → **Billing & tax**:

- **NTN / CNIC** — the client's registration. For an unregistered buyer,
  put their CNIC here.
- **Billing address**
- **Sales tax rate %** — leave blank for the company default; enter `0` for an
  exempt client
- **Parent account** — only if this client is a sub-account of another

From now on the CRM will not let a client move to **Active** without an NTN
and a billing address, because that is the moment the first invoice is raised.

## 9. Create the automation key for n8n

```bash
docker exec crm_app npm run create-key -- "n8n automation" automation
```

Copy the `vq_...` key it prints **once**. In n8n it goes in the same
`x-api-key` header the usage webhook uses, on the billing workflow only.

Keep the existing webhook key exactly as it is — the usage flow does not change.

## 10. Check it end to end

```bash
curl -sS https://crm.vantriqai.com/api/health
curl -sS -o /dev/null -w 'reset page: %{http_code}\n' https://portal.vantriqai.com/reset.html
```

Then in the browser:

1. **Quota & Overage** in the sidebar — it should load, empty at first.
2. Open a client → **Customer portal** → type a password → **Set password**.
   Sign in at `https://portal.vantriqai.com` with it.
3. On the portal sign-in page, use **Forgot your password?** with that
   username. The email arrives at the address on the client record; the link
   opens the reset page; the password you choose there works immediately and
   the CRM shows it as set by the customer.
4. Open any invoice → **Print tax invoice**. Check both NTNs and the tax split.

---

## Rolling back

```bash
cd /root/crm-stack
docker compose stop crm_app
docker exec -i postgres_db psql -U n8n -d vantriq < /root/vantriq-backup-<the file from step 1>.sql
```

Then re-upload the v3 zip and rebuild. **Never** run `docker compose down -v` —
the `-v` deletes the volumes and would take the n8n database with it.

## After you are live

- **Rotate the Hostinger mail token.** It was pasted into a chat window, so
  treat it as public: make a new one in hPanel, put it in `.env`, restart
  `crm_app`, then revoke the old one.
- **Rotate the WhatsApp access token** in n8n and store it as a credential
  rather than in three node bodies.
- **Turn off API-key sign-in** once every employee has an account:
  set `ALLOW_API_KEY_LOGIN=false` in `.env` and restart. The webhook and
  automation keys keep working — only the break-glass admin key is closed off.
