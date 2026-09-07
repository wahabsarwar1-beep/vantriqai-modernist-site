# Going live — the complete run

Takes the CRM from where it is now (original portal, API-key sign-in) to the
current build: employee logins with 2FA, customer portal logins, locked
packages, one-way pipeline, and the customer activity log.

Everything below runs in your SSH window (`ssh root@76.13.193.8`) except
step 2, which is a drag-and-drop, and steps 8 and 9, which are in a browser.

Roughly 25 minutes.

---

## 1. Back up the database

Do this before anything else.

```bash
docker exec postgres_db pg_dump -U n8n vantriq > /root/vantriq-backup-$(date +%F-%H%M).sql
ls -lh /root/vantriq-backup-*.sql
```

**Expect:** a file of tens of KB or more. If it is 0 bytes, stop — something
is wrong and you do not want to upgrade without a good backup.

## 2. Upload the new code

In **WinSCP**: left panel = your PC, right panel = the server.

- Right panel path box: `/root/crm-stack`
- Drag **`vantriq-backend-v3.zip`** from left to right

Then confirm it arrived:

```bash
ls -lh /root/crm-stack/vantriq-backend-v3.zip
```

## 3. Add the new settings

```bash
cd /root/crm-stack
cat >> .env <<'EOF'
HOSTINGER_MAIL_TOKEN=f8ed2ccb62b5650e4980e965db3b677377cfa0503b7c7483b707d718784d92b7
HOSTINGER_MAILBOX_ID=AC639077da6944831097970eb520d3
MAIL_FROM=support@vantriqai.com
COMPANY_EMAIL_DOMAIN=vantriqai.com
ALLOW_API_KEY_LOGIN=true
EOF
echo "settings added"
```

## 4. Check the mail token works

```bash
curl -s -o /dev/null -w 'token check: %{http_code}\n' \
  -H "Authorization: Bearer $(grep -oP 'HOSTINGER_MAIL_TOKEN=\K.*' /root/crm-stack/.env)" \
  https://api.mail.hostinger.com/api/v1/me
```

**Expect `200`.** If you get `401`, the token is wrong or revoked — generate a
new one in hPanel (Emails → API tokens), replace the value in `.env`, and try
again. **Do not continue past a 401**: without working mail nobody can sign in.

## 5. Pass the settings to the container

Paste the whole block including the final `EOF`:

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
      HOSTINGER_MAIL_TOKEN: ${HOSTINGER_MAIL_TOKEN}
      HOSTINGER_MAILBOX_ID: ${HOSTINGER_MAILBOX_ID}
      MAIL_FROM: ${MAIL_FROM}
      COMPANY_EMAIL_DOMAIN: ${COMPANY_EMAIL_DOMAIN}
      ALLOW_API_KEY_LOGIN: ${ALLOW_API_KEY_LOGIN}
    networks:
      - shared

networks:
  shared:
    external: true
    name: ${DOCKER_NET}
EOF
echo "compose updated"
```

## 6. Deploy

```bash
cd /root/crm-stack
unzip -o vantriq-backend-v3.zip
docker compose up -d --build
```

The zip contains a top-level `vantriq-backend/` folder, so this lands the code
in `/root/crm-stack/vantriq-backend/` — which is the build context named in
docker-compose.yml. If you ever see `unzip` listing files as `src/...` rather
than `vantriq-backend/src/...`, stop: the code is going to the wrong place and
the build will silently reuse the old version. Extract with
`-d vantriq-backend/` instead.

Confirm the new code really is in the build context before rebuilding:

```bash
grep -c "is_standard" /root/crm-stack/vantriq-backend/db/schema.sql   # expect > 0
```

Takes a minute or two. **Expect** it to end with `Container crm_app Started`.

Then check it came up:

```bash
docker logs crm_app --tail 5
```

**Expect:** `Vantriq CRM API listening on port 8080`

## 7. Update the database

```bash
docker exec crm_app npm run migrate
```

**Expect:** `Applying schema.sql ...`, `Schema applied.`, `Done.`

No `--seed` this time — your packages and clients are already there. The
migration only adds new columns and tables; nothing existing is changed.

## 8. Create your login

```bash
docker exec crm_app npm run create-user -- "wahab@vantriqai.com" "Wahab Sarwar" admin
```

**Copy the password it prints.** It is shown once and cannot be recovered —
though you can always run this again for a different address, or reset it later
from inside the CRM.

## 9. Sign in

Open **https://crm.vantriqai.com** and press **Ctrl+Shift+R** (hard refresh, so
you get the new page rather than the old one from your browser's cache).

1. Enter your email and the password from step 8 → **Continue**
2. Check `wahab@vantriqai.com` for a 6-digit code
3. Enter it → **Verify and sign in**

You should land on the dashboard, with your name and "Admin" at the bottom of
the sidebar.

**If the code does not arrive:** check the junk folder, then:

```bash
docker logs crm_app | grep -i "OTP send failed"
```

That line carries Hostinger's own error message. The sign-in deliberately fails
rather than letting you in without the code.

## 10. Point portal.vantriqai.com at the portal

Right now that address serves an empty placeholder. In **Nginx Proxy Manager**
(`http://76.13.193.8:81`) → **Hosts → Proxy Hosts** → `portal.vantriqai.com` →
**⋮ → Edit**:

| Field | Set to |
|---|---|
| Forward Hostname / IP | `crm_app` |
| Forward Port | `8080` |
| Websockets Support | on |

Save. Customers can then sign in at **https://portal.vantriqai.com/portal.html**

## 11. Give each client a portal login

Old portal links stopped working the moment step 6 completed — that is the
point of the change. For every client who needs access:

1. CRM → **Clients** → click the client → **Create portal login**
2. Copy the username and password (shown once)
3. Send them the sign-in link, username and password — ideally the password by
   a different channel from the link

---

## Checks worth running afterwards

```bash
# the API is healthy
curl -s https://crm.vantriqai.com/api/health

# the new code really is being served
curl -s https://crm.vantriqai.com/ | grep -c "openModal || openPanel"   # expect 1

# n8n's usage webhook still authenticates (404 = reached the app, no such client)
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://crm.vantriqai.com/api/webhooks/usage \
  -H "Content-Type: application/json" -H "x-api-key: vq_YOUR_WEBHOOK_KEY" \
  -d '{"session_id":"t","external_ref":"nobody"}'
```

## After it is all working

- **Rotate the mail token.** It has been shared in a chat. hPanel → Emails →
  API tokens → new token → replace line 1 of `.env` → `docker compose up -d --build`.
- **Close the emergency door.** Once every employee has an account and you have
  seen codes arrive reliably, set `ALLOW_API_KEY_LOGIN=false` in `.env` and
  rebuild. The admin API key then stops opening the CRM.
- **Rotate the WhatsApp token.** Still sitting in plaintext in three n8n nodes.
- **Reboot when convenient.** Ubuntu has been asking since day one. Containers
  restart by themselves.

## If something goes wrong

```bash
docker logs crm_app --tail 50
```

| What you see | Cause | Fix |
|---|---|---|
| `password authentication failed` | container and database disagree | see the v2 notes — `ALTER USER` then `--force-recreate` |
| `Email is not configured` | mail vars missing | step 3 or step 5 not applied; re-run and rebuild |
| `502` in the browser | app not up | `docker logs crm_app`; usually a migration not yet run |
| Old screen still showing | browser cache | Ctrl+Shift+R, or an incognito window |

**Rolling back:** the previous code is still in the folder Docker built from,
so the quickest route back is to restore the backup from step 1 and rebuild
from your earlier zip. The new columns are additive and the old code ignores
them, so a rollback does not require touching the schema.
