/**
 * Products & Pricing, costed at today's prices (v9.20).
 *
 * Two halves. The engine (src/utils/costingEngine.js) must reproduce the business
 * model's own structure — its labour figures to the rupee, its steady-state
 * revenue, labour and infrastructure — so that the only thing that moved is
 * what the business model got wrong or what changed since: model prices and
 * the exchange rate. And the API must keep margins where they belong: an
 * admin sees them, staff never do.
 *
 * Needs Postgres (DATABASE_URL in .env) and the API on 8099 with an admin key
 * in /tmp/adminkey.
 *
 *   node test/costing.test.js
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const V = require('../src/utils/costingEngine');
const C = require('../src/utils/costing');
const db = require('../src/db');

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const A = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, body, headers = A) => fetch(B + p, {
  method, headers, body: body === undefined ? undefined : JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// The ladder exactly as the business model sets it.
const LADDER = [
  ['Starter', 25000, 20000, 12, 1500, 2], ['Growth', 55000, 35000, 14, 4000, 2], ['Scale', 70000, 53000, 14, 9000, 3],
  ['Pro', 100000, 90000, 16, 15000, 4], ['Enterprise', 135000, 137000, 16, 25000, 4], ['Enterprise+', 190000, 257000, 18, 40000, 5],
].map(([name, setup_fee, retainer, msgs_per_session, quota, overage_rate]) =>
  ({ name, setup_fee, retainer, msgs_per_session, quota, overage_rate }));

(async () => {
  console.log('\n== the engine reproduces the business model ==');
  const m = V.model(LADDER, {}, { utilization: 0.7 }, '2026-09-29');
  const by = Object.fromEntries(m.packages.map((r) => [r.name, r]));

  const mgmt = [3000, 5100, 7200, 10125, 12600, 18900];
  const build = [12000, 25500, 38400, 54000, 75600, 105000];
  ok(m.packages.every((r, i) => r.mgmt_labour === mgmt[i]), 'management labour matches the model, tier by tier',
    m.packages.map((r) => r.mgmt_labour).join(','));
  ok(m.packages.every((r, i) => r.build_labour === build[i]), 'build labour matches the model, tier by tier',
    m.packages.map((r) => r.build_labour).join(','));
  ok(by.Starter.setup_margin === 0.52 && by.Growth.setup_margin === 0.536, 'setup margins match (52.0%, 53.6%)',
    `${by.Starter.setup_margin}, ${by.Growth.setup_margin}`);

  const ss = m.steady_state;
  ok(ss.clients === 18, 'steady state is the model\'s eighteen clients', ss.clients);
  ok(ss.revenue === 10697000, 'steady-state revenue PKR 10,697,000', ss.revenue);
  ok(ss.labour === 1760400, 'steady-state labour PKR 1,760,400', ss.labour);
  ok(ss.infra === 20016, 'infrastructure PKR 20,016 a year', ss.infra);
  ok(ss.mgmt_hours_month === 42, '42 management hours a month', ss.mgmt_hours_month);

  console.log('\n== at today\'s prices ==');
  // Starter: 6 turns; input = 6*1200 + 6*30 + 110*15 = 9,030; output = 480.
  ok(by.Starter.tokens.input === 9030 && by.Starter.tokens.output === 480, 'Starter session is 9,030 tokens in, 480 out',
    JSON.stringify(by.Starter.tokens));
  const usd = 0.98 * (9030 * 0.15 + 480 * 0.60) / 1e6 + 0.02 * (9030 * 2 + 480 * 10) / 1e6;
  ok(Math.abs(by.Starter.cost_per_session - usd * 277.05) < 0.0001, 'Starter cost per session is the blend at USD/PKR 277.05',
    `${by.Starter.cost_per_session} vs ${usd * 277.05}`);
  ok(by.Starter.margin_full === 0.807 && by['Enterprise+'].margin_full === 0.483, 'margin at full use 80.7% (Starter) to 48.3% (Enterprise+)',
    `${by.Starter.margin_full} … ${by['Enterprise+'].margin_full}`);
  ok(ss.margin === 0.714, 'steady-state contribution 71.4%', ss.margin);
  ok(m.flags.some((f) => /Enterprise\+: overage covers only 1\.8/.test(f.text)), 'flags Enterprise+ overage at 1.8x cost');

  const gem = m.what_if.find((w) => w.bulk_model === 'gemini-3-flash');
  ok(gem && gem.packages.find((p) => p.name === 'Enterprise+').margin_full < 0,
    'the what-if shows Gemini 3 Flash at today\'s price would sink Enterprise+', gem && JSON.stringify(gem.packages.slice(-1)));
  const nano = V.model(LADDER, { assumptions: { bulk_model: 'gpt-5-nano' } }, { utilization: 0.7 });
  ok(nano.packages[0].cost_per_session < by.Starter.cost_per_session, 'a cheaper bulk model lowers the cost per session');

  console.log('\n== validation ==');
  const bad = (fn, re, label) => { try { fn(); ok(false, label, 'accepted'); } catch (e) { ok(e.status === 400 && re.test(e.message), label, e.message); } };
  bad(() => C.applyChange({}, { assumptions: { fx_usd_pkr: 5 } }), /exchange rate/, 'an absurd exchange rate is refused');
  bad(() => C.applyChange({}, { assumptions: { bulk_model: 'gpt-99' } }), /not on the rate card/, 'an unknown bulk model is refused');
  bad(() => C.applyChange({}, { rates: { 'gpt-4o-mini': { input: -1 } } }), /input price/, 'a negative price is refused');
  bad(() => C.applyChange({}, { rates: { 'brand-new': { input: 1 } } }), /both an input and an output/, 'a new model needs both prices');
  const next = C.applyChange({}, { rates: { 'gpt-4o-mini': { input: 0.2 } } });
  ok(next.rates['gpt-4o-mini'].input === 0.2 && /^\d{4}-\d{2}-\d{2}$/.test(next.assumptions.as_of),
    'a rate change is stored and dates the model as re-checked', JSON.stringify(next));

  console.log('\n== the API ==');
  let r = await call('GET', '/api/costing');
  ok(r.status === 200 && r.body.packages.length >= 6 && r.body.steady_state && r.body.addons.length >= 20,
    'an admin gets the whole model, add-ons included', r.status);
  const starter = r.body.packages.find((p) => p.name === 'Starter');

  r = await call('PUT', '/api/costing', { assumptions: { fx_usd_pkr: 300 } });
  const moved = r.body.packages.find((p) => p.name === 'Starter');
  ok(r.status === 200 && moved.cost_per_session > starter.cost_per_session, 'a new exchange rate re-costs every package', r.status);
  const { rows: prod } = await db.query(`select delivery_cost_full, ai_model from products where id = $1`, [starter.id]);
  ok(Number(prod[0].delivery_cost_full) === moved.ai_full, 'and writes the delivery cost Financials reads',
    `${prod[0].delivery_cost_full} vs ${moved.ai_full}`);
  ok(/GPT-4o mini; 2% escalated to Claude Sonnet 5\.5/.test(prod[0].ai_model), 'the routing line on the package is the model\'s', prod[0].ai_model);

  r = await call('PATCH', `/api/costing/packages/${starter.id}`, { premium_share: 1.5 });
  ok(r.status === 400, 'a premium share over 100% is refused', r.status);
  r = await call('PATCH', `/api/costing/packages/${starter.id}`, { mgmt_hours: 2 });
  ok(r.status === 200 && r.body.packages.find((p) => p.name === 'Starter').mgmt_labour === 6000,
    'a package\'s cost profile can be changed (2 h a month = PKR 6,000)', r.status);

  r = await call('POST', '/api/costing/reset', { scope: 'all' });
  const back = r.body.packages.find((p) => p.name === 'Starter');
  ok(r.status === 200 && back.cost_per_session === starter.cost_per_session && back.mgmt_labour === 3000,
    'reset puts the business model\'s rates and profiles back', JSON.stringify({ c: back.cost_per_session, l: back.mgmt_labour }));

  r = await call('POST', '/api/addons', { name: 'Test add-on', family: 'capability', price_basis: 'fixed', setup_fee: 1000 });
  ok(r.status === 400, 'a priced add-on needs both fees', r.status);
  r = await call('POST', '/api/addons', { name: 'Costing test add-on', family: 'capability', price_basis: 'fixed',
    setup_fee: 10000, monthly_fee: 5000, est_monthly_cost: 1000 });
  ok(r.status === 201 && r.body.key === 'costing-test-add-on', 'an admin can add to the catalogue', r.status);
  const addonId = r.body && r.body.id;

  console.log('\n== staff never see margins ==');
  const email = `costing-test-${crypto.randomBytes(3).toString('hex')}@vantriqai.com`;
  const { rows: u } = await db.query(
    `insert into internal_users (email, name, password_hash, role, must_change_password)
     values ($1, 'Costing Test', 'x', 'staff', false) returning id`, [email]);
  const token = crypto.randomBytes(24).toString('hex');
  await db.query(`insert into staff_sessions (token, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [token, u[0].id]);
  const S = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  try {
    r = await call('GET', '/api/costing', undefined, S);
    ok(r.status === 403, 'staff cannot read the costing model', r.status);
    r = await call('PUT', '/api/costing', { assumptions: { fx_usd_pkr: 280 } }, S);
    ok(r.status === 403, 'staff cannot change it', r.status);
    r = await call('GET', '/api/addons', undefined, S);
    ok(r.status === 200 && r.body.length >= 20, 'staff read the add-ons catalogue (the quote builder needs it)', r.status);
    ok(r.body.every((a) => a.est_monthly_cost === undefined && a.monthly_margin === undefined && a.cost_note === undefined),
      'without our cost or margin', JSON.stringify(r.body[0]));
    r = await call('POST', '/api/addons', { name: 'Nope', price_basis: 'included' }, S);
    ok(r.status === 403, 'staff cannot change the catalogue', r.status);
    r = await call('GET', '/api/products', undefined, S);
    ok(r.body.every((p) => p.delivery_cost_full === undefined && p.context_tokens === undefined && p.premium_share === undefined),
      'the staff catalogue withholds the cost profile too');
  } finally {
    await db.query(`delete from internal_users where id = $1`, [u[0].id]);
    if (addonId) await db.query(`delete from catalog_addons where id = $1`, [addonId]);
  }

  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* already closed */ } process.exit(1); });
