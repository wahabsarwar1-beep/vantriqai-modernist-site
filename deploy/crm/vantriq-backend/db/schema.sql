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

-- Where new-lead notifications go. Comma-separated; blank falls back to
-- MAIL_FROM so a fresh install still reaches somebody.
alter table settings add column if not exists lead_notify_emails text not null default '';
