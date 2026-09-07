-- =====================================================================
-- Seed data — the six-tier ladder exactly as the Business Model
-- (VantriqAI Business Model 2, August 2026) sets it, plus the cost base
-- behind it. Run after schema.sql. Safe to re-run: inserts only where a
-- product or vendor of that name does not already exist.
--
-- To move an EXISTING database onto these figures, the insert below is
-- not enough — it skips rows that are already there. schema.sql carries a
-- one-time realignment (v5) that updates them in place.
-- =====================================================================

-- Notes on the columns that are not money:
--   msgs_per_session   the cost model's message budget per session, 12–18 by tier.
--                      Messages inside a session are never billed separately.
--   quota              included sessions per month. Deliberately 2.7–5x what the
--                      segment typically uses, so clients never ration conversations.
--   overage_rate       PKR per session past the allowance — roughly 3x delivery cost.
--   delivery_cost_full what the AI costs us if the client used the whole allowance.
--   ai_model           bulk model, and the share of turns escalated to a premium one.
--   channels           web chat and voice are priced add-ons, not part of a tier.
insert into products (name, target_tier, setup_fee, retainer, msgs_per_session, quota, overage_rate, delivery_cost_full, automation, data_layer, ai_model, channels, sort_order)
select * from (values
  ('Starter',     'Typically 300–600 sessions/mo',    25000., 20000., 12., 1500, 2., 672.,   'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 12% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram', 1),
  ('Growth',      'Typically 800–1,500 sessions/mo',  55000., 35000., 14., 4000, 2., 3120.,  'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 15% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram', 2),
  ('Scale',       'Typically 2,000–4,000 sessions/mo',70000., 53000., 14., 9000, 3., 8072.,  'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 16% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram', 3),
  ('Pro',         'Typically 4,000–8,000 sessions/mo',100000.,90000., 16., 15000,4., 18077., 'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 18% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram', 4),
  ('Enterprise',  'Typically 8,000–15,000 sessions/mo',135000.,137000.,16.,25000,4., 33674., 'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 20% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram; on-premise option', 5),
  ('Enterprise+', 'Typically 15,000+ sessions/mo',    190000.,257000.,18.,40000,5., 69391., 'n8n Community, self-hosted', 'Vantriq CRM (Postgres)', 'Gemini 3 Flash; 22% escalated to GPT-4o-mini / Sonnet', 'WhatsApp + Instagram; custom SLA', 6)
) as v(name,target_tier,setup_fee,retainer,msgs_per_session,quota,overage_rate,delivery_cost_full,automation,data_layer,ai_model,channels,sort_order)
where not exists (select 1 from products p where p.name = v.name);

-- The whole cost base. Self-hosting n8n and running our own Postgres means
-- infrastructure is one virtual server for the entire company; the AI spend is
-- per conversation and is carried in each product's delivery_cost_full, so it
-- is not repeated here as a fixed monthly cost.
insert into vendors (name, category, tiers, cost_min, cost_max, status)
select * from (values
  ('VPS (n8n + Vantriq CRM)','Infrastructure','Whole business',1668.,1668.,'Active'),
  ('AI models (Gemini / OpenAI / Anthropic)','AI','All tiers',0.,0.,'Per conversation — counted in each package''s delivery cost'),
  ('WhatsApp BSP','Messaging','All clients',0.,0.,'Client-registered and client-billed — not on Vantriq books')
) as v(name,category,tiers,cost_min,cost_max,status)
where not exists (select 1 from vendors vv where vv.name = v.name);

-- Enterprise+ is the only customisable tier; the rest are locked to the model.
update products set is_standard = (name <> 'Enterprise+');
