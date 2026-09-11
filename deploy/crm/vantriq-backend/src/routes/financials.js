const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const [clientsQ, productsQ, vendorsQ, expensesQ, invoicesQ, settingsQ] = await Promise.all([
    db.query(`select * from clients where stage = 'active'`),
    db.query(`select * from products where archived = false`),
    db.query(`select * from vendors`),
    db.query(`select * from expenses where recurring = true`),
    db.query(`select * from invoices where type = 'setup_fee' and status = 'paid'`),
    db.query(`select * from settings where id = 1`),
  ]);

  const utilization = req.query.utilization ? parseFloat(req.query.utilization) : Number(settingsQ.rows[0].utilization);
  const productById = Object.fromEntries(productsQ.rows.map((p) => [p.id, p]));
  const active = clientsQ.rows;

  const retainerRevenue = active.reduce((s, c) => s + (productById[c.product_id] ? Number(productById[c.product_id].retainer) : 0), 0);
  const setupRevenueCollected = invoicesQ.rows.reduce((s, i) => s + Number(i.amount), 0);
  const deliveryCost = active.reduce((s, c) => {
    const p = productById[c.product_id];
    return s + (p ? Number(p.delivery_cost_full) * utilization : 0);
  }, 0);
  const contributionMargin = retainerRevenue - deliveryCost;
  const fixedPlatformCost = vendorsQ.rows.reduce((s, v) => s + (Number(v.cost_min) + Number(v.cost_max)) / 2, 0);
  const contractLabour = expensesQ.rows.reduce((s, e) => s + Number(e.amount), 0);
  const netResult = contributionMargin - fixedPlatformCost - contractLabour;

  const byPackage = productsQ.rows.map((p) => {
    const tierClients = active.filter((c) => c.product_id === p.id);
    const revenue = tierClients.length * Number(p.retainer);
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
    net_monthly_result: netResult,
    by_package: byPackage,
  });
});

module.exports = router;
