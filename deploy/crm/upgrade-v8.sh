#!/usr/bin/env bash
#
# Vantriq Ops CRM — upgrade to v8, on the VPS, in one command.
#
#   cd /root/app-stack
#   ./upgrade-v8.sh --dry-run          # show me what you would do
#   ./upgrade-v8.sh                    # do it
#
# Everything v8 adds is off or zero by default: dunning does not send, the
# billing run is not scheduled, GST and AIT are 0%, opening cash is 0. So this
# changes nothing about what gets charged or emailed until you switch each one
# on afterwards. What it DOES change is that usage starts being recorded.
#
# It stops at the first failure and never drops anything. The one thing that
# touches existing rows is widening the invoice-status constraint and
# backfilling net_payable, both additive — and there is a verified backup on
# disk before either happens.

set -euo pipefail

STACK_DIR="${STACK_DIR:-/root/app-stack}"
APP_CONTAINER="${APP_CONTAINER:-crm_app}"
# These are NOT guesses to fall back on — the database is discovered from the
# app's own DATABASE_URL below. They exist only so an operator who knows
# better can override that discovery, and this flag records that they did.
DB_OVERRIDDEN=""
[ -n "${DB_CONTAINER:-}${DB_NAME:-}${DB_USER:-}" ] && DB_OVERRIDDEN=1
DB_CONTAINER="${DB_CONTAINER:-postgres_db}"
DB_NAME="${DB_NAME:-vantriq}"
DB_USER="${DB_USER:-postgres}"
ZIP="${ZIP:-vantriq-backend-v8.zip}"
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY=1 ;;
    *.zip)     ZIP="$arg" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

bold()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()    { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()   { printf '\n  \033[31m✗ %s\033[0m\n\n' "$*" >&2; exit 1; }
run()   { if [ "$DRY" = 1 ]; then printf '  would run: %s\n' "$*"; else "$@"; fi; }

[ "$DRY" = 1 ] && bold "DRY RUN — nothing will be changed."

# ---------------------------------------------------------------- 1. checks
bold "1. Checking the stack"
cd "$STACK_DIR" 2>/dev/null || die "No $STACK_DIR. Set STACK_DIR=... if the stack lives elsewhere."
[ -f docker-compose.yml ] || die "No docker-compose.yml in $STACK_DIR."
command -v docker >/dev/null || die "docker is not on PATH."
# `docker inspect` succeeds for a container that merely EXISTS, stopped ones
# included, so it cannot answer "is it running". Ask for the state itself.
[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" = "true" ] \
  || die "Container '$DB_CONTAINER' is not running."
[ "$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null)" = "true" ] \
  || warn "Container '$APP_CONTAINER' is not running yet — it will be built."

# Which compose project owns crm_app?
#
# Not necessarily this one. On this server /root/app-stack defines
# postgres_db, n8n_app, nginx_proxy and portal_app — and no crm_app. The
# container is running all the same, so it comes from a second compose
# project in its own directory. A compose-managed container records where it
# came from, so ask it, and run compose THERE.
lbl() { docker inspect -f "{{index .Config.Labels \"$1\"}}" "$APP_CONTAINER" 2>/dev/null || true; }
APP_PROJECT_DIR=$(lbl com.docker.compose.project.working_dir)
APP_SERVICE=$(lbl com.docker.compose.service)

COMPOSE_DIR="$STACK_DIR"
if [ -n "$APP_PROJECT_DIR" ] && [ "$APP_PROJECT_DIR" != "$STACK_DIR" ]; then
  COMPOSE_DIR="$APP_PROJECT_DIR"
  ok "$APP_CONTAINER is built from $COMPOSE_DIR, not $STACK_DIR"
fi
# Every compose call for the API goes through here, so it always runs in the
# directory that actually defines the service.
compose() { ( cd "$COMPOSE_DIR" && docker compose "$@" ); }

# Trust the label only if that directory really has such a service.
if [ -n "$APP_SERVICE" ]; then
  compose config --services 2>/dev/null | grep -qx "$APP_SERVICE" || APP_SERVICE=""
fi

# No usable label: match services to the container by id instead.
if [ -z "$APP_SERVICE" ]; then
  APP_ID=$(docker inspect -f '{{.Id}}' "$APP_CONTAINER" 2>/dev/null || true)
  for svc in $(compose config --services 2>/dev/null); do
    sid=$(compose ps -aq "$svc" 2>/dev/null | head -1)
    [ -n "$sid" ] || continue
    sid=$(docker inspect -f '{{.Id}}' "$sid" 2>/dev/null || true)
    if [ -n "$sid" ] && [ "$sid" = "$APP_ID" ]; then APP_SERVICE="$svc"; break; fi
  done
fi

# Checked HERE, in the preflight, so a dry run fails on it rather than an
# apply. Two applies were spent learning that lesson.
if [ -z "$APP_SERVICE" ]; then
  echo "    $APP_CONTAINER labels:"
  for k in com.docker.compose.project com.docker.compose.service \
           com.docker.compose.project.working_dir com.docker.compose.project.config_files; do
    echo "      $k = $(lbl "$k")"
  done
  echo "    services in $COMPOSE_DIR: $(compose config --services 2>/dev/null | tr '\n' ' ')"
  die "Cannot find the compose service that builds '$APP_CONTAINER'.
     If the labels above are empty the container was not created by compose
     at all (docker run), and it must be rebuilt by hand. Otherwise re-run
     with STACK_DIR set to the directory named above."
fi
ok "API service is '$APP_SERVICE' in $COMPOSE_DIR"
# Deliberately does not name a database container: which one serves the CRM
# is not known until the discovery below. Announcing a guess here is what made
# the earlier version look like it had checked something it had not.
ok "stack at $STACK_DIR"

[ -f "$ZIP" ] || die "Cannot find $ZIP. Copy it up first:
     scp deploy/crm/vantriq-backend-v8.zip root@<vps>:$STACK_DIR/"
unzip -tq "$ZIP" >/dev/null 2>&1 || die "$ZIP is corrupt — re-copy it."
ok "$ZIP is present and intact ($(du -h "$ZIP" | cut -f1))"
echo "    sha256 $(sha256sum "$ZIP" | cut -c1-16)…"

# Finding the database
#
# This has to be exactly right, because step 2 backs up whatever it finds. A
# plausible wrong answer is worse than no answer: it produces a backup of
# somebody else's data and calls the upgrade safe.
#
# So the ONLY authority is crm_app's own DATABASE_URL. That string is the
# CRM's live connection by definition — user, database and the compose
# service that serves it. The database container's POSTGRES_* variables are
# NOT an authority: on this stack postgres_db is n8n's container and answers
# POSTGRES_DB=n8n quite truthfully, which is how a first attempt at this
# check cheerfully selected n8n's 131 tables for backup.
#
# Whatever is chosen, it must then prove it is the CRM's database.
crm_schema_ok() { # container user db -> 0 if this is the CRM's database
  local t n
  t=$(docker exec "$1" psql -U "$2" -d "$3" -Atc \
        "select to_regclass('public.clients') is not null" 2>/dev/null) || return 1
  [ "$t" = "t" ] && return 0
  # A brand-new install has no tables yet; that is legitimately the CRM's
  # database awaiting its first migration. Anything else belongs elsewhere.
  n=$(docker exec "$1" psql -U "$2" -d "$3" -Atc \
        "select count(*) from information_schema.tables where table_schema='public'" 2>/dev/null) || return 1
  [ "$n" = "0" ]
}

if [ -n "$DB_OVERRIDDEN" ]; then
  warn "using the DB_CONTAINER/DB_USER/DB_NAME passed in, not the app" \
       "connection string"
else
  url=$(docker exec "$APP_CONTAINER" printenv DATABASE_URL 2>/dev/null || true)
  [ -n "$url" ] || die "$APP_CONTAINER has no DATABASE_URL, so there is no way to
     know which database is the CRM's. Set DB_CONTAINER=... DB_USER=... DB_NAME=...
     explicitly if you know them."

  # postgresql://user:pass@host:5432/dbname?params — taken apart with shell
  # expansion rather than a regex, so a password containing a colon or an @
  # cannot break the parse.
  u=${url#*://}; u=${u%%@*}; u=${u%%:*}
  hp=${url#*://}; hp=${hp#*@}; host=${hp%%:*}; host=${host%%/*}
  d=${url%%\?*}; d=${d##*/}

  # The host is a compose service name; ask compose which container serves it.
  cid=$(docker compose ps -q "$host" 2>/dev/null | head -1)
  [ -n "$cid" ] || cid=$(docker inspect -f '{{.Id}}' "$host" 2>/dev/null || true)
  [ -n "$cid" ] || die "The CRM points at database host '$host', but no container
     of that name or compose service exists in $STACK_DIR."

  DB_CONTAINER="$cid"; DB_USER="$u"; DB_NAME="$d"
  ok "database taken from $APP_CONTAINER's DATABASE_URL — '$DB_NAME' on service '$host'"
fi

docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c 'select 1' >/dev/null 2>&1 \
  || die "Cannot reach database '$DB_NAME' as user '$DB_USER'."

crm_schema_ok "$DB_CONTAINER" "$DB_USER" "$DB_NAME" \
  || die "Database '$DB_NAME' is reachable but is NOT the CRM's — it holds tables
     but no 'clients' table. Refusing to back up or migrate somebody else's
     data. Check $APP_CONTAINER's DATABASE_URL."

BEFORE=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
  -c "select count(*) from information_schema.tables where table_schema='public'")
ok "database '$DB_NAME' reachable — $BEFORE tables today"

# ---------------------------------------------------------------- 2. backup
bold "2. Backing up first"
mkdir -p backups
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="backups/pre-v8-$STAMP.sql"
if [ "$DRY" = 1 ]; then
  echo "  would run: docker exec $DB_CONTAINER pg_dump -U $DB_USER $DB_NAME > $BACKUP"
else
  docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP" \
    || die "Backup failed — stopping before anything is changed."
  # An empty or truncated dump is worse than no dump, because it looks like one.
  [ -s "$BACKUP" ] || die "Backup file is empty — stopping."
  grep -q "PostgreSQL database dump complete" "$BACKUP" \
    || die "Backup looks truncated (no completion marker) — stopping."
  ok "backed up to $BACKUP ($(du -h "$BACKUP" | cut -f1))"
fi

# ---------------------------------------------------------------- 3. unpack
bold "3. Unpacking v8"
if [ -d vantriq-backend ]; then
  run cp -a vantriq-backend "vantriq-backend.bak-$STAMP"
  ok "previous source kept at vantriq-backend.bak-$STAMP"
fi
run unzip -oq "$ZIP" -d vantriq-backend
# The Dockerfile lives beside this script, not inside the zip.
if [ -f Dockerfile ] && [ ! -f vantriq-backend/Dockerfile ]; then
  run cp Dockerfile .dockerignore vantriq-backend/ 2>/dev/null || true
fi
[ "$DRY" = 1 ] || [ -f vantriq-backend/package.json ] || die "Unpack did not produce vantriq-backend/package.json."
[ "$DRY" = 1 ] || ok "source in place ($(grep -c 'create table' vantriq-backend/db/schema.sql) tables in schema.sql)"

# ---------------------------------------------------------------- 4. rebuild
bold "4. Rebuilding and restarting the API"
run compose build "$APP_SERVICE"
run compose up -d "$APP_SERVICE"

if [ "$DRY" = 0 ]; then
  printf '  waiting for health'
  for i in $(seq 1 45); do
    if docker exec "$APP_CONTAINER" wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
      printf '\n'; ok "API is up"; break
    fi
    printf '.'; sleep 2
    [ "$i" = 45 ] && { printf '\n'; docker logs --tail 40 "$APP_CONTAINER"; die "API did not come up. Logs above. Roll back with:
     docker compose down $APP_SERVICE
     rm -rf vantriq-backend && mv vantriq-backend.bak-$STAMP vantriq-backend
     docker compose up -d --build $APP_SERVICE"; }
  done
fi

# ---------------------------------------------------------------- 5. migrate
bold "5. Applying the schema"
run docker exec "$APP_CONTAINER" npm run migrate

bold "6. Creating VantriqAI's own account"
echo "  Meters the site chat and the WhatsApp agent as an internal customer."
echo "  Idempotent — safe if it has already been done."
run docker exec "$APP_CONTAINER" npm run seed-internal

# ---------------------------------------------------------------- 7. verify
bold "7. Verifying"
if [ "$DRY" = 1 ]; then
  echo "  would run the post-upgrade checks"
else
  FAILED=0
  chk() { # name expected sql
    local got; got=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "$3" 2>/dev/null || echo ERR)
    if [ "$got" = "$2" ]; then ok "$1"; else warn "$1 — expected $2, got $got"; FAILED=1; fi
  }
  chk "withholding tax columns on invoices" 3 \
    "select count(*) from information_schema.columns where table_name='invoices' and column_name in ('ait_rate','ait_amount','net_payable')"
  chk "v7 tables (ledger, lines, agents, remittances)" 4 \
    "select count(*) from information_schema.tables where table_name in ('payments','invoice_lines','client_agents','tax_remittances')"
  chk "v8 tables (bundles, quotes, dunning, bank)" 10 \
    "select count(*) from information_schema.tables where table_name in ('client_bundles','quotes','quote_lines','subscription_phases','usage_rates','dunning_steps','invoice_reminders','automations','automation_runs','bank_credits')"
  chk "VantriqAI's internal account exists" 1 \
    "select count(*) from clients where is_internal"
  chk "its two agents carry the live references" 2 \
    "select count(*) from client_agents where external_ref in ('vantriqai.com','923411120049')"
  chk "dunning is OFF (nothing will be emailed yet)" f \
    "select dunning_enabled from settings where id=1"

  AFTER=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
    -c "select count(*) from information_schema.tables where table_schema='public'")
  echo "    tables: $BEFORE → $AFTER"

  if [ "$FAILED" = 1 ]; then
    die "Some checks did not pass. Nothing is broken — the old source is at
     vantriq-backend.bak-$STAMP and the database backup at $BACKUP.
     Send the warnings above before changing anything else."
  fi
fi

# ---------------------------------------------------------------- done
if [ "$DRY" = 1 ]; then
  bold "Dry run complete — nothing above was done."
else
  bold "Done."
fi
cat <<'NEXT'
  The CRM is on v8 and usage is being recorded. Nothing is charged or
  emailed yet — those are switches, and they are all still off.

  Next, in this order:

  1. Send one site chat and one WhatsApp message, then open
     Agents & Automations. Both agents should show a conversation.
     If they do, the metering loop is closed.

  2. Settings → Accounting → opening cash, and Financials → your cost lines.

  3. Settings → Tax & invoicing → GST % and AIT %.
     At 0% every invoice you raise will be missing its tax.

  4. Billing Automation → Monthly run → "Show me what it would do".
     Read every line before you ever press the real one.

  5. Fix the Hostinger mail credential (Authorization: Bearer <token>)
     before switching dunning on, or reminders log as skipped.
NEXT
printf '\n'
