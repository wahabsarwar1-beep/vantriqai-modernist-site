# Upgrading the Vantriq CRM to v8

Two waves, shipped together. **v7** put real accounting under the CRM;
**v8** turned the billing into a subscription system.

Everything is additive. `db/schema.sql` is safe to re-run — it has been
applied twice to a clean database and twice over a v6 one with no errors.

---

## 1. Deploy

### The short way

Copy two files up, then run one command:

```bash
# from your own machine
scp deploy/crm/vantriq-backend-v8.zip deploy/crm/upgrade-v8.sh root@76.13.193.8:/root/app-stack/

# on the VPS
cd /root/app-stack
chmod +x upgrade-v8.sh
./upgrade-v8.sh --dry-run      # read this first
./upgrade-v8.sh
```

`upgrade-v8.sh` does the whole of this section: checks the stack, takes a
**verified** database backup, keeps the old source, rebuilds, waits for health,
migrates, seeds the internal account, and runs the verification below —
stopping at the first thing that does not look right, and printing the rollback
if it does.

It refuses to continue on a backup that is empty or truncated, which is the one
failure that would otherwise leave you worse off than doing nothing.

`--dry-run` prints every command without running any of them. Use it once.

Override the defaults with environment variables if your stack differs:
`STACK_DIR`, `APP_CONTAINER`, `DB_CONTAINER`, `DB_NAME`, `DB_USER`.

### Or let CI do it

`.github/workflows/deploy-crm.yml` runs the same script over SSH. Add three
repository secrets (Settings → Secrets and variables → Actions):

| secret | value |
|---|---|
| `VPS_HOST` | `76.13.193.8` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | a **new** private key, not the one you use from your laptop |

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key
ssh-copy-id -i deploy_key.pub root@76.13.193.8
# paste the contents of deploy_key as VPS_SSH_KEY, then delete both files
```

Then Actions → **Deploy CRM** → Run workflow. It **defaults to a dry run** —
you have to pick `apply` to change anything, so a mis-click costs a log and
nothing else. It builds the bundle from the commit being deployed rather than
trusting the committed zip, pins the host key, refuses to run two deploys at
once, and checks `/api/health` afterwards.

Optional secrets: `VPS_PORT` (default 22), `STACK_DIR` (default
`/root/app-stack`).

### The long way, by hand

```bash
cd /root/app-stack
docker exec postgres_db pg_dump -U postgres vantriq > pre-v8.sql   # do not skip
sha256sum vantriq-backend-v8.zip      # 90341101303272d5a84e333252c112257593e94819894635184b577bc287c5ad
unzip -o vantriq-backend-v8.zip -d vantriq-backend
docker compose build crm_app && docker compose up -d crm_app
docker exec crm_app npm run migrate
docker exec crm_app npm run seed-internal
```

That last line creates **VantriqAI's own account** — see §4.

### Verify

```bash
docker compose exec -T db psql -U postgres -d vantriq -At <<'SQL'
select count(*) from information_schema.columns
 where table_name='invoices' and column_name in ('ait_rate','ait_amount','net_payable');   -- 3
select count(*) from information_schema.tables
 where table_name in ('payments','invoice_lines','client_agents','tax_remittances');       -- 4
select count(*) from information_schema.tables
 where table_name in ('client_bundles','quotes','quote_lines','subscription_phases',
                      'usage_rates','dunning_steps','invoice_reminders','automations',
                      'automation_runs','bank_credits');                                   -- 10
select count(*) from clients where is_internal;                                            -- 1
SQL
```

---

## 2. What changed in v7 — the books

### Two taxes, moving in opposite directions

An invoice used to carry one. A Pakistani service invoice carries two:

| | direction | on the invoice |
|---|---|---|
| **GST** | **added** to the bill | Subtotal → **+ GST** → Total |
| **AIT** (s.153) | **withheld** from it | Total → **less AIT** → **Net payable** |

`net_payable` is what the client actually transfers. They deposit the
withheld portion against your NTN and send back a CPR/challan, which the
Accounts view tracks as recoverable until you claim it.

**Set your rates in Settings → Tax & invoicing.** GST and AIT default to 0,
so nothing changes on your existing invoices until you do. 11% is the usual
AIT rate for services; set 0 if nobody withholds from you.

### Status stops being something you type

`payments` records every receipt, challan, write-off and credit note. An
invoice restates itself from them: **paid** when nothing is outstanding,
**partial** when something has come in, **overdue** once the due date passes
with a balance on it. `POST /api/invoices/reconcile` re-reads them all.

### One company, many agents

`client_agents` lets a client run a WhatsApp agent, an Instagram agent, a
Facebook agent and a website assistant at once, each with its own reference,
each metered separately. **Every pre-v7 n8n flow keeps working unchanged** —
usage ingestion tries `agent_ref` first, then falls through from
`external_ref` to a client and then to an agent.

### VantriqAI as a customer of VantriqAI

`npm run seed-internal` creates the internal account on Enterprise+ with an
agent for the site chat and one for WhatsApp. Its usage is metered and priced
exactly like a customer's, with one difference: **no GST, nothing withheld,
settled at issue, never a receivable** — and the financials read the billing
as **cost, not revenue**, so running your own agents shows up where it belongs.

Point the site-chat workflow at `agent_ref: "vantriqai.com"` and the WhatsApp
one at `agent_ref: "vantriqai-whatsapp"`.

### Statements that are derived, not typed

**Accounts & Statements** gives you P&L for any window, a monthly P&L series,
an income statement against the prior period, and a balance sheet that carries
its own proof that it balances. Correct an invoice and every one of them moves.

The old **Financials** page stays, now labelled as the forward projection it
always was.

> **One thing to set:** Settings → Accounting → **opening cash**. The balance
> sheet is derived rather than kept in a general ledger, so it needs one
> anchor: the cash you held on the day you started keeping these records.
> Equity opens at the same figure. Leave it at 0 and the sheet still balances,
> it just starts from nothing.

---

## 3. What changed in v8 — subscriptions

### Bundles: another package alongside the first

When a package runs its course, or a client simply wants more, you add a
bundle rather than moving them. Its quota **adds** to their allowance and its
retainer **adds** to the same monthly invoice, as its own line. A bundle can
be pinned to one agent — that is how "the Instagram agent needs its own
allowance" is expressed.

Prices are snapshotted when the bundle is added, so re-pricing a tier later
cannot re-price a bundle somebody is already paying for.

**The customer can add one themselves** from their portal. That is deliberate:
moving tier changes what they pay every month and comes to you for approval;
buying more of what they already have does not. A customer-added bundle
carries **no setup fee** — they are not being set up again.

### The monthly run

`POST /api/billing/run-monthly` bills every active client in one call:
package, bundles, and anything past the allowance, as one invoice with a line
for each. It applies scheduled package changes that have come due first and
ends the bundles whose term has run out.

Running it twice cannot double-bill anybody. Point n8n at it on the 1st with
an automation key.

Everything on the Billing Automation page can be asked **what it would do**
before it does it.

### Quotes

An estimate that consumes no invoice number and touches no account. The
customer accepts it in their portal, and *that* is when the invoice is raised
from its own lines and any package move or bundle it describes is applied.
An accepted quote is frozen.

### The invoice actually reaches the customer

The monthly run used to raise invoices silently — a customer's first word of
one was a dunning reminder days later, chasing a bill nobody had sent them.

Now the run emails each invoice as it raises it: the line items, the full tax
ladder (Subtotal → + GST → Total → less AIT withheld → Net payable), the s.153
note asking for the challan, and a link to their portal. The email is built
from the **same** printable document the CRM and the portal render, so what
they read in their inbox cannot drift from the invoice itself.

Three things it will not do:

- **Never emails an internal invoice.** Billing ourselves is a transfer.
- **Never sends the same invoice twice.** Every send is logged; the run and the
  manual button both check first. Pass `force` to deliberately resend.
- **Never lets a mail failure undo an invoice.** The invoice is the record, the
  email is a courtesy. A failed send is logged against the invoice for someone
  to retry — it does not roll anything back.

This is **on by default**, because an unsent invoice is the bug, not the safe
state. Nothing reaches anyone until you run the billing for real, and the dry
run names every recipient first. Switch it off in Billing Automation → Monthly
run if you would rather send bills by hand.

Sending one by hand: open any invoice → **Email it to …**, or
`POST /api/invoices/:id/send` (`?preview=true` to see what would happen).
**What has been sent** on the same panel shows the full history — the invoice
itself and every chase — in one list.

### Chasing, and why there are no "smart retries"

There is no card to retry — invoices here are settled by bank transfer. The
honest equivalent is an escalating schedule of reminders around the due date
ending, if nothing arrives, in the service being paused. A sensible default
schedule installs in one click. **Each step fires once per invoice, ever**, so
the daily run can be left alone.

Switch it on in Billing Automation → Chase schedule. It is **off by default**
and sends nothing until you turn it on.

### Bank auto-reconciliation

Paste your statement's credit lines and they are matched to invoices in order
of how sure the rules can be: invoice number in the reference, then an amount
fitting exactly one open invoice, then payer plus amount. **Anything ambiguous
is left for a person.** A wrong automatic match tells a customer they have
paid when they have not, and hides a real debt.

### Metered rates

Rate cards price messages, tokens or automation runs instead of the tier's
flat per-conversation overage — what a negotiated contract usually needs. The
most specific wins: agent → client → package → the tier's own rate.

---

## 4. The customer portal

- **My agents** — every agent running under their company, with its own
  numbers. End-consumer phone numbers are never exposed.
- **Packages & bundles** — add a bundle instantly, end one they added.
- **Quotes** — accept or decline, and print.
- **Security** — change their own password. The current one is required, so a
  borrowed laptop cannot lock the owner out; every other device is signed out;
  and a notice goes to the address on their record, which only you can change.

---

## 5. Everything downloads

Settings → **Download the CRM as Excel**, or Accounts & Statements → Download.
29 sheets: every table that carries a fact, plus a month-by-month revenue
sheet from the first invoice ever raised to today, and the balance sheet as it
stands.

---

## 6. Also in this release

- The **pipeline has a stage bar** across the top. Press a stage to work just
  that stage as a list; "All stages" keeps the drag-and-drop board. The rep
  portal has the same bar.
- **Everything clickable shows a hand**, not a text cursor — in the CRM, the
  customer portal and the rep portal.
- The printed invoice was rebuilt: invoice number / date of issue / date due,
  a from and bill-to block, Description / Qty / Unit price / Amount, and the
  full tax ladder down to Amount due.

---

## 6a. What the metering actually measures

Both live agents run OpenAI `gpt-4o-mini`. Until now their usage nodes posted
`input_tokens: 0, output_tokens: 0`, so the CRM counted conversations and knew
nothing about cost. That is fixed, with one honest caveat.

**Tokens are estimated, not billed.** n8n does not expose the model sub-node's
token counts to a downstream expression — verified, `$('OpenAI Chat Model')`
throws *"No data found from `main` input"* — and the figure n8n itself holds is
`tokenUsageEstimate`, flagged `estimated: true`, not OpenAI's billed usage. The
agent node has no token-usage output either.

So each usage post now sends a measured system-prompt baseline plus a
script-aware count of the message and the reply (Urdu script is far denser per
token than Latin, so the two are counted separately), and stamps
`token_source: "estimate:baseline+length"` into the raw payload so nobody
later mistakes it for a bill.

Read it this way:

| | where it comes from | what it is good for |
|---|---|---|
| **Token estimate** | the n8n usage post | **allocation** — which agent, which client, which channel is spending |
| **Actual spend** | the OpenAI invoice | **the total** — enter it as a vendor expense |

The estimate tells you how to split the bill. The bill tells you its size.
Memory growth inside a long session is not modelled, so treat the input figure
as a floor, and note that **Whisper transcription of WhatsApp voice notes is a
real OpenAI cost that the chat-token estimate does not capture at all**.

### The references have to match exactly

`npm run seed-internal` creates two agents whose `external_ref` is exactly what
the live workflows post:

| agent | external_ref | posted by |
|---|---|---|
| Website assistant | `vantriqai.com` | the website workflow, a literal |
| WhatsApp agent | `923411120049` | `metadata.display_phone_number` — the number the message **arrived on**, not the prospect's |

If the WhatsApp business number changes, set `VANTRIQ_WHATSAPP_NUMBER` before
seeding. A mismatch fails silently: the reply still goes out, the usage row
just never lands.

### The duplicate WhatsApp workflow has been retired

`VantriqAI - WhatsApp Sales Agent (Text + Voice)` receives Meta's traffic and
carries the usage node. `Vantriq Assistant - WhatsApp AI Sales Consultant` had
**never executed once** — Meta was not pointed at its webhook — so it has been
unpublished and **archived**, not hard-deleted: n8n keeps it recoverable from
the archive if you ever want what was in it.

Worth knowing what went with it, because the live workflow does **not** have
these: the **CRM service gate** (ask before answering, so a suspended or
over-quota client stops being served), **lead capture** into the CRM pipeline,
and **transcript saving**. Only usage reporting was carried across. Say the
word and I will port the gate and lead capture into the live one.

A third, `VantriqAI - WhatsApp Sales Agent2`, is inactive with no triggers and
was left alone.

---

## 8. Making email work

Invoices, payment chases, staff sign-in codes and password resets all go out
through one path. Get this wrong and every one of them **fails quietly** — by
design, so that a mail outage never blocks an invoice or a reply — which is
exactly why it can stay broken for weeks without anyone noticing.

### It is two environment variables, not an n8n credential

The CRM talks to Hostinger's mail API directly from `src/utils/mailer.js`,
which already sends `Authorization: Bearer <token>` correctly. There is nothing
to configure in n8n: leads now go through the CRM, so no n8n node sends mail
any more.

What it needs is on the `crm_app` container:

| variable | value |
|---|---|
| `HOSTINGER_MAIL_TOKEN` | the real token (currently the literal `PASTE_MAIL_TOKEN`) |
| `HOSTINGER_MAILBOX_ID` | `AC639077da6944831097970eb520d3` — **verified correct** |
| `MAIL_DISPLAY_NAME` | optional, defaults to `Vantriq AI` |

### Two things worth knowing before you set it

**The API has no `from` field.** The sender IS the mailbox the token is
authorised for, named in the URL by `HOSTINGER_MAILBOX_ID`. `MAIL_FROM` never
did anything and has been removed; what you *can* set is the display name
beside the address.

**`support@vantriqai.com` is the only mailbox on this order.** So mail sends as
support@, whatever you would prefer. `sales@vantriqai.com` is not a mailbox
here — if you want invoices to come from it, create it in hPanel, generate a
token *for that mailbox*, and use its resource id instead.

### Doing it

1. hPanel → **Emails** → `support@vantriqai.com` → **API tokens** → generate
   one. Copy it — it is shown once.
2. Put it in `/root/app-stack/docker-compose.yml` under `crm_app:` →
   `environment:` as `HOSTINGER_MAIL_TOKEN`.
3. `docker compose up -d crm_app` — an environment change needs the container
   recreated, not just restarted.
4. In the CRM: **Settings → Email**. It tells you whether it is configured and,
   if not, which variable is wrong. Then **Send a test email** to yourself.

A green result means invoices and chases will reach customers. A red one
carries the mail API's own words plus what to change:

| what it says | what it means |
|---|---|
| `401` / `ERR_UNAUTHORIZED` | the token is wrong or revoked — generate a fresh one |
| `403` / `ERR_FORBIDDEN` | valid token, wrong mailbox — check the mailbox id matches |
| `404` | that mailbox id does not exist |

The token is never echoed back. The page shows a fingerprint
(`abcd…wxyz (48 chars)`) — enough to tell two tokens apart, not enough to use.

> **Rotate the old token first.** It was pasted into a chat earlier in this
> project's history, so treat it as compromised whatever else you do.

---

## 7. Before you rely on it

These are yours to do, and nothing below is done for you:

1. **Rotate the two exposed secrets** — the webhook API key and the Hostinger
   mail token — and revoke the old ones.
2. **Make email work** — see §8. Nothing about it is an n8n credential.
3. **Move the Meta/WhatsApp token** out of the three n8n nodes holding it in
   plaintext and into a credential.
4. **Set `ALLOW_API_KEY_LOGIN=false`** once staff accounts exist.
5. **Set your tax rates and opening cash** (§2), or the statements start from
   nothing and no tax is charged.
6. **Never let n8n write to Postgres directly.** Reads only; every write goes
   through the API.

