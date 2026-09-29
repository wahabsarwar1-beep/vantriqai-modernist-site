const express = require('express');
const db = require('../db');
const C = require('../utils/costing');
const router = express.Router();

/**
 * Products & Pricing, the cost side — admin only (mounted behind
 * requireScope('admin') in src/index.js). Everything here is margin, which
 * staff, automation keys and customers never see.
 *
 *   GET    /api/costing                 the whole model: rate card, assumptions,
 *                                       every package's economics, the steady
 *                                       state, the bulk-model what-if, flags
 *   PUT    /api/costing                 change rates and/or assumptions
 *                                       { rates: {key: {input, output, ...}|null},
 *                                         assumptions: {...}, utilization }
 *                                       utilization is the costing's own typical
 *                                       use (0.1–1), not Financials' projection
 *   PATCH  /api/costing/packages/:id    one package's cost profile
 *   POST   /api/costing/reset           back to the business model's defaults
 *
 * Package PRICES are not changed here — they stay locked to the business
 * model (routes/products.js). Every change here re-costs every package and
 * writes delivery_cost_full, so Financials moves with it.
 */

router.get('/', async (req, res) => {
  res.json(await C.costingModel());
});

router.put('/', async (req, res) => {
  const body = { ...(req.body || {}) };
  if (body.utilization !== undefined) {
    body.assumptions = { ...(body.assumptions || {}), utilization: body.utilization };
  }
  const { stored } = await C.inputs();
  const next = C.applyChange(stored, body);
  await db.query(`update settings set costing = $1::jsonb where id = 1`, [JSON.stringify(next)]);
  await C.syncDeliveryCosts();
  res.json(await C.costingModel());
});

router.post('/reset', async (req, res) => {
  const scope = String((req.body && req.body.scope) || 'all');
  if (scope === 'packages' || scope === 'all') {
    await db.query(
      `update products set context_tokens = null, premium_share = null, mgmt_hours = null, build_hours = null,
              founder_share = null, typical_min = null, typical_max = null, bulk_model = null, premium_model = null`
    );
  }
  if (scope === 'rates' || scope === 'all') {
    await db.query(`update settings set costing = '{}'::jsonb where id = 1`);
  }
  await C.syncDeliveryCosts();
  res.json(await C.costingModel());
});

router.patch('/packages/:id', async (req, res) => {
  const { rows } = await db.query(`select id from products where id = $1`, [req.params.id]);
  if (!rows[0]) throw new C.CostingError(404, 'Package not found');
  const { stored } = await C.inputs();
  const change = C.profileChange(req.body, C.engine.mergeRates(stored.rates));
  const cols = Object.keys(change);
  if (!cols.length) throw new C.CostingError(400, 'Nothing to change.');
  await db.query(
    `update products set ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} where id = $1`,
    [req.params.id, ...cols.map((c) => change[c])]
  );
  await C.syncDeliveryCosts();
  res.json(await C.costingModel());
});

module.exports = router;
