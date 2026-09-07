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
