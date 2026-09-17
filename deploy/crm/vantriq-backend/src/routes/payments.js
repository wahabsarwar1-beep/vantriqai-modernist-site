const express = require('express');
const db = require('../db');
const { settlementOf, derivedStatus, ROUND } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * The receipts ledger.
 *
 * Before this, an invoice was "paid" because someone chose that from a
 * dropdown. Now it is paid because money arrived and there is a row saying
 * when, how much, by what method and against what reference. Status follows
 * from the ledger; nobody types it.
 *
 * Four kinds of row, and only three of them are cash:
 *
 *   receipt       money in, against net_payable.
 *   ait_challan   the CPR the client sends back after depositing the tax they
 *                 withheld. It is NOT cash and does not reduce the balance —
 *                 net_payable already had the AIT taken out. What it does is
 *                 turn a claimed tax credit into a documented one.
 *   write_off     the debt is not coming. Clears the balance, costs the P&L.
 *   credit_note   we agreed not to charge it after all. Clears the balance,
 *                 reduces revenue.
 */

const KINDS = ['receipt', 'ait_challan', 'write_off', 'credit_note'];

/** Writes back the status the ledger implies for one invoice. */
async function restate(invoiceId) {
  const [{ rows: invRows }, { rows: pays }] = await Promise.all([
    db.query(`select i.*, c.is_internal from invoices i join clients c on c.id = i.client_id where i.id = $1`, [invoiceId]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [invoiceId]),
  ]);
  const inv = invRows[0];
  if (!inv) return null;
  if (inv.is_internal) return { ...inv, payments: pays, settlement: settlementOf(inv, pays) };
  const settlement = settlementOf(inv, pays);
  const status = derivedStatus(inv, settlement);
  if (status !== inv.status) {
    await db.query(`update invoices set status = $2 where id = $1`, [inv.id, status]);
    inv.status = status;
  }
  return { ...inv, payments: pays, settlement };
}

/** GET /api/payments?client_id=&invoice_id=&from=&to=&kind= */
router.get('/', async (req, res) => {
  const { client_id, invoice_id, from, to, kind } = req.query;
  const clauses = [];
  const params = [];
  if (client_id) { params.push(client_id); clauses.push(`p.client_id = $${params.length}`); }
  if (invoice_id) { params.push(invoice_id); clauses.push(`p.invoice_id = $${params.length}`); }
  if (kind) { params.push(kind); clauses.push(`p.kind = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`p.received_date >= $${params.length}::date`); }
  if (to) { params.push(to); clauses.push(`p.received_date <= $${params.length}::date`); }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const { rows } = await db.query(
    `select p.*, i.invoice_number, i.type as invoice_type, i.period, c.company
       from payments p
       join invoices i on i.id = p.invoice_id
       left join clients c on c.id = p.client_id
       ${where}
      order by p.received_date desc, p.created_at desc`,
    params
  );
  res.json(rows);
});

/** POST /api/payments — record one ledger row against one invoice. */
router.post('/', async (req, res) => {
  const { invoice_id, amount, kind, method, reference, received_date, notes } = req.body || {};
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required' });
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: 'amount is required' });
  }
  const k = kind || 'receipt';
  if (!KINDS.includes(k)) return res.status(400).json({ error: `kind must be one of ${KINDS.join(', ')}` });
  if (Number(amount) <= 0) return res.status(400).json({ error: 'amount must be greater than zero' });

  const { rows: invRows } = await db.query(
    `select i.*, c.is_internal from invoices i join clients c on c.id = i.client_id where i.id = $1`,
    [invoice_id]
  );
  const inv = invRows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  if (inv.status === 'void') return res.status(409).json({ error: 'This invoice has been voided.' });
  // Nobody pays themselves. An internal invoice is settled at issue and has no
  // ledger; letting one be recorded would show cash arriving that never did.
  if (inv.is_internal) {
    return res.status(409).json({ error: 'This is our own internal account — its billing is a cost, not a receivable, and it is settled when issued.' });
  }

  // Overpaying is nearly always a typo — a digit too many, or the same
  // receipt entered twice. Refuse it and say by how much, rather than
  // leaving a negative balance for someone to find at year end.
  const { rows: existing } = await db.query(`select * from payments where invoice_id = $1`, [invoice_id]);
  const before = settlementOf(inv, existing);
  if (k !== 'ait_challan' && Number(amount) - before.balance > 0.009) {
    return res.status(409).json({
      error: `That is more than is outstanding. PKR ${before.balance.toLocaleString('en-PK')} remains on ${inv.invoice_number || 'this invoice'}.`,
      outstanding: before.balance,
    });
  }
  if (k === 'ait_challan' && Number(amount) - (Number(inv.ait_amount || 0) - before.ait_challans) > 0.009) {
    return res.status(409).json({
      error: `That is more AIT than was withheld on this invoice (PKR ${Number(inv.ait_amount || 0).toLocaleString('en-PK')}).`,
      withheld: Number(inv.ait_amount || 0),
    });
  }

  await db.query(
    `insert into payments (invoice_id, client_id, amount, kind, method, reference, received_date, notes, recorded_by)
     values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8, $9)`,
    [
      invoice_id, inv.client_id, ROUND(amount), k, method || '', reference || '',
      received_date || null, notes || '',
      (req.user && req.user.email) || req.authKind || '',
    ]
  );
  res.status(201).json(await restate(invoice_id));
});

/** Deleting a ledger row is a correction, so the invoice restates itself. */
router.delete('/:id', blockAutomation, async (req, res) => {
  const { rows } = await db.query(`delete from payments where id = $1 returning invoice_id`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Payment not found' });
  res.json(await restate(rows[0].invoice_id));
});

/**
 * GET /api/payments/statement/:client_id
 *
 * One client's account: every invoice raised, everything received against it,
 * and what is still outstanding — the document you send when someone asks
 * "what do we owe you?".
 */
router.get('/statement/:client_id', async (req, res) => {
  const { rows: clientRows } = await db.query(`select * from clients where id = $1`, [req.params.client_id]);
  const client = clientRows[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const [{ rows: invoices }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoices where client_id = $1 order by issued_date, created_at`, [client.id]),
    db.query(`select * from payments where client_id = $1 order by received_date, created_at`, [client.id]),
  ]);
  const byInvoice = new Map();
  for (const p of pays) {
    if (!byInvoice.has(p.invoice_id)) byInvoice.set(p.invoice_id, []);
    byInvoice.get(p.invoice_id).push(p);
  }

  const lines = invoices.map((inv) => ({
    ...inv,
    payments: byInvoice.get(inv.id) || [],
    settlement: settlementOf(inv, byInvoice.get(inv.id)),
  }));
  const open = lines.filter((l) => l.status !== 'void');
  const sum = (f) => ROUND(open.reduce((s, l) => s + f(l), 0));
  const today = new Date().toISOString().slice(0, 10);

  // Age the debt the way a collections list wants to read it.
  const bucket = (l) => {
    if (l.settlement.balance <= 0.009) return null;
    if (!l.due_date || l.due_date >= today) return 'current';
    const days = Math.floor((new Date(today) - new Date(l.due_date)) / 86400000);
    if (days <= 30) return 'd1_30';
    if (days <= 60) return 'd31_60';
    if (days <= 90) return 'd61_90';
    return 'd90_plus';
  };
  const ageing = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 };
  for (const l of open) {
    const b = bucket(l);
    if (b) ageing[b] = ROUND(ageing[b] + l.settlement.balance);
  }

  res.json({
    client: {
      id: client.id, company: client.company, name: client.name, email: client.email,
      ntn: client.ntn, strn: client.strn, billing_address: client.billing_address,
      is_internal: client.is_internal,
    },
    invoices: lines,
    totals: {
      invoiced_excluding_tax: sum((l) => Number(l.amount)),
      gst_charged: sum((l) => Number(l.tax_amount || 0)),
      ait_withheld: sum((l) => Number(l.ait_amount || 0)),
      ait_challans_received: sum((l) => l.settlement.ait_challans),
      net_billed: sum((l) => l.settlement.due),
      received: sum((l) => l.settlement.received),
      written_off: sum((l) => l.settlement.written_off),
      credited: sum((l) => l.settlement.credited),
      outstanding: sum((l) => l.settlement.balance),
    },
    ageing,
  });
});

module.exports = router;
