/**
 * v9 — billing across five tax authorities.
 *
 * Needs no Postgres and no running server: db is stubbed in the require
 * cache and billing.js is exercised directly.
 *
 *   node test/tax-jurisdiction.test.js
 */
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + extra)); };

// --- stubs ------------------------------------------------------------
const state = {
  settings: {
    default_tax_rate: 15, default_ait_rate: 11, seller_strn: 'STRN-COMPANY-WIDE',
    invoice_prefix: 'VAI', payment_terms_days: 7, currency: 'PKR', company_name: 'Vantriq AI',
  },
  jurisdictions: {
    ICT: { code: 'ICT', name: 'Islamabad Capital Territory (FBR)', sales_tax_rate: 5, seller_reg_no: 'ICT-REG-1' },
    PRA: { code: 'PRA', name: 'Punjab Revenue Authority', sales_tax_rate: 0, seller_reg_no: 'PRA-REG-2' },
  },
  inserted: [],
};

const dbStub = {
  async query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('select * from settings')) return { rows: [state.settings] };
    if (q.startsWith('select * from tax_jurisdictions where code')) {
      const j = state.jurisdictions[params[0]];
      return { rows: j ? [j] : [] };
    }
    if (q.includes("nextval('invoice_number_seq')")) return { rows: [{ n: 1 }] };
    if (q.startsWith('insert into invoices')) {
      // Columns are READ OUT OF THE SQL, never counted by hand. Positional
      // indices into the param array look precise and are quietly wrong the
      // moment a column is added in the middle of the real insert — every
      // field after it shifts by one, and the failures land nowhere near the
      // change that caused them.
      const cols = q.slice(q.indexOf('(') + 1, q.indexOf(')'))
        .split(',').map((c) => c.trim()).filter(Boolean);
      const row = { id: 'inv-' + (state.inserted.length + 1) };
      cols.forEach((c, i) => { row[c] = params[i]; });
      state.inserted.push(row);
      return { rows: [row] };
    }
    if (q.startsWith('insert into invoice_lines')) return { rows: [] };
    return { rows: [] };
  },
};
require.cache[require.resolve(path.join(SRC, 'db.js'))] = { id: 'db', filename: 'db', loaded: true, exports: dbStub };

const billing = require(path.join(SRC, 'utils', 'billing.js'));

(async () => {
  console.log('\n== the rate follows the authority, not the company default ==');

  // ICT client: 5%, not the 15% company default.
  let inv = await billing.createInvoice(
    { id: 'c1', tax_jurisdiction: 'ICT', ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.tax_rate) === 5, 'ICT client billed at the ICT rate (5%)', 'got ' + inv.tax_rate);
  ok(Number(inv.tax_amount) === 5000, 'GST 5% of 100000 = 5000', 'got ' + inv.tax_amount);
  ok(inv.tax_jurisdiction === 'ICT', 'jurisdiction stamped on the invoice', 'got ' + inv.tax_jurisdiction);
  ok(inv.seller_reg_no === 'ICT-REG-1', "the ICT registration number is stamped, not the company-wide one", 'got ' + inv.seller_reg_no);

  // Punjab zero-rates the same service. 0 is a real rate, not "unset".
  inv = await billing.createInvoice(
    { id: 'c2', tax_jurisdiction: 'PRA', ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.tax_rate) === 0, 'Punjab client zero-rated, NOT defaulted to 15%', 'got ' + inv.tax_rate);
  ok(Number(inv.tax_amount) === 0, 'no GST charged in Punjab', 'got ' + inv.tax_amount);
  ok(inv.seller_reg_no === 'PRA-REG-2', 'the Punjab registration number is stamped', 'got ' + inv.seller_reg_no);

  console.log('\n== precedence ==');

  // A rate set on the client beats the jurisdiction.
  inv = await billing.createInvoice(
    { id: 'c3', tax_jurisdiction: 'ICT', tax_rate: 16, ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.tax_rate) === 16, 'an explicit client rate outranks the jurisdiction', 'got ' + inv.tax_rate);

  // No jurisdiction at all: unchanged behaviour, company default.
  inv = await billing.createInvoice(
    { id: 'c4', ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.tax_rate) === 15, 'a client with no jurisdiction still gets the company default', 'got ' + inv.tax_rate);
  ok(inv.tax_jurisdiction === null, 'no jurisdiction stamped when none is set', 'got ' + inv.tax_jurisdiction);
  ok(inv.seller_reg_no === 'STRN-COMPANY-WIDE', 'falls back to the company registration number', 'got ' + inv.seller_reg_no);

  console.log('\n== withholding is federal and does not move with the province ==');

  inv = await billing.createInvoice(
    { id: 'c5', tax_jurisdiction: 'PRA', ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.ait_rate) === 11, 'AIT still comes from the company default in a zero-rated province', 'got ' + inv.ait_rate);
  ok(Number(inv.net_payable) === 89000, 'net payable = 100000 + 0 GST - 11000 AIT', 'got ' + inv.net_payable);

  inv = await billing.createInvoice(
    { id: 'c6', tax_jurisdiction: 'ICT', ait_rate: 4, ntn: '', strn: '', billing_address: '' },
    { type: 'retainer', amount: 100000 }
  );
  ok(Number(inv.ait_rate) === 4, 'an IT-services client can carry the 4% rate', 'got ' + inv.ait_rate);
  ok(Number(inv.net_payable) === 101000, 'net payable = 100000 + 5000 GST - 4000 AIT', 'got ' + inv.net_payable);

  console.log('\n== the document names the authority ==');
  const doc = billing.buildTaxInvoice(
    { invoice_number: 'VAI-2026-000001', amount: 100000, tax_amount: 5000, total_amount: 105000,
      ait_amount: 4000, net_payable: 101000, tax_jurisdiction: 'ICT', seller_reg_no: 'ICT-REG-1',
      issued_date: '2026-09-17', due_date: '2026-09-24', status: 'pending', type: 'retainer' },
    { company: 'Acme', name: 'A', email: 'a@b.c', phone: '1' }, state.settings, [], []
  );
  ok(doc.seller.strn === 'ICT-REG-1', 'invoice shows the registration it was raised under', 'got ' + doc.seller.strn);
  ok(doc.tax_jurisdiction === 'ICT', 'invoice names its jurisdiction for the return it belongs to', 'got ' + doc.tax_jurisdiction);

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})();
