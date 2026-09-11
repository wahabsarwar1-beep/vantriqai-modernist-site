const express = require('express');
const db = require('../db');
const router = express.Router();

// Company details, including the registration numbers and tax rate printed on
// every invoice. invoice_prefix and payment_terms_days shape the invoices
// issued from here on; invoices already raised keep the numbers they were
// issued with.
const FIELDS = [
  'company_name', 'city', 'founder', 'currency', 'utilization',
  'ntn', 'strn', 'address', 'default_tax_rate', 'invoice_prefix', 'payment_terms_days',
  // What happens automatically when a client uses up their allowance.
  'overage_policy', 'overage_grace_pct',
];

const OVERAGE_POLICIES = ['serve', 'grace', 'block'];

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from settings where id = 1`);
  res.json(rows[0]);
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const cols = FIELDS.filter((f) => body[f] !== undefined && body[f] !== null);
  if (!cols.length) return res.status(400).json({ error: 'No settings to update' });

  if (cols.includes('default_tax_rate')) {
    const rate = Number(body.default_tax_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({ error: 'Tax rate must be a percentage between 0 and 100.' });
    }
  }
  if (cols.includes('invoice_prefix') && !/^[A-Za-z0-9-]{1,10}$/.test(String(body.invoice_prefix))) {
    return res.status(400).json({ error: 'Invoice prefix must be 1–10 letters, digits or hyphens.' });
  }
  if (cols.includes('overage_policy') && !OVERAGE_POLICIES.includes(String(body.overage_policy))) {
    return res.status(400).json({ error: `Over-quota policy must be one of: ${OVERAGE_POLICIES.join(', ')}.` });
  }
  if (cols.includes('overage_grace_pct')) {
    const pct = Number(body.overage_grace_pct);
    // Below 100 the grace band would cut service off before the allowance is
    // even used up, which is never what anyone means by "grace".
    if (!Number.isInteger(pct) || pct < 100 || pct > 1000) {
      return res.status(400).json({ error: 'The grace band must be a whole number between 100 and 1000 percent of quota.' });
    }
  }

  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const { rows } = await db.query(
    `update settings set ${setClause} where id = 1 returning *`,
    cols.map((c) => body[c])
  );
  res.json(rows[0]);
});

module.exports = router;
