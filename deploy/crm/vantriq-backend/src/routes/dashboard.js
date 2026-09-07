const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', async (req, res) => {
  const month = new Date().toISOString().slice(0, 7) + '-01';

  const [clientsQ, productsQ, invoicesQ, usageQ, vendorsQ, expensesQ, settingsQ] = await Promise.all([
    db.query(`select * from clients`),
    db.query(`select * from products where archived = false`),
    db.query(`select * from invoices`),
    db.query(`select * from v_monthly_usage where period_month = $1::date`, [month]),
    db.query(`select * from vendors`),
    db.query(`select * from expenses where recurring = true`),
    db.query(`select * from settings where id = 1`),
  ]);

  const clients = clientsQ.rows;
  const products = productsQ.rows;
  const invoices = invoicesQ.rows;
  const usageByClient = Object.fromEntries(usageQ.rows.map((u) => [u.client_id, u]));
  const vendors = vendorsQ.rows;
  const expenses = expensesQ.rows;
  const settings = settingsQ.rows[0];

  const productById = Object.fromEntries(products.map((p) => [p.id, p]));
  const active = clients.filter((c) => c.stage === 'active');
  const pipeline = clients.filter((c) => ['lead', 'contacted', 'proposal', 'negotiation'].includes(c.stage));

  const mrr = active.reduce((s, c) => s + (productById[c.product_id] ? Number(productById[c.product_id].retainer) : 0), 0);
  const pipelineValue = pipeline.reduce((s, c) => s + Number(c.est_value || 0), 0);

  const revenueByTier = products.map((p) => {
    const tierClients = active.filter((c) => c.product_id === p.id);
    return { id: p.id, name: p.name, revenue: tierClients.length * Number(p.retainer), count: tierClients.length };
  });

  const pipelineByStage = ['lead', 'contacted', 'proposal', 'negotiation'].map((stage) => ({
    stage, count: clients.filter((c) => c.stage === stage).length,
  }));

  const totalPlatformCost = vendors.reduce((s, v) => s + (Number(v.cost_min) + Number(v.cost_max)) / 2, 0);
  const totalContractLabour = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const utilization = Number(settings.utilization);
  const totalDeliveryCost = active.reduce((s, c) => {
    const p = productById[c.product_id];
    return s + (p ? Number(p.delivery_cost_full) * utilization : 0);
  }, 0);
  const netMonthlyResult = mrr - totalDeliveryCost - totalPlatformCost - totalContractLabour;

  const attention = invoices
    .filter((i) => i.status === 'pending' || i.status === 'overdue')
    .sort((a, b) => new Date(a.issued_date) - new Date(b.issued_date))
    .slice(0, 8);

  // Staff run the pipeline; delivery cost, platform cost and margin are
  // Financials data their role deliberately excludes, so they never leave
  // the server for a staff session.
  const staffOnly = req.user && req.user.role === 'staff';

  const kpis = {
      active_clients: active.length,
      pipeline_deals: pipeline.length,
      mrr,
      annualised_revenue: mrr * 12,
      pipeline_value: pipelineValue,
      net_monthly_result: netMonthlyResult,
      margin_pct: mrr > 0 ? ((mrr - totalDeliveryCost) / mrr) * 100 : 0,
      total_platform_cost: totalPlatformCost,
      total_contract_labour: totalContractLabour,
      total_delivery_cost: totalDeliveryCost,
      utilization,
  };
  if (staffOnly) {
    for (const k of ['net_monthly_result','margin_pct','total_platform_cost','total_contract_labour','total_delivery_cost','utilization']) {
      delete kpis[k];
    }
  }

  res.json({
    kpis,
    revenue_by_tier: revenueByTier,
    pipeline_by_stage: pipelineByStage,
    needs_attention: attention,
    usage_by_client: usageByClient, // live, from real usage_events this month
  });
});

module.exports = router;
