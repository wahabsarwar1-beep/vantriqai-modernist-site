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
  sum(output_tokens) as output_tokens
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
