const express = require('express');
const db = require('../db');
const router = express.Router();

/**
 * Package changes customers ask for from their portal. Admin-only.
 * Approving is what actually moves the client onto the new package and
 * raises the invoices — nothing bills off the customer's click alone.
 */

router.get('/', async (req, res) => {
  const status = req.query.status;
  const params = [];
  let where = '';
  if (status) { params.push(status); where = `where r.status = $1`; }
  const { rows } = await db.query(
    `select r.*, c.company, c.name as contact_name, p.name as product_name,
            p.setup_fee, p.retainer, cur.name as current_product_name
       from package_requests r
       join clients c on c.id = r.client_id
       join products p on p.id = r.product_id
       left join products cur on cur.id = c.product_id
       ${where}
      order by r.created_at desc`,
    params
  );
  res.json(rows.map((r) => ({
    id: r.id, client_id: r.client_id, company: r.company, contact_name: r.contact_name,
    product_id: r.product_id, product_name: r.product_name,
    current_product_name: r.current_product_name,
    setup_fee: +r.setup_fee, retainer: +r.retainer,
    status: r.status, note: r.note, created_at: r.created_at, decided_at: r.decided_at,
  })));
});

// Approve: move the client onto the requested package. Invoices are raised
// only for a client already active — a lead still bills when they go active.
router.post('/:id/approve', async (req, res) => {
  const { rows: found } = await db.query(`select * from package_requests where id = $1`, [req.params.id]);
  const reqRow = found[0];
  if (!reqRow) return res.status(404).json({ error: 'Request not found' });
  if (reqRow.status !== 'pending') return res.status(409).json({ error: `This request was already ${reqRow.status}.` });

  const [{ rows: clientRows }, { rows: prodRows }] = await Promise.all([
    db.query(`select * from clients where id = $1`, [reqRow.client_id]),
    db.query(`select * from products where id = $1`, [reqRow.product_id]),
  ]);
  const client = clientRows[0];
  const product = prodRows[0];
  if (!client || !product) return res.status(404).json({ error: 'Client or package no longer exists.' });

  await db.query(`update clients set product_id = $2 where id = $1`, [client.id, product.id]);
  await db.query(
    `update package_requests set status = 'approved', decided_at = now() where id = $1`,
    [req.params.id]
  );

  // Moving an active client's package raises the new retainer immediately;
  // a non-active client bills when they reach 'active' as usual.
  let invoice = null;
  if (client.stage === 'active') {
    const period = new Date().toISOString().slice(0, 7);
    const { rows } = await db.query(
      `insert into invoices (client_id, type, amount, status, period, notes)
       values ($1,'retainer',$2,'pending',$3,$4) returning *`,
      [client.id, product.retainer, period, `Package change to ${product.name} (approved from portal request)`]
    );
    invoice = rows[0];
  }

  res.json({ status: 'approved', client_id: client.id, product_id: product.id, invoice });
});

router.post('/:id/reject', async (req, res) => {
  const { rows } = await db.query(
    `update package_requests set status = 'rejected', decided_at = now()
      where id = $1 and status = 'pending' returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: 'Request not found or already decided.' });
  res.json({ status: 'rejected', id: rows[0].id });
});

module.exports = router;
