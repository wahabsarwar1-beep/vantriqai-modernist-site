const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashKey } = require('../middleware/auth');
const router = express.Router();

// List reps, with a live count of leads each one owns (admin visibility —
// this is exactly the cross-rep view individual reps never get).
router.get('/', async (req, res) => {
  const { rows } = await db.query(`
    select r.id, r.name, r.email, r.active, r.created_at, r.last_used_at,
      count(c.id) filter (where c.owner_rep_id = r.id) as lead_count,
      count(c.id) filter (where c.owner_rep_id = r.id and c.sales_stage = 'closure' and c.close_outcome = 'won') as won_count
    from sales_reps r
    left join clients c on c.owner_rep_id = r.id
    group by r.id
    order by r.created_at asc
  `);
  res.json(rows);
});

// Create a rep and issue their login key — shown once, same pattern as admin/webhook keys.
router.post('/', async (req, res) => {
  const { name, email } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const plaintext = 'rep_' + crypto.randomBytes(20).toString('hex');
  const hash = hashKey(plaintext);
  const { rows } = await db.query(
    `insert into sales_reps (name, email, key_hash) values ($1,$2,$3) returning id, name, email, active, created_at`,
    [name, email || '', hash]
  );
  res.status(201).json({ ...rows[0], key: plaintext, login_path: '/rep.html' });
});

router.put('/:id', async (req, res) => {
  const { name, email, active } = req.body || {};
  const { rows } = await db.query(
    `update sales_reps set name=coalesce($2,name), email=coalesce($3,email), active=coalesce($4,active) where id=$1 returning id, name, email, active, created_at`,
    [req.params.id, name, email, active]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rep not found' });
  res.json(rows[0]);
});

// Issue a brand-new key for an existing rep (e.g. their old one leaked). Old key stops working immediately.
router.post('/:id/reset-key', async (req, res) => {
  const plaintext = 'rep_' + crypto.randomBytes(20).toString('hex');
  const hash = hashKey(plaintext);
  const { rows } = await db.query(
    `update sales_reps set key_hash = $2 where id = $1 returning id, name`,
    [req.params.id, hash]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Rep not found' });
  res.json({ ...rows[0], key: plaintext, login_path: '/rep.html' });
});

router.delete('/:id', async (req, res) => {
  // Reps are deactivated, not deleted — their historical leads stay attributed correctly.
  await db.query(`update sales_reps set active = false where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
