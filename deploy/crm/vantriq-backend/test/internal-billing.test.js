/**
 * The internal account bills what it used, not what the package costs.
 *
 * VantriqAI is a client of itself so its agents can be metered and costed.
 * Charging it a flat Enterprise+ retainer would defeat that: the figure
 * would be the same whether the agents answered ten conversations or ten
 * thousand, which is the one thing the account exists to tell you.
 *
 *   node test/internal-billing.test.js
 */
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + extra)); };

const ENTERPRISE = {
  id: 'prod-ent', name: 'Enterprise+', retainer: 250000, quota: 40000,
  overage_rate: 5, setup_fee: 0, msgs_per_session: 12,
};

const state = { sessions: 0, rates: [], bundles: [] };

const dbStub = {
  async query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('select * from products where id')) return { rows: [ENTERPRISE] };
    if (q.startsWith('select * from usage_rates')) return { rows: state.rates };
    if (q.includes('from client_bundles')) return { rows: state.bundles };
    if (q.includes('count(distinct session_id)')) {
      return { rows: [{ session: state.sessions, message: state.sessions, input_token: 0, output_token: 0 }] };
    }
    if (q.startsWith('select sessions from v_monthly_usage')) {
      return { rows: [{ sessions: state.sessions }] };
    }
    if (q.startsWith('select * from settings')) return { rows: [{ default_tax_rate: 0, default_ait_rate: 0 }] };
    return { rows: [] };
  },
};
require.cache[require.resolve(path.join(SRC, 'db.js'))] = { id: 'db', filename: 'db', loaded: true, exports: dbStub };

const subs = require(path.join(SRC, 'utils', 'subscriptions.js'));
const build = subs.buildMonthlyBill;

const INTERNAL = { id: 'c-int', company: 'Vantriq AI', product_id: 'prod-ent', is_internal: true };
const EXTERNAL = { id: 'c-ext', company: 'Acme Ltd',   product_id: 'prod-ent', is_internal: false };

(async () => {
  console.log('\n== the internal account pays for use, not for the package ==');

  state.sessions = 3; state.rates = []; state.bundles = [];
  let bill = await build(INTERNAL, '2026-09-01');
  ok(bill !== null, 'a month with usage produces a bill');
  ok(bill && bill.amount === 15, '3 conversations at 5 = 15, not the 250000 retainer', 'got ' + (bill && bill.amount));
  ok(bill && !bill.lines.some(l => l.kind === 'retainer'), 'no retainer line on an internal bill',
     bill && JSON.stringify(bill.lines.map(l => l.kind)));
  ok(bill && bill.lines.every(l => l.kind === 'usage'), 'every line is usage',
     bill && JSON.stringify(bill.lines.map(l => l.kind)));

  console.log('\n== no usage, no invoice ==');
  state.sessions = 0;
  bill = await build(INTERNAL, '2026-09-01');
  ok(bill === null, 'a month with no usage bills nothing at all', 'got ' + JSON.stringify(bill));

  console.log('\n== usage scales the bill, which is the whole point ==');
  state.sessions = 1200;
  bill = await build(INTERNAL, '2026-09-01');
  ok(bill && bill.amount === 6000, '1200 conversations at 5 = 6000', 'got ' + (bill && bill.amount));

  console.log('\n== a rate card wins, so cost can be priced by token ==');
  state.sessions = 3;
  state.rates = [{ metric: 'session', label: 'Conversations', unit_rate: 2, included_units: 0, unit_size: 1 }];
  bill = await build(INTERNAL, '2026-09-01');
  ok(bill && bill.amount === 6, 'the rate card replaces the package rate (3 x 2 = 6)', 'got ' + (bill && bill.amount));

  console.log('\n== paying customers are untouched ==');
  state.sessions = 3; state.rates = []; state.bundles = [];
  bill = await build(EXTERNAL, '2026-09-01');
  ok(bill && bill.amount === 250000, 'an external client still pays the full retainer', 'got ' + (bill && bill.amount));
  ok(bill && bill.lines.some(l => l.kind === 'retainer'), 'and still gets a retainer line');
  ok(bill && !bill.lines.some(l => l.kind === 'overage'), 'with no overage while inside quota');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})();
