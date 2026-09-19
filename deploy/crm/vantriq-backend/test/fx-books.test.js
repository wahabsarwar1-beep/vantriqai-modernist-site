/**
 * One set of books, two currencies.
 *
 * The internal account is invoiced in USD because what it records is an
 * OpenAI bill. Every other figure in the financials is PKR. The two must
 * never be added together, and the conversion between them must be a fact
 * stamped on the invoice rather than a rate looked up whenever a report
 * happens to run.
 *
 * Three things are tested here, and each of them has already gone wrong once:
 *
 *   1. a sub-cent USD amount survives being written down at all,
 *   2. the rate is stamped at issue, so a later rate cannot restate a month
 *      that has already been reported,
 *   3. the statements read the converted figure, and say so when there
 *      isn't one, instead of quietly adding dollars to rupees.
 *
 *   node test/fx-books.test.js
 */
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + extra)); };

// What the settings row says, swapped between cases.
const state = { settings: { currency: 'PKR', usd_pkr_rate: 0, default_tax_rate: 18, default_ait_rate: 4 } };
// Everything createInvoice wrote, so the test can read back what was stored
// rather than what the function returned.
const written = { invoices: [], lines: [] };

const dbStub = {
  async query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('select * from settings')) return { rows: [state.settings] };
    if (q.includes("nextval('invoice_number_seq')")) return { rows: [{ n: written.invoices.length + 1 }] };
    if (q.startsWith('select * from tax_jurisdictions')) return { rows: [] };
    if (q.startsWith('insert into invoices')) {
      // The column order is READ OUT OF THE SQL rather than copied here.
      // A hand-kept copy silently goes stale the moment a column is inserted
      // in the middle of the real insert: every field after it shifts by one
      // and thirteen assertions fail somewhere unrelated to the change. That
      // happened once; this cannot repeat it.
      const cols = q.slice(q.indexOf('(') + 1, q.indexOf(')'))
        .split(',').map((c) => c.trim()).filter(Boolean);
      const row = { id: `inv-${written.invoices.length + 1}` };
      cols.forEach((c, i) => { row[c] = params[i]; });
      written.invoices.push(row);
      return { rows: [row] };
    }
    if (q.startsWith('insert into invoice_lines')) {
      written.lines.push({
        invoice_id: params[0], position: params[1], description: params[2],
        detail: params[3], qty: params[4], unit_price: params[5], amount: params[6],
      });
      return { rows: [] };
    }
    return { rows: [] };
  },
};
require.cache[require.resolve(path.join(SRC, 'db.js'))] = { id: 'db', filename: 'db', loaded: true, exports: dbStub };

const billing = require(path.join(SRC, 'utils', 'billing.js'));
const acc = require(path.join(SRC, 'utils', 'accounting.js'));

const INTERNAL = { id: 'c-int', company: 'Vantriq AI', is_internal: true, currency: 'USD' };
const EXTERNAL = { id: 'c-ext', company: 'Acme Ltd', is_internal: false, ntn: '1234567-8' };

// A quiet month: 2,700 input and 360 output tokens on gpt-4o-mini.
const TOKEN_LINES = [
  { description: 'Model input tokens (gpt-4o-mini)', qty: 0.0027, unit_price: 0.15, amount: 0.000405 },
  { description: 'Model output tokens (gpt-4o-mini)', qty: 0.00036, unit_price: 0.6, amount: 0.000216 },
];

(async () => {
  console.log('\n== a fraction of a cent is still a cost ==');

  let inv = await billing.createInvoice(INTERNAL, {
    type: 'retainer', amount: 0.000621, period: 'Sep 2026', lines: TOKEN_LINES,
  });
  ok(Number(inv.amount) === 0.000621,
    'a USD invoice keeps six decimal places instead of rounding to zero', 'got ' + inv.amount);
  ok(Number(inv.total_amount) === 0.000621, 'and the total matches it', 'got ' + inv.total_amount);
  ok(inv.currency === 'USD', 'stamped as USD', 'got ' + inv.currency);

  const stored = written.lines.filter((l) => l.invoice_id === inv.id);
  ok(stored.length === 2, 'both token lines were written', 'got ' + stored.length);
  ok(stored[0].amount === 0.000405 && stored[1].amount === 0.000216,
    'the stored line amounts survive at full precision',
    JSON.stringify(stored.map((l) => l.amount)));
  ok(stored[0].unit_price === 0.15,
    'the published rate is recorded verbatim, not rounded', 'got ' + stored[0].unit_price);

  console.log('\n== no rate means no conversion, never an invented one ==');
  ok(inv.fx_rate === null, 'nothing is stamped when no rate has been entered', 'got ' + inv.fx_rate);
  ok(inv.base_amount === null, 'and no PKR figure is guessed', 'got ' + inv.base_amount);

  const noRate = acc.computePnl(
    { invoices: [{ ...inv, is_internal: true, issued_date: '2026-09-18' }], payments: [], expenses: [], pos: [], remittances: [], settings: state.settings },
    '2026-09-01', '2026-09-30'
  );
  ok(noRate.cost_of_service.internal_ai_usage === 0,
    'an unconverted invoice adds nothing to a rupee total', 'got ' + noRate.cost_of_service.internal_ai_usage);
  ok(noRate.cost_of_service.internal_ai_usage_unconverted.length === 1,
    'but it is reported rather than dropped',
    JSON.stringify(noRate.cost_of_service.internal_ai_usage_unconverted));

  console.log('\n== with a rate, the books read rupees ==');
  state.settings.usd_pkr_rate = 283.5;
  inv = await billing.createInvoice(INTERNAL, {
    type: 'retainer', amount: 0.000621, period: 'Sep 2026', lines: TOKEN_LINES,
  });
  ok(Number(inv.fx_rate) === 283.5, 'the rate is stamped on the invoice', 'got ' + inv.fx_rate);
  ok(Number(inv.base_amount) === 0.18,
    '0.000621 x 283.5 = 0.18 PKR, rounded to the paisa', 'got ' + inv.base_amount);
  ok(Number(inv.amount) === 0.000621,
    'and the invoice still says what it was actually billed in', 'got ' + inv.amount);

  const pnl = acc.computePnl(
    {
      invoices: [
        { ...inv, is_internal: true, issued_date: '2026-09-18' },
        { invoice_number: 'X', is_internal: false, type: 'retainer', amount: 25000, currency: 'PKR', base_amount: 25000, issued_date: '2026-09-05' },
      ],
      payments: [], expenses: [], pos: [], remittances: [], settings: state.settings,
    },
    '2026-09-01', '2026-09-30'
  );
  ok(pnl.cost_of_service.internal_ai_usage === 0.18,
    'the P&L costs it in PKR', 'got ' + pnl.cost_of_service.internal_ai_usage);
  ok(pnl.cost_of_service.internal_ai_usage_foreign.USD === 0.000621,
    'while still showing what it was in dollars',
    JSON.stringify(pnl.cost_of_service.internal_ai_usage_foreign));
  ok(pnl.revenue.net === 25000, 'the internal invoice is never revenue', 'got ' + pnl.revenue.net);
  ok(pnl.gross_profit === 24999.82, 'gross profit nets the converted cost', 'got ' + pnl.gross_profit);

  console.log('\n== a later rate cannot restate a month already reported ==');
  state.settings.usd_pkr_rate = 500;
  const restated = acc.computePnl(
    { invoices: [{ ...inv, is_internal: true, issued_date: '2026-09-18' }], payments: [], expenses: [], pos: [], remittances: [], settings: state.settings },
    '2026-09-01', '2026-09-30'
  );
  ok(restated.cost_of_service.internal_ai_usage === 0.18,
    'September stays at the rate September was billed at', 'got ' + restated.cost_of_service.internal_ai_usage);

  console.log('\n== PKR is untouched by any of this ==');
  state.settings.usd_pkr_rate = 283.5;
  const pkr = await billing.createInvoice(EXTERNAL, { type: 'retainer', amount: 25000, period: 'Sep 2026' });
  ok(Number(pkr.amount) === 25000, 'a rupee invoice is unchanged', 'got ' + pkr.amount);
  ok(Number(pkr.fx_rate) === 1, 'it converts at one to one', 'got ' + pkr.fx_rate);
  ok(Number(pkr.base_amount) === 25000, 'and its book value is itself', 'got ' + pkr.base_amount);
  ok(Number(pkr.tax_amount) === 4500, 'GST is still added at 18%', 'got ' + pkr.tax_amount);
  ok(Number(pkr.ait_amount) === 1000, 'AIT is still withheld at 4%', 'got ' + pkr.ait_amount);
  ok(Number(pkr.net_payable) === 28500, '25000 + 4500 - 1000 = 28500', 'got ' + pkr.net_payable);

  console.log('\n== a USD ledger settles in USD ==');
  const s = billing.settlementOf(
    { currency: 'USD', net_payable: 0.000621, total_amount: 0.000621, amount: 0.000621 },
    [{ kind: 'receipt', amount: 0.0004 }]
  );
  ok(s.balance === 0.000221, 'a sub-cent balance stays visible', 'got ' + s.balance);
  ok(billing.derivedStatus({ currency: 'USD', status: 'pending' }, s) === 'partial',
    'part-paid reads as partial, not as paid on the strength of rounding',
    billing.derivedStatus({ currency: 'USD', status: 'pending' }, s));

  const settled = billing.settlementOf(
    { currency: 'USD', net_payable: 0.000621, total_amount: 0.000621, amount: 0.000621 },
    [{ kind: 'receipt', amount: 0.000621 }]
  );
  ok(billing.derivedStatus({ currency: 'USD', status: 'pending' }, settled) === 'paid',
    'and it reads as paid once the whole sub-cent balance is in',
    billing.derivedStatus({ currency: 'USD', status: 'pending' }, settled));

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
