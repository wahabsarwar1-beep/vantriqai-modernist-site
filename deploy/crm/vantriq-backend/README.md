# Vantriq Ops — CRM, Billing & Procurement Backend

A real, deployable backend for the Vantriq AI CRM: Postgres database,
REST API, and a usage-ingestion webhook that n8n calls in real time after
every AI-handled conversation. The frontend (`public/index.html`) is
served by this same server, so the whole thing is one deployment.

This is not a demo with fake data — it's wired to a real database from
the first request. Follow the steps below and you'll have a live URL.

---

## What you're deploying

```
 n8n workflow                    Vantriq Ops (this repo)             You
 (WhatsApp -> AI -> reply)  --->  Express API  <--->  Postgres  <---  Browser
                                       |
                                  public/index.html (CRM UI)
```

- **Postgres** — one database, holds everything: clients, packages,
  invoices, procurement, and every usage event.
- **Express API** — the only thing that talks to Postgres. Deployed
  as one small Node.js service.
- **The CRM frontend** — static HTML/JS, served by the same Express
  app, talks to the API over `fetch()`.
- **n8n** — posts to one endpoint, `/api/webhooks/usage`, right after
  each AI call. See `n8n/README.md` for the exact node config.

---

## Step 1 — Create a free Postgres database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Once it's provisioned: **Project Settings -> Database -> Connection string -> URI**.
   Copy it — it looks like
   `postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres`
3. Keep this tab open, you'll need it in Step 3.

(Any other Postgres host — Railway, Render, Neon, RDS — works too. Supabase
is the free/fastest option to start with, and gives you a real-time
dashboard over your data for free if you ever want it.)

## Step 2 — Get the code onto your machine

Unzip this project, then:

```bash
cd vantriq-backend
npm install
cp .env.example .env
```

Open `.env` and paste your connection string into `DATABASE_URL`.
Leave `DATABASE_SSL=true` (Supabase requires SSL).

## Step 3 — Create the database tables

```bash
npm run migrate -- --seed
```

This creates every table and loads the six-tier package ladder
(Starter through Enterprise+) plus your starter vendor list, matching
your pitch deck. Safe to re-run.

## Step 4 — Generate your API keys

```bash
npm run create-key -- "Frontend admin key" admin
npm run create-key -- "n8n usage webhook" webhook
```

Each command prints a key starting with `vq_` **once** — copy both
somewhere safe (a password manager, not a chat window). The admin key
goes into the CRM's Settings screen; the webhook key goes into n8n and
nowhere else.

## Step 5 — Run it locally to check everything works

```bash
npm start
```

Open `http://localhost:8080` in a browser. You'll see a **Connect**
screen — paste in:
- **API base URL:** `http://localhost:8080`
- **Admin API key:** the admin key from Step 4

You should land on a dashboard with the six packages and zero clients.
Add a test client, move it through the pipeline to Active, and confirm
an invoice appears in Billing. If that all works, you're ready to deploy.

## Step 6 — Deploy it somewhere permanent

Any Node hosting works. **Railway** is the fastest path:

1. Push this folder to a GitHub repo (or use Railway's CLI to deploy
   the folder directly).
2. On [railway.app](https://railway.app): New Project -> Deploy from
   GitHub repo (or `railway up` from this folder).
3. In Railway's dashboard, set environment variables under your
   service: `DATABASE_URL`, `DATABASE_SSL=true`, `CORS_ORIGIN=*`
   (or your actual domain once you have one).
4. Railway gives you a public URL like `https://vantriq-ops-production.up.railway.app`.
5. Open that URL — you'll hit the Connect screen again. Use the same
   admin key from Step 4 (it's stored in the database, not tied to
   your laptop).

Render, Fly.io, and Vercel (with a serverless adapter) work the same
way — set `DATABASE_URL` as an environment variable and deploy.

## Step 7 — Point n8n at it

Open `n8n/README.md` — it has the exact HTTP Request node configuration,
including where to get token counts from Claude/GPT-4o/DeepSeek's API
responses, and how to match a WhatsApp number to a client record.

Once that's wired, session counts on the Clients and Dashboard pages
update automatically (polled every 20 seconds) as real conversations
happen — no manual entry.

## Step 8 — Give clients their own portal

Every client can have a self-serve account portal — their package,
this month's usage, invoices, and a running billing statement — with
no login system to build or maintain.

1. In the CRM, open a client and click **"Get shareable portal link"**.
2. Copy the link it generates (looks like `https://your-api/portal.html?t=pt_...`)
   and send it to the client however you'd normally reach them (WhatsApp, email).
3. That's it. The link itself is the credential — a long random token,
   not a password — and it only ever grants read access to that one
   client's own data. Regenerating the link (also in the CRM) instantly
   invalidates the old one, useful if a link is ever shared somewhere
   it shouldn't be.

The portal is a separate page (`public/portal.html`) served by the same
backend, so there's nothing extra to deploy.

## Step 9 — Add your sales team

Sales reps get their own restricted login, completely separate from your
admin key — they can only ever see and edit leads they personally created,
work them through a five-stage pipeline, and export their own numbers.
They cannot see other reps' leads, pricing internals, invoices, financials,
or anything else in the CRM.

1. In the CRM, go to **Sales Reps → Add sales rep**. Enter their name and
   (optionally) email.
2. A login key is generated and shown once — copy it, along with the URL
   `https://your-api/rep.html`, and send both to the rep.
3. The rep opens that URL, pastes in their key, and sees their own
   pipeline: **Qualification → Needs Assessment → Proposal Submission →
   Negotiation → Closure**. They can add new leads, move them through
   stages, mark a closed deal Won or Lost, and export their pipeline to
   a real `.xlsx` file at any time.
4. When a rep marks a lead **Closure + Won**, it automatically shows up
   in your main Clients/Pipeline view as `active` (if they'd already
   picked a package) or `negotiation` (if not, so you can finish
   assigning a package and start billing). A **Lost** closure sets it to
   `lost`. Either way, you see it — reps' leads were never a separate,
   hidden system; they're the same `clients` table, just access-controlled.
5. If a rep's key is compromised or they leave, click **Reset key** (issues
   a new one, the old one stops working instantly) or **Deactivate**
   (their key stops working, but their historical leads and numbers stay
   intact and attributed to them).

Reps never get access to `index.html` (the full CRM) — their key simply
doesn't have the scope for it, the same way a webhook key can't read
client data. See `n8n/README.md`-style separation: three independent
credential types (`admin`, `webhook`, and now per-rep keys), each able to
do only what it's meant to.

---

## Project structure

```
vantriq-backend/
  db/
    schema.sql        <- run once (via `npm run migrate`)
    seed.sql           <- the six-tier package ladder + starter vendors
  src/
    index.js            <- Express app entry point
    db.js                <- Postgres connection pool
    middleware/
      auth.js               <- scoped API key checking (admin / webhook)
      repAuth.js             <- sales rep key checking (separate identity system)
    routes/                <- one file per resource (clients, products, ...)
      portal.js              <- token-scoped, read-only customer portal API
      reps.js                 <- admin: create/manage sales reps
      repPortal.js             <- rep-scoped lead CRUD, summary, Excel export
    utils/
      migrate.js           <- applies schema.sql (+ seed.sql with --seed)
      createKey.js          <- generates a new admin or webhook API key
  public/
    index.html                <- the CRM frontend (talks to the API)
    portal.html                 <- the customer-facing account portal
    rep.html                     <- the sales rep pipeline app
  n8n/
    README.md                  <- exact node config for real-time usage
  .env.example
  package.json
```

## Data model notes

- **`clients.external_ref`** is what links a real WhatsApp conversation
  to a CRM record — set it once per client (their WhatsApp number is
  the simplest choice) and n8n's webhook calls resolve to the right
  client automatically.
- **`usage_events`** is the raw, append-only log n8n writes to. Nothing
  else deletes from it, so it doubles as an audit trail if a client ever
  disputes a bill.
- **`v_monthly_usage`** is a database view that rolls `usage_events` up
  by client and month — this is what the dashboard, billing, and
  overage calculations actually read from, so it's always live.
- The **WhatsApp BSP cost is deliberately not tracked as a Vantriq
  expense** anywhere in this schema — per your business model, that's
  billed directly to each client.
- **`clients.owner_rep_id` / `sales_stage` / `close_outcome`** are what
  power the sales rep system (Step 9) — a rep-sourced lead is still just
  a row in `clients`, so it's fully visible to you in the main CRM the
  moment it's created, not siloed away in a separate system.

## Scale

Postgres comfortably handles thousands of clients and millions of usage
events — this removes the ~5MB single-blob ceiling of a browser-only
prototype. Supabase's free tier covers roughly 500MB of data and up to
2GB of the paid tier's transfer; either is far beyond what an 18–40
client agency generates in a year. If you outgrow the free tier, it's a
one-click upgrade on Supabase's side, no code changes needed here.

## Security notes before you show this to anyone else

- Never commit `.env` — it holds your database password.
- Give n8n **only** the webhook-scoped key, never the admin key.
- Give sales reps **only** their own rep key, never the admin key —
  a rep key physically cannot query another rep's leads or any
  admin-only endpoint (enforced in the SQL `WHERE` clause on every rep
  route, not just in the UI).
- If a key ever leaks, mark it revoked directly in the database:
  `update api_keys set revoked = true where name = '...';`
  (a `revoke-key` CLI helper is a natural next addition if you want one).
  For a rep key specifically, use the **Reset key** button in the CRM
  instead — same effect, no SQL needed.
- `CORS_ORIGIN=*` is fine while testing; once you have a fixed frontend
  domain, set it explicitly in `.env` to lock down who can call the API
  from a browser.
- Portal links are bearer tokens, not passwords — anyone with the link
  can view that client's billing and usage. Treat them like you would a
  shared file link: send over a channel you trust, and regenerate a
  client's link (in the CRM) if you think it's been shared too widely.
