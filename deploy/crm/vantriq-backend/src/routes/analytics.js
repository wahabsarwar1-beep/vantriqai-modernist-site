const express = require('express');
const db = require('../db');
const { effectivePackage } = require('../utils/pkg');
const { clientAnalytics, salesAnalytics, platformAnalytics } = require('../utils/analytics');
const { clientReport, salesReport, sendReport } = require('../utils/analyticsReport');

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
 * Each has a …/report.xlsx beside it: the same figures as a workbook, with
 * the contacts, conversations and survey answers behind them.
 *
 * Staff and admins alike: none of this is cost or margin data.
 */
const grainOf = (req) => String(req.query.grain || 'month');

/** The package allowance the customer's Pulse measures this month against, or null. */
async function quotaOf(client) {
  if (!client.product_id) return null;
  const { rows } = await db.query(`select * from products where id = $1`, [client.product_id]);
  const eff = effectivePackage(client, rows[0]);
  return eff ? eff.quota : null;
}

async function clientById(id) {
  try {
    const { rows } = await db.query(`select * from clients where id = $1`, [id]);
    return rows[0] || null;
  } catch (err) {
    if (err.code === '22P02') return null; // not a uuid
    throw err;
  }
}

/** Our own leads, wins, losses, funnel, sources and what prospects ask the sales agent. */
router.get('/sales', async (req, res, next) => {
  try { res.json(await salesAnalytics({ grain: grainOf(req) })); } catch (err) { next(err); }
});

/** The sales workbook: every lead, the funnel, sources, and each prospect conversation. */
router.get('/sales/report.xlsx', async (req, res, next) => {
  try { sendReport(res, await salesReport({ grain: grainOf(req) })); } catch (err) { next(err); }
});

/** Every customer's conversations and satisfaction together, with the busiest customers. */
router.get('/platform', async (req, res, next) => {
  try { res.json(await platformAnalytics({ grain: grainOf(req) })); } catch (err) { next(err); }
});

/** Every customer's workbook in one: each customer side by side, then every contact and conversation. */
router.get('/platform/report.xlsx', async (req, res, next) => {
  try { sendReport(res, await clientReport(null, { grain: grainOf(req) })); } catch (err) { next(err); }
});

/** One customer's analytics — identical to what they see on their portal's Pulse tab (Vantriq Pulse). */
router.get('/clients/:id', async (req, res, next) => {
  try {
    const client = await clientById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    const out = await clientAnalytics(client.id, { grain: grainOf(req), quota: await quotaOf(client) });
    res.json({ client: { id: client.id, company: client.company }, ...out });
  } catch (err) { next(err); }
});

/**
 * One customer's workbook — Pulse and Echo, with their contacts (new and
 * returning), conversations and survey answers. Staff see the Echo tabs even
 * when Echo is switched off for the customer, as they see its surveys.
 */
router.get('/clients/:id/report.xlsx', async (req, res, next) => {
  try {
    const client = await clientById(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found' });
    sendReport(res, await clientReport(client, { grain: grainOf(req), quota: await quotaOf(client) }));
  } catch (err) { next(err); }
});

module.exports = router;
