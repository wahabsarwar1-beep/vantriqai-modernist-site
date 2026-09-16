const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from expenses order by created_at desc`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { label, category, amount, recurring, start_date, end_date, vendor_id } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });
  const { rows } = await db.query(
    `insert into expenses (label, category, amount, recurring, start_date, end_date, vendor_id)
     values ($1,$2,$3,$4,coalesce($5,current_date),$6,$7) returning *`,
    [label, category || 'Other', amount || 0, recurring !== false, start_date || null,
      end_date || null, vendor_id || null]
  );
  res.status(201).json(rows[0]);
});

/**
 * Ending a recurring expense rather than deleting it. Deleting the row also
 * deletes it from every past month's P&L, which is not what "we cancelled
 * that subscription in March" means.
 */
router.patch('/:id', async (req, res) => {
  const allowed = ['label', 'category', 'amount', 'recurring', 'start_date', 'end_date', 'vendor_id'];
  const sets = [];
  const params = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    params.push(req.body[f] === '' ? null : req.body[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(
    `update expenses set ${sets.join(', ')} where id = $1 returning *`, params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Expense not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query(`delete from expenses where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
