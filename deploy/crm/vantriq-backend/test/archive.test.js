/**
 * Archiving old invoices out of the working set.
 *
 * This is the one endpoint that destroys financial rows, so the tests are
 * about the two properties that make that survivable.
 *
 *   YOU CANNOT PURGE WHAT YOU HAVE NOT DOWNLOADED. The purge takes the
 *   SHA-256 of the workbook the archive produced. No download, no hash.
 *
 *   THE BOOKS DO NOT MOVE. Every statement is derived from invoice and
 *   payment rows. Deleting a year of them would restate cash, receivables,
 *   advance tax, revenue — silently, and in a direction that looks like the
 *   business shrank. The purge writes each month's totals into the books in
 *   the same transaction, and the balance sheet has to come out identical
 *   afterwards. That last assertion is the whole point of the feature.
 *
 * Needs the API on 8099 with an admin key in /tmp/adminkey, and a database
 * it may write to — it creates its own back-dated invoices and purges those.
 *
 *   node test/archive.test.js
 */
const fs = require('fs');
const crypto = require('crypto');
const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const post = (p, b) => fetch(B + p, { method: 'POST', headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));

/** Every number in a nested object, flattened, so two can be compared whole. */
function flat(o, p = '') {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flat(v, p + k + '.'));
    else if (typeof v === 'number') out[p + k] = v;
  }
  return out;
}

(async () => {
  console.log('\n== a cutoff has to be sane ==');
  ok((await get('/api/archive/preview?months=0')).status === 400,
    'keeping zero months is refused — it would empty the live set');
  ok((await get('/api/archive/preview?months=999')).status === 400, 'so is an absurd window');
  ok((await get('/api/archive/preview?before=last-tuesday')).status === 400, 'so is a date that is not one');
  ok((await get('/api/archive/preview?months=12')).status === 200, 'twelve months is fine');

  console.log('\n== nothing to archive is not an error worth deleting over ==');
  const far = await fetch(`${B}/api/archive/download?before=1990-01-01`, { headers: H });
  ok(far.status === 404, 'an empty range refuses to produce an archive', String(far.status));

  console.log('\n== set up something old enough to archive ==');
  const clients = (await get('/api/clients')).body;
  const client = clients.find((c) => !c.is_internal);
  const CUT = '2019-01-01';           // safely before anything else in the database
  // Every figure below is measured as a DELTA against this baseline. The
  // earlier runs of this test archived into 2018 too, and their carry-forward
  // is still in the books — correctly, since it really was archived. Asserting
  // an absolute here passes once and then fails on every later run for a
  // reason that has nothing to do with the code.
  const pnlBase = (await get('/api/accounting/pnl?from=2018-01-01&to=2018-12-31')).body.revenue;
  // Same reasoning for the row counts: anything else already sitting before
  // the cutoff is in scope too, and this test does not own that date range.
  const scopeBase = (await get(`/api/archive/preview?before=${CUT}`)).body;
  const made = [];
  for (const [d, amt] of [['2018-03-04', 12000], ['2018-03-19', 8000], ['2018-06-02', 15000]]) {
    const r = await post('/api/invoices', {
      client_id: client.id, type: 'addon', amount: amt, issued_date: d, notes: 'archive test',
    });
    made.push(r.body.id);
  }
  ok(made.every(Boolean), 'three back-dated invoices exist', JSON.stringify(made));
  await post('/api/payments', {
    invoice_id: made[0], client_id: client.id, kind: 'receipt',
    amount: 5000, received_date: '2018-04-10', method: 'bank',
  });

  const before = flat((await get('/api/accounting/balance-sheet')).body);
  const pnlBefore = (await get('/api/accounting/pnl?from=2018-01-01&to=2018-12-31')).body.revenue;
  ok(pnlBefore.gross - pnlBase.gross === 35000,
    'the 2018 P&L rises by 35,000 while the new rows are live',
    `${pnlBase.gross} -> ${pnlBefore.gross}`);

  console.log('\n== the preview describes exactly what would go ==');
  const prev = (await get(`/api/archive/preview?before=${CUT}`)).body;
  ok(prev.invoice_count - scopeBase.invoice_count === 3,
    'three more invoices in scope than before', `${scopeBase.invoice_count} -> ${prev.invoice_count}`);
  ok(prev.payment_count - scopeBase.payment_count === 1,
    'and the receipt against one of them', `${scopeBase.payment_count} -> ${prev.payment_count}`);
  // Three months, not two: the March invoices, the June one, and APRIL — the
  // month the receipt was banked. A receipt belongs to the month it arrived,
  // not the month of the invoice it settles. Folding it into March would
  // still balance the sheet, which is cumulative, but would put revenue and
  // cash in the same month on a P&L that has them a month apart.
  const at = (list, ym) => list.find((m) => m.month.startsWith(ym)) || { revenue: 0, receipts: 0 };
  const march = at(prev.months, '2018-03'), march0 = at(scopeBase.months, '2018-03');
  const april = at(prev.months, '2018-04'), april0 = at(scopeBase.months, '2018-04');
  ok(march.revenue - march0.revenue === 20000,
    'March gains the two March invoices', `${march0.revenue} -> ${march.revenue}`);
  ok(march.receipts - march0.receipts === 0,
    'and no receipt — none arrived in March', `${march0.receipts} -> ${march.receipts}`);
  ok(april.receipts - april0.receipts === 5000 && april.revenue - april0.revenue === 0,
    'April gains the receipt and no revenue, which is when the money actually moved',
    JSON.stringify(april));
  // A preview must not be a write.
  ok((await get('/api/archive')).body.older_than_window >= 3, 'previewing changed nothing');

  console.log('\n== a purge without the archive is refused ==');
  ok((await post('/api/archive/purge', { confirm: 'PURGE' })).status === 400, 'no hash at all');
  ok((await post('/api/archive/purge', {
    sha256: crypto.createHash('sha256').update('not the file').digest('hex'), confirm: 'PURGE',
  })).status === 404, 'a hash that matches no archive');
  ok((await get('/api/archive/preview?before=' + CUT)).body.invoice_count === prev.invoice_count,
    'and after all that, every invoice is still there');

  console.log('\n== the archive names the bytes it produced ==');
  const dl = await fetch(`${B}/api/archive/download?before=${CUT}`, { headers: H });
  const body = Buffer.from(await dl.arrayBuffer());
  const header = dl.headers.get('x-archive-sha256');
  ok(dl.status === 200, 'it downloads', String(dl.status));
  ok(body.slice(0, 2).toString() === 'PK', 'as a real workbook', body.slice(0, 4).toString('hex'));
  ok(header === crypto.createHash('sha256').update(body).digest('hex'),
    'and the hash in the header is of exactly those bytes');

  console.log('\n== confirmation is not optional ==');
  ok((await post('/api/archive/purge', { sha256: header })).status === 400, 'the confirm word is required');
  ok((await post('/api/archive/purge', { sha256: header, confirm: 'yes' })).status === 400,
    'and it has to be the right word');
  ok((await get('/api/archive/preview?before=' + CUT)).body.invoice_count === prev.invoice_count,
    'still nothing deleted');

  console.log('\n== the purge, and what it must not disturb ==');
  const purge = await post('/api/archive/purge', { sha256: header, confirm: 'PURGE' });
  ok(purge.status === 200, 'it goes through', JSON.stringify(purge.body).slice(0, 140));
  ok(purge.body.invoices_removed === prev.invoice_count,
    'everything in scope was removed, not just this test\'s rows',
    `${purge.body.invoices_removed} of ${prev.invoice_count}`);
  ok(purge.body.ledger_entries_removed === prev.payment_count,
    'and the ledger entries with them', String(purge.body.ledger_entries_removed));
  ok(purge.body.months_carried_forward === prev.months.length,
    'every month in scope carried forward', `${purge.body.months_carried_forward} of ${prev.months.length}`);

  const after = flat((await get('/api/accounting/balance-sheet')).body);
  const moved = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k]);
  ok(moved.length === 0,
    'THE BALANCE SHEET IS IDENTICAL — not one figure moved',
    moved.map((k) => `${k}: ${before[k]} -> ${after[k]}`).join(', ').slice(0, 300));

  const pnlAfter = (await get('/api/accounting/pnl?from=2018-01-01&to=2018-12-31')).body.revenue;
  ok(pnlAfter.gross === pnlBefore.gross,
    'the 2018 P&L still reads 35,000 with no rows behind it', String(pnlAfter.gross));
  ok(pnlAfter.invoices_issued === pnlBefore.invoices_issued,
    'and still counts three invoices', String(pnlAfter.invoices_issued));
  ok(pnlAfter.archived_revenue - pnlBase.archived_revenue === 35000,
    'flagged as archived, so nobody totals the by-type split and finds a hole',
    `${pnlBase.archived_revenue} -> ${pnlAfter.archived_revenue}`);

  console.log('\n== and it does not happen twice ==');
  ok((await post('/api/archive/purge', { sha256: header, confirm: 'PURGE' })).status === 404,
    'the same hash cannot be replayed once its run is purged');
  const archNow = (await get('/api/archive')).body;
  ok(archNow.archived.invoices >= 3, 'the archive summary knows about them', String(archNow.archived.invoices));
  ok(archNow.runs.some((r) => r.status === 'purged'), 'and the run is on the record');

  // The rows really are gone, not merely hidden.
  ok((await get(`/api/archive/preview?before=${CUT}`)).body.invoice_count === 0,
    'nothing is left in that range');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
