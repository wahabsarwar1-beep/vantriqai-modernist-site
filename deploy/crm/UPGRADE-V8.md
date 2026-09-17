# Upgrading the Vantriq CRM to v8

Two waves, shipped together. **v7** put real accounting under the CRM;
**v8** turned the billing into a subscription system.

Everything is additive. `db/schema.sql` is safe to re-run — it has been
applied twice to a clean database and twice over a v6 one with no errors.

---

## 1. Deploy

```bash
# on the VPS, in the folder holding docker-compose.yml
curl -fsSL <url>/vantriq-backend-v8.zip -o vantriq-backend-v8.zip
sha256sum vantriq-backend-v8.zip      # 2695b55df4d942f501629e3aba51da8e177916012ae88185d1c62549d301f4ac
unzip -o vantriq-backend-v8.zip -d vantriq-backend
docker compose build api && docker compose up -d api
docker compose exec api npm run migrate
```

Then, once:

```bash
docker compose exec api npm run seed-internal
```

That creates **VantriqAI's own account** — see §4.

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

## 7. Before you rely on it

These are yours to do, and nothing below is done for you:

1. **Rotate the two exposed secrets** — the webhook API key and the Hostinger
   mail token — and revoke the old ones.
2. **Fix the mail credential** so dunning and password notices can send. The
   Authorization template must be `Bearer <token>`, not the bare token.
   Without it, reminders log as `skipped`, not `sent` — they are never
   silently dropped.
3. **Move the Meta/WhatsApp token** out of the three n8n nodes holding it in
   plaintext and into a credential.
4. **Set `ALLOW_API_KEY_LOGIN=false`** once staff accounts exist.
5. **Set your tax rates and opening cash** (§2), or the statements start from
   nothing and no tax is charged.
6. **Never let n8n write to Postgres directly.** Reads only; every write goes
   through the API.

