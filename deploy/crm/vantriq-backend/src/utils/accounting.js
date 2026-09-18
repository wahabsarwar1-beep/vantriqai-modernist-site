const db = require('../db');

/**
 * The books.
 *
 * The CRM has no general ledger — it has invoices, a receipts ledger,
 * expenses, purchase orders and tax remittances. Everything below derives the
 * statements from those five records, which means the statements can never
 * drift from the documents they are built on: correct an invoice and the
 * Balance Sheet moves with it.
 *
 * The rules, stated once so every function agrees:
 *
 *   Revenue        an invoice's `amount` (EXCLUDING GST), on its issue date.
 *                  Accrual, not cash — the sale happens when you bill it.
 *   Credit notes   reduce revenue in the month they are raised.
 *   Write-offs     are a bad-debt expense, not a reduction of revenue.
 *   GST            never touches the P&L. It is collected on our customers'
 *                  behalf and sits as a liability until remitted.
 *   AIT            never touches the P&L either. It is our money, withheld
 *                  by the client — an asset until it is set against a tax
 *                  bill, at which point it becomes income tax expense.
 *   Internal       VantriqAI billing itself for its own agents is COST, never
 *                  revenue, and never a receivable. See below.
 *   Expenses / POs are assumed settled in cash when incurred. The CRM does
 *                  not track supplier payment terms, so there are no trade
 *                  payables on the sheet.
 *
 * The one anchor the derivation needs is settings.opening_cash: the cash the
 * business held on the day it started keeping these records. Equity opens at
 * the same figure, which is what makes the sheet balance before anything has
 * happened.
 */

const ROUND = (n) => Math.round(Number(n || 0) * 100) / 100;
const pct = (n, d) => (Number(d) ? Math.round((Number(n) / Number(d)) * 1000) / 10 : 0);

const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const MONTH_START = (d) => `${DAY(d).slice(0, 7)}-01`;

/** 'Sep 2026' from '2026-09-01'. */
function monthName(iso) {
  return new Date(`${DAY(iso).slice(0, 7)}-01T00:00:00Z`)
    .toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Every month start from `from` to `to`, inclusive. */
function monthsBetween(from, to) {
  const out = [];
  let cur = new Date(`${MONTH_START(from)}T00:00:00Z`);
  const end = new Date(`${MONTH_START(to)}T00:00:00Z`);
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}

/**
 * What a recurring expense costs inside one window.
 *
 * A recurring row is a monthly charge that starts on start_date and stops on
 * end_date. It accrues on the first of each month it is live for, so a
 * subscription cancelled in March stops costing money in April — which it
 * would not do if the row were simply deleted, since that would also rewrite
 * every past month's P&L.
 */
function expenseAccrual(expense, from, to) {
  const amount = Number(expense.amount || 0);
  if (!expense.recurring) {
    const on = DAY(expense.start_date);
    return on >= DAY(from) && on <= DAY(to) ? ROUND(amount) : 0;
  }
  const liveFrom = MONTH_START(expense.start_date);
  const liveTo = expense.end_date ? MONTH_START(expense.end_date) : null;
  let months = 0;
  for (const m of monthsBetween(from, to)) {
    if (m < liveFrom) continue;
    if (liveTo && m > liveTo) continue;
    months += 1;
  }
  return ROUND(amount * months);
}

/**
 * An invoice's net value in the currency the books are kept in.
 *
 * Almost every invoice is already in that currency and this is just its
 * amount. The internal account is not: it is raised in USD, because what it
 * records is an OpenAI bill. Adding those dollars to a column of rupees would
 * produce a total that is wrong by a factor of nearly three hundred, so the
 * converted figure stamped on the invoice at issue is what the statements
 * read \u2014 never the raw amount, and never today's rate applied to an old month.
 *
 * Returns null when an invoice is in a foreign currency with no rate stamped
 * on it. The statements surface that as an unconverted figure instead of
 * silently dropping a cost or inventing a rate for it.
 */
function bookValue(invoice, settings) {
  if (invoice.base_amount != null) return Number(invoice.base_amount);
  const base = (settings && settings.currency) || 'PKR';
  if ((invoice.currency || base) === base) return Number(invoice.amount || 0);
  return null;
}

/** Sums invoices in the books' currency, keeping back the ones that have no
 *  rate so the caller can report them rather than lose them. */
function bookTotal(invoices, settings) {
  let total = 0;
  const unconverted = [];
  for (const i of invoices) {
    const v = bookValue(i, settings);
    if (v == null) {
      unconverted.push({
        invoice_number: i.invoice_number,
        currency: i.currency,
        amount: Number(i.amount || 0),
      });
      continue;
    }
    total += v;
  }
  return { total: ROUND(total), unconverted };
}

/** The same invoices grouped by the currency they were actually raised in,
 *  e.g. { USD: 0.000621 }. Empty when everything was already in the books'
 *  own currency, which is the normal case. */
function foreignTotals(invoices) {
  const out = {};
  for (const i of invoices) {
    const c = i.currency;
    if (!c || c === 'PKR') continue;
    out[c] = Math.round((Number(out[c] || 0) + Number(i.amount || 0)) * 1e6) / 1e6;
  }
  return out;
}

/** Everything the statements are built from, loaded once. */
async function loadBooks(upTo) {
  const bound = upTo ? DAY(upTo) : null;
  const [settings, invoices, payments, expenses, pos, remittances] = await Promise.all([
    db.query(`select * from settings where id = 1`).then((r) => r.rows[0] || {}),
    db.query(
      `select i.*, c.is_internal, c.company, c.id as cid, p.name as package_name
         from invoices i
         join clients c on c.id = i.client_id
         left join products p on p.id = c.product_id
        where i.status <> 'void' ${bound ? 'and i.issued_date <= $1::date' : ''}`,
      bound ? [bound] : []
    ).then((r) => r.rows),
    db.query(
      `select p.*, c.is_internal
         from payments p left join clients c on c.id = p.client_id
        ${bound ? 'where p.received_date <= $1::date' : ''}`,
      bound ? [bound] : []
    ).then((r) => r.rows),
    db.query(`select * from expenses`).then((r) => r.rows),
    db.query(
      `select * from purchase_orders where status <> 'Cancelled' ${bound ? 'and po_date <= $1::date' : ''}`,
      bound ? [bound] : []
    ).then((r) => r.rows),
    db.query(
      `select * from tax_remittances ${bound ? 'where paid_date <= $1::date' : ''}`,
      bound ? [bound] : []
    ).then((r) => r.rows),
  ]);
  return { settings, invoices, payments, expenses, pos, remittances };
}

const inWindow = (d, from, to) => DAY(d) >= DAY(from) && DAY(d) <= DAY(to);

/**
 * Profit and loss for any window at all — a month, a quarter, a financial
 * year, or since the business started.
 */
function computePnl(books, from, to) {
  const { invoices, payments, expenses, pos, remittances, settings } = books;

  const external = invoices.filter((i) => !i.is_internal && inWindow(i.issued_date, from, to));
  const internal = invoices.filter((i) => i.is_internal && inWindow(i.issued_date, from, to));

  const byType = (t) => ROUND(external.filter((i) => i.type === t).reduce((s, i) => s + Number(i.amount), 0));
  const gross = ROUND(external.reduce((s, i) => s + Number(i.amount), 0));

  const pay = (kind) => ROUND(
    payments.filter((p) => p.kind === kind && inWindow(p.received_date, from, to))
      .reduce((s, p) => s + Number(p.amount), 0)
  );
  const credit_notes = pay('credit_note');
  const bad_debts = pay('write_off');
  const net_revenue = ROUND(gross - credit_notes);

  const internal_cost = bookTotal(internal, settings);
  const internal_ai_usage = internal_cost.total;
  const vendor_purchases = ROUND(
    pos.filter((p) => inWindow(p.po_date, from, to)).reduce((s, p) => s + Number(p.amount), 0)
  );
  const cost_of_service = ROUND(internal_ai_usage + vendor_purchases);
  const gross_profit = ROUND(net_revenue - cost_of_service);

  // Operating expenses, grouped the way they were entered.
  const buckets = new Map();
  for (const e of expenses) {
    const amount = expenseAccrual(e, from, to);
    if (!amount) continue;
    const key = e.category || 'Other';
    buckets.set(key, ROUND((buckets.get(key) || 0) + amount));
  }
  const operating_expenses = [...buckets.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
  const operating_expenses_total = ROUND(operating_expenses.reduce((s, r) => s + r.amount, 0));

  const income_tax = ROUND(
    remittances.filter((r) => r.kind === 'ait_claimed' && inWindow(r.paid_date, from, to))
      .reduce((s, r) => s + Number(r.amount), 0)
  );

  const operating_profit = ROUND(gross_profit - operating_expenses_total - bad_debts);
  const net_profit = ROUND(operating_profit - income_tax);

  return {
    period: { from: DAY(from), to: DAY(to), label: `${DAY(from)} → ${DAY(to)}` },
    currency: settings.currency || 'PKR',
    revenue: {
      setup_fee: byType('setup_fee'),
      retainer: byType('retainer'),
      overage: byType('overage'),
      addon: byType('addon'),
      gross,
      credit_notes,
      net: net_revenue,
      invoices_issued: external.length,
    },
    cost_of_service: {
      internal_ai_usage,
      internal_label: settings.internal_cost_label || 'Internal AI usage (own agents)',
      // The statement is in PKR; the internal invoices behind this figure are
      // in dollars. Both are carried so the line can say what it converted.
      internal_ai_usage_foreign: foreignTotals(internal),
      internal_ai_usage_unconverted: internal_cost.unconverted,
      usd_pkr_rate: Number(settings.usd_pkr_rate || 0),
      vendor_purchases,
      total: cost_of_service,
    },
    gross_profit,
    gross_margin_pct: pct(gross_profit, net_revenue),
    operating_expenses,
    operating_expenses_total,
    bad_debts,
    operating_profit,
    income_tax,
    net_profit,
    net_margin_pct: pct(net_profit, net_revenue),
  };
}

/** Revenue split by package and by client, for the window. */
function revenueBreakdown(books, from, to) {
  const external = books.invoices.filter((i) => !i.is_internal && inWindow(i.issued_date, from, to));
  const group = (keyFn, labelFn) => {
    const m = new Map();
    for (const i of external) {
      const k = keyFn(i);
      const cur = m.get(k) || { label: labelFn(i), amount: 0, invoices: 0 };
      cur.amount = ROUND(cur.amount + Number(i.amount));
      cur.invoices += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  };
  return {
    by_package: group((i) => i.package_name || 'Unassigned', (i) => i.package_name || 'Unassigned'),
    by_client: group((i) => i.cid, (i) => i.company),
  };
}

/**
 * The Balance Sheet, as at one date.
 *
 * Derived, so it comes with its own proof: `check.difference` is assets less
 * (liabilities + equity) and is expected to be zero. It is shown rather than
 * hidden — a sheet that silently plugs the gap is worse than one that says
 * where it went.
 */
function computeBalanceSheet(books, asOf) {
  const { invoices, payments, expenses, pos, remittances, settings } = books;
  const date = DAY(asOf);
  const opening_cash = ROUND(settings.opening_cash || 0);
  const start = settings.opening_cash_date ? DAY(settings.opening_cash_date) : '1970-01-01';

  const external = invoices.filter((i) => !i.is_internal);
  const internal = invoices.filter((i) => i.is_internal);
  const sum = (arr, f) => ROUND(arr.reduce((s, x) => s + Number(f(x) || 0), 0));
  const pay = (kind) => ROUND(payments.filter((p) => p.kind === kind).reduce((s, p) => s + Number(p.amount), 0));

  const receipts = pay('receipt');
  const written_off = pay('write_off');
  const credited = pay('credit_note');

  const billed_net = sum(external, (i) => (i.net_payable != null ? i.net_payable : i.total_amount || i.amount));
  const gst_charged = sum(external, (i) => i.tax_amount);
  const ait_withheld = sum(external, (i) => i.ait_amount);
  const revenue = sum(external, (i) => i.amount);
  const internal_cost = bookTotal(internal, settings).total;

  const opex = ROUND(expenses.reduce((s, e) => s + expenseAccrual(e, start, date), 0));
  const purchases = sum(pos, (p) => p.amount);
  const gst_paid = ROUND(remittances.filter((r) => r.kind === 'gst_paid').reduce((s, r) => s + Number(r.amount), 0));
  const ait_claimed = ROUND(remittances.filter((r) => r.kind === 'ait_claimed').reduce((s, r) => s + Number(r.amount), 0));

  const cash = ROUND(opening_cash + receipts - opex - purchases - internal_cost - gst_paid);
  const receivables = ROUND(billed_net - receipts - written_off - credited);
  const advance_tax = ROUND(ait_withheld - ait_claimed);
  const total_assets = ROUND(cash + receivables + advance_tax);

  const gst_payable = ROUND(gst_charged - gst_paid);
  const total_liabilities = gst_payable;

  const retained_earnings = ROUND(
    revenue - credited - written_off - internal_cost - opex - purchases - ait_claimed
  );
  const total_equity = ROUND(opening_cash + retained_earnings);

  return {
    as_of: date,
    currency: settings.currency || 'PKR',
    assets: {
      current: [
        { label: 'Cash and bank', amount: cash },
        { label: 'Trade receivables', amount: receivables },
        { label: 'Advance income tax recoverable', amount: advance_tax },
      ],
      total: total_assets,
    },
    liabilities: {
      current: [
        { label: 'Sales tax payable (GST collected, not yet remitted)', amount: gst_payable },
      ],
      total: total_liabilities,
    },
    equity: {
      lines: [
        { label: 'Opening capital', amount: opening_cash },
        { label: 'Retained earnings', amount: retained_earnings },
      ],
      total: total_equity,
    },
    check: {
      assets: total_assets,
      liabilities_and_equity: ROUND(total_liabilities + total_equity),
      difference: ROUND(total_assets - total_liabilities - total_equity),
      balanced: Math.abs(ROUND(total_assets - total_liabilities - total_equity)) < 0.05,
    },
    basis: [
      'Revenue is recognised when an invoice is issued, excluding GST.',
      'Expenses and purchase orders are treated as settled in cash when incurred, so no trade payables are shown.',
      'GST collected is a liability until remitted; AIT withheld by clients is an asset until claimed.',
      "VantriqAI's own agents are billed internally: those invoices are cost, never revenue or receivables.",
      'Credit notes and write-offs are recorded at their gross value; reverse GST with a negative invoice if it matters.',
    ],
  };
}

/** The earliest date anything happened, so "since the start" means something. */
async function inceptionDate() {
  const { rows } = await db.query(`
    select min(d) as d from (
      select min(issued_date)::date as d from invoices
      union all select min(start_date)::date from expenses
      union all select min(po_date)::date from purchase_orders
      union all select min(created_at)::date from clients
    ) x`);
  return (rows[0] && rows[0].d && DAY(rows[0].d)) || DAY(new Date());
}

module.exports = {
  loadBooks, computePnl, computeBalanceSheet, revenueBreakdown,
  bookValue, bookTotal, foreignTotals,
  expenseAccrual, monthsBetween, monthName, inceptionDate, DAY, MONTH_START, ROUND, pct,
};
