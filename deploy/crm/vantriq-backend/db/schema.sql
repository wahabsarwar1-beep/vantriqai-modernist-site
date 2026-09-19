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
