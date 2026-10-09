/**
 * Products & Pricing, costed at today's prices (v9.20).
 *
 * Two halves. The engine (src/utils/costingEngine.js) must reproduce the business
 * model's own structure — its labour figures to the rupee, its steady-state
 * revenue, labour and infrastructure — so that the only thing that moved is
 * what the business model got wrong or what changed since: model prices and
 * the exchange rate. And the API must keep margins where they belong: the
 * CEO sees them (v9.21), nobody else does — not another admin, not any key.
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
const { ceoSession, adminSession, db } = require('./ceo-session');

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const K = { 'Content-Type': 'application/json', 'x-api-key': KEY };
let A = K; // the CEO's session, once signed in below

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, body, headers) => fetch(B + p, {
  headers: headers || A,
  method, body: body === undefined ? undefined : JSON.stringify(body),
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

  console.log('\n== the August model\'s own inputs still reproduce its figures ==');
  // gpt-4o-mini, 1,200–3,000 context tokens, 80-token replies, one call a turn.
  const AUG_CTX = { Starter: 1200, Growth: 1500, Scale: 1800, Pro: 2200, Enterprise: 2600, 'Enterprise+': 3000 };
  const aug = V.model(LADDER.map((p) => ({ ...p, context_tokens: AUG_CTX[p.name] })), {},
    { utilization: 0.7, bulk_model: 'gpt-4o-mini', reply_tokens: 80, calls_per_turn: 1, voice_allowance_share: 0 }, '2026-09-29');
  const augBy = Object.fromEntries(aug.packages.map((r) => [r.name, r]));
  // Starter: 6 turns; input = 6*1200 + 6*30 + 110*15 = 9,030; output = 480.
  ok(augBy.Starter.tokens.input === 9030 && augBy.Starter.tokens.output === 480, 'Starter session is 9,030 tokens in, 480 out',
    JSON.stringify(augBy.Starter.tokens));
  const augUsd = 0.98 * (9030 * 0.15 + 480 * 0.60) / 1e6 + 0.02 * (9030 * 2 + 480 * 10) / 1e6;
  ok(Math.abs(augBy.Starter.cost_per_session - augUsd * 277.05) < 0.0001, 'Starter cost per session is the blend at USD/PKR 277.05',
    `${augBy.Starter.cost_per_session} vs ${augUsd * 277.05}`);
  ok(augBy.Starter.margin_full === 0.807 && augBy['Enterprise+'].margin_full === 0.483, 'margin at full use 80.7% (Starter) to 48.3% (Enterprise+)',
    `${augBy.Starter.margin_full} … ${augBy['Enterprise+'].margin_full}`);
  ok(aug.steady_state.margin === 0.714, 'steady-state contribution 71.4%', aug.steady_state.margin);
  ok(aug.flags.some((f) => /Enterprise\+: overage covers only 1\.8/.test(f.text)), 'flags Enterprise+ overage at 1.8x cost');

  console.log('\n== at what the live agents measured (v9.33) ==');
  // gpt-5-mini, 4,000 context tokens on Starter, 220-token replies with
  // reasoning, 1.2 model calls a turn: input = 1.2*(6*4000 + 6*30 + 250*15)
  // = 33,516; output = 1.2*6*220 = 1,584.
  ok(by.Starter.tokens.input === 33516 && by.Starter.tokens.output === 1584, 'Starter session is 33,516 tokens in, 1,584 out',
    JSON.stringify(by.Starter.tokens));
  const usd = 0.98 * (33516 * 0.25 + 1584 * 2.00) / 1e6 + 0.02 * (33516 * 2 + 1584 * 10) / 1e6;
  ok(Math.abs(by.Starter.cost_per_session - usd * 277.05) < 0.0001, 'and costs the GPT-5 mini blend: about PKR 3.59',
    `${by.Starter.cost_per_session} vs ${usd * 277.05}`);
  ok(m.flags.filter((f) => f.level === 'bad' && /overage rate/.test(f.text)).length === 6,
    'every tier\'s overage rate is flagged as below the cost of a session', JSON.stringify(m.flags.map((f) => f.text)));
  ok(by.Pro.margin_full < 0, 'Pro loses money at full use without prompt caching', by.Pro.margin_full);
  const cached = V.model(LADDER, {}, { utilization: 0.7, cache_share: 0.7 }, '2026-09-29');
  const cachedStarter = cached.packages.find((r) => r.name === 'Starter');
  // 70% of 28,800 context tokens at $0.025 instead of $0.25.
  const cachedUsd = 0.98 * ((33516 - 20160) * 0.25 + 20160 * 0.025 + 1584 * 2.00) / 1e6 + 0.02 * (33516 * 2 + 1584 * 10) / 1e6;
  ok(Math.abs(cachedStarter.cost_per_session - cachedUsd * 277.05) < 0.0001,
    'a cached share of the prompt is billed at the cached-input price', `${cachedStarter.cost_per_session} vs ${cachedUsd * 277.05}`);

  const gem = m.what_if.find((w) => w.bulk_model === 'gemini-3-flash');
  ok(gem && gem.packages.find((p) => p.name === 'Enterprise+').margin_full < 0,
    'the what-if shows Gemini 3 Flash at today\'s price would sink Enterprise+', gem && JSON.stringify(gem.packages.slice(-1)));
  const nano = V.model(LADDER, { assumptions: { bulk_model: 'gpt-5-nano' } }, { utilization: 0.7 });
  ok(nano.packages[0].cost_per_session < by.Starter.cost_per_session, 'a cheaper bulk model lowers the cost per session');

  console.log('\n== validation ==');
  const bad = (fn, re, label) => { try { fn(); ok(false, label, 'accepted'); } catch (e) { ok(e.status === 400 && re.test(e.message), label, e.message); } };
  bad(() => C.applyChange({}, { assumptions: { cache_share: 1.5 } }), /cached share/, 'a cached share over 100% is refused');
  bad(() => C.applyChange({}, { assumptions: { calls_per_turn: 0 } }), /Model calls/, 'fewer than one model call a turn is refused');
  bad(() => C.applyChange({}, { assumptions: { fx_usd_pkr: 5 } }), /exchange rate/, 'an absurd exchange rate is refused');
  bad(() => C.applyChange({}, { assumptions: { bulk_model: 'gpt-99' } }), /not on the rate card/, 'an unknown bulk model is refused');
  bad(() => C.applyChange({}, { rates: { 'gpt-4o-mini': { input: -1 } } }), /input price/, 'a negative price is refused');
  bad(() => C.applyChange({}, { rates: { 'brand-new': { input: 1 } } }), /both an input and an output/, 'a new model needs both prices');
  const next = C.applyChange({}, { rates: { 'gpt-4o-mini': { input: 0.2 } } });
  ok(next.rates['gpt-4o-mini'].input === 0.2 && /^\d{4}-\d{2}-\d{2}$/.test(next.assumptions.as_of),
    'a rate change is stored and dates the model as re-checked', JSON.stringify(next));

  console.log('\n== voice notes are costed (v9.33) ==');
  const vm = V.model(LADDER, {}, {}, '2026-10-09');
  ok(vm.stt_rates.some((r) => r.key === 'whisper-1' && r.per_minute === 0.006)
    && vm.stt_rates.some((r) => r.key === 'gpt-4o-mini-transcribe' && r.per_minute === 0.003),
    'the speech-to-text price list carries Whisper and GPT-4o mini Transcribe', JSON.stringify(vm.stt_rates.map((r) => r.key)));
  ok(vm.voice.stt_model === 'whisper-1' && vm.voice.per_minute_pkr === 1.6623 && vm.voice.per_note_pkr === 0.8312,
    'voice notes are costed on Whisper: PKR 1.66 a minute, PKR 0.83 a 30-second note', JSON.stringify(vm.voice));
  const vby = Object.fromEntries(vm.packages.map((r) => [r.name, r]));
  ok([['Starter', 150, 249], ['Growth', 400, 665], ['Scale', 900, 1496], ['Pro', 1500, 2493], ['Enterprise', 2500, 4156], ['Enterprise+', 4000, 6649]]
    .every(([n, min, cost]) => vby[n].voice_minutes === min && vby[n].voice_full === cost),
    'every package includes voice minutes at 10% of its conversations, costed at full use',
    JSON.stringify(vm.packages.map((r) => [r.name, r.voice_minutes, r.voice_full])));
  ok(vm.packages.every((r) => r.voice_share_of_price <= 0.031), 'and voice never costs more than about 3% of a package\'s fee',
    JSON.stringify(vm.packages.map((r) => r.voice_share_of_price)));
  const noVoice = V.model(LADDER, {}, { voice_allowance_share: 0 }, '2026-10-09');
  ok(noVoice.packages[0].margin_full - vby.Starter.margin_full > 0.01 && noVoice.packages[0].voice_full === 0,
    'the allowance comes out of the package margin');
  ok(V.voiceFlags([], vm.voice, vm.stt_rates, '2026-10-09').some((f) => f.level === 'warn' && /retired/.test(f.text) && /2027-02-26/.test(f.text)),
    'Whisper\'s retirement on 26 Feb 2027 is flagged', JSON.stringify(V.voiceFlags([], vm.voice, vm.stt_rates, '2026-10-09')));
  ok(V.voiceFlags([], vm.voice, vm.stt_rates, '2027-01-10').some((f) => f.level === 'bad'), 'and turns red in its last sixty days');
  const cheaper = V.model(LADDER, {}, { stt_model: 'gpt-4o-mini-transcribe' }, '2026-10-09');
  ok(cheaper.voice.per_minute_pkr === 0.8312, 'moving to GPT-4o mini Transcribe halves it', cheaper.voice.per_minute_pkr);
  const tx = { name: 'Voice-note transcription', meter: 'voice_minute', included_units: 500, overage_rate: 5, active: true };
  const vc = V.voiceAddonCost(tx, vm.voice);
  ok(vc.stt_cost === 831 && vc.overage_cover === 3, '500 included minutes cost PKR 831; PKR 5 a minute covers 3× the cost', JSON.stringify(vc));
  ok(V.voiceAddonCost({ name: 'Echo' }, vm.voice) === null, 'an add-on that meters nothing has no voice cost');
  const vf = V.voiceFlags([{ ...tx, overage_rate: 1 }, { ...tx, name: 'Free past it', overage_rate: null }], vm.voice, vm.stt_rates);
  ok(vf.some((f) => f.level === 'bad' && /below what a minute/.test(f.text)) && vf.some((f) => /have no price/.test(f.text)),
    'a per-minute price under cost, or none at all, is flagged', JSON.stringify(vf));
  ok(V.voiceFlags([], V.voiceCost({ ...vm.assumptions, stt_model: 'nope' }, vm.stt_rates), vm.stt_rates).some((f) => f.level === 'bad'),
    'a speech-to-text model off the list is flagged');
  bad(() => C.applyChange({}, { assumptions: { stt_model: 'nope' } }), /speech-to-text price list/, 'an unknown speech-to-text model is refused');
  bad(() => C.applyChange({}, { stt_rates: { 'new-stt': { label: 'x' } } }), /per-minute price/, 'a new speech-to-text model needs its price');
  bad(() => C.applyChange({}, { assumptions: { voice_note_minutes: 0 } }), /voice note/, 'a zero-length voice note is refused');
  const sttNext = C.applyChange({}, { stt_rates: { 'whisper-1': { per_minute: 0.007 } }, assumptions: { stt_model: 'whisper-1' } });
  ok(sttNext.stt_rates['whisper-1'].per_minute === 0.007 && V.model(LADDER, sttNext).voice.per_minute_usd === 0.007,
    'a speech-to-text price change is stored and used', JSON.stringify(sttNext.stt_rates));

  console.log('\n== the API: the CEO\'s alone ==');
  const ceo = await ceoSession();
  const other = await adminSession();
  A = ceo.headers;
  let r = await call('GET', '/api/costing', undefined, K);
  ok(r.status === 403, 'the break-glass admin key cannot open the costing model', r.status);
  r = await call('GET', '/api/costing', undefined, other.headers);
  ok(r.status === 403, 'nor can another admin', r.status);
  r = await call('GET', '/api/products', undefined, other.headers);
  ok(r.status === 200 && r.body.every((p) => p.delivery_cost_full === undefined), 'another admin sees packages without their cost', r.status);
  r = await call('GET', '/api/financials', undefined, other.headers);
  ok(r.status === 403, 'nor Financials', r.status);
  r = await call('PUT', `/api/products/${(await call('GET', '/api/products')).body[0].id}`, { retainer: 1 }, other.headers);
  ok(r.status === 403 && /CEO/.test(r.body.error), 'nor may they change a price', r.status);
  r = await call('GET', '/api/auth/me', undefined, ceo.headers);
  ok(r.status === 200 && r.body.pricing === true, 'the CEO\'s own session says it opens Pricing', JSON.stringify(r.body));
  r = await call('GET', '/api/auth/me', undefined, other.headers);
  ok(r.status === 200 && r.body.pricing === false, 'another admin\'s does not', JSON.stringify(r.body));
  await other.end();
  r = await call('GET', '/api/costing');
  ok(r.status === 200 && r.body.packages.length >= 6 && r.body.steady_state && r.body.addons.length >= 20,
    'the CEO gets the whole model, add-ons included', r.status);
  const starter = r.body.packages.find((p) => p.name === 'Starter');

  // Vantriq Echo, priced on what it costs to run (v9.20.1).
  const echo = r.body.addons.find((a) => a.key === 'echo');
  const loc = r.body.addons.find((a) => a.key === 'echo-location');
  ok(echo && Number(echo.setup_fee) === 12000 && Number(echo.monthly_fee) === 6000,
    'Echo is PKR 12,000 setup + 6,000 a month for the first location', echo && `${echo.setup_fee} + ${echo.monthly_fee}`);
  ok(loc && Number(loc.setup_fee) === 2000 && Number(loc.monthly_fee) === 1500,
    'each further location is PKR 2,000 + 1,500 a month', loc && `${loc.setup_fee} + ${loc.monthly_fee}`);
  ok(echo && echo.monthly_margin >= 0.7 && echo.setup_margin >= 0.5, 'Echo keeps a prudent margin (75% monthly, 53% setup)',
    echo && `${echo.monthly_margin}, ${echo.setup_margin}`);
  ok(loc && loc.monthly_margin >= 0.75 && loc.setup_margin >= 0.4, 'and so does each location (80% monthly, 44% setup)',
    loc && `${loc.monthly_margin}, ${loc.setup_margin}`);
  const chain = (n) => Number(echo.monthly_fee) + (n - 1) * Number(loc.monthly_fee);
  const chainCost = (n) => Number(echo.est_monthly_cost) + (n - 1) * Number(loc.est_monthly_cost);
  ok(chain(5) === 12000 && chain(10) === 19500 && (chain(10) - chainCost(10)) / chain(10) > 0.75,
    'five branches pay 12,000 a month and ten 19,500, still above 75% margin', `${chain(5)}, ${chain(10)}`);

  r = await call('PUT', '/api/costing', { assumptions: { fx_usd_pkr: 300 } });
  const moved = r.body.packages.find((p) => p.name === 'Starter');
  ok(r.status === 200 && moved.cost_per_session > starter.cost_per_session, 'a new exchange rate re-costs every package', r.status);
  const { rows: prod } = await db.query(`select delivery_cost_full, ai_model from products where id = $1`, [starter.id]);
  ok(Number(prod[0].delivery_cost_full) === moved.delivery_full && moved.delivery_full === moved.ai_full + moved.voice_full,
    'and writes the delivery cost Financials reads — conversations and voice', `${prod[0].delivery_cost_full} vs ${moved.delivery_full}`);
  ok(/GPT-5 mini; 2% escalated to Claude Sonnet 5\.5/.test(prod[0].ai_model), 'the routing line on the package is the model\'s', prod[0].ai_model);

  // Financials' projection setting must not leak into the business model's
  // typical-use margin (production runs Financials at a cautious 100%).
  const { rows: su } = await db.query(`select utilization from settings where id = 1`);
  await db.query(`update settings set utilization = 1 where id = 1`);
  try {
    r = await call('GET', '/api/costing');
    const st = r.body.packages.find((p) => p.name === 'Starter');
    ok(r.body.assumptions.utilization === 0.7 && st.margin_util > st.margin_full,
      'typical use stays the business model\'s 70% whatever Financials projects at',
      `${r.body.assumptions.utilization}, ${st.margin_util} vs ${st.margin_full}`);
  } finally {
    await db.query(`update settings set utilization = $1 where id = 1`, [su[0].utilization]);
  }
  r = await call('PUT', '/api/costing', { utilization: 0.5 });
  ok(r.status === 200 && r.body.assumptions.utilization === 0.5, 'typical use can be changed in Rates & assumptions', r.status);
  const { rows: su2 } = await db.query(`select utilization from settings where id = 1`);
  ok(Number(su2[0].utilization) === Number(su[0].utilization), 'without touching the Financials projection setting', su2[0].utilization);
  r = await call('PUT', '/api/costing', { utilization: 5 });
  ok(r.status === 400, 'a utilisation over 100% is refused', r.status);

  r = await call('PATCH', `/api/costing/packages/${starter.id}`, { premium_share: 1.5 });
  ok(r.status === 400, 'a premium share over 100% is refused', r.status);
  r = await call('PATCH', `/api/costing/packages/${starter.id}`, { mgmt_hours: 2 });
  ok(r.status === 200 && r.body.packages.find((p) => p.name === 'Starter').mgmt_labour === 6000,
    'a package\'s cost profile can be changed (2 h a month = PKR 6,000)', r.status);

  r = await call('POST', '/api/costing/reset', { scope: 'all' });
  const back = r.body.packages.find((p) => p.name === 'Starter');
  ok(r.status === 200 && back.cost_per_session === starter.cost_per_session && back.mgmt_labour === 3000,
    'reset puts the business model\'s rates and profiles back', JSON.stringify({ c: back.cost_per_session, l: back.mgmt_labour }));

  // Voice notes included in every package (v9.33, approved 9 Oct 2026).
  r = await call('GET', '/api/costing');
  const vt = r.body.addons.find((a) => a.key === 'voice-transcription');
  const vu = r.body.addons.find((a) => a.key === 'voice-understanding');
  ok(!vt || vt.active === false, 'there is no separate voice-transcription add-on for sale', vt && JSON.stringify(vt));
  ok(vu && vu.active !== false && !vu.meter && Number(vu.est_monthly_cost) === 1250 && /included in every package/.test(vu.price_note),
    'Voice understanding is sold for its spoken replies; transcription is in the package', vu && JSON.stringify(vu));
  const st = r.body.packages.find((p) => p.name === 'Starter');
  ok(st.voice_minutes === 150 && st.voice_full === 249 && r.body.voice.stt_model === 'whisper-1',
    'the model costs Starter\'s 150 included minutes on Whisper', JSON.stringify({ m: st.voice_minutes, c: st.voice_full, s: r.body.voice.stt_model }));
  const { rows: vr } = await db.query(
    `select p.name, r.included_units, r.unit_rate from usage_rates r join products p on p.id = r.product_id
      where r.metric = 'voice_minute' and r.client_id is null and r.effective_to is null order by p.sort_order`);
  ok(vr.length === 6 && vr.every((x) => Number(x.unit_rate) === 5) && Number(vr[0].included_units) === 150 && Number(vr[5].included_units) === 4000,
    'each package carries a voice-minute rate card: 10% of its conversations, then PKR 5 a minute', JSON.stringify(vr));
  r = await call('PUT', '/api/costing', { assumptions: { stt_model: 'gpt-4o-mini-transcribe' } });
  ok(r.status === 200 && r.body.packages.find((p) => p.name === 'Starter').voice_full === 125,
    'a cheaper speech-to-text model halves what the allowance costs', r.status);
  await call('POST', '/api/costing/reset', { scope: 'rates' });
  r = await call('PUT', '/api/addons/' + vu.id, { meter: 'tokens' });
  ok(r.status === 400, 'an unknown meter is refused', r.status);

  r = await call('POST', '/api/addons', { name: 'Test add-on', family: 'capability', price_basis: 'fixed', setup_fee: 1000 });
  ok(r.status === 400, 'a priced add-on needs both fees', r.status);
  r = await call('POST', '/api/addons', { name: 'Costing test add-on', family: 'capability', price_basis: 'fixed',
    setup_fee: 10000, monthly_fee: 5000, est_monthly_cost: 1000 });
  ok(r.status === 201 && r.body.key === 'costing-test-add-on', 'the CEO can add to the catalogue', r.status);
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
    await ceo.end();
  }

  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* already closed */ } process.exit(1); });
