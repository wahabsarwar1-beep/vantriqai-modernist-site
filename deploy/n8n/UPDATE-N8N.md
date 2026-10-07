# Updating n8n on the Hostinger VPS

n8n runs as the `n8n_app` container in the `app-stack` Docker project on
VPS `srv1959839.hstgr.cloud` (`76.13.193.8`). Hostinger's Docker Manager does
not support this OS (Ubuntu 26.04), so the update is done by hand in the
terminal. It takes about 5 minutes; n8n is offline for roughly 30 seconds.

Latest stable n8n at the time of writing: **2.42.3**.

Open a terminal: from your own PC, `ssh root@76.13.193.8` in PowerShell (recommended —
the hPanel browser terminal garbles multi-line pastes with `^[[200~`).

Last update: 2.37.10 → 2.42.3 on 2026-10-06.

---

## 1. Back up

A full VPS snapshot was taken on 2026-10-06 (hPanel → VPS → Snapshots &
Backups). Also dump the n8n database — it holds your workflows and credentials:

```bash
cd /root/app-stack
docker exec postgres_db pg_dumpall -U n8n > /root/n8n-backup-$(date +%F-%H%M).sql
ls -lh /root/n8n-backup-*.sql
```

**You should see:** a file of a few MB. If it is 0 bytes, stop and ask for help.

## 2. See what version you're on and how the image is pinned

```bash
docker exec n8n_app n8n --version
grep -n 'image:.*n8n' /root/app-stack/docker-compose.yml
```

- If the image line ends in `:latest` or has no tag → go to step 3.
- If it ends in a fixed version (e.g. `n8nio/n8n:2.30.1`) → back the file up
  and change that number to `2.42.3`:

  ```bash
  cp /root/app-stack/docker-compose.yml /root/app-stack/docker-compose.yml.bak
  nano /root/app-stack/docker-compose.yml
  ```

## 3. Pull the new version and restart n8n only

The compose service is named `n8n_app` (image `docker.n8n.io/n8nio/n8n:latest`):

```bash
cd /root/app-stack
docker compose pull n8n_app
docker compose up -d n8n_app
```

**Do not run `docker compose down -v`.** The `-v` deletes volumes and would
destroy the n8n database.

## 4. Check it

```bash
docker exec n8n_app n8n --version
docker logs --tail 40 n8n_app
```

**You should see:** the new version number, and a log ending in
`Editor is now accessible via: https://n8n.vantriqai.com`. Database migrations
run on first start and can add a minute.

Then in the n8n editor:

- Confirm the active workflows are still **Active**: Website Assistant,
  WhatsApp Sales Agent, Instagram + Messenger Agent, Knowledge Base,
  CRM Calendar Booking, Daily Facebook + Instagram Post, After-chat survey.
- Send one test message to the website chat and one on WhatsApp.

## 5. Clean up old images (optional)

```bash
docker image prune -f
```

---

## If something goes wrong

Roll back to the previous image: restore the compose file (if you edited it)
and pin the old version you noted in step 2:

```bash
cd /root/app-stack
cp docker-compose.yml.bak docker-compose.yml   # only if you edited it
# or set image: n8nio/n8n:<old version>
docker compose up -d n8n_app
```

If the database was migrated and the old version refuses to start, restore the
dump from step 1 or, as a last resort, restore the VPS snapshot from hPanel
(this rolls back **everything** on the server, CRM included, to the snapshot time).
