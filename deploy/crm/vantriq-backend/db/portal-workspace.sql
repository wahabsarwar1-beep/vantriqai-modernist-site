-- Customer workspaces: a business's prospects, distinct from Vantriq's clients.
create table if not exists portal_leads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  crm_client_id uuid unique references clients(id) on delete cascade,
  contact_key text not null,
  name text not null default '', company text not null default '',
  email text not null default '', phone text not null default '',
  source text not null default 'manual',
  status text not null default 'new' check(status in ('new','contacted','qualified','proposal','negotiation','won','lost')),
  assigned_to text not null default '', notes text not null default '',
  next_action text not null default '', next_action_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(client_id,contact_key), unique(client_id,id)
);
create index if not exists idx_portal_leads_client on portal_leads(client_id,updated_at desc);
alter table calendar_events add column if not exists portal_lead_id uuid;
-- Composite FK also enforces the tenant boundary for staff/webhook writes.
do $$ begin
  if not exists(select 1 from pg_constraint where conname='calendar_events_portal_lead_fk') then
    alter table calendar_events add constraint calendar_events_portal_lead_fk
      foreign key(client_id,portal_lead_id) references portal_leads(client_id,id) on delete cascade;
  end if;
end $$;
alter table calendar_events drop constraint if exists calendar_events_status_check;
alter table calendar_events add constraint calendar_events_status_check
  check(status in ('scheduled','confirmed','completed','cancelled','no_show'));
create table if not exists portal_lead_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references portal_leads(id) on delete cascade,
  event_id uuid references calendar_events(id) on delete set null,
  action text not null, actor text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists idx_portal_lead_history on portal_lead_history(lead_id,created_at desc);

