// Verify domestic pricing and reject USD orders against an isolated database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const express = require('express');
const pg = new PGlite();
require.cache[require.resolve('../src/db')] = { exports: { query: (q, p) => pg.query(q, p) } };

(async () => {
  await pg.exec(`
    create table clients(id uuid primary key, currency text);
    create table applied_migrations(name text primary key, note text);
    create table catalog_addons(key text primary key, active boolean, name text, summary text,
      availability text, price_basis text, setup_fee numeric, monthly_fee numeric, meter text,
      included_units numeric, overage_rate numeric, setup_fee_usd numeric, monthly_fee_usd numeric,
      overage_rate_usd numeric, price_note text, cost_note text, family text, est_monthly_cost numeric, est_build_hours numeric, is_new boolean, sort_order int);
    create table client_bundles(id uuid primary key default gen_random_uuid(), client_id uuid,
      agent_id uuid, product_id uuid, name text, qty numeric, unit_setup_fee numeric, unit_retainer numeric,
      unit_quota numeric, overage_rate numeric, recurring boolean, status text, starts_on date,
      ends_on date, added_by text, note text, addon_key text);
    create table usage_rates(client_id uuid, metric text, unit_rate numeric, included_units numeric,
      agent_id uuid, product_id uuid, unit_rate_usd numeric, unit_size numeric, label text, effective_from date, effective_to date, bundle_id uuid);
    create table settings(id integer primary key, currency text);
    insert into settings values(1,'PKR');
    create table usage_events(client_id uuid, session_id text, channel text, messages_count numeric default 0, input_tokens numeric default 0, output_tokens numeric default 0, voice_seconds numeric default 0, call_seconds numeric default 0, occurred_at timestamptz default now());
    insert into clients values ('00000000-0000-0000-0000-000000000001','PKR'),
      ('00000000-0000-0000-0000-000000000002','USD');
    insert into catalog_addons(key,active,name,price_basis,setup_fee,monthly_fee,meter,included_units,
      overage_rate,setup_fee_usd,monthly_fee_usd,overage_rate_usd)
      values ('voice-call-agent',true,'Voice call agent','fixed',60000,20000,'call_minute',0,40,900,149,.15);
  `);
  const schema = fs.readFileSync(require('node:path').join(__dirname, '../db/schema.sql'), 'utf8');
  const migration = schema.slice(schema.indexOf('-- v9.35:'));
  await pg.exec(migration);
  await pg.exec(migration);
  const a = (await pg.query("select * from catalog_addons where key='voice-call-agent'")).rows[0];
  assert.equal(a.setup_fee_usd, null);
  assert.equal(a.monthly_fee_usd, null);
  assert.equal(a.overage_rate_usd, null);
  assert.equal(a.availability, 'Pakistan only, incoming calls');
  const app = express(); app.use(express.json());
  app.use('/subscriptions', require('../src/routes/subscriptions'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const post = async (id, extra = {}) => {
      const r = await fetch(`http://127.0.0.1:${server.address().port}/subscriptions/bundles`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: id, addon_key: 'relay-starter', ...extra }),
      }); return { status: r.status, body: await r.json() };
    };
    for (const overrides of ['relay-starter','relay-business','relay-scale'].flatMap(addon_key=>[{addon_key},{addon_key,unit_setup_fee:1,unit_retainer:1,meter_rate:1}])) {
      const r = await post('00000000-0000-0000-0000-000000000002', overrides);
      assert.equal(r.status, 400); assert.match(r.body.error, /Pakistan only/);
    }
    assert.equal((await pg.query('select * from client_bundles')).rows.length, 0);
    assert.equal((await pg.query('select * from usage_rates')).rows.length, 0);
    for(const [key, fee, minutes] of [['relay-starter',40000,500],['relay-business',60000,1000],['relay-scale',100000,2000]]) {
    const r = await post('00000000-0000-0000-0000-000000000001', {addon_key:key});
    assert.equal(r.status, 201);
    assert.equal(Number(r.body.unit_setup_fee), 60000);
    assert.equal(Number(r.body.unit_retainer), fee);
    const rate = (await pg.query('select * from usage_rates where bundle_id=$1',[r.body.id])).rows[0];
    assert.equal(Number(rate.unit_rate), 40);
    assert.equal(Number(rate.included_units), minutes);
    await pg.query('delete from usage_events');
    await pg.query("insert into usage_events(client_id,session_id,channel,call_seconds) values($1,'call','voice',$2)",['00000000-0000-0000-0000-000000000001',minutes*60]);
    const meter = require('../src/utils/subscriptions').meteredCharges;
    const client={id:'00000000-0000-0000-0000-000000000001',currency:'PKR'};
    assert.equal((await meter(client,new Date().toISOString().slice(0,7))).length,0);
    await pg.query('update usage_events set call_seconds=call_seconds+600');
    const charges=await meter(client,new Date().toISOString().slice(0,7));assert.equal(charges[0].amount,400);
    const duplicate=await post(client.id,{addon_key:key});assert.equal(duplicate.status,400);assert.match(duplicate.body.error,/already has/);
    await pg.query('delete from usage_rates');
    await pg.query('delete from client_bundles');
    }
    const multi = await post('00000000-0000-0000-0000-000000000001',{qty:2}); assert.equal(multi.status,400);
    console.log('PASS: repeatable migration, domestic prices, USD rejection and no rejected-order billing records');
  } finally { await new Promise(resolve => server.close(resolve)); await pg.close(); }
})().catch(e => { console.error(e); process.exit(1); });
