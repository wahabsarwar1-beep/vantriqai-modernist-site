/**
 * What the Financials page counts, and whether it is live.
 *
 * Three faults, all of which made the same page overstate the business.
 *
 *   1. Our own AI usage was listed in the cost table under a heading reading
 *      "Recurring line items feeding the P&L" — and fed nothing. The internal
 *      invoice is a real metered cost, so the Dashboard subtracted it and
 *      Financials did not, and the two screens disagreed about the same month.
 *
 *   2. Both screens priced an active client at their package's LIST retainer.
 *      A client on a negotiated rate is invoiced their rate every month, so
 *      revenue read high for every one of them.
 *
 *   3. The rule for (1) existed twice, once per screen. Two copies of an
 *      arithmetic rule is how they drift apart.
 *
 *   node test/live-financials.test.js
 */
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + extra)); };

// accounting.js opens a pool at require time; nothing here touches the
// database, so hand it a stub rather than a connection string.
require.cache[require.resolve(path.join(SRC, 'db.js'))] =
  { id: 'db', filename: 'db', loaded: true, exports: { async query() { return { rows: [] }; } } };
const acc = require(path.join(SRC, 'utils', 'accounting.js'));

const INTERNAL = new Set(['c-int']);
const INV = [
  // Ours, this month, stamped: counts.
  { client_id: 'c-int', status: 'paid',    issued_date: '2026-09-18', currency: 'USD', amount: 0.000621, base_amount: 0.17, invoice_number: 'VAI-19' },
  // Ours, this month, raised before a rate existed: must not be guessed at.
  { client_id: 'c-int', status: 'paid',    issued_date: '2026-09-20', currency: 'USD', amount: 0.0004,   base_amount: null, invoice_number: 'VAI-20' },
  // Ours, but voided.
  { client_id: 'c-int', status: 'void',    issued_date: '2026-09-21', currency: 'USD', amount: 9,        base_amount: 2500, invoice_number: 'VAI-21' },
  // Ours, last month.
  { client_id: 'c-int', status: 'paid',    issued_date: '2026-08-18', currency: 'USD', amount: 0.9,      base_amount: 250,  invoice_number: 'VAI-18' },
  // A customer's — never ours to count as cost.
  { client_id: 'c-ext', status: 'pending', issued_date: '2026-09-18', currency: 'PKR', amount: 20000,    base_amount: 20000, invoice_number: 'VAI-22' },
];

console.log('\n== our own AI usage, as one rule both screens can call ==');
ok(acc.internalAiCost(INV, INTERNAL, '2026-09-01') === 0.17,
  'only this month\'s stamped internal invoices count', String(acc.internalAiCost(INV, INTERNAL, '2026-09-01')));
ok(acc.internalAiCost(INV, INTERNAL, '2026-08-01') === 250,
  'last month is its own figure', String(acc.internalAiCost(INV, INTERNAL, '2026-08-01')));
ok(acc.internalAiCost(INV, INTERNAL, '2026-07-01') === 0,
  'a month with nothing in it is zero, not NaN', String(acc.internalAiCost(INV, INTERNAL, '2026-07-01')));
// A Date, and a full ISO timestamp, both reach this from pg in-process.
ok(acc.internalAiCost(INV, INTERNAL, new Date('2026-09-05T00:00:00Z')) === 0.17,
  'a Date works as well as a string', String(acc.internalAiCost(INV, INTERNAL, new Date('2026-09-05T00:00:00Z'))));

console.log('\n== an unconverted invoice is held back, never guessed ==');
const held = acc.internalAiUnstamped(INV, INTERNAL, '2026-09-01');
ok(held.length === 1 && held[0].invoice_number === 'VAI-20',
  'the invoice with no rate is reported separately', JSON.stringify(held));
ok(!acc.internalAiUnstamped(INV, INTERNAL, '2026-09-01').some((i) => i.invoice_number === 'VAI-21'),
  'a void invoice is not chased for a rate it will never need');

console.log('\n== a customer invoice is not our cost ==');
ok(acc.internalAiCost([{ client_id: 'c-ext', status: 'paid', issued_date: '2026-09-18', base_amount: 999999 }],
  INTERNAL, '2026-09-01') === 0, 'someone else\'s invoice contributes nothing');

console.log('\n== a client is priced at what they are contracted at ==');
// The rule itself, stated the same way both routes state it.
const PRODUCTS = { 'p-ent': { retainer: 250000 }, 'p-pro': { retainer: 60000 } };
const retainerOf = (c) => (c.custom_retainer != null
  ? Number(c.custom_retainer)
  : (PRODUCTS[c.product_id] ? Number(PRODUCTS[c.product_id].retainer) : 0));

ok(retainerOf({ product_id: 'p-ent', custom_retainer: 180000 }) === 180000,
  'a negotiated rate wins over the tier list price');
ok(retainerOf({ product_id: 'p-ent', custom_retainer: null }) === 250000,
  'no negotiated rate falls back to list');
// 0 is a real negotiated figure — a pilot at no charge — and must not be
// read as "unset" and silently repriced at the full retainer.
ok(retainerOf({ product_id: 'p-ent', custom_retainer: 0 }) === 0,
  'a free pilot stays free rather than reverting to list price',
  String(retainerOf({ product_id: 'p-ent', custom_retainer: 0 })));
ok(retainerOf({ product_id: 'p-gone', custom_retainer: null }) === 0,
  'a client with no package priced at nothing, not NaN');

console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
process.exit(fail ? 1 : 0);
