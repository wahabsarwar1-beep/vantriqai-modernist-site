const express = require('express');
const db = require('../db');
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
  const { client_id, type, amount, period, status, issued_date, overage_sessions, notes } = req.body || {};
  if (!client_id || !type) return res.status(400).json({ error: 'client_id and type are required' });

  let finalAmount = amount;
  let finalOverage = overage_sessions || 0;

  // If caller wants us to auto-price a retainer invoice from live usage, pass
  // { auto_from_usage: true, month: 'YYYY-MM-01' } instead of amount.
  if (req.body.auto_from_usage && type === 'retainer') {
    const clientRes = await db.query(`select product_id from clients where id = $1`, [client_id]);
    const productId = clientRes.rows[0] && clientRes.rows[0].product_id;
    if (!productId) return res.status(400).json({ error: 'Client has no assigned package' });
    const productRes = await db.query(`select retainer, quota, overage_rate from products where id = $1`, [productId]);
    const product = productRes.rows[0];
    const month = req.body.month || new Date().toISOString().slice(0, 7) + '-01';
    const usageRes = await db.query(
      `select sessions from v_monthly_usage where client_id = $1 and period_month = $2::date`,
      [client_id, month]
    );
    const sessionsUsed = (usageRes.rows[0] && usageRes.rows[0].sessions) || 0;
    const overSessions = Math.max(0, sessionsUsed - product.quota);
    finalOverage = overSessions;
    finalAmount = Number(product.retainer) + overSessions * Number(product.overage_rate);
  }

  const { rows } = await db.query(
    `insert into invoices (client_id, type, amount, period, status, issued_date, overage_sessions, notes)
     values ($1,$2,$3,$4,$5, coalesce($6, current_date), $7, $8) returning *`,
    [client_id, type, finalAmount || 0, period || null, status || 'pending', issued_date || null, finalOverage, notes || '']
  );
  res.status(201).json(rows[0]);
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

router.delete('/:id', async (req, res) => {
  await db.query(`delete from invoices where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
