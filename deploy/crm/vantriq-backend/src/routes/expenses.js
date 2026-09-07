const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from expenses order by created_at desc`);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { label, category, amount, recurring, start_date } = req.body || {};
  if (!label) return res.status(400).json({ error: 'label is required' });
  const { rows } = await db.query(
    `insert into expenses (label, category, amount, recurring, start_date)
     values ($1,$2,$3,$4,coalesce($5,current_date)) returning *`,
    [label, category || 'Other', amount || 0, recurring !== false, start_date || null]
  );
  res.status(201).json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await db.query(`delete from expenses where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
