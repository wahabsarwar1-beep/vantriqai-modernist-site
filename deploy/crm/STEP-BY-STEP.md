# Getting the CRM online — plain-English walkthrough

For `crm.vantriqai.com` on VPS `76.13.193.8`. Every step is copy-paste. After
each one I say what you should see, so you know it worked before moving on.

**Roughly 20 minutes.** Nothing here can break n8n or your website.

## What we're actually doing

Your server is running the *wrong* CRM. When it was set up, a program called
Twenty CRM was installed, but the CRM you actually want is the Vantriq Ops app
in your zip file. Twenty was never configured with a database, so it crashes
over and over — and the "502 Bad Gateway" page is your server saying "the thing
I'm supposed to show you isn't running."

So: we switch off Twenty, and put your real CRM in its place.

We are **not** touching n8n, your website, or the existing setup file. Your CRM
gets its own folder, so if anything goes wrong, nothing else is affected.

---

## Step 1 — Open a terminal on the server

Go to <https://hpanel.hostinger.com/vps/1959839/overview> and click
**Browser terminal** (opens in a new tab; allow popups if nothing appears).

You'll see a black window ending in `root@srv1959839:~#`. That's the prompt —
it means the server is waiting for you.

> **Tip:** in the browser terminal, paste with **Ctrl+Shift+V**, not Ctrl+V.

## Step 2 — Switch off the broken CRM

```bash
docker stop crm_app && docker rm crm_app
```

**You should see:** `crm_app` printed twice.

That's Twenty stopped and removed. `crm.vantriqai.com` is now properly offline
instead of showing an error — we'll fill the gap in a moment.

## Step 3 — Make a folder for the real CRM

```bash
mkdir -p /root/crm-stack && cd /root/crm-stack && pwd
```

**You should see:** `/root/crm-stack`

## Step 4 — Copy your zip file onto the server

This one runs **on your own computer**, not in the server terminal. Open a
terminal on your laptop (on Windows: PowerShell) in the folder where the zip is:

```bash
scp vantriqcrmbackend_2.zip root@76.13.193.8:/root/crm-stack/
```

It'll ask for your server's root password, then show a progress bar.

Now **back in the server terminal**, unpack it:

```bash
cd /root/crm-stack && unzip -o vantriqcrmbackend_2.zip && ls
```

**You should see:** a list ending with a `vantriq-backend` folder.

If `unzip` isn't installed: `apt update && apt install -y unzip`, then retry.

## Step 5 — Add the build recipe

Your zip has no instructions for building a container, so we add them. Paste
this **whole block** at once, including the last line with `EOF`:

```bash
cat > /root/crm-stack/vantriq-backend/Dockerfile <<'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "src/index.js"]
EOF
echo "Dockerfile written"
```

**You should see:** `Dockerfile written`

## Step 6 & 7 — Settings and database, in one go

This discovers your Postgres superuser name and network, generates a password,
and creates the CRM's own database. Run it as one block:

```bash
cd /root/crm-stack
unset CRM_DB_PASSWORD DOCKER_NET
PGSUPER=$(docker exec postgres_db printenv POSTGRES_USER 2>/dev/null); [ -z "$PGSUPER" ] && PGSUPER=postgres
NET=$(docker inspect postgres_db --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
PASS=$(openssl rand -hex 24)
printf 'DOCKER_NET=%s\nCRM_DB_PASSWORD=%s\n' "$NET" "$PASS" > .env
echo "superuser: $PGSUPER"
echo "network:   $NET"
docker exec postgres_db psql -U "$PGSUPER" -c "CREATE USER vantriq WITH PASSWORD '$PASS';"
docker exec postgres_db psql -U "$PGSUPER" -c "CREATE DATABASE vantriq OWNER vantriq;"
unset PASS NET PGSUPER
```

**You should see:** the superuser name, the network name, then `CREATE ROLE` and
`CREATE DATABASE`.

Two things this gets right that a naive version does not:

- **The superuser is probably not `postgres`.** On this stack it is `n8n`,
  because n8n created the container. Hardcoding `-U postgres` fails with
  `role "postgres" does not exist`, so the name is read from the container.
- **Never `source` the .env file into your shell.** Docker Compose gives a
  variable already set in your shell precedence over the `.env` file. Sourcing
  `.env` and then regenerating the password leaves the shell holding the old
  value, and Compose hands the container a password the database no longer
  accepts — a `password authentication failed for user "vantriq"` that looks
  inexplicable because the file on disk is correct. The `unset` lines above
  prevent it.

If `DOCKER_NET` prints blank, stop — the rest will not work.

## Step 8 — Write the startup file

Again, paste the **whole block** including the final `EOF`:

```bash
cat > /root/crm-stack/docker-compose.yml <<'EOF'
services:
  crm_app:
    build: ./vantriq-backend
    container_name: crm_app
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://vantriq:${CRM_DB_PASSWORD}@postgres_db:5432/vantriq
      DATABASE_SSL: "false"
      PORT: "8080"
      CORS_ORIGIN: https://crm.vantriqai.com,https://portal.vantriqai.com
    networks:
      - shared

networks:
  shared:
    external: true
    name: ${DOCKER_NET}
EOF
echo "compose file written"
```

`DATABASE_SSL: "false"` is the single most important line. Your CRM was written
for a cloud database that demands an encrypted connection; the one on your own
server doesn't use encryption. Leave this out and it fails — and it defaults to
"on" if you don't say otherwise.

## Step 9 — Build and start it

```bash
cd /root/crm-stack && docker compose up -d --build
```

First run takes 1–3 minutes (it downloads Node.js and your app's libraries).
Lots of text scrolls past — normal.

**You should see:** it finishing with something like `Container crm_app Started`.

Check it's alive:

```bash
docker logs crm_app
```

**You should see:** `Vantriq CRM API listening on port 8080`

If you see anything else, copy it and send it to me.

## Step 10 — Create the tables

The database exists but is empty. This builds the structure and loads your six
pricing packages:

```bash
docker exec crm_app npm run migrate -- --seed
```

**You should see:** `Schema applied.`, `Seed data applied.`, `Done.`

## Step 11 — Create your login keys

```bash
docker exec crm_app npm run create-key -- "Frontend admin key" admin
docker exec crm_app npm run create-key -- "n8n usage webhook" webhook
```

Each prints a key starting with `vq_`. **Copy both somewhere safe right now** —
they are shown once and cannot be recovered.

- the **admin** key logs you into the CRM
- the **webhook** key is only for n8n

Don't paste them into a chat (including this one). If you already have, make a
new one and revoke the old.

## Step 12 — Point the web address at it

Open <http://76.13.193.8:81> — this is Nginx Proxy Manager, the traffic
director that decides which web address goes to which app.

Log in, go to **Hosts → Proxy Hosts**, and find `crm.vantriqai.com` (it exists
already, from the Twenty attempt). Click the **⋮** menu → **Edit**, then change:

- **Forward Hostname / IP:** `crm_app`
- **Forward Port:** `8080`  *(it currently says 3000 — Twenty's port)*
- **Websockets Support:** on

Click **Save**.

## Step 13 — Check it worked

```bash
curl -sS https://crm.vantriqai.com/api/health
```

**You should see:** `{"ok":true,"time":"..."}`

Now open <https://crm.vantriqai.com> in your browser. You'll get a **Connect**
screen. Enter:

- **API base URL:** `https://crm.vantriqai.com`
- **Admin API key:** your `vq_...` admin key from Step 11

You should land on the dashboard with six packages and no clients. **That's it —
you're live.**

> **Important:** the health check in Step 13 passing does *not* prove the
> database is connected — that check doesn't look at the database at all. The
> real proof is the dashboard loading your six packages in the browser.

To prove the database from the terminal, swap in your admin key:

```bash
curl -sS -H "x-api-key: vq_YOUR_ADMIN_KEY" https://crm.vantriqai.com/api/products
```

**You should see:** a long line of data starting `[{"id":"...","name":"Starter"`.
That is your seeded package list coming out of the database — at that point
everything works. (The header is `x-api-key`, not the more common
`Authorization: Bearer`.) If this errors but the page loads, run
`docker logs crm_app` and send me the output.

---

## If something goes wrong

Run `docker logs crm_app` first — the answer is nearly always in there.

| What you see | What it means | Fix |
|---|---|---|
| `/run/postgresql/.s.PGSQL.5432` | It can't find the database and gave up | Step 8's `DATABASE_URL` didn't apply — re-run Steps 8 and 9 |
| `no encryption` / SSL error | Encryption mismatch | `DATABASE_SSL` isn't `"false"` — check Step 8 |
| `ENOTFOUND postgres_db` | Can't see the database container | `DOCKER_NET` in Step 6 was wrong or blank |
| `password authentication failed` | The container and database disagree on the password, usually because a stale `CRM_DB_PASSWORD` in your shell overrode `.env` | Re-run the Step 6 & 7 block, but with `ALTER USER` instead of `CREATE USER`, then `docker compose up -d --force-recreate`. |
| `database "vantriq" does not exist` | Step 7 was skipped | Run Step 7 |
| Still 502 in the browser | Traffic director is misconfigured | Step 12 — Forward Port must be `8080`, hostname must be `crm_app` |

**One rule: never run `docker compose down -v`.** The `-v` erases stored data
and would delete your n8n history along with everything else. Plain
`docker compose up -d --build` is always safe.

## Afterwards

- **Restart the CRM:** `cd /root/crm-stack && docker compose restart`
- **See what's running:** `docker ps`
- **Update after code changes:** `cd /root/crm-stack && docker compose up -d --build`

Your old setup file still has the Twenty CRM entry in it. It's harmless while
things are running, but if you ever run `docker compose up -d` inside
`/root/app-stack`, Twenty will try to come back and clash with your real CRM.
Ask me to clean that up when convenient.

`portal.vantriqai.com` can also point at `crm_app` port `8080` — the same app
serves the customer portal and the sales-rep pages. Currently it points at an
empty placeholder.
