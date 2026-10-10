/**
 * Price books and add-on billing (v9.34).
 *
 * One rupee and one US-dollar price list: a USD client is quoted, bundled
 * and billed in dollars from the same packages. Overage is one flat rate
 * that never undercuts the next package. A catalogue add-on can be billed
 * monthly as a bundle, and a metered one (the Voice Agent's call minutes)
 * creates its own rate card, ended with the add-on.
 *
 * Needs Postgres (DATABASE_URL in .env) and the API on 8099.
 *
 *   node test/price-books.test.js
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/db');
const { adminSession } = require('./ceo-session');
const { effectivePackage } = require('../src/utils/pkg');
const { meteredCharges, buildMonthlyBill } = require('../src/utils/subscriptions');
const { buildQuoteDocument } = require('../src/routes/quotes');

const B = 'http://127.0.0.1:8099';
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };

(async () => {
  const s = await adminSession();
  const tag = crypto.randomBytes(3).toString('hex');
  const { rows: prods } = await db.query(
    `select * from products where name in ('Starter','Growth','Scale','Pro','Enterprise','Enterprise+') order by retainer`);
  const by = Object.fromEntries(prods.map((p) => [p.name, p]));
  const { rows: pk } = await db.query(
    `insert into clients (name, company, product_id) values ('PB PKR', 'PB PKR ${tag}', $1) returning *`, [by.Starter.id]);
  const { rows: us } = await db.query(
    `insert into clients (name, company, product_id, currency) values ('PB USD', 'PB USD ${tag}', $1, 'USD') returning *`, [by.Starter.id]);
  const pkr = pk[0], usd = us[0];
  const api = (method, path, body) => fetch(B + path, { method, headers: s.headers, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  try {
    console.log('\n== overage never undercuts the next package ==');
    ok(prods.every((p) => Number(p.overage_rate) === 7), 'every package overflows at PKR 7 a conversation',
      prods.map((p) => p.overage_rate).join(','));
    const ladder = ['Starter', 'Growth', 'Scale', 'Pro', 'Enterprise'];
    let undercut = [];
    for (let i = 0; i < ladder.length - 1; i++) {
      const lo = by[ladder[i]], hi = by[ladder[i + 1]];
      const overflow = Number(lo.retainer) + (Number(hi.quota) - Number(lo.quota)) * Number(lo.overage_rate);
      if (overflow <= Number(hi.retainer)) undercut.push(`${lo.name}→${hi.name}`);
    }
    ok(!undercut.length, 'running a package up to the next one\'s allowance always costs more than moving up', undercut.join(', '));

    console.log('\n== a USD client is priced from the dollar list ==');
    const e1 = effectivePackage(pkr, by.Starter), e2 = effectivePackage(usd, by.Starter);
    ok(e1.retainer === 20000 && e1.setup_fee === 25000 && e1.overage_rate === 7 && !e1.currency, 'a PKR client: PKR 20,000 a month, 25,000 setup, PKR 7 overage');
    ok(e2.retainer === 299 && e2.setup_fee === 750 && e2.overage_rate === 0.1 && e2.currency === 'USD', 'a USD client: US$299 a month, US$750 setup, US$0.10 overage',
      JSON.stringify(e2));

    await db.query(
      `insert into usage_events (client_id, session_id, channel, voice_seconds) values ($1, $2, 'whatsapp', 9600)`,
      [usd.id, 'pb-' + tag]);
    const month = new Date().toISOString().slice(0, 7);
    const v = (await meteredCharges(usd, month)).find((l) => l.metric === 'voice_minute');
    ok(v && v.unit_price === 0.02 && Math.abs(v.amount - 0.2) < 0.001,
      'voice-note minutes past a USD client\'s allowance bill at US$0.02 (160 used, 150 included)', JSON.stringify(v));
    const bill = await buildMonthlyBill(usd, month);
    const ret = bill.lines.find((l) => l.kind === 'retainer');
    ok(ret && ret.amount === 299, 'their monthly bill charges US$299', JSON.stringify(ret));

    console.log('\n== an add-on bills monthly, and the Voice Agent brings its minute rate ==');
    let r = await api('POST', '/api/subscriptions/bundles', { client_id: pkr.id, addon_key: 'voice-call-agent' });
    ok(r.status === 201 && Number(r.body.unit_setup_fee) === 60000 && Number(r.body.unit_retainer) === 20000 && r.body.addon_key === 'voice-call-agent',
      'the Voice Agent added to a PKR client: PKR 60,000 setup, PKR 20,000 a month', JSON.stringify(r.body));
    const bundle = r.body;
    let { rows: rate } = await db.query(`select * from usage_rates where bundle_id = $1`, [bundle.id]);
    ok(rate[0] && rate[0].metric === 'call_minute' && Number(rate[0].unit_rate) === 40 && Number(rate[0].included_units) === 0 && !rate[0].effective_to,
      'and its call minutes are billed at PKR 40 from the first minute', JSON.stringify(rate[0]));

    r = await api('POST', '/api/subscriptions/bundles', { client_id: usd.id, addon_key: 'voice-call-agent' });
    ok(r.status === 201 && Number(r.body.unit_setup_fee) === 900 && Number(r.body.unit_retainer) === 149,
      'for a USD client: US$900 setup, US$149 a month', JSON.stringify(r.body));
    const { rows: urate } = await db.query(`select * from usage_rates where bundle_id = $1`, [r.body.id]);
    ok(urate[0] && Number(urate[0].unit_rate) === 0.15, 'and US$0.15 a call minute', JSON.stringify(urate[0]));

    await db.query(`insert into usage_events (client_id, session_id, channel, call_seconds) values ($1, $2, 'voice', 600)`,
      [pkr.id, 'pb-call-' + tag]);
    const c = (await meteredCharges(pkr, month)).find((l) => l.metric === 'call_minute');
    ok(c && c.amount === 400, 'a 10-minute call bills PKR 400', JSON.stringify(c));
    const pbill = await buildMonthlyBill(pkr, month);
    const lineFor = pbill.lines.find((l) => /Voice call agent/.test(l.description));
    ok(!!lineFor, 'the add-on\'s monthly fee is on the bill', JSON.stringify(pbill.lines.map((l) => l.description)));

    r = await api('DELETE', `/api/subscriptions/bundles/${bundle.id}`);
    ({ rows: rate } = await db.query(`select effective_to from usage_rates where bundle_id = $1`, [bundle.id]));
    ok(r.status === 200 && rate[0] && rate[0].effective_to, 'ending the add-on ends its minute rate', JSON.stringify(rate[0]));

    r = await api('POST', '/api/subscriptions/bundles', { client_id: pkr.id, addon_key: 'recruitment' });
    ok(r.status === 400 && /scope/.test(r.body.error), 'a scoped add-on cannot be bundled at a list price', JSON.stringify(r.body));

    console.log('\n== a USD client is quoted in dollars ==');
    r = await api('POST', '/api/quotes', { client_id: usd.id, product_id: by.Growth.id });
    ok(r.status === 201, 'a quote for Growth is raised', r.status);
    const doc = await buildQuoteDocument(r.body.id);
    ok(doc.currency === 'USD' && doc.lines.some((l) => l.unit_price === 499) && doc.lines.some((l) => l.unit_price === 1500),
      'priced US$1,500 setup and US$499 a month, in USD', JSON.stringify({ c: doc.currency, l: doc.lines }));
    ok(doc.package_scope && doc.package_scope.overage_rate === 0.1
      && !doc.package_scope.includes.some((l) => /PKR/.test(l)),
      'its scope shows US$0.10 overage and no rupee figures', JSON.stringify(doc.package_scope && doc.package_scope.includes));
    await db.query(`delete from quotes where id = $1`, [r.body.id]);
  } finally {
    await db.query(`delete from clients where id = any($1::uuid[])`, [[pkr.id, usd.id]]);
    await s.end();
  }

  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* closed */ } process.exit(1); });
