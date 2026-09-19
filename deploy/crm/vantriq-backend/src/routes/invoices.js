const express = require('express');
const db = require('../db');
const {
  createInvoice, getSettings, monthLabel, buildTaxInvoice,
  settlementOf, derivedStatus,
} = require('../utils/billing');
const { sendInvoice, previewInvoiceSend, deliveryHistory } = require('../utils/invoiceDelivery');
const { renderInvoicePdf, invoiceFilename } = require('../utils/invoicePdf');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Loads the ledger rows for a set of invoices in one query, keyed by
 * invoice_id. The list view shows every invoice's outstanding balance, and
 * doing that a row at a time is how a 200-invoice page turns into 200 queries.
 */
async function paymentsByInvoice(ids) {
  const map = new Map();
  if (!ids.length) return map;
  const { rows } = await db.query(
    `select * from payments where invoice_id = any($1::uuid[]) order by received_date, created_at`, [ids]
  );
  for (const p of rows) {
    if (!map.has(p.invoice_id)) map.set(p.invoice_id, []);
    map.get(p.invoice_id).push(p);
  }
  return map;
}

router.get('/', async (req, res) => {
  const { status, client_id, from, to, type } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (client_id) { params.push(client_id); clauses.push(`client_id = $${params.length}`); }
  if (type) { params.push(type); clauses.push(`type = $${params.length}`); }
  if (from) { params.push(from); clauses.push(`issued_date >= $${params.length}::date`); }
  if (to) { params.push(to); clauses.push(`issued_date <= $${params.length}::date`); }
  const where = clauses.length ? `where ${clauses.map((c) => `i.${c}`).join(' and ')}` : '';
  const { rows } = await db.query(
    `select i.*, c.is_internal
       from invoices i join clients c on c.id = i.client_id
       ${where} order by i.issued_date desc, i.created_at desc`, params
  );
  const ledger = await paymentsByInvoice(rows.map((r) => r.id));
  res.json(rows.map((r) => ({ ...r, settlement: settlementOf(r, ledger.get(r.id)) })));
});

/** One invoice with its printed body and its ledger. */
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `select i.*, c.is_internal from invoices i join clients c on c.id = i.client_id where i.id = $1`,
    [req.params.id]
  );
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [inv.id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [inv.id]),
  ]);
  res.json({ ...inv, lines, payments: pays, settlement: settlementOf(inv, pays) });
});

router.post('/', async (req, res) => {
  const { client_id, type, amount, period, status, issued_date, overage_sessions, notes,
    tax_rate, ait_rate, due_date, lines } = req.body || {};
  if (!client_id || !type) return res.status(400).json({ error: 'client_id and type are required' });

  const { rows: clientRows } = await db.query(`select * from clients where id = $1`, [client_id]);
  const client = clientRows[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let finalAmount = amount;
  let finalOverage = overage_sessions || 0;
  let finalPeriod = period === undefined || period === null ? period : String(period).trim();
  let finalLines = lines;

  // Auto-pricing from live usage: pass { auto_from_usage: true, month: 'YYYY-MM-01' }
  // instead of an amount and the month's retainer plus any billable overage is
  // computed here. This is what the monthly n8n billing run calls.
  if (req.body.auto_from_usage && type === 'retainer') {
    if (!client.product_id) return res.status(400).json({ error: 'Client has no assigned package' });
    const productRes = await db.query(`select name, retainer, quota, overage_rate from products where id = $1`, [client.product_id]);
    const product = productRes.rows[0];
    const month = req.body.month || new Date().toISOString().slice(0, 7) + '-01';
    const usageRes = await db.query(
      `select sessions from v_monthly_usage where client_id = $1 and period_month = $2::date`,
      [client_id, month]
    );
    const retainer = Number(client.custom_retainer != null ? client.custom_retainer : product.retainer);
    const quota = Number(client.custom_quota != null ? client.custom_quota : product.quota);
    const rate = Number(client.custom_overage_rate != null ? client.custom_overage_rate : product.overage_rate);
    const sessionsUsed = Number((usageRes.rows[0] && usageRes.rows[0].sessions) || 0);
    const overSessions = Math.max(0, sessionsUsed - quota);
    finalOverage = overSessions;
    finalAmount = retainer + overSessions * rate;
    if (!finalPeriod) finalPeriod = monthLabel(month);
    // The month's bill reads as two lines rather than one lump, so the
    // customer can see exactly what the overage cost them.
    finalLines = [{
      description: `${product.name} — monthly retainer`,
      detail: `${finalPeriod} · ${quota} conversations included`,
      qty: 1, unit_price: retainer, amount: retainer,
    }];
    if (overSessions > 0) {
      finalLines.push({
        description: 'Conversations over included quota',
        detail: `${sessionsUsed} used against a quota of ${quota}`,
        qty: overSessions, unit_price: rate, amount: overSessions * rate,
      });
    }
  }

  // Raising the same month's retainer twice is the mistake an automated
  // monthly run makes; refuse it rather than double-bill the customer.
  if (type === 'retainer' && finalPeriod) {
    const { rows: dupe } = await db.query(
      `select id, invoice_number from invoices where client_id = $1 and type = 'retainer' and period = $2 limit 1`,
      [client_id, finalPeriod]
    );
    if (dupe[0]) {
      return res.status(409).json({
        error: `A retainer invoice for ${finalPeriod} already exists (${dupe[0].invoice_number || dupe[0].id}).`,
        existing_invoice_id: dupe[0].id,
      });
    }
  }

  const invoice = await createInvoice(client, {
    type, amount: finalAmount || 0, period: finalPeriod, status, issued_date,
    overage_sessions: finalOverage, notes, tax_rate, ait_rate, due_date, lines: finalLines,
  });
  res.status(201).json(invoice);
});

/**
 * Status is normally derived from the ledger — record a receipt and the
 * invoice marks itself paid. This endpoint stays for the two cases a ledger
 * cannot express: voiding an invoice raised in error, and an admin
 * correcting a status by hand.
 */
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'partial', 'paid', 'overdue', 'void'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { rows } = await db.query(
    `update invoices set status = $2 where id = $1 returning *`, [req.params.id, status]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
});

/**
 * Re-reads every open invoice's ledger and its due date and writes back the
 * status that follows from them. Cheap enough to run on every dashboard load,
 * and it is what turns a pending invoice overdue without anyone touching it.
 */
router.post('/reconcile', async (req, res) => {
  // Internal invoices are excluded on purpose: VantriqAI billing itself is a
  // transfer, settled the moment it is raised. Reconciling it against an empty
  // ledger would turn it into a debt the company owes itself, and put it on
  // the chase list.
  const { rows } = await db.query(
    `select i.* from invoices i join clients c on c.id = i.client_id
      where i.status <> 'void' and c.is_internal = false`
  );
  const ledger = await paymentsByInvoice(rows.map((r) => r.id));
  let changed = 0;
  for (const inv of rows) {
    const next = derivedStatus(inv, settlementOf(inv, ledger.get(inv.id)));
    if (next !== inv.status) {
      await db.query(`update invoices set status = $2 where id = $1`, [inv.id, next]);
      changed += 1;
    }
  }
  res.json({ reviewed: rows.length, changed });
});

/** The printable tax invoice — see buildTaxInvoice in src/utils/billing.js. */
router.get('/:id/tax-invoice', async (req, res) => {
  const [{ rows }, settings] = await Promise.all([
    db.query(
      `select i.*, c.company, c.name, c.email, c.phone
         from invoices i join clients c on c.id = i.client_id
        where i.id = $1`,
      [req.params.id]
    ),
    getSettings(),
  ]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [inv.id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [inv.id]),
  ]);
  res.json(buildTaxInvoice(inv, inv, settings, lines, pays));
});

/**
 * GET /api/invoices/:id/pdf — the invoice as a file you can keep.
 *
 * The same document the customer is emailed and the same one the portal
 * prints, rendered from the same buildTaxInvoice() output. Before this, the
 * CRM's Download button wrote a hand-built text file listing five fields,
 * which is not something anyone can file or hand to an accountant.
 */
router.get('/:id/pdf', async (req, res) => {
  const [{ rows }, settings] = await Promise.all([
    db.query(
      `select i.*, c.company, c.name, c.email, c.phone
         from invoices i join clients c on c.id = i.client_id
        where i.id = $1`,
      [req.params.id]
    ),
    getSettings(),
  ]);
  const inv = rows[0];
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [inv.id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [inv.id]),
  ]);

  const doc = buildTaxInvoice(inv, inv, settings, lines, pays);
  try {
    const pdf = await renderInvoicePdf(doc);
    res.setHeader('Content-Type', 'application/pdf');
    // `inline` so a browser can preview it; the filename is still what it
    // saves as. invoiceFilename strips anything with no business in a header.
    res.setHeader('Content-Disposition', `inline; filename="${invoiceFilename(doc)}"`);
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: `Could not render the invoice: ${err.message}` });
  }
});

/**
 * POST /api/invoices/:id/send — email this invoice to the customer.
 *
 * The monthly run does this automatically as it raises each invoice; this is
 * for the ones raised by hand, and for resending after a bounce. An invoice
 * already emailed is skipped unless `force` is passed, so a stray double-click
 * does not send a customer their bill twice.
 *
 * `?preview=true` reports what would happen without sending.
 */
router.post('/:id/send', async (req, res) => {
  if (String(req.query.preview) === 'true') {
    return res.json(await previewInvoiceSend(req.params.id));
  }
  const result = await sendInvoice(req.params.id, { force: !!(req.body || {}).force });
  // A refusal to send is a 200 with an outcome, not an error: the caller asked
  // what happened, and "skipped, no email address" is a complete answer.
  res.json(result);
});

/** What has been emailed about this invoice, and when. */
router.get('/:id/delivery', async (req, res) => {
  res.json(await deliveryHistory(req.params.id));
});

router.delete('/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from invoices where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
