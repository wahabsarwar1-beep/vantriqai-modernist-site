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
 * The Contracts tab's own filters, mirrored exactly.
 *
 * The screen and the spreadsheet have to agree on what "expiring soon" means,
 * so the rule lives here once and the tab's counts are derived from the same
 * fields the API already computes. Getting these out of step would be worse
 * than having no export: somebody reconciles a download against the screen and
 * finds a different number with no way to tell which is right.
 */
const CONTRACT_VIEWS = [
  { id: 'active',   label: 'Active',        match: (c) => c.status === 'active' || c.status === 'signed' },
  { id: 'expiring', label: 'Expiring soon', match: (c) => c.expiring_soon },
  { id: 'draft',    label: 'Draft or sent', match: (c) => c.status === 'draft' || c.status === 'sent' },
  { id: 'ended',    label: 'Ended',         match: (c) => ['expired', 'terminated', 'superseded'].includes(c.status) },
];

const CONTRACT_COLUMNS = [
  col('Contract #', 'contract_number', { width: 20 }),
  col('Company', 'company', { width: 26 }),
  col('Title', 'title', { width: 30 }),
  col('Type', 'kind', { width: 13 }), col('Status', 'status', { width: 13 }),
  col('Starts', 'start_date', { date: true }), col('Ends', 'end_date', { date: true }),
  col('Days remaining', 'days_remaining', { width: 14 }),
  col('Expiring soon', 'expiring_soon', { width: 13 }),
  col('Auto-renews', 'auto_renew'), col('Notice (days)', 'notice_days'),
  col('Value', 'value', { money: true }), col('Currency', 'currency'),
  col('Billed', 'billing_frequency', { width: 13 }),
  col('Signed', 'signed_date', { date: true }),
  col('Signed by (client)', 'signed_by_client', { width: 22 }),
  col('Signed by (us)', 'signed_by_us', { width: 22 }),
  // As signed, never the client record's current values.
  col('Registered name', 'client_legal_name', { width: 26 }),
  col('NTN', 'client_ntn', { width: 16 }), col('STRN', 'client_strn', { width: 20 }),
  col('Registered address', 'client_address', { width: 30 }),
  col('Document', 'document_url', { width: 34 }),
  col('Scope', 'scope', { width: 30 }), col('Notes', 'notes', { width: 30 }),
];

/**
 * GET /api/export/contracts.xlsx[?view=expiring]
 *
 * With no view it writes one sheet per filter on the Contracts tab plus an
 * "All contracts" sheet, so the whole book and each section separately arrive
 * together. With ?view= it writes that section alone.
 */
router.get('/contracts.xlsx', async (req, res) => {
  const wanted = String(req.query.view || 'all').toLowerCase();
  const chosen = CONTRACT_VIEWS.find((v) => v.id === wanted);
  if (wanted !== 'all' && !chosen) {
    return res.status(400).json({
      error: `Unknown section '${req.query.view}'. Use one of: all, ${CONTRACT_VIEWS.map((v) => v.id).join(', ')}.`,
    });
  }

  const [{ rows }, { rows: settingsRows }] = await Promise.all([
    db.query(
      `select k.*, c.company, c.ntn as client_current_ntn, c.strn as client_current_strn
         from contracts k join clients c on c.id = k.client_id
        order by c.company, k.start_date desc nulls last`
    ),
    db.query(`select * from settings where id = 1`),
  ]);
  const settings = settingsRows[0] || {};

  // The same derivations the Contracts tab shows. Status follows the term —
  // a contract whose end date has passed reads expired whether or not anyone
  // opened the CRM to say so — and expiring-soon uses the contract's own
  // notice period, so a 90-day-notice agreement warns three months out.
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  // pg hands dates back as Date objects in-process, and String(aDate) gives
  // 'Thu Oct 15 2026 ...' — so slicing ten characters off it yields
  // 'Thu Oct 15', which parses to Invalid Date. Every comparison against NaN
  // is then false, and the spreadsheet quietly reports nothing as expiring
  // while the screen reports two. Same trap as the invoice PDF's dates.
  const asDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const daysUntil = (d) => (d ? Math.round((new Date(asDay(d) + 'T00:00:00Z').getTime() - today) / 86400000) : null);
  const contracts = rows.map((c) => {
    const left = daysUntil(c.end_date);
    let status = c.status;
    if (!['terminated', 'superseded', 'draft', 'sent'].includes(c.status)) {
      if (c.end_date && left < 0) status = 'expired';
      else if (c.status === 'signed' && c.start_date && daysUntil(c.start_date) <= 0) status = 'active';
    }
    return {
      ...c,
      status,
      days_remaining: left,
      expiring_soon: status === 'active' && left != null && left >= 0
        && left <= Math.max(30, Number(c.notice_days || 0)),
      client_legal_name: c.client_legal_name || c.company,
      client_ntn: c.client_ntn || c.client_current_ntn || '',
      client_strn: c.client_strn || c.client_current_strn || '',
    };
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name || 'Vantriq AI';
  wb.created = new Date();

  if (chosen) {
    addSheet(wb, chosen.label, CONTRACT_COLUMNS, contracts.filter(chosen.match));
  } else {
    addSheet(wb, 'All contracts', CONTRACT_COLUMNS, contracts);
    for (const v of CONTRACT_VIEWS) addSheet(wb, v.label, CONTRACT_COLUMNS, contracts.filter(v.match));
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const who = (settings.company_name || 'vantriq').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',
    `attachment; filename="${who}-contracts-${chosen ? chosen.id + '-' : ''}${stamp}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

/**
 * The pipeline stages, in the order a deal moves through them.
 *
 * 'lost' folds churned in with it: from the pipeline's point of view they are
 * the same answer — the deal is not coming, and you want both in one list
 * when you sit down to work out why.
 */
const PIPELINE_STAGES = [
  { id: 'lead',        label: 'New leads',      stages: ['lead'] },
  { id: 'contacted',   label: 'Contacted',      stages: ['contacted'] },
  { id: 'proposal',    label: 'Proposal sent',  stages: ['proposal'] },
  { id: 'negotiation', label: 'Negotiation',    stages: ['negotiation'] },
  { id: 'active',      label: 'Won — active',   stages: ['active'] },
  { id: 'lost',        label: 'Lost — churned', stages: ['lost', 'churned'] },
];

/**
 * GET /api/export/pipeline.xlsx[?stage=lead]
 *
 * The pipeline as a spreadsheet. With no stage it writes one sheet per stage
 * plus an "All stages" sheet holding every row — so the whole pipeline and
 * each stage on its own arrive in a single file, which is what you want when
 * the question is "where is everything sitting". With ?stage= it writes that
 * one stage alone.
 *
 * The columns are the ones you work a lead from — who, how to reach them,
 * where they came from, what it is worth, who owns it and how long it has sat
 * there — rather than every column the table happens to have. Days in stage
 * comes off updated_at, which is what the stage-change trigger touches.
 */
router.get('/pipeline.xlsx', async (req, res) => {
  const wanted = String(req.query.stage || 'all').toLowerCase();
  const chosen = PIPELINE_STAGES.find((s) => s.id === wanted);
  if (wanted !== 'all' && !chosen) {
    return res.status(400).json({
      error: `Unknown stage '${req.query.stage}'. Use one of: all, ${PIPELINE_STAGES.map((s) => s.id).join(', ')}.`,
    });
  }

  const [clientsQ, productsQ, repsQ, settingsQ] = await Promise.all([
    db.query(`select * from clients order by est_value desc nulls last, company`),
    db.query(`select id, name from products`),
    db.query(`select id, name from sales_reps`),
    db.query(`select * from settings where id = 1`),
  ]);
  const settings = settingsQ.rows[0] || {};
  const productName = Object.fromEntries(productsQ.rows.map((p) => [p.id, p.name]));
  const repName = Object.fromEntries(repsQ.rows.map((r) => [r.id, r.name]));

  const DAYS = (d) => (d ? Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 86400000)) : '');

  const columns = [
    col('Company', 'company', { width: 28 }),
    col('Contact', 'name', { width: 22 }),
    col('Email', 'email', { width: 26 }),
    col('Phone', 'phone', { width: 16 }),
    col('Stage', 'stage', { width: 13 }),
    col('Est. value', 'est_value', { money: true, width: 14 }),
    col('Package', 'package', { width: 16, value: (c) => productName[c.product_id] || '' }),
    col('Source', 'source', { width: 16 }),
    col('Owner (rep)', 'owner', { width: 18, value: (c) => repName[c.owner_rep_id] || '' }),
    col('Days in stage', 'days_in_stage', { width: 14, value: (c) => DAYS(c.updated_at) }),
    col('Created', 'created_at', { date: true, width: 13 }),
    col('Joined', 'join_date', { date: true, width: 13 }),
    col('Notes', 'notes', { width: 44 }),
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name || 'Vantriq AI';
  wb.created = new Date();

  const groups = chosen ? [chosen] : PIPELINE_STAGES;
  if (!chosen) {
    // Every row in one sheet, so "the leads as a whole" is one tab rather
    // than a copy-paste of the six that follow it.
    const everything = clientsQ.rows.filter((c) => !c.is_internal);
    addSheet(wb, 'All stages', columns, everything);
  }
  for (const g of groups) {
    const rows = clientsQ.rows.filter((c) => g.stages.includes(c.stage) && !c.is_internal);
    addSheet(wb, g.label, columns, rows);
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const who = (settings.company_name || 'vantriq').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const name = `${who}-pipeline-${chosen ? chosen.id + '-' : ''}${stamp}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  await wb.xlsx.write(res);
  res.end();
});

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
    bundles, quotes, quoteLines, phases, rates, dunningSteps, reminders,
    automations, automationRuns, bankCredits, contracts, documents, identityChanges,
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
    // v8 — subscriptions, quotes, chasing and reconciliation.
    q(`select b.*, c.company, a.name as agent_name, p.name as product_name
         from client_bundles b
         join clients c on c.id = b.client_id
         left join client_agents a on a.id = b.agent_id
         left join products p on p.id = b.product_id
        order by c.company, b.starts_on`),
    q(`select qq.*, c.company, p.name as product_name from quotes qq
         join clients c on c.id = qq.client_id
         left join products p on p.id = qq.product_id
        order by qq.created_at`),
    q(`select l.*, qq.quote_number from quote_lines l join quotes qq on qq.id = l.quote_id
        order by qq.quote_number, l.position`),
    q(`select ph.*, c.company, p.name as product_name from subscription_phases ph
         join clients c on c.id = ph.client_id join products p on p.id = ph.product_id
        order by ph.effective_on`),
    q(`select r.*, c.company, a.name as agent_name, p.name as product_name from usage_rates r
         left join clients c on c.id = r.client_id
         left join client_agents a on a.id = r.agent_id
         left join products p on p.id = r.product_id
        order by r.metric`),
    q(`select * from dunning_steps order by offset_days, position`),
    q(`select r.*, i.invoice_number, c.company, s.name as step_name from invoice_reminders r
         join invoices i on i.id = r.invoice_id
         join clients c on c.id = i.client_id
         left join dunning_steps s on s.id = r.step_id
        order by r.sent_at desc`),
    q(`select * from automations order by created_at`),
    q(`select r.*, a.name as automation_name, c.company from automation_runs r
         join automations a on a.id = r.automation_id
         left join clients c on c.id = r.client_id
        order by r.created_at desc`),
    q(`select b.*, i.invoice_number, c.company from bank_credits b
         left join invoices i on i.id = b.matched_invoice_id
         left join clients c on c.id = i.client_id
        order by b.received_date desc`),
    // v9.3 — contracts. The legal identity comes off the CONTRACT, not the
    // client, so the sheet shows what each one was actually signed under.
    q(`select k.*, c.company, c.name as contact_name, c.email,
              prev.contract_number as superseded_by_number
         from contracts k
         join clients c on c.id = k.client_id
         left join contracts prev on prev.id = k.superseded_by
        order by c.company, k.start_date desc nulls last`),
    // A manifest of the paperwork, not the paperwork. The bytes are
    // deliberately not selected: a spreadsheet is not a filing cabinet, and
    // pulling every scan into memory to build one is how the export starts
    // timing out. Download the file itself from the client's panel.
    q(`select d.id, d.doc_type, d.title, d.filename, d.content_type, d.byte_size,
              d.notes, d.uploaded_by, d.created_at, c.company
         from client_documents d join clients c on c.id = d.client_id
        order by c.company, d.created_at desc`),
    q(`select h.*, c.company as current_company from client_identity_changes h
         join clients c on c.id = h.client_id
        order by h.changed_at desc`),
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
    ['Bundles on accounts', bundles.filter((b) => b.status === 'active').length],
    ['Quotes raised', quotes.length],
    ['— accepted', quotes.filter((q) => q.status === 'accepted').length],
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

  addSheet(wb, 'Bundles', [
    col('Company', 'company', { width: 26 }), col('Bundle', 'name', { width: 24 }),
    col('Based on', 'product_name', { width: 16 }), col('Agent', 'agent_name', { width: 22 }),
    col('Qty', 'qty'),
    col('Retainer each', 'unit_retainer', { money: true }),
    col('Setup each', 'unit_setup_fee', { money: true }),
    col('Conversations each', 'unit_quota'),
    col('Overage rate', 'overage_rate', { money: true }),
    col('Monthly total', 'monthly', { money: true, value: (r) => Number(r.qty) * Number(r.unit_retainer) }),
    col('Conversations added', 'added', { value: (r) => Number(r.qty) * Number(r.unit_quota) }),
    col('Recurring', 'recurring'), col('Status', 'status'),
    col('Starts', 'starts_on', { date: true }), col('Ends', 'ends_on', { date: true }),
    col('Added by', 'added_by'), col('Setup billed', 'setup_billed'),
    col('Note', 'note', { width: 30 }),
  ], bundles);

  addSheet(wb, 'Contracts', [
    col('Contract #', 'contract_number', { width: 20 }),
    col('Company', 'company', { width: 26 }),
    col('Title', 'title', { width: 30 }),
    col('Type', 'kind', { width: 13 }), col('Status', 'status', { width: 13 }),
    col('Starts', 'start_date', { date: true }), col('Ends', 'end_date', { date: true }),
    col('Auto-renews', 'auto_renew'), col('Notice (days)', 'notice_days'),
    col('Value', 'value', { money: true }), col('Currency', 'currency'),
    col('Billed', 'billing_frequency', { width: 13 }),
    col('Signed', 'signed_date', { date: true }),
    col('Signed by (client)', 'signed_by_client', { width: 22 }),
    col('Signed by (us)', 'signed_by_us', { width: 22 }),
    // As signed — deliberately not the client record's current values.
    col('Registered name', 'client_legal_name', { width: 26 }),
    col('NTN', 'client_ntn', { width: 16 }), col('STRN', 'client_strn', { width: 20 }),
    col('Registered address', 'client_address', { width: 30 }),
    col('Document', 'document_url', { width: 34 }),
    col('Scope', 'scope', { width: 30 }), col('Notes', 'notes', { width: 30 }),
    col('Replaced by', 'superseded_by_number', { width: 20 }),
  ], contracts);

  addSheet(wb, 'Documents on file', [
    col('Company', 'company', { width: 26 }),
    col('Type', 'doc_type', { width: 12 }), col('Title', 'title', { width: 28 }),
    col('Filename', 'filename', { width: 30 }),
    col('Format', 'content_type', { width: 20 }),
    col('Size (KB)', 'kb', { width: 11, value: (d) => Math.max(1, Math.round(Number(d.byte_size || 0) / 1024)) }),
    col('Uploaded', 'created_at', { date: true, width: 20 }),
    col('By', 'uploaded_by', { width: 22 }), col('Note', 'notes', { width: 30 }),
  ], documents);

  // Why a year's invoices for one customer can carry two different NTNs.
  addSheet(wb, 'Identity changes', [
    col('Company (now)', 'current_company', { width: 26 }),
    col('Changed', 'changed_at', { date: true, width: 20 }),
    col('Effective from', 'effective_from', { date: true, width: 14 }),
    col('Name was', 'old_company', { width: 26 }), col('Name is', 'new_company', { width: 26 }),
    col('NTN was', 'old_ntn', { width: 16 }), col('NTN is', 'new_ntn', { width: 16 }),
    col('STRN was', 'old_strn', { width: 20 }), col('STRN is', 'new_strn', { width: 20 }),
    col('Address was', 'old_address', { width: 30 }), col('Address is', 'new_address', { width: 30 }),
    col('Reason', 'reason', { width: 34 }), col('By', 'changed_by', { width: 22 }),
  ], identityChanges);

  addSheet(wb, 'Quotes', [
    col('Quote #', 'quote_number', { width: 20 }), col('Company', 'company', { width: 26 }),
    col('For', 'title', { width: 28 }), col('Status', 'status'),
    col('Subtotal', 'subtotal', { money: true }),
    col('Tax %', 'tax_rate'), col('Tax', 'tax_amount', { money: true }),
    col('Total', 'total', { money: true }),
    col('Proposes package', 'product_name', { width: 18 }),
    col('Valid until', 'valid_until', { date: true }),
    col('Raised', 'created_at', { date: true, width: 20 }),
    col('Sent', 'sent_at', { date: true, width: 20 }),
    col('Decided', 'decided_at', { date: true, width: 20 }),
    col('Notes', 'notes', { width: 34 }),
  ], quotes);

  addSheet(wb, 'Quote lines', [
    col('Quote #', 'quote_number', { width: 20 }), col('#', 'position'),
    col('Description', 'description', { width: 38 }), col('Detail', 'detail', { width: 28 }),
    col('Qty', 'qty'), col('Unit price', 'unit_price', { money: true }), col('Amount', 'amount', { money: true }),
  ], quoteLines);

  addSheet(wb, 'Scheduled changes', [
    col('Effective', 'effective_on', { date: true }), col('Company', 'company', { width: 26 }),
    col('Moves to', 'product_name', { width: 18 }), col('Status', 'status'),
    col('Applied', 'applied_at', { date: true, width: 20 }),
    col('Set by', 'created_by', { width: 22 }), col('Note', 'note', { width: 30 }),
  ], phases);

  addSheet(wb, 'Metered rates', [
    col('Client', 'company', { width: 24 }), col('Agent', 'agent_name', { width: 22 }),
    col('Package', 'product_name', { width: 16 }), col('Metric', 'metric', { width: 16 }),
    col('Rate', 'unit_rate', { money: true }), col('Per units', 'unit_size'),
    col('Included', 'included_units'), col('Label', 'label', { width: 26 }),
    col('From', 'effective_from', { date: true }), col('To', 'effective_to', { date: true }),
  ], rates);

  addSheet(wb, 'Chase schedule', [
    col('Days from due', 'offset_days'), col('Step', 'name', { width: 24 }),
    col('Action', 'action'), col('Active', 'active'),
    col('Subject', 'subject', { width: 40 }), col('Body', 'body', { width: 60 }),
  ], dunningSteps);

  addSheet(wb, 'Reminders sent', [
    col('Sent', 'sent_at', { date: true, width: 20 }), col('Company', 'company', { width: 26 }),
    col('Invoice #', 'invoice_number', { width: 18 }), col('Step', 'step_name', { width: 22 }),
    col('Action', 'action'), col('Outcome', 'outcome'), col('Detail', 'detail', { width: 40 }),
  ], reminders);

  addSheet(wb, 'Automations', [
    col('Rule', 'name', { width: 28 }), col('Trigger', 'trigger', { width: 22 }),
    col('Days', 'threshold_days'), col('Percent', 'threshold_pct'),
    col('Action', 'action', { width: 20 }), col('Active', 'active'),
    col('Times fired', 'run_count'), col('Last run', 'last_run_at', { date: true, width: 20 }),
  ], automations);

  addSheet(wb, 'Automation history', [
    col('When', 'created_at', { date: true, width: 20 }), col('Rule', 'automation_name', { width: 26 }),
    col('Company', 'company', { width: 24 }), col('Outcome', 'outcome'), col('Detail', 'detail', { width: 40 }),
  ], automationRuns);

  addSheet(wb, 'Bank credits', [
    col('Received', 'received_date', { date: true }), col('Amount', 'amount', { money: true }),
    col('Reference', 'reference', { width: 26 }), col('Payer', 'payer', { width: 24 }),
    col('Status', 'status'), col('Matched to', 'invoice_number', { width: 18 }),
    col('Company', 'company', { width: 24 }), col('Why', 'match_confidence', { width: 44 }),
  ], bankCredits);

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
