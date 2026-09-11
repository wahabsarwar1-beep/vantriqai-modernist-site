# Upgrading the live CRM to v2

Adds portal logins, locked standard packages, forward-only pipeline stages with
comments, required fields, and customer package requests.

The database migration is **additive only** — it adds columns and tables and
changes no existing data. Nothing is dropped. Take a backup anyway.

## 1. Back up the database first

```bash
docker exec postgres_db pg_dump -U n8n vantriq > /root/vantriq-backup-$(date +%F-%H%M).sql
ls -lh /root/vantriq-backup-*.sql
```

The file should be tens of KB, not zero. (`n8n` is this stack's Postgres
superuser — see the deployment guide.)

## 2. Upload and unpack

Drag `vantriq-backend-v2.zip` into `/root/crm-stack/` with WinSCP, then:

```bash
cd /root/crm-stack
unzip -o vantriq-backend-v2.zip
```

`-o` overwrites the old files in place. Your `.env` and `docker-compose.yml`
live one level up in `/root/crm-stack/` and are untouched.

## 3. Rebuild and migrate

```bash
cd /root/crm-stack && docker compose up -d --build
docker exec crm_app npm run migrate
```

`migrate` without `--seed` applies the new columns and tables and leaves your
existing rows alone. Expect `Schema applied.` then `Done.`

## 4. Check it took

```bash
docker exec crm_app grep -c "portal_sessions" /app/db/schema.sql
docker exec postgres_db psql -U n8n -d vantriq -c "select name, is_standard from products order by sort_order;"
curl -s https://crm.vantriqai.com/api/health
```

Enterprise+ should be the only row with `is_standard = f`. Then hard-refresh
the CRM in your browser (Ctrl+Shift+R).

## What changes for you the moment this goes live

**Existing customer portal links stop working.** That is the point of the
change — a link alone can no longer open an account. For each client who needs
portal access: open the client, **Create portal login**, and send them the
username and password. The password is shown once.

**Existing clients may be missing required fields.** Every field except Notes
is now mandatory, so the first time you edit an older client you will be asked
to fill in anything blank. Saving is blocked until you do. Existing records are
not touched until you edit them.

**Stages only move forward now.** One step at a time, each with a comment, and
the comment is recorded permanently. Lost can be set from any stage before
Active; an Active client can be moved to Churned. Both are final — there is no
undo in the UI, so read the confirmation before you commit a move.

**Standard packages are read-only.** Starter through Enterprise show a lock.
Only Enterprise+ can be edited, and per-client custom terms appear on a client's
record when their package is Enterprise+.

## Rolling back

```bash
cd /root/crm-stack
rm -rf vantriq-backend && unzip -o <the previous zip>
docker compose up -d --build
```

The new columns and tables stay behind harmlessly — the old code simply ignores
them. Only restore the SQL backup if you actually need the old data back:

```bash
docker exec -i postgres_db psql -U n8n -d vantriq < /root/vantriq-backup-<stamp>.sql
```

---

# v3 — internal employee logins (password + emailed OTP)

Replaces API-key sign-in for people with company-email accounts, a password and
a one-time code emailed to that address. The n8n webhook key is untouched.

## 1. Get a mail API token

hPanel → **Emails** → your `vantriqai.com` mail service → **API tokens** →
create one. The CRM sends the codes from `support@vantriqai.com` through
Hostinger's mail API — no SMTP password is stored anywhere.

**Without this token nobody can finish signing in.** Set it before you switch
anyone over.

## 2. Add the environment variables

Edit `/root/crm-stack/docker-compose.yml` and add these under the existing
`environment:` block for `crm_app`:

```yaml
      HOSTINGER_MAIL_TOKEN: <the token from step 1>
      HOSTINGER_MAILBOX_ID: AC639077da6944831097970eb520d3
      MAIL_FROM: support@vantriqai.com
      COMPANY_EMAIL_DOMAIN: vantriqai.com
      ALLOW_API_KEY_LOGIN: "true"
```

`AC639077da6944831097970eb520d3` is your `support@vantriqai.com` mailbox id.

## 3. Deploy and migrate

```bash
cd /root/crm-stack
unzip -o vantriq-backend-v3.zip
docker compose up -d --build
docker exec crm_app npm run migrate
```

## 4. Create the first login

Nobody can sign in until one account exists, and accounts are made from inside
the CRM — so the first one comes from the command line:

```bash
docker exec crm_app npm run create-user -- "wahab@vantriqai.com" "Wahab Sarwar" admin
```

It prints a password once. Then open `https://crm.vantriqai.com`, sign in with
that email and password, and enter the 6-digit code sent to your inbox.

Everyone after that is added from **Team** in the CRM.

## 5. Check the code actually arrives

The most likely thing to go wrong is mail delivery. If the code never arrives:

```bash
docker logs crm_app | grep -i "OTP send failed"
```

A `502` on the sign-in screen means the server could not send the mail — the
log line carries Hostinger's own error. Sign-in deliberately fails closed: a
code nobody received is deleted rather than left redeemable.

## What changes

- **The Connect screen is gone.** Staff sign in with email and password, then a
  code. Their old admin API key no longer needs to be shared around.
- **Two roles.** Admin sees everything and manages the team. Staff get pipeline,
  clients, billing and package requests — no Financials, Procurement, Settings,
  Team, pricing edits, delivery costs or margin. Those figures are withheld by
  the API, not merely hidden in the interface.
- **Break-glass stays available** at "Emergency access with an API key" on the
  sign-in screen. Once every employee has an account and you have seen codes
  arrive reliably, set `ALLOW_API_KEY_LOGIN: "false"` and rebuild to close it.
- **Only `@vantriqai.com` addresses** can hold an internal login — enforced in
  the API and by a database constraint.
