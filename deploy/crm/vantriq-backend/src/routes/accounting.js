const express = require('express');
const db = require('../db');
const acc = require('../utils/accounting');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * The financial statements.
 *
 * /pnl                profit and loss for any window you ask for
 * /pnl/monthly        the same, one row per month, for the trend
 * /income-statement   a formal statement for a period, against the one before
 * /balance-sheet      assets, liabilities and equity as at a date
 * /tax                what is owed to FBR and what is recoverable from it
 * /remittances        record a GST payment or an AIT credit claimed
 *
 * The arithmetic all lives in src/utils/accounting.js — see the header there
 * for the recognition rules these endpoints follow.
 */

/** Defaults to the current calendar month when nothing is asked for. */
function windowFrom(query, fallbackFrom) {
  const today = acc.DAY(new Date());
  const to = query.to ? acc.DAY(query.to) : today;
  const from = query.from ? acc.DAY(query.from) : (fallbackFrom || acc.MONTH_START(to));
  return { from, to };
}

router.get('/pnl', async (req, res) => {
  const { from, to } = windowFrom(req.query);
  const books = await acc.loadBooks(to);
  const pnl = acc.computePnl(books, from, to);
  res.json({ ...pnl, breakdown: acc.revenueBreakdown(books, from, to) });
});

/**
 * GET /api/accounting/pnl/monthly?from=&to=
 *
 * One P&L per month from the first thing that ever happened (or `from`) to
 * today (or `to`). This is the monthly report the business runs on: the
 * trend matters more than any single month's number.
 */
router.get('/pnl/monthly', async (req, res) => {
  const to = req.query.to ? acc.DAY(req.query.to) : acc.DAY(new Date());
  const from = req.query.from ? acc.DAY(req.query.from) : await acc.inceptionDate();
  const books = await acc.loadBooks(to);

  const months = acc.monthsBetween(from, to).map((m) => {
    const last = new Date(Date.UTC(new Date(`${m}T00:00:00Z`).getUTCFullYear(), new Date(`${m}T00:00:00Z`).getUTCMonth() + 1, 0));
    const monthEnd = acc.DAY(last) > to ? to : acc.DAY(last);
    const p = acc.computePnl(books, m, monthEnd);
    return {
      month: m,
      label: acc.monthName(m),
      revenue: p.revenue.net,
      revenue_gross: p.revenue.gross,
      setup_fee: p.revenue.setup_fee,
      retainer: p.revenue.retainer,
      overage: p.revenue.overage,
      addon: p.revenue.addon,
      cost_of_service: p.cost_of_service.total,
      internal_ai_usage: p.cost_of_service.internal_ai_usage,
      gross_profit: p.gross_profit,
      operating_expenses: p.operating_expenses_total,
      bad_debts: p.bad_debts,
      net_profit: p.net_profit,
      net_margin_pct: p.net_margin_pct,
    };
  });

  const total = (f) => acc.ROUND(months.reduce((s, m) => s + m[f], 0));
  res.json({
    from, to,
    currency: books.settings.currency || 'PKR',
    months,
    totals: {
      revenue: total('revenue'),
      cost_of_service: total('cost_of_service'),
      internal_ai_usage: total('internal_ai_usage'),
      gross_profit: total('gross_profit'),
      operating_expenses: total('operating_expenses'),
      bad_debts: total('bad_debts'),
      net_profit: total('net_profit'),
    },
  });
});

/**
 * A period against the one immediately before it, same length. Two columns is
 * what makes a statement readable — a single number tells you nothing about
 * whether it is good.
 */
router.get('/income-statement', async (req, res) => {
  const { from, to } = windowFrom(req.query);
  const span = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1);
  const prevTo = acc.DAY(new Date(new Date(from).getTime() - 86400000));
  const prevFrom = acc.DAY(new Date(new Date(prevTo).getTime() - (span - 1) * 86400000));

  const books = await acc.loadBooks(to);
  const current = acc.computePnl(books, from, to);
  const prior = acc.computePnl(books, prevFrom, prevTo);

  const line = (label, get, opts = {}) => ({
    label,
    current: get(current),
    prior: get(prior),
    ...opts,
  });

  res.json({
    title: 'Statement of Profit or Loss',
    currency: current.currency,
    period: current.period,
    prior_period: prior.period,
    lines: [
      line('Setup and onboarding fees', (p) => p.revenue.setup_fee),
      line('Monthly retainers', (p) => p.revenue.retainer),
      line('Conversation overage', (p) => p.revenue.overage),
      line('Add-ons and change requests', (p) => p.revenue.addon),
      line('Credit notes', (p) => -p.revenue.credit_notes),
      line('Revenue', (p) => p.revenue.net, { emphasis: 'subtotal' }),
      line(current.cost_of_service.internal_label, (p) => -p.cost_of_service.internal_ai_usage),
      line('Platform and vendor purchases', (p) => -p.cost_of_service.vendor_purchases),
      line('Gross profit', (p) => p.gross_profit, { emphasis: 'subtotal' }),
      ...[...new Set([
        ...current.operating_expenses.map((e) => e.category),
        ...prior.operating_expenses.map((e) => e.category),
      ])].map((cat) => line(cat, (p) => -(p.operating_expenses.find((e) => e.category === cat) || { amount: 0 }).amount)),
      line('Bad debts written off', (p) => -p.bad_debts),
      line('Operating profit', (p) => p.operating_profit, { emphasis: 'subtotal' }),
      line('Income tax (advance tax claimed)', (p) => -p.income_tax),
      line('Profit for the period', (p) => p.net_profit, { emphasis: 'total' }),
    ],
    margins: {
      gross_margin_pct: current.gross_margin_pct,
      net_margin_pct: current.net_margin_pct,
      prior_net_margin_pct: prior.net_margin_pct,
    },
  });
});

router.get('/balance-sheet', async (req, res) => {
  const asOf = req.query.as_of ? acc.DAY(req.query.as_of) : acc.DAY(new Date());
  const books = await acc.loadBooks(asOf);
  res.json(acc.computeBalanceSheet(books, asOf));
});

/**
 * The FBR position: GST we have collected and owe, AIT clients have withheld
 * and we can recover, and what has already been settled either way.
 */
router.get('/tax', async (req, res) => {
  const asOf = req.query.as_of ? acc.DAY(req.query.as_of) : acc.DAY(new Date());
  const books = await acc.loadBooks(asOf);
  const external = books.invoices.filter((i) => !i.is_internal);
  const sum = (arr, f) => acc.ROUND(arr.reduce((s, x) => s + Number(f(x) || 0), 0));
  const rem = (kind) => acc.ROUND(books.remittances.filter((r) => r.kind === kind).reduce((s, r) => s + Number(r.amount), 0));
  const challans = acc.ROUND(
    books.payments.filter((p) => p.kind === 'ait_challan').reduce((s, p) => s + Number(p.amount), 0)
  );

  const gst_charged = sum(external, (i) => i.tax_amount);
  const gst_paid = rem('gst_paid');
  const ait_withheld = sum(external, (i) => i.ait_amount);
  const ait_claimed = rem('ait_claimed');

  res.json({
    as_of: asOf,
    currency: books.settings.currency || 'PKR',
    gst: {
      charged: gst_charged,
      remitted: gst_paid,
      payable: acc.ROUND(gst_charged - gst_paid),
      default_rate: Number(books.settings.default_tax_rate || 0),
    },
    ait: {
      withheld_by_clients: ait_withheld,
      challans_received: challans,
      awaiting_challan: acc.ROUND(ait_withheld - challans),
      claimed: ait_claimed,
      recoverable: acc.ROUND(ait_withheld - ait_claimed),
      default_rate: Number(books.settings.default_ait_rate || 0),
    },
    remittances: books.remittances.sort((a, b) => String(b.paid_date).localeCompare(String(a.paid_date))),
  });
});

router.get('/remittances', async (req, res) => {
  const { rows } = await db.query(`select * from tax_remittances order by paid_date desc, created_at desc`);
  res.json(rows);
});

router.post('/remittances', async (req, res) => {
  const { kind, amount, period, reference, paid_date, notes } = req.body || {};
  if (!['gst_paid', 'ait_claimed'].includes(kind)) {
    return res.status(400).json({ error: "kind must be 'gst_paid' or 'ait_claimed'" });
  }
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'amount must be greater than zero' });
  const { rows } = await db.query(
    `insert into tax_remittances (kind, amount, period, reference, paid_date, notes, recorded_by)
     values ($1,$2,$3,$4, coalesce($5::date, current_date), $6, $7) returning *`,
    [kind, acc.ROUND(amount), period || '', reference || '', paid_date || null, notes || '',
      (req.user && req.user.email) || req.authKind || '']
  );
  res.status(201).json(rows[0]);
});

router.delete('/remittances/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from tax_remittances where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
