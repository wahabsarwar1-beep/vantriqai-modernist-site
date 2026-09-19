const express = require('express');
const db = require('../db');
const { internalAiCost, internalAiUnstamped } = require('../utils/accounting');
const router = express.Router();

router.get('/', async (req, res) => {
  const [clientsQ, productsQ, vendorsQ, expensesQ, invoicesQ, settingsQ] = await Promise.all([
    db.query(`select * from clients`),
    db.query(`select * from products where archived = false`),
    db.query(`select * from vendors`),
    db.query(`select * from expenses where recurring = true`),
    db.query(`select * from invoices`),
    db.query(`select * from settings where id = 1`),
  ]);

  const utilization = req.query.utilization ? parseFloat(req.query.utilization) : Number(settingsQ.rows[0].utilization);
  const productById = Object.fromEntries(productsQ.rows.map((p) => [p.id, p]));
  // Paying customers only. VantriqAI sits at stage 'active' on Enterprise+ so
  // its agents can be metered; counting it as a customer here would book what
  // we pay ourselves as revenue and inflate the margin with it.
  const active = clientsQ.rows.filter((c) => c.stage === 'active' && !c.is_internal);
  const internalIds = new Set(clientsQ.rows.filter((c) => c.is_internal).map((c) => c.id));

  // What a client is actually contracted at, not what their tier lists at. A
  // negotiated retainer is the number on their invoices every month, so
  // pricing them at list here overstated revenue for every client who has one.
  const retainerOf = (c) => (c.custom_retainer != null
    ? Number(c.custom_retainer)
    : (productById[c.product_id] ? Number(productById[c.product_id].retainer) : 0));

  const retainerRevenue = active.reduce((s, c) => s + retainerOf(c), 0);
  const customPriced = active.filter((c) => c.custom_retainer != null).length;
  const setupRevenueCollected = invoicesQ.rows
    .filter((i) => i.type === 'setup_fee' && i.status === 'paid' && !internalIds.has(i.client_id))
    .reduce((s, i) => s + Number(i.amount), 0);
  const deliveryCost = active.reduce((s, c) => {
    const p = productById[c.product_id];
    return s + (p ? Number(p.delivery_cost_full) * utilization : 0);
  }, 0);
  const contributionMargin = retainerRevenue - deliveryCost;
  const fixedPlatformCost = vendorsQ.rows.reduce((s, v) => s + (Number(v.cost_min) + Number(v.cost_max)) / 2, 0);
  const contractLabour = expensesQ.rows.reduce((s, e) => s + Number(e.amount), 0);

  // Our own AI usage is a real invoiced cost, metered from live usage. It was
  // already shown as a line in the cost table on this page, under a heading
  // that reads "feeding the P&L" — but it was not subtracted from anything,
  // so the net result on Financials was quietly better than the Dashboard's.
  const month = req.query.month || new Date().toISOString().slice(0, 10);
  const aiCost = internalAiCost(invoicesQ.rows, internalIds, month);
  const aiUnstamped = internalAiUnstamped(invoicesQ.rows, internalIds, month);
  const netResult = contributionMargin - fixedPlatformCost - contractLabour - aiCost;

  const byPackage = productsQ.rows.map((p) => {
    const tierClients = active.filter((c) => c.product_id === p.id);
    const revenue = tierClients.reduce((s, c) => s + retainerOf(c), 0);
    const cost = tierClients.length * Number(p.delivery_cost_full) * utilization;
    return {
      id: p.id, name: p.name, active_clients: tierClients.length,
      revenue, delivery_cost: cost, margin: revenue - cost,
      margin_pct: revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0,
    };
  });

  res.json({
    utilization,
    setup_revenue_collected: setupRevenueCollected,
    retainer_revenue: retainerRevenue,
    variable_delivery_cost: deliveryCost,
    contribution_margin: contributionMargin,
    contribution_margin_pct: retainerRevenue > 0 ? (contributionMargin / retainerRevenue) * 100 : 0,
    fixed_platform_cost: fixedPlatformCost,
    contract_labour: contractLabour,
    internal_ai_cost: aiCost,
    internal_ai_unstamped: aiUnstamped,
    net_monthly_result: netResult,
    by_package: byPackage,
    // What on this page is measured and what is assumed. The page is a
    // projection and says so, but "is it live?" deserves an answer per line
    // rather than one disclaimer over the whole thing.
    basis: {
      month: month.slice(0, 7),
      active_clients: 'live',
      retainer_revenue: customPriced
        ? `live client list; ${customPriced} at a negotiated rate, the rest at list price`
        : 'live client list, priced at each package list price',
      setup_revenue_collected: 'live — paid setup invoices',
      variable_delivery_cost: `assumed — package delivery cost at ${Math.round(utilization * 100)}% utilization`,
      fixed_platform_cost: 'assumed — midpoint of each vendor cost range',
      contract_labour: 'live — recurring cost lines',
      internal_ai_cost: 'live — metered token usage, invoiced on our own account',
    },
  });
});

module.exports = router;
