const express = require('express');
const db = require('../db');
const { effectivePackage } = require('../utils/pkg');
const { clientAnalytics, salesAnalytics, platformAnalytics } = require('../utils/analytics');

const router = express.Router();

/**
 * The CRM's analytics. Three views of the same engine (utils/analytics.js):
 *
 *   GET /api/analytics/sales?grain=      our own leads, wins, sources and
 *                                        what prospects ask our sales agent
 *   GET /api/analytics/platform?grain=   every customer's conversations
 *                                        together, and satisfaction across them
 *   GET /api/analytics/clients/:id?grain=  one customer, exactly as that
 *                                        customer sees it in their portal
 *
 * Staff and admins alike: none of this is cost or margin data.
 */
const grainOf = (req) => String(req.query.grain || 'month');

/** Our own leads, wins, losses, funnel, sources and what prospects ask the sales agent. */
router.get('/sales', async (req, res, next) => {
  try { res.json(await salesAnalytics({ grain: grainOf(req) })); } catch (err) { next(err); }
});

/** Every customer's conversations and satisfaction together, with the busiest customers. */
router.get('/platform', async (req, res, next) => {
  try { res.json(await platformAnalytics({ grain: grainOf(req) })); } catch (err) { next(err); }
});

/** One customer's analytics — identical to what they see on their portal's Analytics tab. */
router.get('/clients/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`select * from clients where id = $1`, [req.params.id]);
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });
    let quota = null;
    if (client.product_id) {
      const { rows: p } = await db.query(`select * from products where id = $1`, [client.product_id]);
      const eff = effectivePackage(client, p[0]);
      if (eff) quota = eff.quota;
    }
    const out = await clientAnalytics(client.id, { grain: grainOf(req), quota });
    res.json({ client: { id: client.id, company: client.company }, ...out });
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'Client not found' });
    next(err);
  }
});

module.exports = router;
