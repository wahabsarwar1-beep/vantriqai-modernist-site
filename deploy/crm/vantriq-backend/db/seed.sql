-- =====================================================================
-- Optional seed data — six-tier product ladder + starter vendor list.
-- Run after schema.sql. Safe to re-run (checks for existing rows by name).
-- =====================================================================

insert into products (name, target_tier, setup_fee, retainer, msgs_per_session, quota, overage_rate, delivery_cost_full, automation, data_layer, ai_model, channels, sort_order)
select * from (values
  ('Starter','Small business',30000,20000,13,220,110,12089,'n8n Cloud','Airtable','DeepSeek','WhatsApp only',1),
  ('Growth','Medium corporate',60000,55000,13,460,145,33249,'n8n Cloud','Airtable','GPT-4o','WhatsApp + CRM',2),
  ('Scale','Multi-location business',90000,70000,6,1350,65,45090,'n8n Cloud','Airtable','GPT-4o','WhatsApp + CRM + Web',3),
  ('Pro','Established corporate',130000,110000,7,1400,100,71540,'n8n Server','Airtable + Postgres','Claude Sonnet','Multi-channel',4),
  ('Enterprise','Large enterprise',150000,150000,8,1650,115,96360,'n8n Server','Airtable + Postgres + Pinecone','Claude Sonnet','Multi-channel + on-prem',5),
  ('Enterprise+','Highest volume, custom',200000,200000,10,1800,145,131400,'n8n Server (dedicated)','Full RAG stack','Claude Sonnet + Llama 3','Custom SLA',6)
) as v(name,target_tier,setup_fee,retainer,msgs_per_session,quota,overage_rate,delivery_cost_full,automation,data_layer,ai_model,channels,sort_order)
where not exists (select 1 from products p where p.name = v.name);

insert into vendors (name, category, tiers, cost_min, cost_max, status)
select * from (values
  ('n8n Cloud','Automation','Starter–Scale',7000,17000,'Active'),
  ('n8n Server (self-hosted)','Automation','Pro–Enterprise+',1400,8000,'Active'),
  ('Airtable','Data layer','All tiers',5600,25000,'Active'),
  ('Supabase (Postgres)','Data layer','Pro+',0,7000,'Active'),
  ('Pinecone','Vector search / RAG','Enterprise+',0,19500,'Active'),
  ('WhatsApp BSP','Messaging','All clients — client-billed pass-through',0,0,'Client-billed — not on Vantriq books')
) as v(name,category,tiers,cost_min,cost_max,status)
where not exists (select 1 from vendors vv where vv.name = v.name);

-- Enterprise+ is the only customisable tier; the rest are locked to the model.
update products set is_standard = (name <> 'Enterprise+');
