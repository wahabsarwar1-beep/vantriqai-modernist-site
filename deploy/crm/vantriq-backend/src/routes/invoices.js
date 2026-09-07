const express = require('express');
const db = require('../db');
const { createInvoice, getSettings, monthLabel, buildTaxInvoice } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

router.get('/', async (req, res) => {
  const { status, client_id } = req.query;
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (client_id) { params.push(client_id); clauses.push(`client_id = $${params.length}`); }
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';
  const { rows } = await db.query(
    `select * from invoices ${where} order by issued_date desc, created_at desc`, params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { client_id, type, amount, period, status, issued_date, overage_sessions, notes, tax_rate, due_date } = req.body || {};
  if (!client_id || !type) return res.status(400).json({ error: 'client_id and type are required' });

  const { rows: clientRows } = await db.query(`select * from clients where id = $1`, [client_id]);
  const client = clientRows[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let finalAmount = amount;
  let finalOverage = overage_sessions || 0;
  let finalPeriod = period === undefined || period === null ? period : String(period).trim();

  // Auto-pricing from live usage: pass { auto_from_usage: true, month: 'YYYY-MM-01' }
  // instead of an amount and the month's retainer plus any billable overage is
  // computed here. This is what the monthly n8n billing run calls.
  if (req.body.auto_from_usage && type === 'retainer') {
    if (!client.product_id) return res.status(400).json({ error: 'Client has no assigned package' });
    const productRes = await db.query(`select retainer, quota, overage_rate from products where id = $1`, [client.product_id]);
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
    overage_sessions: finalOverage, notes, tax_rate, due_date,
  });
  res.status(201).json(invoice);
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'paid', 'overdue'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const { rows } = await db.query(
    `update invoices set status = $2 where id = $1 returning *`, [req.params.id, status]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(rows[0]);
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
  res.json(buildTaxInvoice(inv, inv, settings));
});

router.delete('/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from invoices where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
