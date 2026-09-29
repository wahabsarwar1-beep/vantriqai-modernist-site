#!/usr/bin/env bash
#
# Vantriq Ops CRM — upgrade to v9.2, on the VPS, in one command.
#
#   cd /root/app-stack
#   ./upgrade-v9.sh --dry-run          # show me what you would do
#   ./upgrade-v9.sh                    # do it
#
# v9 added the five provincial tax authorities. v9.1 put our own account onto
# pay-as-you-go pricing in dollars, per model token. v9.2 records the rate
# those dollars convert into the books at, and re-skins the console, the
# customer portal and the printed invoice in VantriqAI's own colours.
#
# Nothing here changes what anybody is charged. Every jurisdiction lands at
# 0%, the dollar rate lands at 0 (which means "not set", and the financials
# then report our own AI cost unconverted rather than guessing at it), and
# what a customer is billed is untouched: customers are in rupees, and only
# our own internal account is ever in dollars.
#
# v9.14 adds customer-satisfaction surveys: four new tables and one new
# column on csat_responses, nothing changed or removed. It also stops a single
# failed query from crashing the API (the cause of intermittent 502s).
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
ZIP="${ZIP:-vantriq-backend-v9.zip}"
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

# How the running API has been holding up. A container that keeps restarting
# is exactly what a visitor sees as an intermittent 502: Nginx Proxy Manager
# has nothing to forward to while it comes back. Counts only, never log
# lines — those can carry customer data, and this output lands in a public
# GitHub Actions log. Covers the current container, i.e. since the last deploy.
if [ "$(docker inspect -f '{{.State.Running}}' "$APP_CONTAINER" 2>/dev/null)" = "true" ]; then
  RESTARTS=$(docker inspect -f '{{.RestartCount}}' "$APP_CONTAINER" 2>/dev/null || echo '?')
  CREATED=$(docker inspect -f '{{.Created}}' "$APP_CONTAINER" 2>/dev/null | cut -c1-16 || echo '?')
  BOOTS=$(docker logs "$APP_CONTAINER" 2>&1 | grep -c 'Vantriq CRM API listening' || true)
  CRASHES=$(docker logs "$APP_CONTAINER" 2>&1 | grep -cE '^Node\.js v[0-9]+' || true)
  REJECTS=$(docker logs "$APP_CONTAINER" 2>&1 | grep -c 'Unhandled promise rejection (server kept running)' || true)
  ok "$APP_CONTAINER since ${CREATED}Z: $BOOTS start(s), $CRASHES crash(es), Docker restarts $RESTARTS; $REJECTS stray rejection(s) caught"
  if [ "${CRASHES:-0}" != "0" ]; then
    warn "each crash above was a few seconds of 502 Bad Gateway for everyone signed in"
  fi
fi

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

# Where the new source has to land.
#
# Not "next to this script". The build happens in $COMPOSE_DIR, so the only
# directory that matters is the build context compose gives that service —
# unpacking anywhere else rebuilds the OLD source and reports success, which
# is the worst outcome available here: a deploy that changes nothing and
# says it worked. `docker compose config` resolves the context to an
# absolute path, so ask it rather than assuming.
SRC_DIR=$(compose config 2>/dev/null | awk -v svc="$APP_SERVICE" '
  $0 ~ "^  " svc ":$" { inservice = 1; next }
  inservice && /^  [a-zA-Z0-9_-]+:$/ { inservice = 0 }
  inservice && $1 == "context:" { print $2; exit }
')
[ -n "$SRC_DIR" ] || die "Could not read the build context for service '$APP_SERVICE'
     from $COMPOSE_DIR. Without it there is no way to know which directory to
     unpack into, and unpacking into the wrong one would rebuild the old
     source and call it a success."
[ -d "$SRC_DIR" ] || die "Build context '$SRC_DIR' for '$APP_SERVICE' does not exist."
ok "source goes to $SRC_DIR (the build context for '$APP_SERVICE')"
# Deliberately does not name a database container: which one serves the CRM
# is not known until the discovery below. Announcing a guess here is what made
# the earlier version look like it had checked something it had not.
ok "stack at $STACK_DIR"

[ -f "$ZIP" ] || die "Cannot find $ZIP. Copy it up first:
     scp deploy/crm/vantriq-backend-v9.zip root@<vps>:$STACK_DIR/"
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
BACKUP="backups/pre-v9-$STAMP.sql"
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
bold "3. Unpacking the new build"
BACKUP_SRC="$SRC_DIR.bak-$STAMP"
if [ -d "$SRC_DIR" ]; then
  run cp -a "$SRC_DIR" "$BACKUP_SRC"
  ok "previous source kept at $BACKUP_SRC"
fi
# $ZIP is relative to STACK_DIR, where scp put it; $SRC_DIR is absolute.
run unzip -oq "$PWD/$ZIP" -d "$SRC_DIR"
# A Dockerfile living beside the compose file rather than in the zip.
if [ -f "$COMPOSE_DIR/Dockerfile" ] && [ ! -f "$SRC_DIR/Dockerfile" ]; then
  run cp "$COMPOSE_DIR/Dockerfile" "$COMPOSE_DIR/.dockerignore" "$SRC_DIR/" 2>/dev/null || true
fi
[ "$DRY" = 1 ] || [ -f "$SRC_DIR/package.json" ] || die "Unpack did not produce $SRC_DIR/package.json."
[ "$DRY" = 1 ] || ok "source in place ($(grep -c 'create table' "$SRC_DIR/db/schema.sql") tables in schema.sql)"

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

bold "6b. The protected owner account"
echo "  Deliberately NOT run automatically here. seed-owner prints a real password"
echo "  to stdout on first creation, and this script's whole output is captured into"
echo "  a GitHub Actions log — exactly the kind of place a credential must never sit."
echo "  Run it BY HAND, once, over your own SSH session, the same way create-user"
echo "  already has to be:"
echo "    ssh you@your-server"
echo "    docker exec -it $APP_CONTAINER npm run seed-owner"
echo "  Safe to run on every install regardless — idempotent, and a no-op once the"
echo "  owner account already exists. Step 7 below only checks that it does."

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
  # Whether dunning is on is a decision, not a health check. Asserting it is
  # off was right for a first install and wrong forever after: the moment you
  # switch reminders on deliberately, every later deploy fails on it. Report
  # the state so it is visible in the log; do not fail the deploy over it.
  DUNNING=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
    -c "select dunning_enabled from settings where id=1" 2>/dev/null || echo '?')
  if [ "$DUNNING" = "t" ]; then
    ok "dunning is ON — payment reminders will be emailed on schedule"
  else
    ok "dunning is off — no reminders will be emailed"
  fi
  chk "v9.3 contracts table" 1 \
    "select count(*) from information_schema.tables where table_name='contracts'"
  chk "contracts carry the identity they were signed under" 4 \
    "select count(*) from information_schema.columns where table_name='contracts' and column_name in ('client_ntn','client_strn','client_legal_name','client_address')"
  chk "contract numbers have their own sequence" 1 \
    "select count(*) from information_schema.sequences where sequence_name='contract_number_seq'"
  chk "v9.4 customer documents and identity log" 2 \
    "select count(*) from information_schema.tables where table_name in ('client_documents','client_identity_changes')"
  chk "the registered name is stamped on invoices" 1 \
    "select count(*) from information_schema.columns where table_name='invoices' and column_name='client_legal_name'"
  chk "every existing invoice carries the name it was raised under" 0 \
    "select count(*) from invoices where client_legal_name is null"
  chk "v9.5 archive tables" 2 \
    "select count(*) from information_schema.tables where table_name in ('archive_runs','archived_month_totals')"
  # The carry-forward columns ARE the guarantee that purging does not restate
  # the books. If one is ever missing, the balance sheet stops balancing the
  # first time somebody archives, and nothing else would catch it.
  chk "the carry-forward keeps every figure the books derive" 8 \
    "select count(*) from information_schema.columns where table_name='archived_month_totals' and column_name in ('revenue','billed_net','gst_charged','ait_withheld','receipts','written_off','credited','internal_cost')"
  chk "v9.7 proposal fields on quotes" 4 \
    "select count(*) from information_schema.columns where table_name='quotes' and column_name in ('cover_letter','selected_product_ids','show_all_packages','recommended_product_id')"
  chk "v9 tax jurisdictions seeded (ICT, PRA, SRB, KPRA, BRA, EXPORT)" 6 \
    "select count(*) from tax_jurisdictions"
  chk "the five authorities and the export case are all there" 6 \
    "select count(*) from tax_jurisdictions where code in ('ICT','PRA','SRB','KPRA','BRA','EXPORT')"
  chk "v9.1 currency columns" 2 \
    "select count(*) from information_schema.columns where table_name in ('clients','invoices') and column_name='currency'"
  chk "v9.2 conversion columns on invoices" 2 \
    "select count(*) from information_schema.columns where table_name='invoices' and column_name in ('fx_rate','base_amount')"
  chk "existing rupee invoices converted 1:1, none left unstamped" 0 \
    "select count(*) from invoices where fx_rate is null and coalesce(currency,'PKR')='PKR'"
  chk "our own account bills in dollars" USD \
    "select coalesce(currency,'—') from clients where is_internal limit 1"
  chk "model rate cards priced per million tokens" 2 \
    "select count(*) from usage_rates r join clients c on c.id=r.client_id
      where c.is_internal and r.metric in ('input_token','output_token')
        and r.unit_size = 1000000 and r.effective_to is null"
  chk "v9.11 owner-account columns" 4 \
    "select count(*) from information_schema.columns where table_name='internal_users'
      and column_name in ('is_owner','totp_secret','totp_enabled','must_setup_totp')"
  chk "the database itself refuses a second owner (unique index present)" 1 \
    "select count(*) from pg_indexes where indexname='idx_internal_users_one_owner'"
  chk "v9.13 satisfaction table and handoff flag" 2 \
    "select (select count(*) from information_schema.tables where table_name='csat_responses')
          + (select count(*) from information_schema.columns where table_name='usage_events' and column_name='handoff')"
  chk "v9.14 survey tables (surveys, responses, invites, views)" 4 \
    "select count(*) from information_schema.tables where table_name in ('surveys','survey_responses','survey_invites','survey_views')"
  chk "survey answers feed the satisfaction dashboards (csat link column)" 1 \
    "select count(*) from information_schema.columns where table_name='csat_responses' and column_name='survey_response_id'"
  chk "v9.15 surveys are switched on per client (clients columns)" 3 \
    "select count(*) from information_schema.columns where table_name='clients' and column_name in ('surveys_enabled','surveys_enabled_at','surveys_enabled_by')"
  # Who has the add-on. A count only: this log is public, client names are not.
  SURVEY_CLIENTS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -F ' ' \
    -c "select count(*) filter (where surveys_enabled), count(*) filter (where not surveys_enabled and exists (select 1 from surveys s where s.client_id = clients.id)) from clients" 2>/dev/null || echo '? ?')
  read -r SURVEYS_ON SURVEYS_PAUSED <<< "$SURVEY_CLIENTS"
  ok "surveys are switched on for $SURVEYS_ON client(s) — an admin switches them on in CRM → Clients → the client"
  if [ "$SURVEYS_PAUSED" != "0" ]; then
    warn "$SURVEYS_PAUSED client(s) have surveys but are switched off, so their surveys are paused — switch them on in CRM → Clients if they should run"
  fi
  chk "our own surveys are made only once (settings flags)" 2 \
    "select count(*) from information_schema.columns where table_name='settings' and column_name in ('own_survey_at','own_chat_survey_at')"
  # The survey app itself, from inside the container: a made-up address must
  # come back as the survey page's own "not found" (404 with the page), and
  # the staff survey API must be mounted behind sign-in (401), not missing.
  if docker exec "$APP_CONTAINER" node -e "fetch('http://127.0.0.1:8080/s/vqs-deploy-check-000').then(r=>r.text().then(t=>process.exit(r.status===404&&t.includes('\"state\":\"not_found\"')?0:1))).catch(()=>process.exit(1))" 2>/dev/null; then
    ok "the survey app answers at /s/<address>"
  else
    warn "the survey app did not answer at /s/<address>"; FAILED=1
  fi
  if docker exec "$APP_CONTAINER" node -e "fetch('http://127.0.0.1:8080/api/surveys/templates').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    ok "the survey API is mounted behind sign-in"
  else
    warn "the survey API is not answering as expected"; FAILED=1
  fi
  # End to end on this install: a temporary survey on our own account is
  # answered through the public endpoint, seen in its results and in the
  # Analytics dashboards, then deleted — nothing is left behind or emailed.
  echo "    survey end-to-end check:"
  if docker exec "$APP_CONTAINER" npm run -s survey-smoke; then
    ok "surveys work end to end (the check survey was created, answered and deleted)"
  else
    warn "the survey end-to-end check failed — lines above"; FAILED=1
  fi
  chk "v9.17 customers: the contacts table, and gender/city/age on survey answers" 4 \
    "select (select count(*) from information_schema.tables where table_name='contacts')
          + (select count(*) from information_schema.columns where table_name='survey_responses' and column_name in ('gender','city','age_band'))"
  chk "v9.19 template library: each client's industry (clients.industry)" 1 \
    "select count(*) from information_schema.columns where table_name='clients' and column_name='industry'"
  # Every template in the library must open in its preview (the survey app,
  # as a respondent sees it — never recorded), from inside the container.
  if docker exec "$APP_CONTAINER" node -e "const T=require('/app/src/utils/surveyTemplates').templateSummaries();Promise.all(T.map(t=>fetch('http://127.0.0.1:8080/s/_template/'+t.key).then(r=>r.status))).then(s=>{const bad=s.filter(x=>x!==200).length;console.log('    '+T.length+' templates, '+(T.length-bad)+' open in preview');process.exit(bad||T.length<28?1:0)}).catch(e=>{console.error('    '+e.message);process.exit(1)})"; then
    ok "the survey template library: every industry's template previews"
  else
    warn "a survey template did not open in preview — lines above"; FAILED=1
  fi
  INDUSTRIES=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
    -c "select count(*) from clients where industry <> ''" 2>/dev/null || echo '?')
  ok "clients with their industry set: $INDUSTRIES (their templates come first in Echo; set it on the client's page)"
  # The Excel workbooks — Pulse, Echo and the customer directory — are built
  # from this install's real data (read-only). Only whether each built is
  # printed: they hold customers' numbers and this log is public.
  if docker exec "$APP_CONTAINER" node -e "require('dotenv').config();const R=require('/app/src/utils/analyticsReport');Promise.all([R.pulseReport(null,{grain:'week'}),R.echoReport(null,{grain:'week'}),R.contactsWorkbook(null)]).then(rs=>process.exit(rs.every(r=>r.buffer.slice(0,2).toString()==='PK'&&r.buffer.length>5000)?0:1)).catch(e=>{console.error('    '+e.message);process.exit(1)})"; then
    ok "the Pulse, Echo and customer-directory workbooks build from this install's data"
  else
    warn "a report workbook did not build — lines above"; FAILED=1
  fi
  CUSTOMERS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
    -c "select count(*) from contacts" 2>/dev/null || echo '?')
  ok "customer profiles on file: $CUSTOMERS (they fill in as agents pass names and customers answer surveys)"
  # Whether an unhappy answer is actually emailed to anyone. Reported, never
  # failed on — and this log is public, so it says yes or no, nothing more.
  MAIL_SET=$(docker exec "$APP_CONTAINER" node -e "require('dotenv').config();process.stdout.write(require('/app/src/utils/mailer').mailDiagnosis().configured?'yes':'no')" 2>/dev/null || echo '?')
  if [ "$MAIL_SET" = "yes" ]; then
    ok "email is set up — unhappy survey answers are emailed the moment they arrive"
  else
    warn "email is not set up — unhappy answers still open a follow-up in Surveys, but nobody is emailed (set HOSTINGER_MAIL_TOKEN and HOSTINGER_MAILBOX_ID on $APP_CONTAINER)"
  fi
  # Our own live surveys (made once by seed-internal above), so there is an
  # address to open straight after a deploy, and the after-chat one the
  # WhatsApp flow in n8n sends. Nothing to report once one has been paused or
  # deleted — that is a choice, not a fault.
  OWN_SURVEYS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -F ' ' \
    -c "select s.slug, s.title from surveys s join clients c on c.id = s.client_id where c.is_internal and s.status = 'live' order by s.created_at limit 5" 2>/dev/null || true)
  if [ -n "$OWN_SURVEYS" ]; then
    SURVEY_BASE=$(docker exec "$APP_CONTAINER" node -e "require('dotenv').config();process.stdout.write((process.env.SURVEY_BASE_URL||process.env.PORTAL_URL||'https://portal.vantriqai.com').replace(/\/+$/,''))" 2>/dev/null || echo 'https://portal.vantriqai.com')
    while read -r OWN_SLUG OWN_TITLE; do
      if [ -n "$OWN_SLUG" ]; then ok "our own survey is live: $SURVEY_BASE/s/$OWN_SLUG ($OWN_TITLE)"; fi
    done <<< "$OWN_SURVEYS"
  fi
  # Not a chk(): creating the owner account is a deliberate, one-time manual
  # step (see 6b above) precisely so its password never touches this log.
  # A fresh install legitimately has none yet — that must never fail a deploy.
  OWNER_COUNT=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At \
    -c "select count(*) from internal_users where is_owner" 2>/dev/null || echo '?')
  if [ "$OWNER_COUNT" = "1" ]; then
    ok "a protected owner account exists"
  else
    warn "no protected owner account yet — run 'docker exec -it $APP_CONTAINER npm run seed-owner' by hand, over SSH, not through this pipeline"
  fi

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
# Read the version off the container that is actually running, so this line
# cannot go stale the way a hard-coded "v9.2" did. Computed HERE, because the
# heredoc below is quoted — deliberately, so the $ and backticks in the notes
# survive — and a command substitution inside it would print verbatim.
if [ "$DRY" = 1 ]; then
  RUNNING_VERSION="(unchanged — dry run)"
else
  RUNNING_VERSION="v$(docker exec "$APP_CONTAINER" node -p "require('/app/package.json').version" 2>/dev/null || echo '?')"
fi
echo "  The CRM is on ${RUNNING_VERSION}."
cat <<'NEXT'
  Nothing is charged differently: every jurisdiction is
  at 0%, and the dollar rate is unset until you enter one.

  Next, in this order:

  1. Settings → Tax & invoicing → enter the sales tax rate and your
     registration number for each authority you sell under (ICT, PRA, SRB,
     KPRA, BRA). At 0% every invoice you raise is missing its tax.

  2. Settings → Tax & invoicing → US dollar rate (PKR per USD).
     This is the only place dollars meet rupees. The rate is stamped on each
     internal invoice as it is raised, so changing it later never restates a
     month you have already reported and settled. Leave it at 0 and the
     financials show our own AI cost as dollars, unconverted, rather than
     applying a rate nobody chose.

  3. Settings → Tax & invoicing → "Our own invoice goes to".
     Defaults to support@vantriqai.com, the one mailbox on the Hostinger
     account. If you point it elsewhere, create that mailbox in hPanel
     first: an address with nothing behind it bounces rather than failing
     loudly, so the invoice looks sent and never arrives.

  4. Set HOSTINGER_MAIL_TOKEN on crm_app if it is not set, or invoice emails
     log as skipped rather than sending.

  5. Billing Automation → Monthly run → "Show me what it would do".
     Our own account should appear priced in USD, per token, at what the
     month actually used. Read every line before you press the real one.

  6. Surveys (v9.14). Open "our own survey" (its address is above) on a
     phone, answer it, and watch the answer arrive in CRM → Surveys.
     Surveys are an add-on (v9.15): for a customer who has signed up, an
     admin switches them on in CRM → Clients → the client → Customer-
     satisfaction surveys. Then CRM → Surveys → New survey, or they do it
     from their own portal. Pick an industry template; it is live at once at
     https://portal.vantriqai.com/s/<address>, with a QR poster to print.
     After every WhatsApp chat: the "VantriqAI - After-chat survey
     (WhatsApp)" workflow in n8n sends the after-chat survey an hour after a
     conversation goes quiet — see "After every WhatsApp conversation" in
     deploy/crm/SURVEYS.md.

  7. Reports (v9.17). Pulse → "Download Pulse report (Excel)": every
     figure, each contact (new and returning, who and where), conversation
     and transcript. Echo → "Echo report (Excel)": satisfaction, NPS, every
     survey and answer, who answered (gender, age, city), follow-ups.
     Customers → "All customers (Excel)": everyone ever, every detail.
     Clients have the same three in their portal, for their own customers.

  8. Customers (v9.17). CRM → Customers, and a Customers tab in every
     client's portal: each customer's profile, every conversation and what
     was said, their survey answers, tags and notes. Names arrive with the
     WhatsApp agent's usage calls (contact_name); cities and more through
     POST /api/webhooks/contact or a survey's About-you questions.

  9. Survey templates (v9.19). Echo → New survey: 28 ready-made surveys on
     eight shelves, in English and Urdu, each with a phone preview. Set a
     client's industry on their page (CRM → Clients → the client → Vantriq
     Echo): their templates come first, here and in their portal, and
     switching Echo on can create their first survey from it, live.
NEXT
printf '\n'
