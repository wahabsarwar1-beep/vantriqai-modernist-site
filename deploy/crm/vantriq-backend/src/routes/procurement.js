const express = require('express');
const db = require('../db');
const router = express.Router();

/* ---------------------------- Vendors ---------------------------- */
router.get('/vendors', async (req, res) => {
  const { rows } = await db.query(`select * from vendors order by created_at asc`);
  res.json(rows);
});

router.post('/vendors', async (req, res) => {
  const { name, category, tiers, cost_min, cost_max, status } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const { rows } = await db.query(
    `insert into vendors (name, category, tiers, cost_min, cost_max, status)
     values ($1,$2,$3,$4,$5,$6) returning *`,
    [name, category || '', tiers || '', cost_min || 0, cost_max || 0, status || 'Active']
  );
  res.status(201).json(rows[0]);
});

router.put('/vendors/:id', async (req, res) => {
  const { name, category, tiers, cost_min, cost_max, status } = req.body || {};
  const { rows } = await db.query(
    `update vendors set name=coalesce($2,name), category=coalesce($3,category), tiers=coalesce($4,tiers),
      cost_min=coalesce($5,cost_min), cost_max=coalesce($6,cost_max), status=coalesce($7,status)
     where id = $1 returning *`,
    [req.params.id, name, category, tiers, cost_min, cost_max, status]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Vendor not found' });
  res.json(rows[0]);
});

router.delete('/vendors/:id', async (req, res) => {
  await db.query(`delete from purchase_orders where vendor_id = $1`, [req.params.id]);
  await db.query(`delete from vendors where id = $1`, [req.params.id]);
  res.status(204).end();
});

/* ------------------------- Purchase orders ------------------------- */
router.get('/purchase-orders', async (req, res) => {
  const { rows } = await db.query(
    `select po.*, v.name as vendor_name from purchase_orders po
     left join vendors v on v.id = po.vendor_id
     order by po.po_date desc, po.created_at desc`
  );
  res.json(rows);
});

router.post('/purchase-orders', async (req, res) => {
  const { vendor_id, item, amount, po_date, status } = req.body || {};
  if (!item) return res.status(400).json({ error: 'item is required' });
  const { rows } = await db.query(
    `insert into purchase_orders (vendor_id, item, amount, po_date, status)
     values ($1,$2,$3,coalesce($4,current_date),coalesce($5,'Ordered')) returning *`,
    [vendor_id || null, item, amount || 0, po_date || null, status || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/purchase-orders/:id', async (req, res) => {
  const { status, amount, item } = req.body || {};
  const { rows } = await db.query(
    `update purchase_orders set status=coalesce($2,status), amount=coalesce($3,amount), item=coalesce($4,item)
     where id = $1 returning *`,
    [req.params.id, status, amount, item]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Purchase order not found' });
  res.json(rows[0]);
});

router.delete('/purchase-orders/:id', async (req, res) => {
  await db.query(`delete from purchase_orders where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
