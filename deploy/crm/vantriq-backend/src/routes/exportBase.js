const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const acc = require('../utils/accounting');
const { settlementOf } = require('../utils/billing');
const router = express.Router();

/**
 * The whole CRM, in one spreadsheet.
 *
 * Not a report — a copy. Every table that carries a fact worth keeping gets
 * its own sheet, plus the two derived sheets people actually open first: the
 * month-by-month revenue line from the first invoice ever raised to today,
 * and the Balance Sheet as it stands.
 *
 * It exists because a CRM you cannot get your data out of is a CRM you do not
 * own. An accountant gets sent this file; nobody has to be given a login.
 */

const MONEY = '#,##0.00';
const DATE = 'yyyy-mm-dd';

/** Booleans and timestamps come out of pg in shapes Excel does not like. */
function cell(v) {
  if (v === null || v === undefined) return '';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (v instanceof Date) return v;
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function addSheet(wb, name, columns, rows) {
  // Excel refuses sheet names over 31 characters or containing : \ / ? * [ ]
  const ws = wb.addWorksheet(String(name).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31));
  ws.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width || Math.max(12, String(c.header).length + 2),
    style: c.money ? { numFmt: MONEY } : c.date ? { numFmt: DATE } : undefined,
  }));
  for (const r of rows) {
    const out = {};
    for (const c of columns) out[c.key] = cell(c.value ? c.value(r) : r[c.key]);
    ws.addRow(out);
  }
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

const col = (header, key, opts = {}) => ({ header, key, ...opts });

/**
 * GET /api/export/crm.xlsx
 *
 * Optional ?from=&to= narrows the transactional sheets (invoices, payments,
 * usage). The reference sheets — clients, packages, agents — are always
 * complete, because a filtered invoice list that points at clients you cannot
 * see is not much use to anyone.
 */
router.get('/crm.xlsx', async (req, res) => {
  const to = req.query.to ? acc.DAY(req.query.to) : acc.DAY(new Date());
  const from = req.query.from ? acc.DAY(req.query.from) : await acc.inceptionDate();

  const q = (sql, params = []) => db.query(sql, params).then((r) => r.rows);
  const [
    settings, clients, agents, products, invoices, lines, payments, expenses,
    vendors, pos, remittances, usageMonthly, usageByAgent, quotaEvents,
    stageHistory, reps, packageRequests,
  ] = await Promise.all([
    q(`select * from settings where id = 1`).then((r) => r[0] || {}),
    q(`select c.*, p.name as package_name, parent.company as parent_company
         from clients c
         left join products p on p.id = c.product_id
         left join clients parent on parent.id = c.parent_client_id
        order by c.company`),
    q(`select a.*, c.company from client_agents a join clients c on c.id = a.client_id order by c.company, a.name`),
    q(`select * from products order by sort_order, name`),
    q(`select i.*, c.company, c.is_internal from invoices i join clients c on c.id = i.client_id
        where i.issued_date between $1::date and $2::date
        order by i.issued_date, i.invoice_number`, [from, to]),
    q(`select l.*, i.invoice_number from invoice_lines l join invoices i on i.id = l.invoice_id
        where i.issued_date between $1::date and $2::date
        order by i.invoice_number, l.position`, [from, to]),
    q(`select p.*, i.invoice_number, c.company from payments p
         join invoices i on i.id = p.invoice_id
         left join clients c on c.id = p.client_id
        where p.received_date between $1::date and $2::date
        order by p.received_date`, [from, to]),
    q(`select e.*, v.name as vendor_name from expenses e left join vendors v on v.id = e.vendor_id order by e.start_date`),
    q(`select * from vendors order by name`),
    q(`select po.*, v.name as vendor_name from purchase_orders po left join vendors v on v.id = po.vendor_id order by po.po_date`),
    q(`select * from tax_remittances order by paid_date`),
    q(`select u.period_month, c.company, c.id as client_id, u.sessions, u.messages, u.input_tokens, u.output_tokens
         from v_monthly_usage u join clients c on c.id = u.client_id
        where u.period_month between date_trunc('month',$1::date) and $2::date
        order by u.period_month, c.company`, [from, to]),
    q(`select date_trunc('month', e.occurred_at)::date as period_month,
              c.company, a.name as agent, a.kind,
              count(distinct e.session_id) as sessions,
              sum(e.messages_count) as messages,
              sum(e.input_tokens) as input_tokens,
              sum(e.output_tokens) as output_tokens
         from usage_events e
         join client_agents a on a.id = e.agent_id
         join clients c on c.id = e.client_id
        where e.occurred_at between $1::date and ($2::date + 1)
        group by 1,2,3,4 order by 1,2,3`, [from, to]),
    q(`select q.*, c.company from quota_events q join clients c on c.id = q.client_id order by q.period_month desc`),
    q(`select h.*, c.company from client_stage_history h join clients c on c.id = h.client_id order by h.created_at`),
    q(`select id, name, email, active, created_at, last_used_at from sales_reps order by name`),
    q(`select r.*, c.company, p.name as package_name from package_requests r
         join clients c on c.id = r.client_id join products p on p.id = r.product_id
        order by r.created_at desc`),
  ]);

  // Settlement per invoice, for the Invoices sheet's outstanding column.
  const ledger = new Map();
  for (const p of payments) {
    if (!ledger.has(p.invoice_id)) ledger.set(p.invoice_id, []);
    ledger.get(p.invoice_id).push(p);
  }

  const books = await acc.loadBooks(to);
  const months = acc.monthsBetween(from, to).map((m) => {
    const d = new Date(`${m}T00:00:00Z`);
    const last = acc.DAY(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
    const p = acc.computePnl(books, m, last > to ? to : last);
    return {
      month: m, label: acc.monthName(m),
      setup_fee: p.revenue.setup_fee, retainer: p.revenue.retainer,
      overage: p.revenue.overage, addon: p.revenue.addon,
      credit_notes: p.revenue.credit_notes, revenue: p.revenue.net,
      internal_ai: p.cost_of_service.internal_ai_usage,
      vendor_purchases: p.cost_of_service.vendor_purchases,
      gross_profit: p.gross_profit,
      operating_expenses: p.operating_expenses_total,
      bad_debts: p.bad_debts,
      net_profit: p.net_profit,
      margin: p.net_margin_pct,
    };
  });
  const sheet = acc.computeBalanceSheet(books, to);
  const total = acc.computePnl(books, from, to);

  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name || 'Vantriq AI';
  wb.created = new Date();

  // --- Overview -------------------------------------------------------
  const overview = wb.addWorksheet('Overview');
  overview.columns = [{ width: 42 }, { width: 24 }];
  const rowsOverview = [
    [settings.company_name || 'Vantriq AI', ''],
    ['Full CRM export', ''],
    ['Generated', new Date().toISOString().slice(0, 19).replace('T', ' ')],
    ['Covering', `${from} to ${to}`],
    ['Currency', settings.currency || 'PKR'],
    ['', ''],
    ['Clients', clients.length],
    ['— active', clients.filter((c) => c.stage === 'active').length],
    ['— internal (VantriqAI itself)', clients.filter((c) => c.is_internal).length],
    ['Agents and automations', agents.length],
    ['Invoices in range', invoices.length],
    ['', ''],
    ['Revenue (excluding GST)', total.revenue.net],
    ['Cost of service', total.cost_of_service.total],
    [`— ${total.cost_of_service.internal_label}`, total.cost_of_service.internal_ai_usage],
    ['Gross profit', total.gross_profit],
    ['Operating expenses', total.operating_expenses_total],
    ['Net profit', total.net_profit],
    ['', ''],
    ['Cash and bank', sheet.assets.current[0].amount],
    ['Trade receivables', sheet.assets.current[1].amount],
    ['Advance income tax recoverable', sheet.assets.current[2].amount],
    ['Sales tax payable', sheet.liabilities.current[0].amount],
  ];
  rowsOverview.forEach((r) => overview.addRow(r));
  overview.getRow(1).font = { bold: true, size: 16 };
  overview.getRow(2).font = { italic: true, color: { argb: 'FF666666' } };
  overview.getColumn(2).numFmt = MONEY;

  // --- Monthly revenue, first month to last ---------------------------
  addSheet(wb, 'Monthly revenue', [
    col('Month', 'label', { width: 12 }),
    col('Setup fees', 'setup_fee', { money: true }),
    col('Retainers', 'retainer', { money: true }),
    col('Overage', 'overage', { money: true }),
    col('Add-ons', 'addon', { money: true }),
    col('Credit notes', 'credit_notes', { money: true }),
    col('Revenue', 'revenue', { money: true }),
    col('Internal AI usage', 'internal_ai', { money: true }),
    col('Vendor purchases', 'vendor_purchases', { money: true }),
    col('Gross profit', 'gross_profit', { money: true }),
    col('Operating expenses', 'operating_expenses', { money: true }),
    col('Bad debts', 'bad_debts', { money: true }),
    col('Net profit', 'net_profit', { money: true }),
    col('Net margin %', 'margin'),
  ], months);

  // --- Balance sheet ---------------------------------------------------
  const bs = wb.addWorksheet('Balance sheet');
  bs.columns = [{ width: 52 }, { width: 20, style: { numFmt: MONEY } }];
  bs.addRow([`Balance sheet as at ${sheet.as_of}`, '']).font = { bold: true, size: 14 };
  bs.addRow(['', '']);
  bs.addRow(['ASSETS', '']).font = { bold: true };
  sheet.assets.current.forEach((l) => bs.addRow([l.label, l.amount]));
  bs.addRow(['Total assets', sheet.assets.total]).font = { bold: true };
  bs.addRow(['', '']);
  bs.addRow(['LIABILITIES', '']).font = { bold: true };
  sheet.liabilities.current.forEach((l) => bs.addRow([l.label, l.amount]));
  bs.addRow(['Total liabilities', sheet.liabilities.total]).font = { bold: true };
  bs.addRow(['', '']);
  bs.addRow(['EQUITY', '']).font = { bold: true };
  sheet.equity.lines.forEach((l) => bs.addRow([l.label, l.amount]));
  bs.addRow(['Total equity', sheet.equity.total]).font = { bold: true };
  bs.addRow(['', '']);
  bs.addRow(['Liabilities and equity', sheet.check.liabilities_and_equity]).font = { bold: true };
  bs.addRow(['Difference (should be zero)', sheet.check.difference]);
  bs.addRow(['', '']);
  bs.addRow(['Basis of preparation', '']).font = { bold: true };
  sheet.basis.forEach((b) => bs.addRow([b, '']));

  // --- The records ------------------------------------------------------
  addSheet(wb, 'Clients', [
    col('Company', 'company', { width: 26 }), col('Contact', 'name', { width: 20 }),
    col('Email', 'email', { width: 26 }), col('Phone', 'phone'),
    col('Stage', 'stage'), col('Sales stage', 'sales_stage'),
    col('Package', 'package_name', { width: 18 }),
    col('Parent account', 'parent_company', { width: 22 }),
    col('Internal', 'is_internal'), col('Service', 'service_status'),
    col('Est. value', 'est_value', { money: true }), col('Source', 'source'),
    col('External ref', 'external_ref', { width: 22 }),
    col('NTN', 'ntn'), col('STRN', 'strn'),
    col('GST %', 'tax_rate'), col('AIT %', 'ait_rate'), col('AIT exempt', 'ait_exempt'),
    col('Billing address', 'billing_address', { width: 30 }),
    col('Join date', 'join_date', { date: true }),
    col('Portal username', 'portal_username'),
    col('Created', 'created_at', { date: true, width: 20 }),
    col('Notes', 'notes', { width: 40 }),
  ], clients);

  addSheet(wb, 'Agents and automations', [
    col('Company', 'company', { width: 26 }), col('Agent', 'name', { width: 24 }),
    col('Kind', 'kind'), col('Status', 'status'),
    col('External ref', 'external_ref', { width: 26 }),
    col('Created', 'created_at', { date: true, width: 20 }), col('Notes', 'notes', { width: 34 }),
  ], agents);

  addSheet(wb, 'Packages', [
    col('Package', 'name', { width: 20 }), col('Target tier', 'target_tier', { width: 22 }),
    col('Setup fee', 'setup_fee', { money: true }), col('Retainer', 'retainer', { money: true }),
    col('Quota', 'quota'), col('Overage rate', 'overage_rate', { money: true }),
    col('Msgs / session', 'msgs_per_session'),
    col('Delivery cost @100%', 'delivery_cost_full', { money: true }),
    col('AI model', 'ai_model', { width: 20 }), col('Channels', 'channels', { width: 22 }),
    col('Automation', 'automation', { width: 26 }), col('Data layer', 'data_layer', { width: 22 }),
    col('Standard', 'is_standard'), col('Archived', 'archived'),
  ], products);

  addSheet(wb, 'Invoices', [
    col('Invoice no.', 'invoice_number', { width: 18 }),
    col('Company', 'company', { width: 26 }), col('Internal', 'is_internal'),
    col('Type', 'type'), col('Period', 'period'),
    col('Issued', 'issued_date', { date: true }), col('Due', 'due_date', { date: true }),
    col('Status', 'status'),
    col('Subtotal', 'amount', { money: true }),
    col('GST %', 'tax_rate'), col('GST', 'tax_amount', { money: true }),
    col('Total', 'total_amount', { money: true }),
    col('AIT %', 'ait_rate'), col('AIT withheld', 'ait_amount', { money: true }),
    col('Net payable', 'net_payable', { money: true }),
    col('Received', 'received', { money: true, value: (r) => settlementOf(r, ledger.get(r.id)).received }),
    col('Outstanding', 'balance', { money: true, value: (r) => settlementOf(r, ledger.get(r.id)).balance }),
    col('Overage sessions', 'overage_sessions'),
    col('Client NTN', 'client_ntn'), col('Notes', 'notes', { width: 34 }),
  ], invoices);

  addSheet(wb, 'Invoice lines', [
    col('Invoice no.', 'invoice_number', { width: 18 }),
    col('#', 'position'), col('Description', 'description', { width: 38 }),
    col('Detail', 'detail', { width: 30 }), col('Qty', 'qty'),
    col('Unit price', 'unit_price', { money: true }), col('Amount', 'amount', { money: true }),
  ], lines);

  addSheet(wb, 'Payments', [
    col('Received', 'received_date', { date: true }),
    col('Invoice no.', 'invoice_number', { width: 18 }), col('Company', 'company', { width: 26 }),
    col('Kind', 'kind'), col('Amount', 'amount', { money: true }),
    col('Method', 'method'), col('Reference', 'reference', { width: 22 }),
    col('Recorded by', 'recorded_by', { width: 22 }), col('Notes', 'notes', { width: 30 }),
  ], payments);

  addSheet(wb, 'Usage by client', [
    col('Month', 'period_month', { date: true }), col('Company', 'company', { width: 26 }),
    col('Sessions', 'sessions'), col('Messages', 'messages'),
    col('Input tokens', 'input_tokens'), col('Output tokens', 'output_tokens'),
  ], usageMonthly);

  addSheet(wb, 'Usage by agent', [
    col('Month', 'period_month', { date: true }), col('Company', 'company', { width: 26 }),
    col('Agent', 'agent', { width: 24 }), col('Kind', 'kind'),
    col('Sessions', 'sessions'), col('Messages', 'messages'),
    col('Input tokens', 'input_tokens'), col('Output tokens', 'output_tokens'),
  ], usageByAgent);

  addSheet(wb, 'Expenses', [
    col('Label', 'label', { width: 32 }), col('Category', 'category', { width: 20 }),
    col('Amount', 'amount', { money: true }), col('Recurring', 'recurring'),
    col('Starts', 'start_date', { date: true }), col('Ends', 'end_date', { date: true }),
    col('Vendor', 'vendor_name', { width: 22 }),
  ], expenses);

  addSheet(wb, 'Vendors', [
    col('Vendor', 'name', { width: 26 }), col('Category', 'category', { width: 20 }),
    col('Tiers', 'tiers', { width: 20 }),
    col('Cost min', 'cost_min', { money: true }), col('Cost max', 'cost_max', { money: true }),
    col('Status', 'status'),
  ], vendors);

  addSheet(wb, 'Purchase orders', [
    col('Date', 'po_date', { date: true }), col('Vendor', 'vendor_name', { width: 24 }),
    col('Item', 'item', { width: 34 }), col('Amount', 'amount', { money: true }),
    col('Status', 'status'),
  ], pos);

  addSheet(wb, 'Tax remittances', [
    col('Paid', 'paid_date', { date: true }), col('Kind', 'kind', { width: 16 }),
    col('Amount', 'amount', { money: true }), col('Period', 'period'),
    col('Reference', 'reference', { width: 22 }), col('Notes', 'notes', { width: 30 }),
  ], remittances);

  addSheet(wb, 'Quota events', [
    col('Month', 'period_month', { date: true }), col('Company', 'company', { width: 26 }),
    col('Threshold', 'threshold'), col('Sessions', 'sessions_at_event'),
    col('Quota', 'quota_at_event'), col('Decision', 'decision'),
    col('Decided', 'decided_at', { date: true, width: 20 }), col('By', 'decided_by', { width: 22 }),
    col('Note', 'note', { width: 30 }),
  ], quotaEvents);

  addSheet(wb, 'Stage history', [
    col('When', 'created_at', { date: true, width: 20 }), col('Company', 'company', { width: 26 }),
    col('From', 'from_stage'), col('To', 'to_stage'), col('Comment', 'comment', { width: 44 }),
  ], stageHistory);

  addSheet(wb, 'Sales reps', [
    col('Name', 'name', { width: 24 }), col('Email', 'email', { width: 28 }),
    col('Active', 'active'), col('Created', 'created_at', { date: true, width: 20 }),
    col('Last used', 'last_used_at', { date: true, width: 20 }),
  ], reps);

  addSheet(wb, 'Package requests', [
    col('Raised', 'created_at', { date: true, width: 20 }), col('Company', 'company', { width: 26 }),
    col('Requested package', 'package_name', { width: 22 }), col('Status', 'status'),
    col('Decided', 'decided_at', { date: true, width: 20 }), col('Note', 'note', { width: 34 }),
  ], packageRequests);

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `${(settings.company_name || 'vantriq').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-crm-${stamp}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
