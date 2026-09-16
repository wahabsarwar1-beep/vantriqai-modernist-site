const express = require('express');
const db = require('../db');
const { ensureInternalClient } = require('../utils/internalClient');
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
  // v7: withholding tax, the seller block on the printed invoice, and the
  // one anchor the derived Balance Sheet needs.
  'default_ait_rate', 'seller_ntn', 'seller_strn', 'seller_address', 'seller_email',
  'opening_cash', 'opening_cash_date', 'internal_cost_label',
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

  for (const f of ['default_tax_rate', 'default_ait_rate']) {
    if (!cols.includes(f)) continue;
    const rate = Number(body[f]);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        error: `${f === 'default_tax_rate' ? 'GST' : 'Advance income tax'} must be a percentage between 0 and 100.`,
      });
    }
  }
  if (cols.includes('opening_cash') && !Number.isFinite(Number(body.opening_cash))) {
    return res.status(400).json({ error: 'Opening cash must be a number.' });
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

/**
 * VantriqAI's own account — the site assistant and the WhatsApp agent metered
 * and priced like any customer, with the billing landing as cost rather than
 * revenue. See src/utils/internalClient.js.
 */
router.get('/internal-account', async (req, res) => {
  const { rows } = await db.query(
    `select c.*, p.name as package_name from clients c
       left join products p on p.id = c.product_id
      where c.is_internal = true order by c.created_at limit 1`
  );
  if (!rows[0]) return res.json({ configured: false, client: null, agents: [] });
  const { rows: agents } = await db.query(
    `select * from client_agents where client_id = $1 order by kind, name`, [rows[0].id]
  );
  res.json({ configured: true, client: rows[0], agents });
});

/** Idempotent: creates what is missing, leaves what exists alone. */
router.post('/internal-account', async (req, res) => {
  const result = await ensureInternalClient(req.body || {});
  res.status(result.created.length ? 201 : 200).json(result);
});

module.exports = router;
