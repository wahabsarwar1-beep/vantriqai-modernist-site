# Deploying Vantriq Ops CRM to the Hostinger VPS

Replaces the crash-looping Twenty CRM (`twentycrm/twenty:latest`) on
`crm.vantriqai.com` with the Vantriq Ops backend, reusing the Postgres and
Nginx Proxy Manager containers already running in the `app-stack` project.

**Target:** VPS `srv1959839.hstgr.cloud` (`76.13.193.8`), stack at
`/root/app-stack/`.

## What differs from the shipped README

The project README and the Ops Documentation both assume **Supabase + Railway**.
Two things must change for a VPS deployment:

| | Docs assume | On this VPS |
|---|---|---|
| `DATABASE_SSL` | `true` (Supabase mandates TLS) | **`false`** — the local Postgres container speaks plaintext; leaving it `true` fails the handshake |
| Container image | Railway builds from source | No Dockerfile ships in the zip — one is provided here |

`DATABASE_SSL` is the trap. It defaults to `true` when unset (`src/db.js`), so
omitting it is not the same as disabling it.

---

## 1. Get the source onto the VPS

From your own machine:

```bash
scp vantriqcrmbackend_2.zip root@76.13.193.8:/root/app-stack/
```

Then on the VPS:

```bash
cd /root/app-stack
unzip vantriqcrmbackend_2.zip     # creates ./vantriq-backend/
ls vantriq-backend/package.json    # sanity check
```

Copy `Dockerfile` and `.dockerignore` from this folder into
`/root/app-stack/vantriq-backend/`.

## 2. Find your real network name

The compose fragment uses a placeholder. Get the actual value:

```bash
docker inspect postgres_db --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'
docker inspect nginx_proxy --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}'
```

Both must be on the **same** network, and `crm_app` must join it too —
otherwise Nginx Proxy Manager cannot resolve the hostname `crm_app`.

## 3. Create the CRM's database

n8n is almost certainly sharing this Postgres, so give the CRM its own database
rather than reusing an existing one:

```bash
docker exec -it postgres_db psql -U postgres -c "CREATE DATABASE vantriq;"
docker exec -it postgres_db psql -U postgres -c "\l"   # confirm it exists
```

If you don't know the Postgres password, read it out of the running container:

```bash
docker exec postgres_db env | grep POSTGRES_PASSWORD
```

## 4. Swap the service definition

Edit `/root/app-stack/docker-compose.yml`. Back it up first:

```bash
cp /root/app-stack/docker-compose.yml /root/app-stack/docker-compose.yml.bak
```

Delete the Twenty service block and paste in the one from `crm-service.yml`,
substituting the real Postgres password and network name.

## 5. Build and start

```bash
cd /root/app-stack
docker compose up -d --build crm_app
docker compose ps
docker logs -f crm_app
```

Expect `Vantriq CRM API listening on port 8080`. If it exits instead, the log
line names the cause — see Troubleshooting.

**Do not run `docker compose down -v`.** The `-v` deletes volumes and would
destroy the n8n database alongside everything else.

## 6. Build the schema

```bash
docker exec crm_app npm run migrate -- --seed
```

Creates all nine tables and loads the six-tier package ladder and starter
vendors. Safe to re-run.

## 7. Generate API keys

```bash
docker exec crm_app npm run create-key -- "Frontend admin key" admin
docker exec crm_app npm run create-key -- "n8n usage webhook" webhook
```

Each prints a `vq_...` key **once**. Store them in a password manager, not a
chat window. The admin key goes into the CRM's Connect screen; the webhook key
goes into n8n and nowhere else.

## 8. Point Nginx Proxy Manager at it

NPM's admin UI is on port 81 (`http://76.13.193.8:81`). A proxy host for
`crm.vantriqai.com` already exists from the Twenty attempt — edit it rather
than creating a second one:

- **Forward Hostname:** `crm_app`
- **Forward Port:** `8080`  ← was Twenty's `3000`
- **Websockets Support:** on
- **Block Common Exploits:** on
- **SSL tab:** Force SSL, with the existing Let's Encrypt certificate

Optionally point `portal.vantriqai.com` at the same `crm_app:8080` — the app
serves `portal.html` and `rep.html` from the same Express instance, so the
`portal_app` nginx:alpine placeholder is redundant.

## 9. Verify

```bash
# inside the container
docker exec crm_app wget -qO- http://127.0.0.1:8080/api/health

# end to end, through NPM and TLS
curl -sS https://crm.vantriqai.com/api/health
```

Both should return `{"ok":true,"time":"..."}`.

**A healthy container does not prove the database works.** `/api/health` never
touches Postgres, and `pg` opens connections lazily — verified during prep, the
app boots and reports healthy with a deliberately unreachable database. So the
container going green tells you the image and the proxy are right, nothing more.
The database is only proven by a query succeeding:

```bash
curl -sS -H "x-api-key: vq_YOUR_ADMIN_KEY" https://crm.vantriqai.com/api/products
```

The header is `x-api-key`, not `Authorization: Bearer` — see
`src/middleware/auth.js`. A Bearer token returns
`{"error":"Missing x-api-key header"}` with a 401.

That should return the six seeded packages. A 500 here with a green container
means the app is up but `DATABASE_URL` / `DATABASE_SSL` are wrong — check
`docker logs crm_app` for the Postgres error.

Then open `https://crm.vantriqai.com`, paste the admin key into the Connect
screen, and confirm the six packages load with zero clients. All three surfaces
are served by this one container — `/` (admin CRM), `/portal.html` (customer
portal) and `/rep.html` (sales rep pipeline), each returning 200 in prep testing.

---

## Troubleshooting

**`connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed`**
`DATABASE_URL` is unset or unreadable, so `pg` fell back to a local Unix
socket. This was the original Twenty failure. Check `docker exec crm_app env | grep DATABASE`.

**`no pg_hba.conf entry ... no encryption` or a TLS handshake error**
`DATABASE_SSL` is `true` against the local Postgres. Set it to `"false"` —
quoted, so YAML keeps it a string.

**`getaddrinfo ENOTFOUND postgres_db`**
`crm_app` isn't on the same Docker network as Postgres. Re-check step 2.

**NPM shows 502 but the container is healthy**
NPM can't resolve `crm_app`. Confirm `nginx_proxy` shares the network, and that
Forward Hostname is the container name — not `localhost`, not an IP.

**`database "vantriq" does not exist`**
Step 3 was skipped.

## Security follow-ups

- `CORS_ORIGIN` is pinned to the two real domains rather than `*`.
- The API is deliberately not published to the host — no `ports:` mapping — so
  it is reachable only through NPM over TLS.
- Rotate the admin key if it has ever been pasted into a chat or ticket:
  `update api_keys set revoked = true where name = '...';`

## Notes on the source zip

Verified during preparation:

- `npm ci --omit=dev` installs cleanly — `package-lock.json` is in sync with
  `package.json`, so the Docker build's dependency layer will not fail.
- `npm audit` reports 5 moderate-severity advisories in the dependency tree.
  None block deployment; worth clearing with `npm audit fix` at some point.
- The zip contains no `Dockerfile`, no `.dockerignore` and no `docker-compose.yml`
  — all three are supplied in this folder.
