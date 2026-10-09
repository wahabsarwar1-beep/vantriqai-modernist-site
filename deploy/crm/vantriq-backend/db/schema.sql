-- =====================================================================
-- Vantriq AI — Ops Database Schema
-- Target: Postgres 14+ (Supabase-compatible)
-- Run this once against your Supabase / Postgres database before
-- starting the API. Safe to re-run — uses IF NOT EXISTS everywhere.
-- =====================================================================

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

-- ---------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------
create table if not exists settings (
  id int primary key default 1,
  company_name text not null default 'Vantriq AI',
  city text not null default 'Islamabad, Pakistan',
  founder text not null default 'Wahab Sarwar',
  currency text not null default 'PKR',
  utilization numeric not null default 0.70, -- assumed avg quota utilization, used in financial projections
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- API keys — scoped credentials. 'admin' = full CRM access (frontend).
-- 'webhook' = write-only usage ingestion (handed to n8n, never the
-- admin key). Keys are stored hashed; the plaintext is shown once.
-- ---------------------------------------------------------------------
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  scope text not null check (scope in ('admin','webhook')),
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- ---------------------------------------------------------------------
-- Products / packages (the six-tier ladder — fully editable)
-- ---------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_tier text default '',
  setup_fee numeric not null default 0,
  retainer numeric not null default 0,
  msgs_per_session numeric not null default 0,
  quota int not null default 0,               -- included sessions / month
  overage_rate numeric not null default 0,     -- PKR per session over quota
  delivery_cost_full numeric not null default 0, -- est. delivery cost at 100% quota use
  automation text default '',
  data_layer text default '',
  ai_model text default '',
  channels text default '',
  sort_order int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Clients (CRM record — pipeline + active accounts)
-- external_ref: the identifier n8n/webhooks use to match inbound usage
-- to this client (e.g. the client's WhatsApp Business number, or a
-- workflow ID). Must be unique so the webhook can resolve it fast.
-- ---------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text not null,
  email text default '',
  phone text default '',
  external_ref text unique,
  product_id uuid references products(id) on delete set null,
  stage text not null default 'lead'
    check (stage in ('lead','contacted','proposal','negotiation','active','lost','churned')),
  est_value numeric default 0,
  source text default '',
  notes text default '',
  join_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_stage on clients(stage);
create index if not exists idx_clients_external_ref on clients(external_ref);

-- Portal access token — a long random string that lets a client view their
-- own account (billing, usage, ledger) without a username/password. Anyone
-- holding the link has read access to that one client's data only.
alter table clients add column if not exists portal_token text unique;
create index if not exists idx_clients_portal_token on clients(portal_token);

-- ---------------------------------------------------------------------
-- Sales reps — a separate identity from api_keys. Each rep gets their own
-- key (via POST /api/reps as an admin) and can only ever see/edit leads
-- they personally created (enforced by owner_rep_id below), through a
-- five-stage sales pipeline distinct from the main client lifecycle.
-- ---------------------------------------------------------------------
create table if not exists sales_reps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text default '',
  key_hash text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Which rep sourced/owns this lead (null = house lead, not rep-sourced).
alter table clients add column if not exists owner_rep_id uuid references sales_reps(id) on delete set null;
create index if not exists idx_clients_owner_rep on clients(owner_rep_id);

-- The rep-facing five-stage sales pipeline. Deliberately separate from the
-- main `stage` column (lead/contacted/proposal/negotiation/active/lost/
-- churned), which represents Vantriq's own client lifecycle and is what
-- the admin CRM's Pipeline/Clients views use. sales_stage is only set on
-- leads a rep is actively working; it's the finer-grained view a rep sees
-- of their own deal, and reaching "closure" flips the main `stage` field
-- (via the API, not a trigger, so admins can see exactly what happened).
alter table clients add column if not exists sales_stage text
  check (sales_stage in ('qualification','needs_assessment','proposal_submission','negotiation','closure'));
alter table clients add column if not exists close_outcome text check (close_outcome in ('won','lost'));
create index if not exists idx_clients_sales_stage on clients(sales_stage);

-- ---------------------------------------------------------------------
-- Usage events — raw, one row per AI-handled turn or session close.
-- This is what n8n (or any AI-call step) posts to /api/webhooks/usage
-- in real time, right after a Claude/GPT/DeepSeek call returns.
-- ---------------------------------------------------------------------
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  session_id text not null,        -- one WhatsApp 24h conversation window = one session
  channel text default 'whatsapp', -- whatsapp | web | voice | instagram
  ai_model text default '',
  input_tokens int default 0,
  output_tokens int default 0,
  messages_count int default 1,
  occurred_at timestamptz not null default now(),
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_client_time on usage_events(client_id, occurred_at);
create index if not exists idx_usage_session on usage_events(session_id);

-- v9.33 — voice notes are metered beside tokens. A WhatsApp voice note is
-- transcribed by a speech-to-text model billed per minute of audio, which no
-- token count shows, so the turn carries the length of the audio it
-- transcribed and the model that did it. tokens_estimated is true when the
-- flow could not read the provider's real token counts and sent an estimate,
-- null when an older flow did not say.
-- Here, ahead of the view below, so the view can sum them on a fresh install.
alter table usage_events add column if not exists voice_seconds numeric not null default 0;
alter table usage_events add column if not exists stt_model text not null default '';
alter table usage_events add column if not exists tokens_estimated boolean;


-- Rolled-up monthly usage per client, derived from usage_events.
-- Used by the dashboard/billing to show "sessions used this month"
-- and to compute overage without re-scanning raw events each time.
create or replace view v_monthly_usage as
select
  client_id,
  date_trunc('month', occurred_at)::date as period_month,
  count(distinct session_id) as sessions,
  sum(messages_count) as messages,
  sum(input_tokens) as input_tokens,
  sum(output_tokens) as output_tokens,
  -- v9.33: appended, never reordered, so `create or replace` keeps working
  -- on a database that already has the earlier columns.
  round(coalesce(sum(voice_seconds), 0) / 60.0, 2) as voice_minutes
from usage_events
group by client_id, date_trunc('month', occurred_at);

-- ---------------------------------------------------------------------
-- Invoices
-- ---------------------------------------------------------------------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  type text not null check (type in ('setup_fee','retainer','overage','addon')),
  amount numeric not null default 0,
  period text default '',
  status text not null default 'pending' check (status in ('pending','paid','overdue')),
  issued_date date not null default current_date,
  overage_sessions int default 0,
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_invoices_status on invoices(status);

-- ---------------------------------------------------------------------
-- Procurement: vendors & purchase orders
-- ---------------------------------------------------------------------
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default '',
  tiers text default '',
  cost_min numeric default 0,
  cost_max numeric default 0,
  status text default 'Active',
  created_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid references vendors(id) on delete set null,
  item text not null,
  amount numeric not null default 0,
  po_date date not null default current_date,
  status text default 'Ordered' check (status in ('Ordered','Received','Cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Fixed costs / recurring expenses (contract labour, etc.)
-- ---------------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  category text default 'Other',
  amount numeric not null default 0,
  recurring boolean not null default true,
  start_date date not null default current_date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Trigger to keep updated_at fresh
-- ---------------------------------------------------------------------
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_updated on products;
create trigger trg_products_updated before update on products
  for each row execute function touch_updated_at();

drop trigger if exists trg_clients_updated on clients;
create trigger trg_clients_updated before update on clients
  for each row execute function touch_updated_at();

drop trigger if exists trg_invoices_updated on invoices;
create trigger trg_invoices_updated before update on invoices
  for each row execute function touch_updated_at();

-- =====================================================================
-- v2 — portal credentials, locked packages, stage history, subscriptions
-- Additive and idempotent: safe to re-run over an existing database.
-- =====================================================================

-- Customer portal now requires a username + password set by an admin.
-- portal_token is kept only so old links can be recognised and refused.
alter table clients add column if not exists portal_username text unique;
alter table clients add column if not exists portal_password_hash text;
alter table clients add column if not exists portal_password_set_at timestamptz;
create index if not exists idx_clients_portal_username on clients(portal_username);

-- Portal login sessions. The browser holds the token; it expires.
create table if not exists portal_sessions (
  token text primary key,
  client_id uuid not null references clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_portal_sessions_client on portal_sessions(client_id);

-- Standard packages are locked to the business model; only Enterprise+ may
-- be customised, and then only per client via the custom_* columns below.
alter table products add column if not exists is_standard boolean not null default true;
update products set is_standard = false where name = 'Enterprise+';

-- Per-client overrides. Only permitted when the client's package is the
-- non-standard (Enterprise+) tier — enforced in src/routes/clients.js.
alter table clients add column if not exists custom_setup_fee numeric;
alter table clients add column if not exists custom_retainer numeric;
alter table clients add column if not exists custom_quota int;
alter table clients add column if not exists custom_overage_rate numeric;
alter table clients add column if not exists custom_msgs_per_session numeric;
alter table clients add column if not exists custom_automation text;
alter table clients add column if not exists custom_data_layer text;
alter table clients add column if not exists custom_ai_model text;
alter table clients add column if not exists custom_channels text;

-- Every stage transition, with its mandatory comment. Append-only.
create table if not exists client_stage_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  from_stage text,
  to_stage text not null,
  comment text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_stage_history_client on client_stage_history(client_id, created_at desc);

-- Package changes requested by a customer from their portal. Nothing bills
-- until an admin approves; approval is what moves the client's product_id.
create table if not exists package_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  note text default '',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_package_requests_status on package_requests(status, created_at desc);

-- =====================================================================
-- v3 — internal employee logins: password + emailed OTP, no API key
-- =====================================================================

-- Internal staff. Email must be on the company domain (enforced in the API
-- and by the constraint below). Roles: admin sees and manages everything;
-- staff get the day-to-day CRM but not financials, procurement, settings,
-- vendors or team management.
create table if not exists internal_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'staff' check (role in ('admin','staff')),
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint company_domain check (email like '%@vantriqai.com')
);
create index if not exists idx_internal_users_email on internal_users(email);

-- A signed-in employee's session.
create table if not exists staff_sessions (
  token text primary key,
  user_id uuid not null references internal_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_staff_sessions_user on staff_sessions(user_id);

-- Second factor. A correct password creates a challenge; the emailed code
-- redeems it for a session. Codes are hashed, expire, and are attempt-limited.
create table if not exists login_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references internal_users(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_login_challenges_user on login_challenges(user_id, created_at desc);

-- =====================================================================
-- v4 — sub-clients, quota decisions, FBR-compliant invoicing,
--      manual + self-service passwords, automation-scoped keys
-- Additive and idempotent.
-- =====================================================================

-- --- Sub-clients ------------------------------------------------------
-- A sub-client is a full client in its own right: its own package, its own
-- quota, its own invoices. The parent link exists for grouping and reporting
-- only, so a group's usage can be rolled up without pooling their quotas.
alter table clients add column if not exists parent_client_id uuid references clients(id) on delete set null;
create index if not exists idx_clients_parent on clients(parent_client_id);

-- --- Tax / FBR --------------------------------------------------------
-- Client-side registration details. tax_rate null means "use the default
-- from settings"; 0 is a real rate meaning exempt.
alter table clients add column if not exists ntn text;
alter table clients add column if not exists strn text;
alter table clients add column if not exists tax_rate numeric;
alter table clients add column if not exists billing_address text;
create index if not exists idx_clients_ntn on clients(ntn);

-- Your own registration details, printed on every invoice.
alter table settings add column if not exists ntn text default '';
alter table settings add column if not exists strn text default '';
alter table settings add column if not exists address text default '';
alter table settings add column if not exists default_tax_rate numeric not null default 0;
alter table settings add column if not exists invoice_prefix text not null default 'VAI';

-- Invoice numbers must be sequential and gapless per FBR. A sequence gives
-- that atomically even with concurrent issuing.
create sequence if not exists invoice_number_seq start 1;

-- amount keeps its existing meaning: the value EXCLUDING tax. The new columns
-- carry the tax breakdown a compliant invoice has to show.
alter table invoices add column if not exists invoice_number text unique;
alter table invoices add column if not exists tax_rate numeric not null default 0;
alter table invoices add column if not exists tax_amount numeric not null default 0;
alter table invoices add column if not exists total_amount numeric;
alter table invoices add column if not exists client_ntn text;
alter table invoices add column if not exists client_strn text;
alter table invoices add column if not exists billing_address text;
alter table invoices add column if not exists due_date date;
update invoices set total_amount = amount where total_amount is null;
create index if not exists idx_invoices_number on invoices(invoice_number);

-- --- Quota decisions --------------------------------------------------
-- Service never stops at the quota line. Instead the client is flagged, and an
-- admin decides per month whether to bill the overage or move them up a tier.
-- One row per client per month, created the first time they cross.
create table if not exists quota_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  period_month date not null,
  threshold text not null check (threshold in ('warning','exceeded')),
  sessions_at_event int not null default 0,
  quota_at_event int not null default 0,
  decision text check (decision in ('bill_overage','upgrade','waive')),
  decided_at timestamptz,
  decided_by text,
  note text default '',
  created_at timestamptz not null default now(),
  unique (client_id, period_month, threshold)
);
create index if not exists idx_quota_events_open on quota_events(decision, period_month desc);

-- --- Password resets --------------------------------------------------
-- Self-service reset for both internal staff and customer portal logins.
-- Tokens are hashed, single-use and short-lived.
create table if not exists password_resets (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('staff','portal')),
  subject_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_password_resets_subject on password_resets(subject_type, subject_id, created_at desc);

-- --- Automation-scoped API keys --------------------------------------
-- n8n needs to create clients and invoices, which the webhook scope cannot do
-- and the admin key should not be handed out for. 'automation' sits between:
-- day-to-day records, never financials, procurement, settings or the team.
alter table api_keys drop constraint if exists api_keys_scope_check;
alter table api_keys add constraint api_keys_scope_check
  check (scope in ('admin','webhook','automation'));

-- Payment terms drive the due date stamped on each invoice at issue time.
alter table settings add column if not exists payment_terms_days int not null default 7;

-- Who last set a portal password. A customer resetting their own password
-- updates this to 'customer', so the CRM shows the change without ever
-- holding the password itself.
alter table clients add column if not exists portal_password_set_by text;

-- The same, for internal staff.
alter table internal_users add column if not exists password_set_by text;

-- =====================================================================
-- v5 — realign the ladder to the Business Model (August 2026)
--
-- seed.sql only inserts packages that do not exist yet, so a database
-- that has been running since v1 still carries the old figures. This
-- block updates them in place, ONCE.
--
-- It is guarded rather than idempotent on purpose. Enterprise+ is an
-- admin-editable tier and the standard tiers can be re-priced by an
-- admin later; re-running this on every migrate would silently undo
-- those edits and put the old numbers back.
-- =====================================================================

create table if not exists applied_migrations (
  name text primary key,
  applied_at timestamptz not null default now(),
  note text default ''
);

do $$
begin
  if exists (select 1 from applied_migrations where name = 'v5_model_realignment') then
    return;
  end if;

  -- The ladder, as the model sets it. Setup and monthly are PKR; quota is
  -- included sessions per month; overage is PKR per session past it.
  update products set setup_fee=25000,  retainer=20000,  msgs_per_session=12, quota=1500,  overage_rate=2, delivery_cost_full=672,
    target_tier='Typically 300–600 sessions/mo'     where name='Starter';
  update products set setup_fee=55000,  retainer=35000,  msgs_per_session=14, quota=4000,  overage_rate=2, delivery_cost_full=3120,
    target_tier='Typically 800–1,500 sessions/mo'   where name='Growth';
  update products set setup_fee=70000,  retainer=53000,  msgs_per_session=14, quota=9000,  overage_rate=3, delivery_cost_full=8072,
    target_tier='Typically 2,000–4,000 sessions/mo' where name='Scale';
  update products set setup_fee=100000, retainer=90000,  msgs_per_session=16, quota=15000, overage_rate=4, delivery_cost_full=18077,
    target_tier='Typically 4,000–8,000 sessions/mo' where name='Pro';
  update products set setup_fee=135000, retainer=137000, msgs_per_session=16, quota=25000, overage_rate=4, delivery_cost_full=33674,
    target_tier='Typically 8,000–15,000 sessions/mo' where name='Enterprise';
  update products set setup_fee=190000, retainer=257000, msgs_per_session=18, quota=40000, overage_rate=5, delivery_cost_full=69391,
    target_tier='Typically 15,000+ sessions/mo'      where name='Enterprise+';

  -- The stack behind every tier. There is no Airtable and no Google Sheets any
  -- more: this CRM's own Postgres is the data layer, on the same self-hosted
  -- box as n8n.
  update products set
    automation = 'n8n Community, self-hosted',
    data_layer = 'Vantriq CRM (Postgres)'
   where name in ('Starter','Growth','Scale','Pro','Enterprise','Enterprise+');

  update products set ai_model = 'Gemini 3 Flash; 12% escalated to GPT-4o-mini / Sonnet' where name='Starter';
  update products set ai_model = 'Gemini 3 Flash; 15% escalated to GPT-4o-mini / Sonnet' where name='Growth';
  update products set ai_model = 'Gemini 3 Flash; 16% escalated to GPT-4o-mini / Sonnet' where name='Scale';
  update products set ai_model = 'Gemini 3 Flash; 18% escalated to GPT-4o-mini / Sonnet' where name='Pro';
  update products set ai_model = 'Gemini 3 Flash; 20% escalated to GPT-4o-mini / Sonnet' where name='Enterprise';
  update products set ai_model = 'Gemini 3 Flash; 22% escalated to GPT-4o-mini / Sonnet' where name='Enterprise+';

  -- Web chat and voice are priced add-ons, so they are not part of a tier.
  update products set channels = 'WhatsApp + Instagram'
   where name in ('Starter','Growth','Scale','Pro');
  update products set channels = 'WhatsApp + Instagram; on-premise option' where name='Enterprise';
  update products set channels = 'WhatsApp + Instagram; custom SLA'        where name='Enterprise+';

  -- The cost base changed with the architecture. The paid data layer and the
  -- metered automation platform are gone; what is left is one virtual server.
  update vendors set status = 'Retired — replaced by the CRM''s own Postgres'
   where name in ('Airtable', 'Supabase (Postgres)', 'Pinecone') and status = 'Active';
  update vendors set status = 'Retired — replaced by self-hosted n8n Community'
   where name in ('n8n Cloud', 'n8n Server (self-hosted)') and status = 'Active';
  update vendors set cost_min = 0, cost_max = 0
   where status like 'Retired%';

  -- Quota flags raised against the old allowances are meaningless now that the
  -- allowances are several times larger — a client "over quota" at 220 sessions
  -- is comfortably inside 1,500. Close them rather than leave an admin deciding
  -- on a threshold that no longer exists. Nothing is billed by a waive.
  update quota_events set
      decision = 'waive',
      decided_at = now(),
      decided_by = 'system (model realignment)',
      note = 'Voided automatically: raised against the previous allowance, which the August 2026 model replaced with a much larger one.'
   where decision is null;

  insert into applied_migrations (name, note)
  values ('v5_model_realignment', 'Ladder, stack and cost base set from the VantriqAI Business Model, August 2026.');
end $$;

-- =====================================================================
-- v6 — service suspension and the over-quota policy
--
-- Two separate controls, deliberately:
--
--   clients.service_status   an admin's own decision about one client.
--                            'suspended' means stop answering, whatever the
--                            usage says. This is the collections lever.
--
--   settings.overage_policy  what happens automatically when a client uses up
--                            their allowance:
--                              'serve' — keep answering (the default, and what
--                                        the business model assumes)
--                              'grace' — keep answering up to overage_grace_pct
--                                        of quota, then stop
--                              'block' — stop at 100%
--
-- The default is 'serve', so applying this migration changes nothing until an
-- admin chooses otherwise.
-- =====================================================================

alter table clients add column if not exists service_status text not null default 'active'
  check (service_status in ('active','suspended'));
alter table clients add column if not exists suspended_at timestamptz;
alter table clients add column if not exists suspended_by text;
alter table clients add column if not exists suspension_reason text default '';
create index if not exists idx_clients_service_status on clients(service_status)
  where service_status = 'suspended';

alter table settings add column if not exists overage_policy text not null default 'serve'
  check (overage_policy in ('serve','grace','block'));
alter table settings add column if not exists overage_grace_pct int not null default 120;

-- =====================================================================
-- v7 — conversations from the AI agents
--
-- The WhatsApp and website agents both hold their context in an n8n memory
-- buffer that is wiped on restart, so until now nothing durable survived a
-- conversation except the billing row. This is where the transcript lands:
-- one row per turn, linked to the client the agent was talking to.
-- ---------------------------------------------------------------------
create table if not exists conversation_messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  -- Kept alongside client_id so a turn is still attributable when the
  -- prospect has not been promoted to a client record yet.
  external_ref text not null default '',
  session_id text not null default '',
  channel text not null default 'whatsapp'
    check (channel in ('whatsapp','website','instagram','voice','email')),
  role text not null check (role in ('customer','agent')),
  content text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_conv_client on conversation_messages(client_id, created_at desc);
create index if not exists idx_conv_session on conversation_messages(session_id, created_at asc);
create index if not exists idx_conv_ref on conversation_messages(external_ref, created_at desc);

-- Where new-lead notifications go. Comma- or semicolon-separated; blank
-- falls back to LEAD_NOTIFY_EMAIL, then TEAM_NOTIFY_EMAIL, so a fresh
-- install still reaches somebody.
alter table settings add column if not exists lead_notify_emails text not null default '';

-- =====================================================================
-- v7 — real accounting: withholding tax, a payments ledger, per-client
--      agents, and VantriqAI as its own (internal) customer
--
-- Five things, and they lean on each other:
--
--   1. AIT (advance income tax) alongside GST. GST is ADDED to the bill;
--      AIT is WITHHELD FROM it — the client pays the net and deposits the
--      AIT with FBR on our behalf, handing back a challan. So an invoice
--      now carries two different kinds of tax that move in opposite
--      directions, and `net_payable` is what the client actually transfers.
--      Getting this backwards overstates cash and understates the tax
--      credit, so the columns are named for the direction they move.
--
--   2. invoice_lines, so an invoice can carry Description / Qty / Unit
--      price / Amount rather than one opaque figure.
--
--   3. payments — the receipts ledger. An invoice's status stops being a
--      field someone types and becomes a fact derived from what has
--      actually been received against it.
--
--   4. client_agents — one company, many agents. A client can run a
--      WhatsApp agent, an Instagram agent and a website assistant at once,
--      each with its own external_ref, each metered separately.
--
--   5. clients.is_internal — VantriqAI is a client of itself. Its agents
--      are metered and invoiced exactly like anyone's, but the money is an
--      internal transfer: financials treat an internal client's billing as
--      COST, never revenue, so running our own agents shows up where it
--      belongs rather than inflating the top line.
-- =====================================================================

-- --- 1. Withholding tax -----------------------------------------------
-- tax_rate / tax_amount keep their meaning: GST, added to the bill.
-- These are the withholding side, subtracted from it.
alter table invoices add column if not exists ait_rate numeric not null default 0;
alter table invoices add column if not exists ait_amount numeric not null default 0;
-- What the client actually transfers: amount + GST - AIT.
alter table invoices add column if not exists net_payable numeric;
update invoices set net_payable = coalesce(total_amount, amount) where net_payable is null;

alter table settings add column if not exists default_ait_rate numeric not null default 0;
-- The seller block on the invoice. Ours, not the client's.
alter table settings add column if not exists seller_ntn text default '';
alter table settings add column if not exists seller_strn text default '';
alter table settings add column if not exists seller_address text default '';
alter table settings add column if not exists seller_email text default '';

-- A client may be exempt from withholding (an exemption certificate), which
-- is a different thing from a 0% rate that happens to be zero today.
alter table clients add column if not exists ait_rate numeric;
alter table clients add column if not exists ait_exempt boolean not null default false;

-- --- 2. Invoice line items --------------------------------------------
create table if not exists invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  position int not null default 0,
  description text not null default '',
  detail text default '',              -- the smaller second line, e.g. a period
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_lines_invoice on invoice_lines(invoice_id, position);

-- --- 3. Payments ledger -----------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  amount numeric not null,
  kind text not null default 'receipt'
    check (kind in ('receipt','ait_challan','write_off','credit_note')),
  method text default '',              -- bank transfer, cheque, cash, card
  reference text default '',           -- transaction id, cheque no, challan no
  received_date date not null default current_date,
  notes text default '',
  recorded_by text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_invoice on payments(invoice_id);
create index if not exists idx_payments_client on payments(client_id, received_date);

-- --- 4. Agents and automations per client ------------------------------
create table if not exists client_agents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  kind text not null default 'whatsapp'
    check (kind in ('whatsapp','instagram','facebook','website','voice','email','automation','other')),
  external_ref text,                   -- the number/domain/handle usage arrives under
  status text not null default 'active' check (status in ('active','paused','retired')),
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One external_ref cannot belong to two agents, or usage could be attributed
-- to either. Nulls are allowed and do not collide.
create unique index if not exists idx_client_agents_ref on client_agents(external_ref)
  where external_ref is not null;
create index if not exists idx_client_agents_client on client_agents(client_id);

-- Usage can now say which agent it came from. Null means "the client's
-- default agent", which is how every event recorded before v7 reads.
alter table usage_events add column if not exists agent_id uuid references client_agents(id) on delete set null;
create index if not exists idx_usage_agent on usage_events(agent_id, occurred_at);

-- --- 5. VantriqAI as its own customer ----------------------------------
alter table clients add column if not exists is_internal boolean not null default false;
create index if not exists idx_clients_internal on clients(is_internal) where is_internal = true;

-- --- 6. Invoice status becomes a derived fact --------------------------
-- 'partial' is what a ledger makes possible: something has been received,
-- but not all of it. 'void' is an invoice cancelled before payment — kept,
-- because the number was issued and the series must not gain a hole.
alter table invoices drop constraint if exists invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('pending','partial','paid','overdue','void'));

-- --- 7. Opening balances and the internal-cost switch ------------------
-- The Balance Sheet is derived from the invoice, payment and expense
-- records rather than from a general ledger, so it needs one anchor: the
-- cash the business started with on the day it started keeping these
-- records. Equity opens at the same figure, which is what makes the sheet
-- balance when nothing else has happened yet.
alter table settings add column if not exists opening_cash numeric not null default 0;
alter table settings add column if not exists opening_cash_date date;
-- The P&L line VantriqAI's own agent usage lands on.
alter table settings add column if not exists internal_cost_label text not null default 'Internal AI usage (own agents)';

-- --- 8. Recurring expenses can end --------------------------------------
-- Without this a cancelled subscription accrues forever and every past
-- month's P&L is wrong the moment you delete the row.
alter table expenses add column if not exists end_date date;
alter table expenses add column if not exists vendor_id uuid references vendors(id) on delete set null;

-- --- 9. Tax remittances -------------------------------------------------
-- GST collected is a liability until it is paid to FBR; AIT withheld is an
-- asset until it is set against a tax bill. Both need somewhere to be
-- cleared, or the Balance Sheet grows a liability and an asset that never
-- go away.
create table if not exists tax_remittances (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('gst_paid','ait_claimed')),
  amount numeric not null,
  period text default '',              -- e.g. 'Sep 2026' or 'FY 2026-27'
  reference text default '',           -- CPR / challan number
  paid_date date not null default current_date,
  notes text default '',
  recorded_by text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_tax_remittances_date on tax_remittances(paid_date);

-- --- 10. Keep the new tables' updated_at fresh -------------------------
drop trigger if exists trg_client_agents_updated on client_agents;
create trigger trg_client_agents_updated before update on client_agents
  for each row execute function touch_updated_at();

-- =====================================================================
-- v8 — subscriptions the way a billing system means it: bundles, quotes,
--      scheduled changes, metered rates, dunning and reconciliation
--
-- Seven things:
--
--   1. client_bundles — a package added ALONGSIDE the one a client is on,
--      rather than replacing it. When a package runs its course, or a
--      customer simply wants more, another is attached: its quota adds to
--      their allowance and its retainer adds to the same monthly invoice
--      as its own line. A bundle can be pinned to one agent, which is how
--      "the Instagram agent needs its own allowance" is expressed.
--
--   2. subscription_phases — a package change dated in the future. The
--      monthly run applies it on the day it falls due, so "move them up a
--      tier from January" is recorded once and then happens.
--
--   3. quotes / quote_lines — an estimate before anything is billed. The
--      customer accepts it in their portal and it becomes an invoice, and
--      where it names a package, a subscription change too.
--
--   4. usage_rates — metered billing beyond one price per session. A
--      negotiated contract can price messages, or tokens, or automation
--      runs, per client or per agent, with its own included allowance.
--
--   5. dunning_steps / invoice_reminders — what happens as a due date
--      approaches and passes. There is no card to retry in this business:
--      invoices are settled by bank transfer, so the equivalent of a
--      smart retry is an escalating schedule of reminders that ends in
--      suspension, and a log so nothing is ever sent twice.
--
--   6. automations — rules on top of that: when an invoice goes N days
--      overdue, or a client crosses quota, or a bundle is about to end,
--      do this.
--
--   7. bank_credits — the statement lines coming in, matched to invoices
--      automatically where the reference or the amount says who they are,
--      and left for a person where it does not.
-- =====================================================================

-- --- 1. Bundles --------------------------------------------------------
-- A bundle snapshots its price and quota at the moment it is added, the
-- same way an invoice does: re-pricing the catalogue later must not
-- silently re-price someone's existing bundle.
create table if not exists client_bundles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_id uuid references client_agents(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  name text not null,
  qty int not null default 1 check (qty > 0),
  unit_setup_fee numeric not null default 0,
  unit_retainer numeric not null default 0,
  unit_quota int not null default 0,
  overage_rate numeric not null default 0,
  recurring boolean not null default true,   -- false = a one-off top-up
  status text not null default 'active' check (status in ('scheduled','active','ended','cancelled')),
  starts_on date not null default current_date,
  ends_on date,
  added_by text not null default 'admin' check (added_by in ('admin','customer','automation')),
  setup_billed boolean not null default false,
  note text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_bundles_client on client_bundles(client_id, status);
create index if not exists idx_bundles_agent on client_bundles(agent_id);

drop trigger if exists trg_bundles_updated on client_bundles;
create trigger trg_bundles_updated before update on client_bundles
  for each row execute function touch_updated_at();

-- Bundle lines have to be traceable from the invoice they were billed on,
-- or a customer querying their bill has nothing to point at.
alter table invoice_lines add column if not exists bundle_id uuid references client_bundles(id) on delete set null;
alter table invoice_lines add column if not exists agent_id uuid references client_agents(id) on delete set null;
alter table invoice_lines add column if not exists kind text not null default 'other'
  check (kind in ('retainer','setup','bundle','bundle_setup','overage','addon','discount','other'));

-- --- 2. Scheduled subscription changes ---------------------------------
create table if not exists subscription_phases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  effective_on date not null,
  note text default '',
  status text not null default 'scheduled' check (status in ('scheduled','applied','cancelled')),
  applied_at timestamptz,
  created_by text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_phases_due on subscription_phases(status, effective_on);
create index if not exists idx_phases_client on subscription_phases(client_id, effective_on);

-- --- 3. Quotes ---------------------------------------------------------
create sequence if not exists quote_number_seq start 1;

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  quote_number text unique,
  title text default '',
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','declined','expired','cancelled')),
  valid_until date,
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  -- A quote may propose a package move, a bundle, or neither.
  product_id uuid references products(id) on delete set null,
  bundle_product_id uuid references products(id) on delete set null,
  notes text default '',
  terms text default '',
  sent_at timestamptz,
  decided_at timestamptz,
  invoice_id uuid references invoices(id) on delete set null,
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_quotes_client on quotes(client_id, created_at desc);
create index if not exists idx_quotes_status on quotes(status, valid_until);

create table if not exists quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  position int not null default 0,
  description text not null default '',
  detail text default '',
  qty numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0
);
create index if not exists idx_quote_lines on quote_lines(quote_id, position);

drop trigger if exists trg_quotes_updated on quotes;
create trigger trg_quotes_updated before update on quotes
  for each row execute function touch_updated_at();

-- --- 4. Metered rates --------------------------------------------------
-- The most specific rate wins: an agent's beats a client's, a client's
-- beats a package's, a package's beats the built-in per-session overage.
create table if not exists usage_rates (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade,
  agent_id uuid references client_agents(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  metric text not null check (metric in ('session','message','input_token','output_token','automation_run')),
  unit_rate numeric not null default 0,
  included_units numeric not null default 0,
  unit_size numeric not null default 1,      -- e.g. 1000 to price per 1k tokens
  label text default '',
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now()
);
create index if not exists idx_usage_rates_client on usage_rates(client_id, metric);
create index if not exists idx_usage_rates_agent on usage_rates(agent_id, metric);

-- --- 5. Dunning --------------------------------------------------------
-- offset_days is relative to the due date: negative is before it.
create table if not exists dunning_steps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  offset_days int not null,
  action text not null default 'email' check (action in ('email','flag','suspend')),
  subject text default '',
  body text default '',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_dunning_active on dunning_steps(active, offset_days);

create table if not exists invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  step_id uuid references dunning_steps(id) on delete set null,
  action text not null,
  channel text default 'email',
  outcome text not null default 'sent' check (outcome in ('sent','failed','skipped')),
  detail text default '',
  sent_at timestamptz not null default now()
);
-- One step fires once per invoice, ever. This is the whole reason the log
-- exists: a daily run must not re-send yesterday's reminder.
create unique index if not exists idx_reminder_once on invoice_reminders(invoice_id, step_id)
  where step_id is not null;
create index if not exists idx_reminders_invoice on invoice_reminders(invoice_id, sent_at desc);

alter table settings add column if not exists dunning_enabled boolean not null default false;
alter table settings add column if not exists dunning_suspend_after_days int not null default 30;

-- --- 6. Automations ----------------------------------------------------
create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger text not null
    check (trigger in ('invoice_overdue','quota_exceeded','bundle_ending','subscription_renewal')),
  threshold_days int not null default 0,     -- days overdue, or days before an end date
  threshold_pct int not null default 100,    -- for quota_exceeded
  action text not null check (action in ('email_customer','notify_team','suspend_service','flag_review','offer_upgrade')),
  params jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  last_run_at timestamptz,
  run_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_automations_active on automations(active, trigger);

drop trigger if exists trg_automations_updated on automations;
create trigger trg_automations_updated before update on automations
  for each row execute function touch_updated_at();

-- What an automation actually did, so a rule that misfires can be traced.
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references automations(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete set null,
  outcome text not null default 'done',
  detail text default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_automation_runs on automation_runs(automation_id, created_at desc);
-- An automation fires once per client per trigger occurrence, not once a day.
create unique index if not exists idx_automation_once
  on automation_runs(automation_id, client_id, invoice_id)
  where invoice_id is not null;

-- --- 7. Bank credits ---------------------------------------------------
create table if not exists bank_credits (
  id uuid primary key default gen_random_uuid(),
  received_date date not null default current_date,
  amount numeric not null,
  reference text default '',
  payer text default '',
  bank_ref text,                              -- the bank's own unique id for the line
  status text not null default 'unmatched'
    check (status in ('unmatched','matched','ignored')),
  matched_invoice_id uuid references invoices(id) on delete set null,
  matched_payment_id uuid references payments(id) on delete set null,
  match_confidence text default '',           -- how it was matched, in words
  raw jsonb,
  created_at timestamptz not null default now()
);
-- Importing the same statement twice must not double-credit anybody.
create unique index if not exists idx_bank_credits_ref on bank_credits(bank_ref)
  where bank_ref is not null;
create index if not exists idx_bank_credits_status on bank_credits(status, received_date desc);

-- --- 11. Sending the invoice, not just raising it -----------------------
-- The monthly run created invoices silently: a customer's first word of one
-- was a dunning reminder days later, chasing a bill nobody had sent them.
-- With this on, the run emails each invoice as it raises it.
--
-- It defaults to TRUE because an unsent invoice is the bug, not the safe
-- state. Nothing reaches anyone until the run is executed for real, and the
-- run's dry run names every recipient before it does.
alter table settings add column if not exists email_invoices boolean not null default true;

-- =====================================================================
-- v9 — one company, five tax authorities
--
-- Sales tax on services in Pakistan is provincial. Selling into ICT,
-- Punjab, Sindh, KP and Balochistan means five different rates, five
-- registrations, and five returns — and the rate for the SAME service
-- genuinely differs: Punjab zero-rates software and IT-based system
-- development while ICT charges its reduced or standard rate.
--
-- A single settings.default_tax_rate cannot express that, and one
-- settings.seller_strn cannot carry five registration numbers. So the
-- authority becomes a thing the system knows about, a client belongs to
-- one, and the invoice records which one it was billed under.
--
-- Withholding does NOT move here. AIT is federal (s.153) and already has
-- clients.ait_rate and clients.ait_exempt, which is the right shape: the
-- rate turns on what the service is and who the customer is, not on
-- which province they sit in.
-- =====================================================================

create table if not exists tax_jurisdictions (
  code text primary key,
  name text not null,
  -- Sales tax on services for OUR services in that jurisdiction. Seeded at
  -- 0 on purpose: a wrong rate on an issued invoice is an FBR problem, so
  -- the system bills nothing until somebody who can be held to it enters
  -- the number. `rate_note` carries what to go and check.
  sales_tax_rate numeric not null default 0,
  -- Our registration with THAT authority. Printed on invoices billed under
  -- it; an invoice showing the wrong authority's number is not valid.
  seller_reg_no text not null default '',
  rate_note text not null default '',
  active boolean not null default true,
  sort_order int not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_tax_jurisdictions_updated on tax_jurisdictions;
create trigger trg_tax_jurisdictions_updated before update on tax_jurisdictions
  for each row execute function touch_updated_at();

-- The five authorities plus export. Rates stay 0 until confirmed; the notes
-- are prompts for whoever confirms them, not authority in themselves.
insert into tax_jurisdictions (code, name, rate_note, sort_order) values
  ('ICT',    'Islamabad Capital Territory (FBR)',
   'Standard and reduced rates differ; the reduced rate is usually conditional on not claiming input tax. Confirm which applies to our services.', 10),
  ('PRA',    'Punjab Revenue Authority',
   'Software and IT-based system development services may be ZERO-RATED in Punjab. Confirm whether our services qualify before charging anything.', 20),
  ('SRB',    'Sindh Revenue Board',
   'Confirm the rate for IT and IT-enabled services, and whether a reduced rate applies.', 30),
  ('KPRA',   'Khyber Pakhtunkhwa Revenue Authority',
   'Rate not yet confirmed.', 40),
  ('BRA',    'Balochistan Revenue Authority',
   'Rate not yet confirmed.', 50),
  ('EXPORT', 'Export of services (outside Pakistan)',
   'Exports of IT and IT-enabled services are generally zero-rated. Confirm the documentation required to support zero-rating.', 60)
on conflict (code) do nothing;

-- Which authority a client is billed under. Null means "fall back to the
-- company default rate", which is what every existing client does today, so
-- this migration changes nobody's bill until a jurisdiction is assigned.
alter table clients add column if not exists tax_jurisdiction text references tax_jurisdictions(code);
create index if not exists idx_clients_jurisdiction on clients(tax_jurisdiction);

-- Stamped onto the invoice at issue, never read back through the client.
-- Rates and registrations change; an invoice issued last March must still
-- show what it was actually billed under.
alter table invoices add column if not exists tax_jurisdiction text;
alter table invoices add column if not exists seller_reg_no text not null default '';

-- =====================================================================
-- v9.1 — the internal account bills in dollars, at model cost
--
-- Customers are billed in PKR against a package. VantriqAI's own account
-- is a different animal: it exists to put the real cost of running the
-- agents somewhere visible, and that cost is an OpenAI bill denominated
-- in USD and metered in tokens. Converting it to PKR inside the system
-- would bake in a rate that was only true on one day; the conversion
-- belongs at the moment the adjustment is actually settled.
--
-- So currency becomes per-client, and the invoice records the one it was
-- raised in. Everything without a currency stays on the company default,
-- which is PKR — no existing client changes.
--
-- Precision matters here in a way it does not for PKR. gpt-4o-mini is
-- $0.15 per million input tokens: a month of light traffic is a fraction
-- of a cent, and rounding to two places would record it as zero and drop
-- the invoice entirely. USD amounts are therefore held to six places.
-- =====================================================================

alter table clients  add column if not exists currency text;
alter table invoices add column if not exists currency text;

-- Where the internal account's own invoice is sent. It is a real invoice
-- and it should arrive like any other, rather than being the one nobody
-- ever sees. Change it in Settings.
alter table settings add column if not exists internal_invoice_email text not null default 'support@vantriqai.com';

-- =====================================================================
-- v9.2 — one set of books, two currencies
--
-- The internal invoice is raised in USD; every other figure in the
-- financials is PKR. Adding one to the other gives a number that means
-- nothing, so the conversion has to be recorded rather than assumed.
--
-- It is recorded the same way a tax rate is: stamped on the invoice at
-- issue, never looked up again. The rate on the day the cost was incurred
-- is the rate that cost was incurred at, and a later rate must not quietly
-- restate a month that has already been reported.
--
--   usd_pkr_rate   what one dollar costs today, entered in Settings.
--                  0 means "not set" — no rate is invented.
--   fx_rate        the rate this invoice was converted at. 1 when the
--                  invoice is already in the books' own currency.
--   base_amount    the invoice's net value in the books' currency. NULL
--                  when no rate was available, which the financials
--                  report as an unconverted figure rather than dropping
--                  or guessing it.
-- =====================================================================

alter table settings add column if not exists usd_pkr_rate numeric not null default 0;
alter table invoices add column if not exists fx_rate numeric;
alter table invoices add column if not exists base_amount numeric;

-- Invoices raised before v9.2 are all PKR, so they convert at 1:1. Done
-- once, guarded, so re-running this file never touches a stamped rate.
update invoices set fx_rate = 1, base_amount = amount
 where fx_rate is null and coalesce(currency, 'PKR') = 'PKR';

-- Where our own monthly invoice is sent. It defaults to the one mailbox the
-- Hostinger account actually has; an address with no mailbox behind it does
-- not fail loudly, it just bounces somewhere nobody reads. Change it in
-- Settings once another mailbox exists — nothing here overwrites a choice
-- made there, so re-running this file never undoes it.

-- =====================================================================
-- v9.3 — CONTRACTS
--
-- The signed agreement behind an account. Until now the CRM held what a
-- client is billed but not what they agreed to, so "what did we actually
-- commit to, and when does it run out" lived in somebody's inbox.
--
-- One table, read from two places: the Contracts tab lists every contract
-- across all clients, and a client's own panel lists theirs. Both render
-- the same rows through the same code, so the two can never disagree —
-- which is the whole point of having it in the system rather than a folder.
--
-- The counterparty's legal identity (NTN, STRN, registered name and
-- address) is SNAPSHOT onto the contract, exactly as invoices snapshot
-- theirs. A contract is a record of what was agreed with whom on the day
-- it was signed; if a client later re-registers under a new NTN, last
-- year's contract must still show the number it was actually signed under.
-- Editing the client record must not silently rewrite history.
-- =====================================================================

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contract_number text unique,
  title text not null default '',
  kind text not null default 'service'
    check (kind in ('service','msa','sow','nda','amendment','renewal','other')),
  status text not null default 'draft'
    check (status in ('draft','sent','signed','active','expired','terminated','superseded')),

  -- The term. end_date null means it runs until somebody ends it.
  start_date date,
  end_date date,
  -- Renews by itself unless cancelled; notice_days is how much warning the
  -- other side is owed. Both drive the "expiring soon" list, nothing else.
  auto_renew boolean not null default false,
  notice_days int not null default 0,

  -- What it is worth. Currency follows the client's, so an internal
  -- contract in USD stays in USD rather than being silently rebased.
  value numeric not null default 0,
  currency text not null default 'PKR',
  billing_frequency text not null default 'monthly'
    check (billing_frequency in ('one_off','monthly','quarterly','annual')),

  -- Who signed, and under what legal identity. Snapshot at signing.
  signed_date date,
  signed_by_client text default '',
  signed_by_us text default '',
  client_legal_name text default '',
  client_ntn text default '',
  client_strn text default '',
  client_address text default '',

  -- The document itself lives wherever your files live; this is the link
  -- to it. The CRM deliberately does not store the PDF: a CRM is not a
  -- document store, and a link that resolves beats a blob that rots.
  document_url text default '',

  scope text default '',
  notes text default '',
  superseded_by uuid references contracts(id) on delete set null,
  created_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contracts_client on contracts(client_id, start_date desc);
create index if not exists idx_contracts_status on contracts(status, end_date);

drop trigger if exists trg_contracts_updated on contracts;
create trigger trg_contracts_updated before update on contracts
  for each row execute function touch_updated_at();

-- Contract numbers run in their own sequence, like invoice numbers, so two
-- contracts raised in the same second cannot collide on one.
create sequence if not exists contract_number_seq start 1;

-- =====================================================================
-- v9.4 — CUSTOMER DOCUMENTS, AND CHANGING A COMPANY'S DETAILS
--
-- Two things, related by the same principle: a tax document has to keep
-- saying what was true when it was issued.
--
-- 1. DOCUMENTS. The service agreement form, the NTN certificate, the
--    CNIC, whatever else an account needs on file. Held as bytes in the
--    database rather than on the container's disk, because the container
--    is rebuilt on every deploy and its filesystem goes with it, while
--    the database has a volume and is in the verified backup.
--
-- 2. IDENTITY CHANGES. Companies rename and re-register. When they do,
--    invoices ALREADY ISSUED must not move — one has been filed with FBR
--    under the old NTN and reprinting it under the new one makes the
--    filing and the document disagree. Invoices issued afterwards pick
--    the new details up by themselves, because every invoice snapshots
--    the identity at issue. What was missing was a record of the change
--    itself, so the jump from one NTN to another in a year's invoices
--    can be explained rather than looking like an error.
-- =====================================================================

create table if not exists client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  doc_type text not null default 'other'
    check (doc_type in ('saf','ntn','strn','cnic','contract','po','bank','other')),
  title text not null default '',
  filename text not null,
  content_type text not null default 'application/octet-stream',
  byte_size int not null default 0,
  -- The bytes. bytea, not a path: a path into a container that is thrown
  -- away on the next deploy is a broken link waiting to happen.
  content bytea not null,
  -- Lets a re-upload of the same file be spotted instead of silently
  -- stored twice under two names.
  sha256 text default '',
  notes text default '',
  uploaded_by text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_client_docs on client_documents(client_id, created_at desc);
create index if not exists idx_client_docs_type on client_documents(client_id, doc_type);

drop trigger if exists trg_client_documents_updated on client_documents;
create trigger trg_client_documents_updated before update on client_documents
  for each row execute function touch_updated_at();

-- Every change to the details that appear on a tax invoice, kept so the
-- books can explain themselves. Written by the API, never by hand.
create table if not exists client_identity_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  changed_at timestamptz not null default now(),
  -- When the new details take legal effect, which is not always the day
  -- somebody got round to typing them in.
  effective_from date,
  old_company text default '', new_company text default '',
  old_ntn text default '',     new_ntn text default '',
  old_strn text default '',    new_strn text default '',
  old_address text default '', new_address text default '',
  reason text default '',
  changed_by text default ''
);
create index if not exists idx_identity_changes on client_identity_changes(client_id, changed_at desc);

-- The registered name the invoice was RAISED under.
--
-- The NTN, STRN and address were already snapshot onto each invoice; the
-- company name was not — it was read live off the client record at print
-- time. So a renamed company's old invoices reprinted under the new name
-- carrying the old NTN: a document whose name and registration number
-- belong to two different entities, which is worse than either being
-- stale. Now the name is stamped with the rest of the identity.
alter table invoices add column if not exists client_legal_name text;

-- Existing invoices predate any rename, so the client's current name is
-- still the name they were raised under. Guarded, so re-running this file
-- never overwrites a stamped name.
update invoices i set client_legal_name = c.company
  from clients c where c.id = i.client_id and i.client_legal_name is null;

-- =====================================================================
-- v9.5 — ARCHIVE AND OFFLOAD
--
-- Keep a rolling window of invoices live and take the rest out of the
-- working set, so the CRM stays quick as the years accumulate.
--
-- Deleting financial rows is the most destructive thing this system can
-- do, so it is built around two guarantees.
--
-- 1. YOU CANNOT PURGE WHAT YOU HAVE NOT DOWNLOADED. A purge names an
--    archive run and must present the SHA-256 of the workbook that run
--    produced. No download, no hash; wrong hash, no purge.
--
-- 2. THE BOOKS DO NOT MOVE. Every statement here is derived from invoice
--    and payment rows, so deleting them would quietly restate the balance
--    sheet, the P&L and the FBR position — cash, receivables and advance
--    tax all fall out of those rows. Before anything is deleted its
--    totals are rolled into archived_month_totals, and the accounting
--    reads those back. A month that has been archived still reports its
--    figures; what it loses is the line-by-line detail, which is in the
--    workbook you downloaded.
--
-- Records still have to be retained for the statutory period. This moves
-- them out of the database and into a file you keep; it is not a licence
-- to throw them away.
-- =====================================================================

create table if not exists archive_runs (
  id uuid primary key default gen_random_uuid(),
  -- Everything ISSUED STRICTLY BEFORE this date is in scope.
  cutoff_date date not null,
  status text not null default 'prepared'
    check (status in ('prepared','purged','cancelled')),

  -- The workbook this run produced. The hash is what a purge must quote.
  archive_sha256 text default '',
  archive_filename text default '',
  archive_bytes int not null default 0,

  invoice_count int not null default 0,
  line_count int not null default 0,
  payment_count int not null default 0,
  earliest_issued date,
  latest_issued date,

  prepared_at timestamptz not null default now(),
  prepared_by text default '',
  purged_at timestamptz,
  purged_by text default ''
);
create index if not exists idx_archive_runs on archive_runs(status, prepared_at desc);

-- What a purged month was worth, so the statements can still report it.
--
-- One row per calendar month per purge. The columns mirror exactly the
-- figures computeBalanceSheet and computePnl derive from invoice and
-- payment rows — if a new figure is ever derived from those rows, it
-- needs a column here too, or the sheet will silently stop balancing
-- the first time somebody archives.
create table if not exists archived_month_totals (
  id uuid primary key default gen_random_uuid(),
  archive_run_id uuid references archive_runs(id) on delete set null,
  month date not null,
  invoice_count int not null default 0,
  revenue numeric not null default 0,        -- ex-GST, external clients
  billed_net numeric not null default 0,     -- net payable, external
  gst_charged numeric not null default 0,
  ait_withheld numeric not null default 0,
  receipts numeric not null default 0,
  written_off numeric not null default 0,
  credited numeric not null default 0,
  internal_cost numeric not null default 0,  -- our own account, in book currency
  created_at timestamptz not null default now()
);
create index if not exists idx_archived_months on archived_month_totals(month);

-- ---------------------------------------------------------------------
-- v9.7 — a quotation that reads like a proposal
--
-- A quote used to be an invoice with a different word at the top: one
-- page, a table of lines, a total. That is the right shape for a bill
-- somebody already agreed to and the wrong shape for asking them to
-- agree in the first place. A prospect reading a bare total has no way
-- to judge whether it is a good one.
--
-- So a quote now carries the material a proposal needs: a covering
-- letter in the sender's own words, the packages being put forward, and
-- which of them we actually recommend. The commercials are unchanged —
-- same quote_lines, same arithmetic — they simply arrive last, after
-- the reader knows what they are buying.
--
-- All four columns are optional. A quote with none of them set renders
-- exactly as it did before, so nothing already sent changes shape.
-- ---------------------------------------------------------------------

-- The page-one letter. Free text, the seller's own voice. Blank falls
-- back to a generated opening rather than an empty page.
alter table quotes add column if not exists cover_letter text default '';

-- Which packages this proposal puts in front of the reader. Empty means
-- "just the quote lines" — the old behaviour.
--
-- Deliberately an array of ids rather than a join table: a proposal's
-- package list is read and written whole, never queried across, and a
-- join table would add a migration, two indexes and an ordering column
-- to store what is genuinely one field of one row.
alter table quotes add column if not exists selected_product_ids uuid[] not null default '{}';

-- Show the entire range as a comparison, not only the selected ones.
-- Some buyers want to see where they sit on the ladder before choosing;
-- others find six columns of pricing overwhelming. The sender decides
-- per proposal rather than us deciding once for everybody.
alter table quotes add column if not exists show_all_packages boolean not null default false;

-- The one we are actually recommending. Drawn highlighted, so a reader
-- who skims the comparison still leaves knowing what we think they
-- should take. Null means present them evenly and make no call.
alter table quotes add column if not exists recommended_product_id uuid
  references products(id) on delete set null;

-- ---------------------------------------------------------------------
-- v9.8 — per-number pricing: charging for extra channels on one package
--
-- client_agents already lets one client run several metered numbers —
-- several WhatsApp lines, an Instagram handle, a website domain — all
-- pooled against one package's quota (v_monthly_usage groups by
-- client_id, not agent_id). That is the right shape for one business
-- with several branches sharing one account. Left unpriced, it is also
-- the shape of two unrelated businesses splitting one bill.
--
-- These two columns give a package an explicit answer to "and the
-- second number costs what?" — an included count, and a monthly price
-- for anything past it. Both default to values that change nothing for
-- anyone until deliberately set:
--
--   included_agents = 1      matches how every client behaves today —
--                            one number, no charge, no prior fixed limit.
--   extra_agent_price = 0    "not charged" is the current, silent
--                            default the business is already running on.
--                            Zero is stated, not invented: nothing in the
--                            seeded business model prices this, so no
--                            figure is set here that nobody has approved.
--
-- Deliberately NOT added to products.FIELDS (the set the core /:id PUT
-- route can touch) and deliberately NOT gated by is_standard. The lock
-- on Starter through Enterprise protects the figures the business model
-- document fixes — setup fee, retainer, quota, overage. Per-number
-- pricing was never part of that document, so there is no fixed figure
-- to protect, and a business selling this as "one bill covers every
-- branch" needs to be able to price it on Growth or Scale, not only on
-- the one bespoke tier. See routes/products.js for the separate,
-- narrower endpoint that edits only these two fields, on any package.
-- ---------------------------------------------------------------------
alter table products add column if not exists included_agents int not null default 1;
alter table products add column if not exists extra_agent_price numeric not null default 0;

-- invoice_lines.kind is checked against a fixed list — the same list the
-- monthly billing run in buildMonthlyBill() draws from, so a line without a
-- matching kind here fails at insert, loudly, rather than as a mystery
-- 'other' row nobody can report on later. The extra-numbers line needs its
-- own value for the same reason bundles and overage already have theirs:
-- so "how much of this did the extra-number pricing actually bring in" is
-- one query, not a text search over free-form descriptions.
alter table invoice_lines drop constraint if exists invoice_lines_kind_check;
alter table invoice_lines add constraint invoice_lines_kind_check
  check (kind in ('retainer','setup','bundle','bundle_setup','overage','addon','discount','extra_agents','other'));

-- =====================================================================
-- v9.11 — an owner account nothing else in the system can touch
--
-- Every admin so far has been equally an admin: any one of them can
-- deactivate, demote or reset the password of any other, including the
-- last one standing being the only thing team.js already protects. That
-- is enough to stop an accident. It is not enough to stop a hijack — an
-- attacker who gets admin access can promote a second account, then use
-- it to lock out a SPECIFIC admin (the real owner) while leaving the
-- "last admin" rule satisfied by the account they just created.
--
-- is_owner marks the one row nobody else — not another admin, not a
-- compromised admin session — can touch. See routes/team.js for the
-- guard; this index is what makes it true even if that guard were ever
-- bypassed: Postgres itself refuses a second row with is_owner set.
alter table internal_users add column if not exists is_owner boolean not null default false;
create unique index if not exists idx_internal_users_one_owner
  on internal_users (is_owner) where is_owner;

-- A second factor that does not depend on the same inbox a password
-- reset would also use. Email OTP protects every other account; the
-- owner account additionally supports an authenticator app (TOTP,
-- RFC 6238), so a compromised mailbox alone cannot complete a sign-in
-- to this one account. Available to any user who sets it up — the
-- owner is the one for whom must_setup_totp starts true.
alter table internal_users add column if not exists totp_secret text;
alter table internal_users add column if not exists totp_enabled boolean not null default false;
alter table internal_users add column if not exists must_setup_totp boolean not null default false;

-- A totp challenge has no emailed code to hash, so code_hash must be
-- nullable; method says which kind a given row is and how /auth/verify
-- should check it.
alter table login_challenges alter column code_hash drop not null;
alter table login_challenges add column if not exists method text not null default 'email'
  check (method in ('email','totp'));

-- =====================================================================
-- v9.12 — a read-only API token a CUSTOMER can hand to their own systems
--
-- The CRM already had a way to give VantriqAI's own automations broad
-- access (api_keys, scope 'automation') and a way for a customer to see
-- their own account in a browser (portal_sessions). Neither covers a
-- customer wanting their own accounting software or BI tool to pull their
-- own invoices and usage automatically — that needed its own credential,
-- scoped to exactly one client, generated by the customer themselves
-- rather than by us running a script on their behalf.
--
-- Deliberately its own table, not a column on clients: a client may
-- reasonably want one token for their accountant's software and a
-- separate one for an internal dashboard, revocable independently of each
-- other without regenerating both.
create table if not exists client_api_tokens (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null default '',
  token_hash text not null unique,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists idx_client_api_tokens_client on client_api_tokens(client_id);

-- Off by default for every client — this was shipped, then reconsidered:
-- most customers will never ask for API access, and self-service token
-- creation open to every portal account is a bigger blast radius than it
-- needs to be for a feature only a few will use. An admin turns it on for
-- one client at a time, the moment that client actually asks, the same
-- way Enterprise+ custom pricing is opt-in per client rather than a
-- standing capability everyone has. See routes/clients.js's
-- PATCH /:id/api-access (admin-only) and middleware/clientApiAuth.js,
-- which refuses a token outright the instant this is turned back off,
-- not only new ones being created.
alter table clients add column if not exists api_access_enabled boolean not null default false;

-- =====================================================================
-- v9.13 — analytics and customer satisfaction
--
-- Two new facts the agents can report, so the dashboards have something
-- better than volume to show:
--
--   1. csat_responses — one row per answered satisfaction survey. The
--      survey itself (a WhatsApp button reply after a conversation, a web
--      form, a separate survey app) is not the CRM's business; whatever
--      asks the question posts the answer to /api/webhooks/csat. A
--      response may carry any of a 1–5 CSAT score, a 0–10 NPS score and a
--      "was it resolved?" yes/no — surveys differ, and forcing all three
--      would make a one-tap survey impossible.
--
--   2. usage_events.handoff — whether a human had to take the
--      conversation over. Null means "not reported", which is what every
--      event before v9.13 reads, so containment is computed only over
--      sessions whose agent actually reports it rather than claiming 100%
--      for flows that never said.
-- =====================================================================
create table if not exists csat_responses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_id uuid references client_agents(id) on delete set null,
  -- Kept for joining a response back to its conversation. Like
  -- usage_events.session_id it is built from the end customer's phone
  -- number: never sent as it is, and the number in it only in the Excel
  -- report, to the customer whose customer it is (utils/analyticsReport.js).
  session_id text not null default '',
  channel text not null default 'whatsapp',
  score smallint check (score between 1 and 5),
  nps smallint check (nps between 0 and 10),
  resolved boolean,
  comment text not null default '',
  source text not null default '',
  -- The survey tool's own id for this answer, so a retried delivery is not
  -- counted twice.
  external_id text,
  responded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (score is not null or nps is not null or resolved is not null)
);
create index if not exists idx_csat_client_time on csat_responses(client_id, responded_at);
create unique index if not exists idx_csat_external on csat_responses(client_id, external_id)
  where external_id is not null;

alter table usage_events add column if not exists handoff boolean;

-- =====================================================================
-- v9.14 — Surveys (VantriqAI Pulse)
--
-- v9.13 could RECEIVE a satisfaction answer but had nothing that asked the
-- question. This is the thing that asks it: a customer builds a survey from
-- an industry template (restaurant, FMCG, telecom, healthcare, …), shares it
-- as a link, a QR code on the table, a kiosk tablet or a WhatsApp message
-- after a conversation, and every answer lands in three places at once —
-- the survey's own results, the customer's portal, and the CRM.
--
--   surveys           one per questionnaire. Questions are JSON because a
--                     restaurant's questions and a telco's have nothing in
--                     common but their shape, and the shape is validated in
--                     src/utils/surveys.js on every write.
--   survey_responses  one per completed submission. The headline figures
--                     (CSAT, NPS, effort, resolved) are lifted out of the
--                     answers into columns so they can be counted cheaply.
--   survey_invites    one per personal link sent after a conversation, so a
--                     response joins back to the conversation it rates and
--                     "how many we asked" is a real number, not a guess.
--   survey_views      opens per survey per day, for the completion rate.
--
-- Every response that carries a headline figure ALSO writes one
-- csat_responses row, linked by survey_response_id. That is what puts survey
-- results into the Analytics dashboards that already exist, in the portal
-- and in the CRM, without a second set of satisfaction maths to keep in step.
-- =====================================================================
create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  -- The public address: /s/<slug>. Lower-case words and a random tail, so a
  -- survey cannot be found by guessing a competitor's name.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  title text not null,
  industry text not null default 'general',
  status text not null default 'live' check (status in ('draft','live','paused','closed')),
  languages text[] not null default '{en}',
  default_language text not null default 'en',
  -- The business name a respondent sees. Defaults to the client's company.
  display_name text not null default '',
  brand_color text not null default '#2f56d9',
  logo_url text not null default '',
  -- Welcome and thank-you text, per language.
  content jsonb not null default '{}'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  -- Branches, outlets or sites: [{id, name}]. A QR code per location tags
  -- every answer with where it was given.
  locations jsonb not null default '[]'::jsonb,
  -- Shown to a delighted respondent after they submit (a Google review link).
  review_url text not null default '',
  -- Who hears about an unhappy answer the moment it arrives.
  alert_emails text not null default '',
  closes_at timestamptz,
  response_limit int check (response_limit is null or response_limit > 0),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_surveys_client on surveys(client_id, created_at desc);
drop trigger if exists trg_surveys_updated on surveys;
create trigger trg_surveys_updated before update on surveys
  for each row execute function touch_updated_at();

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  -- The browser's own id for this submission. A retry after a dropped
  -- connection sends the same one, and is recognised rather than counted twice.
  submission_id text,
  answers jsonb not null default '{}'::jsonb,
  score smallint check (score between 1 and 5),
  nps smallint check (nps between 0 and 10),
  ces smallint check (ces between 1 and 7),
  resolved boolean,
  comment text not null default '',
  location_id text not null default '',
  location_name text not null default '',
  channel text not null default 'link',
  language text not null default 'en',
  -- Only ever what the respondent typed into a contact question themselves.
  contact_name text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  contact_consent boolean not null default false,
  duration_sec int,
  -- Closing the loop: an unhappy answer opens a follow-up that somebody
  -- works to 'resolved'. Everything else starts at 'none'.
  followup_status text not null default 'none'
    check (followup_status in ('none','open','contacted','resolved')),
  followup_note text not null default '',
  followup_by text not null default '',
  followup_at timestamptz,
  submitted_at timestamptz not null default now()
);
create index if not exists idx_survey_responses_survey on survey_responses(survey_id, submitted_at desc);
create index if not exists idx_survey_responses_client on survey_responses(client_id, submitted_at desc);
create unique index if not exists idx_survey_responses_submission
  on survey_responses(survey_id, submission_id) where submission_id is not null;
create index if not exists idx_survey_responses_followup
  on survey_responses(client_id, followup_status) where followup_status in ('open','contacted');

-- Echo service timing: historical updates do not identify first contact.
-- Keep historical timestamps unknown; capture only new status transitions.
alter table survey_responses add column if not exists first_contacted_at timestamptz;
alter table survey_responses add column if not exists first_resolved_at timestamptz;

create table if not exists survey_invites (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references surveys(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  token text not null unique,
  -- The conversation this invite follows. Built from the end customer's
  -- phone number like every session id: never sent as it is, and the number
  -- only in the Excel report, to that customer (utils/analyticsReport.js).
  session_id text not null default '',
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  responded_at timestamptz,
  response_id uuid references survey_responses(id) on delete set null
);
create index if not exists idx_survey_invites_survey on survey_invites(survey_id, created_at desc);

create table if not exists survey_views (
  survey_id uuid not null references surveys(id) on delete cascade,
  day date not null,
  views int not null default 0,
  primary key (survey_id, day)
);

alter table csat_responses add column if not exists survey_response_id uuid
  references survey_responses(id) on delete cascade;
create unique index if not exists idx_csat_survey_response
  on csat_responses(survey_response_id) where survey_response_id is not null;

-- VantriqAI's own survey, made once by npm run seed-internal so a new install
-- has a live one to open and share. The moment it was made is kept here, so
-- pausing, renaming or deleting it is final: a later deploy never brings it
-- back. See ensureOwnSurvey in src/utils/surveys.js.
alter table settings add column if not exists own_survey_at timestamptz;

-- v9.14.1 — the same, for the after-chat survey the WhatsApp agent's flow in
-- n8n sends ("After a WhatsApp chat", /s/vantriqai-chat). Made once.
alter table settings add column if not exists own_chat_survey_at timestamptz;

-- =====================================================================
-- v9.15 — Surveys are an add-on, switched on per client by an admin
--
-- Customer-satisfaction surveys are a service VantriqAI sells, not something
-- every account has. Off by default, like API access: an admin turns them on
-- for one client at a time (PATCH /api/clients/:id/surveys, admin only). Until
-- then the client's portal has no Surveys tab, nobody can make a survey for
-- them, and their agents' after-chat invites are refused. Turning it back off
-- pauses every survey they have at once — answers already given are kept.
--
-- The column is added with the one account switched on that already relies
-- on it: VantriqAI's own, whose WhatsApp agent sends the after-chat survey.
-- That happens once, when the column is created; after that the switch is
-- only ever moved by an admin.
-- =====================================================================
alter table clients add column if not exists surveys_enabled_at timestamptz;
alter table clients add column if not exists surveys_enabled_by text not null default '';
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_name = 'clients' and column_name = 'surveys_enabled') then
    alter table clients add column surveys_enabled boolean not null default false;
    update clients set surveys_enabled = true, surveys_enabled_at = now(), surveys_enabled_by = 'VantriqAI (own account)'
     where is_internal;
  end if;
end $$;

-- v9.15 — The VantriqAI app in the Play Store. The Android app opens the
-- customer portal full screen (a Trusted Web Activity), which Android only
-- allows once portal.vantriqai.com vouches for the app at
-- /.well-known/assetlinks.json. That file is built from these two settings:
-- the app's package name, and the SHA-256 fingerprint(s) of the key(s) Google
-- Play signs it with (Play Console → Test and release → App integrity). Set
-- them in CRM → Settings → The VantriqAI app. See deploy/crm/ANDROID-APP.md.
alter table settings add column if not exists android_package text not null default 'com.vantriqai.app';
alter table settings add column if not exists android_sha256 text not null default '';

-- =====================================================================
-- v9.17 — Customers: who each business's customers are.
--
-- Activity (conversations, messages, first and last contact) is always
-- worked out from usage_events, so it can never drift. What usage cannot
-- say — a name, an email, the city, gender and age group, tags and notes —
-- lives here, one row per customer of a client, keyed like analytics keys a
-- contact: the WhatsApp number (session id without its date), or a web
-- visitor's id. Rows appear the first time anything is known about someone.
--
-- Where it comes from: the WhatsApp profile name the agent passes with each
-- message, a survey the customer answered (their own details, and the gender
-- / city / age questions), and edits by staff in the CRM or by the business
-- in its portal. Automatic sources only ever fill a blank; a person's edit
-- always wins and is recorded with who made it.
-- =====================================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  contact_key text not null,
  name text not null default '',
  phone text not null default '',
  email text not null default '',
  city text not null default '',
  gender text not null default '',
  age_band text not null default '',
  company text not null default '',
  tags text[] not null default '{}',
  notes text not null default '',
  do_not_contact boolean not null default false,
  name_source text not null default '',
  edited_by text not null default '',
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, contact_key)
);
create index if not exists idx_contacts_client on contacts(client_id, updated_at desc);
drop trigger if exists trg_contacts_updated on contacts;
create trigger trg_contacts_updated before update on contacts
  for each row execute function touch_updated_at();

-- Echo's "about you" questions (a question marked profile: gender, city or
-- age): the answer in words, kept on the response so results can be broken
-- down by them without re-reading every answer.
alter table survey_responses add column if not exists gender text not null default '';
alter table survey_responses add column if not exists city text not null default '';
alter table survey_responses add column if not exists age_band text not null default '';

-- Which agent a transcript line came through, when it was logged against an
-- agent's number rather than a client's, so a customer's own customers'
-- conversations stay theirs and out of VantriqAI's sales view.
alter table conversation_messages add column if not exists agent_id uuid references client_agents(id) on delete set null;
create index if not exists idx_usage_client_session on usage_events(client_id, session_id);

-- v9.19 — the client's industry, as the key of the Echo survey template that
-- fits them best (restaurant, pharmacy, …) or '' when nobody has said. It
-- puts their industry's templates first in the Echo library (CRM and portal),
-- and it is what the starter survey is made from when an admin switches
-- Vantriq Echo on. Set by staff on the client's page or by the client in
-- their portal's template library.
alter table clients add column if not exists industry text not null default '';

-- =====================================================================
-- v9.20 — PRODUCTS & PRICING, COSTED AT TODAY'S PRICES
--
-- The package ladder's prices are fixed by the business model and stay
-- locked. What moves is what it costs us to serve them: model prices, the
-- exchange rate, how many messages a conversation takes, how many hours a
-- client needs. Until now one number stood for all of that —
-- delivery_cost_full, typed in once from the August 2026 model — and it
-- had gone stale: that model costed Gemini 3 Flash at Gemini 1.5 Flash's
-- old price, and the live agents run on GPT-4o mini anyway.
--
-- So the cost side becomes a model the CRM computes (src/utils/
-- costingEngine.js, behind the admin-only /api/costing) from inputs an
-- admin can see and change:
--
--   products.*          each package's cost profile — the context its
--                       agent reads per turn, the share of turns escalated
--                       to the premium model, management and build hours,
--                       how much of that is founder time, the usage a
--                       client of that size typically has. NULL means "the
--                       business model's value for a package of this name".
--   settings.costing    the rate card and the assumptions (exchange rate,
--                       bulk and premium model, token sizes, labour rates,
--                       infrastructure, the steady-state client mix), as
--                       overrides on the defaults in costingEngine.js.
--
-- delivery_cost_full and ai_model are now written BY the model (on every
-- migrate and every change in Products & Pricing), so Financials and the
-- dashboard read today's cost, not August's.
-- =====================================================================
alter table products add column if not exists context_tokens int;
alter table products add column if not exists premium_share numeric;
alter table products add column if not exists mgmt_hours numeric;
alter table products add column if not exists build_hours numeric;
alter table products add column if not exists founder_share numeric;
alter table products add column if not exists typical_min int;
alter table products add column if not exists typical_max int;
alter table products add column if not exists bulk_model text;
alter table products add column if not exists premium_model text;

alter table settings add column if not exists costing jsonb not null default '{}'::jsonb;

-- The add-ons catalogue: everything sold on top of a package, priced
-- separately so a client is never repriced when the catalogue grows.
--
--   price_basis  fixed     the price below is the price
--                from      a starting price; the scope can raise it
--                included  part of every plan — shown, never charged
--                scope     priced after scoping; setup/monthly are NULL
--
-- est_monthly_cost and est_build_hours are ours, not the client's: what
-- serving the add-on costs, so its margin can be shown to the CEO (v9.21).
-- They are never sent to anyone else, a customer or a document.
create table if not exists catalog_addons (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  family text not null default 'capability'
    check (family in ('capability','solution','insight','deployment')),
  summary text not null default '',
  setup_fee numeric,
  monthly_fee numeric,
  price_basis text not null default 'fixed'
    check (price_basis in ('fixed','from','included','scope')),
  price_note text not null default '',
  availability text not null default '',
  est_monthly_cost numeric not null default 0,
  est_build_hours numeric not null default 0,
  cost_note text not null default '',
  is_new boolean not null default false,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_catalog_addons_updated on catalog_addons;
create trigger trg_catalog_addons_updated before update on catalog_addons
  for each row execute function touch_updated_at();

-- Seeded from the business model (capabilities and the four flagship
-- solutions, at its prices) and the product range on vantriqai.com. Echo and
-- Human Support are new since that model and carry the prices the September
-- 2026 update of it proposes. Inserted once per key: an admin's edit is never
-- overwritten by a later migrate.
insert into catalog_addons
  (key, name, family, summary, setup_fee, monthly_fee, price_basis, price_note, availability,
   est_monthly_cost, est_build_hours, cost_note, is_new, sort_order)
values
  ('voice-understanding', 'Voice understanding', 'capability',
   'Voice notes in Urdu, Punjabi, Sindhi, Pashto, English or a mix — understood, and answered back in natural speech when that suits the customer better.',
   25000, 12000, 'fixed', '', 'Any package', 2500, 6,
   'Transcription and spoken replies, at about 1,500 voice notes a month.', false, 10),
  ('image-recognition', 'Image recognition', 'capability',
   'A photo of a product, a damaged delivery, a prescription, a receipt or a meter reading — identified, and discussed intelligently.',
   20000, 9000, 'fixed', '', 'Any package', 1500, 5,
   'Vision input at about 1,000 images a month.', false, 20),
  ('voice-call-agent', 'Voice call agent', 'capability',
   'A real phone line answered in natural speech: questions handled, appointments booked, details captured, and the call transferred to a person when that is right.',
   60000, 35000, 'fixed', '', 'Any package', 15000, 20,
   'Real-time voice and telephony at about 1,000 call minutes a month; heavier use is priced per minute.', false, 30),
  ('website-chat', 'Website & blog chat', 'capability',
   'The same agent on your website, landing pages and blog — one brain, so the answer on WhatsApp matches the answer on your site.',
   25000, 10000, 'fixed', '', 'Any package', 0, 4,
   'Web conversations count against the package''s own allowance, so they add no model cost of their own.', false, 40),
  ('lead-generation', 'AI lead generation', 'solution',
   'Lead captured, enriched, qualified and scored, written to your CRM, followed up with personalised outreach — and your salesperson alerted the moment a high-value lead appears.',
   90000, 45000, 'fixed', '', 'Any package', 4000, 30, 'Enrichment and model calls.', false, 110),
  ('support-after-sales', 'AI support & after-sales', 'solution',
   'Understands the issue, searches your documentation, looks up the order, raises the ticket and escalates — and at the top tier performs approved actions such as updating an address or logging a warranty claim.',
   45000, 22000, 'from', 'From', 'Any package', 2500, 16, 'Model calls and ticketing.', false, 120),
  ('sales-assistant', 'AI sales assistant', 'solution',
   'Researches the account, scores the opportunity, drafts follow-ups, flags stalled deals and hands your salesperson a pre-meeting brief: pain points, past objections, decision maker, recommended approach.',
   95000, 48000, 'fixed', '', 'Any package', 4000, 32, 'Research and model calls.', false, 130),
  ('document-processing', 'AI document processing', 'solution',
   'Invoices, contracts, purchase orders, receipts, CVs and forms — extracted, validated, pushed into your system of record and routed to the right department. Nobody retypes anything.',
   85000, 40000, 'fixed', '', 'Any package', 5000, 28, 'Document parsing and model calls.', false, 140),
  ('email-automation', 'Email automation', 'solution',
   'Inbound email read, sorted and answered or routed to the right person; follow-ups drafted for approval.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 150),
  ('recruitment', 'Recruitment', 'solution',
   'CVs screened against the role, candidates shortlisted and interviews booked — with every decision left to your team.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 160),
  ('marketing-content', 'Marketing content', 'solution',
   'Posts, captions and campaign copy drafted in your brand voice, ready for your approval.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 170),
  ('social-media', 'Social media management', 'solution',
   'Comments and messages across your pages triaged, replies drafted, and posts scheduled.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 180),
  ('reporting', 'Reporting', 'solution',
   'Weekly and monthly reports assembled from your own systems and sent in plain language.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 190),
  ('finance-operations', 'Finance operations', 'solution',
   'Invoices matched, payments chased and reconciliations prepared for your accountant to review.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 200),
  ('ecommerce-operations', 'E-commerce operations', 'solution',
   'Orders, returns, stock alerts and abandoned carts handled end to end.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 210),
  ('appointment-booking', 'Appointment booking', 'solution',
   'Scheduling across branches, staff and rooms, with reminders, reschedules and no-show follow-up.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 220),
  ('knowledge-assistant', 'Internal knowledge assistant', 'solution',
   'A private assistant for your own staff, answering from your policies, manuals and past cases.',
   null, null, 'scope', 'Typically PKR 35,000–110,000 setup and 16,000–55,000 a month', 'Any package', 0, 0, '', false, 230),
  ('pulse', 'Vantriq Pulse', 'insight',
   'Live analytics on every conversation: leads made and closed, time to close, busiest hours, satisfaction and what the AI resolved on its own — with an Excel report of all of it.',
   0, 0, 'included', '', 'Every plan', 0, 0, '', true, 300),
  ('customers', 'Customer directory', 'insight',
   'Who your customers are — name, number, city — with every conversation and what they said, kept up to date by the agent itself.',
   0, 0, 'included', '', 'Every plan', 0, 0, '', true, 310),
  ('portal-app', 'Client portal & Android app', 'insight',
   'Invoices, usage, statements, Pulse, customers and surveys in one sign-in — in the browser, or as the VantriqAI app on Android.',
   0, 0, 'included', '', 'Every plan', 0, 0, '', true, 320),
  ('echo', 'Vantriq Echo', 'insight',
   'Customer-satisfaction surveys in English and Urdu — after a WhatsApp chat, by QR code, link, kiosk or on your site — from 28 ready-made industry templates, with alerts on unhappy customers, follow-ups, and every answer flowing into Pulse.',
   12000, 6000, 'fixed', 'First location included · unlimited surveys and responses', 'Any package', 1500, 2.5,
   'No AI or messaging cost of its own: themes are counted, not generated, and survey messages go out on the client''s own WhatsApp number, billed by their provider. The cost is people: about 2.5 hours to set up (branding, the first survey, QR posters, the after-chat hook, a handover) and about 30 minutes a month of results review and support, plus a share of the server.', true, 330),
  ('echo-location', 'Vantriq Echo — additional location', 'insight',
   'Another branch, outlet or site on Echo: its own survey link, QR poster and kiosk, and its own line in every result, so branches can be compared like for like.',
   2000, 1500, 'fixed', 'Per location, up to 10 · more than 10 priced on scope', 'With Vantriq Echo', 300, 0.5,
   'About 30 minutes to set up each location and a few minutes a month after that.', true, 335),
  ('human-support', 'Human Support', 'insight',
   'AI assist for your team: when a person takes over a chat, it hands them the summary, the customer''s history and a drafted reply in the customer''s language — they decide what is sent.',
   20000, 15000, 'fixed', '', 'Any package', 2000, 6, 'A summary and a drafted reply per handover, at about 1,000 handovers a month.', true, 340),
  ('private-deployment', 'Private deployment', 'deployment',
   'The whole stack self-hosted on your own infrastructure, for strict data-residency requirements. Same agents; nothing leaves your network.',
   null, null, 'scope', 'Priced after an infrastructure review', 'From Enterprise', 0, 0, '', false, 400),
  ('custom-module', 'Custom module', 'deployment',
   'The one thing only your business does, built during onboarding: your name for it, your tone, your rules, and your sign-off before it acts.',
   null, null, 'scope', 'Priced on scope', 'From Scale', 0, 0, '', false, 410)
on conflict (key) do nothing;

-- v9.20.1 — Vantriq Echo, priced on what it costs to run.
--
-- v9.20.0 seeded Echo at a provisional 15,000 setup + 8,000 a month, flat,
-- whatever the size of the business. Echo has no AI or messaging cost of its
-- own — the cost is setup time and a short monthly review, and both grow with
-- the number of locations. So it is now PKR 12,000 + 6,000 a month for the
-- first location (unlimited surveys and responses) and PKR 2,000 + 1,500 a
-- month for each further one, so a single branch pays less than it did while
-- a chain pays in step with what it gets. More than ten locations is priced
-- on scope.
--
-- Once, and only where Echo still carries the provisional figures: a price an
-- admin has already set is theirs, and is never overwritten.
do $$
begin
  if exists (select 1 from applied_migrations where name = 'v9_20_1_echo_pricing') then
    return;
  end if;
  update catalog_addons set
      setup_fee = 12000, monthly_fee = 6000,
      price_note = 'First location included · unlimited surveys and responses',
      est_monthly_cost = 1500, est_build_hours = 2.5,
      summary = 'Customer-satisfaction surveys in English and Urdu — after a WhatsApp chat, by QR code, link, kiosk or on your site — from 28 ready-made industry templates, with alerts on unhappy customers, follow-ups, and every answer flowing into Pulse.',
      cost_note = 'No AI or messaging cost of its own: themes are counted, not generated, and survey messages go out on the client''s own WhatsApp number, billed by their provider. The cost is people: about 2.5 hours to set up (branding, the first survey, QR posters, the after-chat hook, a handover) and about 30 minutes a month of results review and support, plus a share of the server.'
   where key = 'echo' and setup_fee = 15000 and monthly_fee = 8000;
  insert into applied_migrations (name, note)
  values ('v9_20_1_echo_pricing', 'Vantriq Echo: 12,000 + 6,000/mo for the first location, 2,000 + 1,500/mo per further location.');
end $$;

-- v9.20.2 — transcripts that are complete, in order, and honest about
-- replies that never arrived.
--
-- external_id: the channel's own id for the message (a WhatsApp wamid). The
--   same message sent twice — n8n retrying after a timeout, or a history
--   backfill run again — is stored once.
-- delivered: false when the agent wrote a reply but the channel refused it
--   (WhatsApp rejected the token, the 24-hour window had closed, …). The
--   customer's words are still kept, and the customer's page shows the reply
--   as not delivered, so nobody assumes they were answered.
-- delivery_error: what the channel said, for whoever has to fix it.
alter table conversation_messages add column if not exists external_id text;
alter table conversation_messages add column if not exists delivered boolean not null default true;
alter table conversation_messages add column if not exists delivery_error text not null default '';
create unique index if not exists uq_conv_external_id
  on conversation_messages(external_ref, external_id) where external_id is not null;

-- v9.28 — 'facebook' (Messenger) joins the transcript channels, for the
-- Instagram + Messenger agent. Dropped and re-added on every migrate, so a
-- fresh install, whose create table above names the old list, ends the same.
alter table conversation_messages drop constraint if exists conversation_messages_channel_check;
alter table conversation_messages add constraint conversation_messages_channel_check
  check (channel in ('whatsapp','website','instagram','facebook','voice','email'));

-- When the team was last told that an agent's replies are failing, so one
-- outage is one email an hour rather than one per customer message.
create table if not exists delivery_alerts (
  ref text primary key,
  last_sent_at timestamptz not null default now(),
  failures_since integer not null default 0
);

-- v9.21 — the CEO's business documents: the business model, the client pitch
-- deck, the product portfolio. Kept here, in the database, and never in the
-- code repository (which anyone can read). Only the CEO's own signed-in
-- account lists, opens, uploads or deletes them (routes/pricingDocs.js).
-- Every upload is a new row: the newest file of each kind and format is the
-- current one, the rest are its history.
create table if not exists owner_documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'other'
    check (kind in ('business_model','pitch_deck','portfolio','other')),
  title text not null default '',
  filename text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null,
  sha256 text not null,
  content bytea not null,
  note text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now(),
  opened_count integer not null default 0,
  last_opened_at timestamptz
);
create index if not exists idx_owner_documents_kind on owner_documents(kind, uploaded_at desc);

-- v9.22 — the admin API key is no longer a way in on its own.
--
-- Typed into the CRM's "Emergency access" screen, the key only asks for a
-- one-time code, and the code goes to the CEO (PRICING_EMAIL), never to
-- whoever typed the key: the CEO decides whether to read it out. A correct
-- code opens an emergency session of two hours, listed for the CEO under
-- Team → Emergency access and ended from there. The key sent on its own,
-- from anywhere but the server itself, is refused — which signs out every
-- browser that was still holding it.
--
-- Codes and session tokens are stored hashed: nothing in either table opens
-- the CRM if read.
create table if not exists breakglass_challenges (
  id uuid primary key default gen_random_uuid(),
  key_id uuid not null references api_keys(id) on delete cascade,
  code_hash text not null,
  sent_to text not null default '',
  expires_at timestamptz not null,
  attempts integer not null default 0,
  consumed boolean not null default false,
  ip text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_breakglass_challenges_key on breakglass_challenges(key_id, created_at desc);

create table if not exists breakglass_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  key_id uuid not null references api_keys(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip text not null default '',
  user_agent text not null default '',
  ended_at timestamptz,
  ended_by text not null default ''
);
create index if not exists idx_breakglass_sessions_recent on breakglass_sessions(created_at desc);

-- CRM calendar and explicit sales ownership. Additive; existing records retain ownership.
alter table clients add column if not exists assigned_at timestamptz;
alter table clients add column if not exists assigned_by text;
create table if not exists lead_assignment_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  from_rep_id uuid references sales_reps(id),
  to_rep_id uuid references sales_reps(id),
  assigned_by text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_lead_assignment_history on lead_assignment_history(client_id, created_at);
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  channel text not null check (channel in ('manual','website','whatsapp')),
  kind text not null default 'meeting' check (kind in ('meeting','demo','call','follow_up')),
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled','no_show')),
  location text not null default '',
  notes text not null default '',
  external_id text,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(channel, external_id)
);
create index if not exists idx_calendar_events_time on calendar_events(starts_at, ends_at);
create index if not exists idx_calendar_events_client on calendar_events(client_id);
-- v9.28 — the Instagram and Messenger agents book discovery calls too.
alter table calendar_events drop constraint if exists calendar_events_channel_check;
alter table calendar_events add constraint calendar_events_channel_check
  check (channel in ('manual','website','whatsapp','instagram','facebook'));

-- Pulse measurements are separate from usage/billing. Stable event ids make retries idempotent.
create table if not exists pulse_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_id uuid references client_agents(id) on delete set null,
  session_id text not null check (length(session_id) between 1 and 200),
  event_id text not null check (length(event_id) between 1 and 128),
  occurred_at timestamptz not null default now(),
  data jsonb not null,
  created_at timestamptz not null default now(),
  unique(client_id,event_id)
);
create index if not exists idx_pulse_client_time on pulse_events(client_id,occurred_at);

-- Opt-in public website activity: aggregate counters only, no visitor/contact identifiers.
create table if not exists website_activity (
  day date not null,
  region text not null check (region in ('pk','global')),
  section text not null check (section in ('home','products','pricing','industries','contact','how-it-works','resources','privacy','cookies','other')),
  event text not null check (event in ('page_view','chat_open','whatsapp_click','brief_sent')),
  total bigint not null default 0 check (total >= 0),
  primary key (day,region,section,event)
);

-- Approximate network locations, independent of contacts and chat sessions.
-- No IP, coordinates, visitor identifiers, or individual event records.
create table if not exists website_location_activity (
  day date not null,
  region text not null check (region in ('pk','global')),
  section text not null,
  event text not null check (event in ('page_view','chat_open','whatsapp_click','brief_sent')),
  country text not null default '' check (country = '' or country ~ '^[A-Z]{2}$'),
  subdivision text not null default '' check (length(subdivision) <= 16),
  city text not null default '' check (length(city) <= 120),
  total bigint not null default 0 check (total >= 0),
  primary key (day,region,section,event,country,subdivision,city)
);

-- v9.33 — voice notes are costed and billed, not absorbed.
--
-- Every WhatsApp voice note is sent to a speech-to-text model billed per
-- minute of audio. Until now nothing recorded those minutes and no package
-- or add-on priced them, so a client sending voice notes cost us money no
-- invoice recovered.
--
--   1. usage_rates gains a 'voice_minute' metric. A client's rate card can
--      include an allowance of voice minutes and a price for each minute past
--      it, exactly as token rates already work. Having a voice-minute rate is
--      also what switches voice notes on for a client's agents: the
--      service-status check reports voice:true only then.
--   2. Add-ons can carry a metered allowance (meter, included_units,
--      overage_rate), so the catalogue — and every quote built from it — says
--      what the monthly fee includes and what happens past it.
--   3. A transcription-only add-on, "Voice-note transcription", for clients
--      who want voice notes understood and answered in text. "Voice
--      understanding" stays the fuller one, with spoken replies.
--
-- est_monthly_cost on a metered voice add-on now means everything EXCEPT the
-- speech-to-text minutes: the costing engine prices the included minutes at
-- the live speech-to-text rate, so a vendor price change reaches the margin
-- without anybody retyping a cost.
alter table usage_rates drop constraint if exists usage_rates_metric_check;
alter table usage_rates add constraint usage_rates_metric_check
  check (metric in ('session','message','input_token','output_token','automation_run','voice_minute'));

alter table catalog_addons add column if not exists meter text
  check (meter is null or meter in ('voice_minute'));
alter table catalog_addons add column if not exists included_units numeric not null default 0;
alter table catalog_addons add column if not exists overage_rate numeric;

insert into catalog_addons
  (key, name, family, summary, setup_fee, monthly_fee, price_basis, price_note, availability,
   est_monthly_cost, est_build_hours, cost_note, is_new, sort_order, meter, included_units, overage_rate)
values
  ('voice-transcription', 'Voice-note transcription', 'capability',
   'Customers can send WhatsApp voice notes instead of typing — in Urdu, Punjabi, English or a mix. Each one is transcribed and answered in text, and the transcript is kept with the conversation.',
   7500, 3500, 'fixed', 'Includes 500 voice-note minutes a month (about 1,000 thirty-second notes) · PKR 5 per minute after',
   'Any package', 250, 1.5,
   'Speech-to-text (gpt-4o-transcribe, about $0.006 a minute) is priced live by the costing engine on the included minutes. This figure is the rest: a few minutes a month of checking transcripts in the client''s languages, and a share of the server. Setup is switching voice on for the client''s number and testing it in their languages.',
   true, 15, 'voice_minute', 500, 5)
on conflict (key) do nothing;

do $$
begin
  if exists (select 1 from applied_migrations where name = 'v9_33_voice_metering') then
    return;
  end if;
  -- Voice understanding: about 1,500 voice notes a month is about 750
  -- minutes. Its old cost of 2,500 covered transcription and spoken replies
  -- together; transcription is now priced live, so the stored cost keeps only
  -- the spoken replies. Only where an admin has not already changed it.
  update catalog_addons set
      meter = 'voice_minute', included_units = 750, overage_rate = 5,
      price_note = 'Includes 750 voice-note minutes a month (about 1,500 notes) · PKR 5 per minute after',
      est_monthly_cost = 1250,
      cost_note = 'Spoken replies at about 1,500 voice notes a month. Speech-to-text on the included 750 minutes is priced live by the costing engine.'
   where key = 'voice-understanding' and est_monthly_cost = 2500 and meter is null;
  insert into applied_migrations (name, note)
  values ('v9_33_voice_metering', 'Voice-note minutes metered on usage_events; voice_minute rate metric; Voice-note transcription add-on; Voice understanding carries a 750-minute allowance.');
end $$;

-- Our own account records what OpenAI charges us, so its voice notes are
-- priced at gpt-4o-transcribe's $0.006 a minute (it bills in USD). Added
-- once; an admin's later change to the rate is never overwritten.
insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label)
select c.id, 'voice_minute', 0.006, 0, 1, 'Voice-note transcription minutes (gpt-4o-transcribe)'
  from clients c
 where c.is_internal
   and not exists (select 1 from usage_rates r
                    where r.client_id = c.id and r.metric = 'voice_minute' and r.effective_to is null);

-- v9.33 — our own account's token rates follow the agents to gpt-5-mini
-- ($0.25 / $2.00 per million). The agents moved off gpt-4o-mini on 7 Oct
-- 2026 and now report OpenAI's real counts, so pricing those counts at
-- gpt-4o-mini's rates would understate what OpenAI bills us. Once, and only
-- for the rates the CRM itself put there: a rate an admin changed is theirs.
do $$
begin
  if exists (select 1 from applied_migrations where name = 'v9_33_internal_gpt5mini') then
    return;
  end if;
  update usage_rates r set effective_to = current_date - 1
    from clients c
   where c.id = r.client_id and c.is_internal and r.effective_to is null
     and r.effective_from < current_date
     and ((r.metric = 'input_token' and r.unit_rate = 0.15) or (r.metric = 'output_token' and r.unit_rate = 0.60))
     and r.label like '%gpt-4o-mini%';
  insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label, effective_from)
  select c.id, v.metric, v.rate, 0, 1000000, v.label, current_date
    from clients c,
         (values ('input_token', 0.25, 'Model input tokens (gpt-5-mini)'),
                 ('output_token', 2.00, 'Model output tokens (gpt-5-mini)')) as v(metric, rate, label)
   where c.is_internal
     and not exists (select 1 from usage_rates r
                      where r.client_id = c.id and r.metric = v.metric and r.effective_to is null);
  insert into applied_migrations (name, note)
  values ('v9_33_internal_gpt5mini', 'Internal account token rates moved from gpt-4o-mini to gpt-5-mini.');
end $$;
