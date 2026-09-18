const express = require('express');
const db = require('../db');
const acc = require('../utils/accounting');
const router = express.Router();

/**
 * GET /api/expenses?include_derived=1&from=&to=
 *
 * The typed-in expenses \u2014 rent, salaries, subscriptions \u2014 and, when asked
 * for, the one cost nobody types in: what VantriqAI's own agents cost to run.
 * That figure is already an invoice on the internal account, so re-entering it
 * by hand would double it. It is derived instead, and marked `derived` so the
 * UI shows it as a cost without offering to edit something that is really an
 * invoice.
 *
 * It is converted to PKR on the way out. The internal invoices behind it are
 * raised in dollars, and this list is a list of rupees.
 */
router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from expenses order by created_at desc`);
  if (!req.query.include_derived) return res.json(rows);

  const to = req.query.to ? acc.DAY(req.query.to) : acc.DAY(new Date());
  const from = req.query.from ? acc.DAY(req.query.from) : acc.MONTH_START(to);
  const books = await acc.loadBooks(to);
  const pnl = acc.computePnl(books, from, to);
  const ai = pnl.cost_of_service;

  const derived = [];
  if (ai.internal_ai_usage > 0 || Object.keys(ai.internal_ai_usage_foreign).length) {
    const foreign = Object.entries(ai.internal_ai_usage_foreign)
      .map(([c, v]) => `${c} ${v}`).join(', ');
    derived.push({
      id: 'derived:internal_ai_usage',
      derived: true,
      label: ai.internal_label,
      category: 'AI model usage',
      amount: ai.internal_ai_usage,
      currency: books.settings.currency || 'PKR',
      recurring: true,
      start_date: from,
      end_date: to,
      // Says where the number came from and what it was before conversion,
      // so the rupee figure on screen can always be traced back to a dollar
      // invoice and the rate it was converted at.
      source: foreign
        ? `${foreign} at ${ai.usd_pkr_rate || 'no rate set'}`
        : 'Internal invoices',
      unconverted: ai.internal_ai_usage_unconverted,
    });
  }
  res.json([...derived, ...rows]);
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
