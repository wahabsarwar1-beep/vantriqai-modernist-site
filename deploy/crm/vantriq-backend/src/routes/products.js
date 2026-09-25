const express = require('express');
const db = require('../db');
const { isAdminRequest } = require('../middleware/auth');
const router = express.Router();

const FIELDS = [
  'name','target_tier','setup_fee','retainer','msgs_per_session','quota',
  'overage_rate','delivery_cost_full','automation','data_layer','ai_model','channels','sort_order'
];

/**
 * The package ladder is fixed by the business model. The standard tiers
 * (Starter-Enterprise) are read-only here, and no new packages may be
 * invented. Enterprise+ is the single customisable tier: its own record
 * stays editable, and per-client overrides live on the client (see
 * custom_* in src/routes/clients.js).
 */
const LOCKED_MESSAGE =
  'Standard packages are fixed by the business model and cannot be edited. ' +
  'Custom pricing and resources are only available on Enterprise+, set per client.';

/** Reading the catalogue is open to staff; changing it is not. */
function adminOnly(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(403).json({ error: 'Only an admin can change package pricing.' });
}

async function loadProduct(id) {
  const { rows } = await db.query(`select * from products where id = $1`, [id]);
  return rows[0] || null;
}

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `select * from products where archived = false order by sort_order asc, created_at asc`
  );
  // delivery_cost_full is what a package costs us to run — Financials data. It
  // is withheld from everyone but an admin, which covers staff sessions and
  // the automation key alike; neither has any use for our margin.
  if (!isAdminRequest(req)) {
    return res.json(rows.map(({ delivery_cost_full, ...rest }) => rest));
  }
  res.json(rows);
});

router.post('/', async (req, res) => {
  res.status(403).json({
    error: 'New packages cannot be created. The ladder is fixed by the business model; ' +
           'use Enterprise+ with per-client custom terms for anything bespoke.',
  });
});

router.put('/:id', adminOnly, async (req, res) => {
  const existing = await loadProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.is_standard !== false) return res.status(403).json({ error: LOCKED_MESSAGE });

  const body = req.body || {};
  const cols = FIELDS.filter((f) => body[f] !== undefined);
  if (cols.length === 0) return res.status(400).json({ error: 'No fields to update' });
  const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => body[c]);
  const { rows } = await db.query(
    `update products set ${setClause} where id = $1 returning *`,
    [req.params.id, ...values]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
});

/**
 * PATCH /:id/addon-pricing  { included_agents, extra_agent_price }
 *
 * One client can already run several metered agents — several WhatsApp
 * numbers, an Instagram handle, a website domain — all pooled against one
 * package's quota (v_monthly_usage groups by client_id, not agent_id). That
 * is the right shape for one business with several branches on one
 * account, and also, left unpriced, the shape of two unrelated businesses
 * splitting one bill. This is where a package says what the second number
 * costs.
 *
 * Deliberately its OWN route rather than two more entries in FIELDS above.
 * The lock on Starter through Enterprise protects the figures the business
 * model document fixes — setup fee, retainer, quota, overage — and nothing
 * in that document prices an extra number. There is no fixed figure here
 * to protect, so this edits on ANY package, standard or custom: a business
 * sold as "one bill covers every branch" needs to be priceable on Growth
 * or Scale, not held hostage to Enterprise+ being the only unlocked tier.
 */
router.patch('/:id/addon-pricing', adminOnly, async (req, res) => {
  const existing = await loadProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const b = req.body || {};
  const sets = [];
  const values = [];
  if (b.included_agents !== undefined) {
    const n = Number(b.included_agents);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: 'included_agents must be a whole number, 0 or more.' });
    }
    values.push(n);
    sets.push(`included_agents = $${values.length}`);
  }
  if (b.extra_agent_price !== undefined) {
    const n = Number(b.extra_agent_price);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ error: 'extra_agent_price must be a number, 0 or more.' });
    }
    values.push(n);
    sets.push(`extra_agent_price = $${values.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  values.push(req.params.id);
  const { rows } = await db.query(
    `update products set ${sets.join(', ')} where id = $${values.length} returning *`,
    values
  );
  res.json(rows[0]);
});

router.delete('/:id', adminOnly, async (req, res) => {
  const existing = await loadProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.is_standard !== false) return res.status(403).json({ error: LOCKED_MESSAGE });

  const { rows: inUse } = await db.query(
    `select 1 from clients where product_id = $1 limit 1`, [req.params.id]
  );
  if (inUse[0]) {
    return res.status(409).json({ error: 'Clients are assigned to this package — reassign them first, or archive instead.' });
  }
  await db.query(`delete from products where id = $1`, [req.params.id]);
  res.status(204).end();
});

router.post('/:id/archive', adminOnly, async (req, res) => {
  const existing = await loadProduct(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  if (existing.is_standard !== false) return res.status(403).json({ error: LOCKED_MESSAGE });

  const { rows } = await db.query(
    `update products set archived = true where id = $1 returning *`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
  res.json(rows[0]);
});

module.exports = router;
