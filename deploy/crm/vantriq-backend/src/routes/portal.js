const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyPassword, hashPassword } = require('../utils/password');
const { sendMail, resetEmail, mailConfigured } = require('../utils/mailer');
const { issueReset, redeemReset, RESET_MINUTES } = require('../utils/resets');
const { quotaStatus } = require('../utils/quota');
const { buildTaxInvoice, getSettings } = require('../utils/billing');
const { requirePortalSession } = require('../middleware/portalAuth');
const { effectivePackage } = require('../utils/pkg');
const { acceptQuote, buildQuoteDocument } = require('./quotes');
const { renderInvoicePdf, invoiceFilename } = require('../utils/invoicePdf');
const { renderWhtStatement, whtFilename } = require('../utils/whtCertificate');
const ExcelJS = require('exceljs');

const router = express.Router();

const INVOICE_TYPE_LABEL = { setup_fee: 'Setup fee', retainer: 'Retainer', overage: 'Overage', addon: 'Add-on / change request' };
const SESSION_HOURS = 12;

/**
 * The customer portal is credential-gated: an admin generates a username and
 * password in the CRM, the customer signs in here, and every other route in
 * this file is scoped to that one client's own data by their session. The
 * old "portal link is the credential" scheme is gone — a link alone can no
 * longer open an account.
 *
 * The AI model behind a package is deliberately never exposed here; which
 * model serves a tier is Vantriq's delivery detail, not customer-facing.
 */

/* ---------------------------- Sign in / out (public) ---------------------------- */
router.post('/login', async (req, res) => {
  const username = String((req.body || {}).username || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  // One message for every failure mode, so the form can't be used to discover
  // which usernames exist.
  const fail = () => res.status(401).json({ error: 'Incorrect username or password.' });
  if (!username || !password) return fail();

  const { rows } = await db.query(`select * from clients where portal_username = $1`, [username]);
  const client = rows[0];
  if (!client || !client.portal_password_hash) return fail();
  if (!verifyPassword(password, client.portal_password_hash)) return fail();

  const token = 'ps_' + crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await db.query(
    `insert into portal_sessions (token, client_id, expires_at) values ($1,$2,$3)`,
    [token, client.id, expires]
  );
  res.json({ session: token, expires_at: expires.toISOString(), company: client.company });
});

router.post('/logout', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = (header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '') || req.header('x-portal-session');
  if (token) await db.query(`delete from portal_sessions where token = $1`, [token]);
  res.status(204).end();
});

/* ---------------------------- Forgot password (public) ---------------------------- */
/**
 * A customer can reset their own password. The link goes to the address on
 * their client record — an admin has to change that, so a stolen username
 * alone cannot redirect the reset. The new password is written straight into
 * the CRM's own record for them, so what they set is what the CRM holds.
 *
 * The reply never varies, so the form cannot be used to test usernames.
 */
router.post('/forgot-password', async (req, res) => {
  const id = String((req.body || {}).username || (req.body || {}).email || '').trim().toLowerCase();
  const same = () => res.json({
    ok: true,
    message: `If that account exists, a reset link is on its way to the email address we hold for it. It expires in ${RESET_MINUTES} minutes.`,
  });
  if (!id) return same();

  const { rows } = await db.query(
    `select id, company, name, email, portal_username from clients
      where portal_username = $1 or lower(email) = $1
      limit 1`,
    [id]
  );
  const client = rows[0];
  if (!client || !client.portal_username || !client.email || !mailConfigured()) return same();

  try {
    const { url } = await issueReset('portal', client.id);
    const { subject, text, html } = resetEmail(url, client.name || client.company, RESET_MINUTES);
    await sendMail({ to: client.email, subject, text, html });
  } catch (err) {
    console.error('Portal reset send failed', err);
  }
  same();
});

router.post('/reset-password', async (req, res) => {
  const token = String((req.body || {}).token || '');
  const password = String((req.body || {}).password || '');
  const result = await redeemReset('portal', token, password);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, message: 'Your password has been changed. Sign in with it now.' });
});

/* -------- Everything below requires a signed-in customer session -------- */
router.use(requirePortalSession);

/* ---------------------------- Account overview ---------------------------- */
router.get('/account', async (req, res) => {
  const client = req.portalClient;
  const [productRes, settingsRes] = await Promise.all([
    client.product_id ? db.query(`select * from products where id = $1`, [client.product_id]) : Promise.resolve({ rows: [] }),
    db.query(`select company_name, city from settings where id = 1`),
  ]);
  const eff = effectivePackage(client, productRes.rows[0] || null);

  res.json({
    company: client.company,
    contact_name: client.name,
    email: client.email,
    phone: client.phone,
    stage: client.stage,
    join_date: client.join_date,
    provider: settingsRes.rows[0],
    // A suspended customer can still sign in and read exactly why, and what
    // they owe. Meeting them with silence would only generate a phone call.
    service: {
      status: client.service_status || 'active',
      suspended_at: client.suspended_at || null,
      reason: client.service_status === 'suspended'
        ? (client.suspension_reason || 'Your service is paused. Please get in touch.')
        : null,
    },
    // Their own billing details, so a wrong NTN is visible to them before it
    // ends up on an invoice.
    billing: { ntn: client.ntn || '', strn: client.strn || '', address: client.billing_address || '' },
    // ai_model is intentionally omitted — internal delivery detail.
    package: eff ? {
      name: eff.name, retainer: eff.retainer, setup_fee: eff.setup_fee,
      quota: eff.quota, overage_rate: eff.overage_rate,
      automation: eff.automation, data_layer: eff.data_layer, channels: eff.channels,
    } : null,
  });
});

/* ---------------------------- Usage ---------------------------- */
router.get('/usage', async (req, res) => {
  const client = req.portalClient;
  const month = new Date().toISOString().slice(0, 7) + '-01';

  const [currentRes, historyRes] = await Promise.all([
    db.query(`select * from v_monthly_usage where client_id = $1 and period_month = $2::date`, [client.id, month]),
    db.query(
      `select * from v_monthly_usage where client_id = $1 and period_month >= (date_trunc('month', now()) - interval '5 months')
       order by period_month asc`,
      [client.id]
    ),
  ]);

  let quota = null, overageRate = null;
  if (client.product_id) {
    const { rows } = await db.query(`select * from products where id = $1`, [client.product_id]);
    const eff = effectivePackage(client, rows[0]);
    if (eff) { quota = eff.quota; overageRate = eff.overage_rate; }
  }
  const current = currentRes.rows[0] || { sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0 };
  const sessionsUsed = +current.sessions || 0;
  const overSessions = quota != null ? Math.max(0, sessionsUsed - quota) : 0;

  // Service does not stop at the quota line, so say plainly what is happening
  // instead of showing a bare number the customer has to interpret.
  const state = quota == null ? 'no_quota'
    : sessionsUsed >= quota ? 'exceeded'
    : sessionsUsed >= quota * 0.8 ? 'warning'
    : 'ok';
  const NOTICE = {
    exceeded: 'You have used all the conversations included in your package this month. Your service is still running — the extra conversations are billed at your overage rate, or you can move up a package.',
    warning: 'You have used most of the conversations included in your package this month.',
    ok: null, no_quota: null,
  };

  res.json({
    period_month: month,
    quota,
    sessions_used: sessionsUsed,
    sessions_remaining: quota != null ? Math.max(0, quota - sessionsUsed) : null,
    percent_used: quota ? Math.round((sessionsUsed / quota) * 100) : null,
    messages: +current.messages || 0,
    over_quota_sessions: overSessions,
    overage_rate: overageRate,
    estimated_overage_cost: overageRate != null ? overSessions * overageRate : null,
    state,
    notice: NOTICE[state],
    history: historyRes.rows.map((r) => ({
      period_month: r.period_month, sessions: +r.sessions || 0, messages: +r.messages || 0,
    })),
  });
});

/* ---------------------------- Invoices ---------------------------- */
router.get('/invoices', async (req, res) => {
  const { rows } = await db.query(
    `select * from invoices where client_id = $1 order by issued_date desc, created_at desc`,
    [req.portalClient.id]
  );
  res.json(rows.map(formatInvoice));
});

/**
 * GET /api/portal/invoices/tax-withheld.pdf[?year=2026][&invoice=<id>]
 *
 * The statement of advance income tax withheld — for a year, or for one
 * invoice. Declared BEFORE the /invoices/:invoiceId routes would otherwise
 * be reached, since 'tax-withheld.pdf' would match :invoiceId and 404 as a
 * missing invoice rather than doing anything useful.
 *
 * Only invoices that actually had tax withheld appear. An invoice with no
 * deduction on it has nothing to certify, and listing it at zero invites the
 * reader to think something went wrong.
 */
router.get('/invoices/tax-withheld.pdf', async (req, res) => {
  const client = req.portalClient;
  const settings = await getSettings();

  const params = [client.id];
  let where = `client_id = $1 and status <> 'void' and coalesce(ait_amount, 0) > 0`;
  let label;
  if (req.query.invoice) {
    params.push(req.query.invoice);
    where += ` and id = $${params.length}`;
    label = 'single invoice';
  } else {
    const year = /^\d{4}$/.test(String(req.query.year || '')) ? String(req.query.year)
      : String(new Date().getUTCFullYear());
    params.push(`${year}-01-01`, `${year}-12-31`);
    where += ` and issued_date between $${params.length - 1}::date and $${params.length}::date`;
    label = year;
  }

  const { rows } = await db.query(
    `select invoice_number, issued_date, amount, tax_amount, total_amount,
            ait_rate, ait_amount, net_payable, currency, client_legal_name,
            client_ntn, client_strn, billing_address
       from invoices where ${where} order by issued_date, invoice_number`,
    params
  );
  if (!rows.length) {
    return res.status(404).json({
      error: req.query.invoice
        ? 'No tax was withheld on that invoice, so there is nothing to state.'
        : `No tax was withheld on any invoice in ${label}.`,
    });
  }
  if (req.query.invoice) label = rows[0].invoice_number || 'single invoice';

  // The identity as STAMPED on the invoices, not the client record's current
  // values — the statement has to agree with the documents it summarises, and
  // a customer who re-registered mid-year must see what was actually filed.
  const first = rows[0];
  const d = {
    seller: {
      name: settings.company_name || 'Vantriq AI',
      ntn: settings.seller_ntn || settings.ntn || '',
      strn: settings.seller_strn || settings.strn || '',
      address: settings.seller_address || settings.address || '',
      email: settings.seller_email || '',
    },
    buyer: {
      company: first.client_legal_name || client.company,
      ntn: first.client_ntn || client.ntn || '',
      strn: first.client_strn || client.strn || '',
      address: first.billing_address || client.billing_address || '',
    },
    period: { label },
    rows,
  };
  try {
    const pdf = await renderWhtStatement(d);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${whtFilename(d)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: `Could not build the statement: ${err.message}` });
  }
});

router.get('/invoices/:invoiceId', async (req, res) => {
  const { rows } = await db.query(
    `select * from invoices where id = $1 and client_id = $2`,
    [req.params.invoiceId, req.portalClient.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  res.json(formatInvoice(rows[0]));
});

/** The same printable tax invoice the CRM produces, for the customer's own records. */
router.get('/invoices/:invoiceId/tax-invoice', async (req, res) => {
  const [{ rows }, settings] = await Promise.all([
    db.query(`select * from invoices where id = $1 and client_id = $2`, [req.params.invoiceId, req.portalClient.id]),
    getSettings(),
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  // The customer's copy carries the same lines and the same settlement the CRM
  // shows, so "what do I still owe on this" reads identically on both sides.
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [rows[0].id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [rows[0].id]),
  ]);
  res.json(buildTaxInvoice(rows[0], req.portalClient, settings, lines, pays));
});

function formatInvoice(inv) {
  const total = inv.total_amount != null ? +inv.total_amount : +inv.amount;
  return {
    id: inv.id, type: inv.type, type_label: INVOICE_TYPE_LABEL[inv.type] || inv.type,
    invoice_number: inv.invoice_number,
    // amount stays the value excluding tax, as it always was; the tax and the
    // total payable are alongside it so the customer sees the same breakdown
    // the printed invoice carries.
    amount: +inv.amount,
    tax_rate: +inv.tax_rate || 0,
    tax_amount: +inv.tax_amount || 0,
    total_amount: total,
    // Withholding. The customer needs to see it because they are the one who
    // deducts it and sends the challan back.
    ait_rate: +inv.ait_rate || 0,
    ait_amount: +inv.ait_amount || 0,
    net_payable: inv.net_payable != null ? +inv.net_payable : total,
    period: inv.period, status: inv.status,
    issued_date: inv.issued_date, due_date: inv.due_date,
    overage_sessions: inv.overage_sessions,
  };
}

/* ---------------------------- Ledger ---------------------------- */
/**
 * GET /api/portal/invoices/:invoiceId/pdf
 *
 * The same document the CRM sends and prints, rendered from the same
 * buildTaxInvoice output — so the copy the customer pulls down themselves is
 * byte-for-byte the copy we emailed them, not a lookalike.
 */
router.get('/invoices/:invoiceId/pdf', async (req, res) => {
  const [{ rows }, settings] = await Promise.all([
    db.query(`select * from invoices where id = $1 and client_id = $2`,
      [req.params.invoiceId, req.portalClient.id]),
    getSettings(),
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [rows[0].id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [rows[0].id]),
  ]);
  const doc = buildTaxInvoice(rows[0], req.portalClient, settings, lines, pays);
  try {
    const pdf = await renderInvoicePdf(doc);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceFilename(doc)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdf);
  } catch (err) {
    res.status(500).json({ error: `Could not build the invoice: ${err.message}` });
  }
});

/**
 * GET /api/portal/contracts — the customer's own agreements and when they end.
 *
 * Read-only on purpose. A customer should be able to see what they signed and
 * how long is left on it without asking; changing any of it is a conversation,
 * not a button.
 */
router.get('/contracts', async (req, res) => {
  const { rows } = await db.query(
    `select id, contract_number, title, kind, status, start_date, end_date,
            auto_renew, notice_days, value, currency, billing_frequency,
            signed_date, signed_by_client, signed_by_us, document_url, scope,
            client_legal_name, client_ntn, client_strn
       from contracts where client_id = $1
      order by coalesce(start_date, created_at::date) desc`,
    [req.portalClient.id]
  );
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  // A Date, not a string, is what pg hands back in-process — and
  // String(aDate).slice(0,10) is 'Thu Oct 15', which parses to Invalid Date.
  // The customer would then never be told their contract is about to expire.
  const asDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  const daysUntil = (d) => (d ? Math.round((new Date(asDay(d) + 'T00:00:00Z').getTime() - today) / 86400000) : null);

  res.json(rows.map((c) => {
    const left = daysUntil(c.end_date);
    let status = c.status;
    if (!['terminated', 'superseded', 'draft', 'sent'].includes(c.status)) {
      if (c.end_date && left < 0) status = 'expired';
      else if (c.status === 'signed' && c.start_date && daysUntil(c.start_date) <= 0) status = 'active';
    }
    return {
      ...c, status, days_remaining: left,
      // The same rule the CRM uses, so neither side is warned before or after
      // the other: the contract's own notice period, floored at 30 days.
      expiring_soon: status === 'active' && left != null && left >= 0
        && left <= Math.max(30, Number(c.notice_days || 0)),
      // A draft is ours until it is sent; a customer seeing one would be
      // reading a document nobody has agreed to yet.
    };
  }).filter((c) => c.status !== 'draft'));
});

/**
 * GET /api/portal/sessions.xlsx[?month=YYYY-MM]
 *
 * The month's conversations as a spreadsheet — the same rows, the same
 * included-or-billable split, as the Activity tab shows.
 *
 * session_id is deliberately NOT in the file. It contains the end consumer's
 * phone number; the portal has never shown it and a download must not be the
 * way it leaks.
 */
router.get('/sessions.xlsx', async (req, res) => {
  const client = req.portalClient;
  const m = String(req.query.month || '').slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(m) ? `${m}-01` : new Date().toISOString().slice(0, 7) + '-01';

  let quota = null, overageRate = null;
  if (client.product_id) {
    const { rows } = await db.query(`select * from products where id = $1`, [client.product_id]);
    const eff = effectivePackage(client, rows[0]);
    if (eff) { quota = eff.quota; overageRate = eff.overage_rate; }
  }

  const { rows } = await db.query(
    `with s as (
       select session_id,
              min(occurred_at) as started_at,
              max(occurred_at) as ended_at,
              sum(messages_count)::int as messages,
              mode() within group (order by channel) as channel
         from usage_events
        where client_id = $1 and occurred_at >= $2::date
          and occurred_at < ($2::date + interval '1 month')
        group by session_id
     )
     select started_at, ended_at, messages, channel,
            row_number() over (order by started_at asc)::int as seq
       from s order by started_at asc`,
    [client.id, month]
  );

  const settings = await getSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name || 'Vantriq AI';
  const ws = wb.addWorksheet(`Sessions ${month.slice(0, 7)}`);
  ws.columns = [
    { header: '#', key: 'seq', width: 7 },
    { header: 'Started', key: 'started', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Ended', key: 'ended', width: 22, style: { numFmt: 'yyyy-mm-dd hh:mm' } },
    { header: 'Channel', key: 'channel', width: 14 },
    { header: 'Messages', key: 'messages', width: 11 },
    { header: 'Length (minutes)', key: 'minutes', width: 16 },
    { header: 'Charge', key: 'charge', width: 16 },
  ];
  for (const r of rows) {
    const billable = quota != null && r.seq > quota;
    ws.addRow({
      seq: r.seq,
      started: r.started_at, ended: r.ended_at,
      channel: r.channel || '', messages: r.messages || 0,
      minutes: Math.max(0, Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000)),
      charge: billable ? Number(overageRate || 0) : 'Included',
    });
  }
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 7 } };

  const who = String(client.company || 'sessions').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${who}-sessions-${month.slice(0, 7)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

router.get('/ledger', async (req, res) => {
  const { rows } = await db.query(
    `select * from invoices where client_id = $1 order by issued_date asc, created_at asc`,
    [req.portalClient.id]
  );
  let balance = 0;
  const entries = rows.map((inv) => {
    // What the customer actually owes is the tax-inclusive total.
    const amount = inv.total_amount != null ? +inv.total_amount : +inv.amount;
    if (inv.status !== 'paid') balance += amount;
    return {
      date: inv.issued_date,
      description: `${INVOICE_TYPE_LABEL[inv.type] || inv.type}${inv.period ? ' — ' + inv.period : ''}`,
      amount, status: inv.status,
      running_balance: balance,
    };
  });
  res.json({
    entries,
    total_outstanding: balance,
    total_paid: rows.filter((i) => i.status === 'paid')
      .reduce((s, i) => s + Number(i.total_amount != null ? i.total_amount : i.amount), 0),
  });
});

/* ---------------------------- Activity: the sessions behind the bill ---------------------------- */
/**
 * One row per conversation session — the unit the client is actually billed
 * on — reconstructed from usage_events by grouping on session_id.
 *
 * The raw session_id is deliberately not returned. It is built from the end
 * consumer's phone number, and that is a third party's data, not the client's
 * own; the start time identifies a session well enough for a billing query.
 */
router.get('/activity', async (req, res) => {
  const client = req.portalClient;

  const monthParam = String(req.query.month || '').slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(monthParam)
    ? `${monthParam}-01`
    : new Date().toISOString().slice(0, 7) + '-01';

  const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 25));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * perPage;

  // The client's allowance for the month, so each session can be shown as
  // included or billable rather than as a bare number the customer has to
  // reconcile against their invoice themselves.
  let quota = null, overageRate = null, packageName = null;
  if (client.product_id) {
    const { rows } = await db.query(`select * from products where id = $1`, [client.product_id]);
    const eff = effectivePackage(client, rows[0]);
    if (eff) { quota = eff.quota; overageRate = eff.overage_rate; packageName = eff.name; }
  }

  // One row per session for the month, numbered in the order they happened.
  // seq is computed over the whole month, not the page, so session 1,501 is
  // still 1,501 on page 61.
  const SESSIONS_CTE = `
    with s as (
      select session_id,
             min(occurred_at) as started_at,
             max(occurred_at) as ended_at,
             sum(messages_count)::int as messages,
             mode() within group (order by channel) as channel
        from usage_events
       where client_id = $1
         and occurred_at >= $2::date
         and occurred_at <  ($2::date + interval '1 month')
       group by session_id
    )
    select s.*, row_number() over (order by started_at asc)::int as seq from s`;

  const [countRes, rowsRes, monthsRes] = await Promise.all([
    db.query(`select count(*)::int as n from (${SESSIONS_CTE}) t`, [client.id, month]),
    db.query(
      `select * from (${SESSIONS_CTE}) t order by started_at desc limit $3 offset $4`,
      [client.id, month, perPage, offset]
    ),
    db.query(
      `select distinct date_trunc('month', occurred_at)::date as m
         from usage_events where client_id = $1
        order by m desc limit 24`,
      [client.id]
    ),
  ]);

  const total = countRes.rows[0].n;
  const included = quota != null ? Math.min(total, quota) : total;
  const billable = quota != null ? Math.max(0, total - quota) : 0;

  res.json({
    period_month: month,
    months: monthsRes.rows.map((r) => r.m),
    total_sessions: total,
    // What the customer is actually being charged for this month, in the same
    // unit the invoice uses.
    package_name: packageName,
    quota,
    overage_rate: overageRate,
    included_sessions: included,
    billable_sessions: billable,
    estimated_overage_cost: overageRate != null ? Math.round(billable * overageRate * 100) / 100 : null,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
    sessions: rowsRes.rows.map((r) => {
      const started = new Date(r.started_at);
      const ended = new Date(r.ended_at);
      return {
        // Where this session falls in the month, which is what decides whether
        // it is inside the allowance. The raw session_id is deliberately never
        // returned: it is built from the end consumer's phone number, and that
        // is a third party's data, not this client's.
        seq: r.seq,
        started_at: r.started_at,
        ended_at: r.ended_at,
        // A single-turn session has no span; report 0 rather than null so the
        // client never has to special-case it.
        duration_seconds: Math.max(0, Math.round((ended - started) / 1000)),
        channel: r.channel || 'whatsapp',
        messages: r.messages || 0,
        billable: quota != null ? r.seq > quota : false,
        charge: quota != null && r.seq > quota ? overageRate : 0,
      };
    }),
  });
});

/* ---------------------------- Standard packages + subscribe ---------------------------- */
// The standard ladder, for a customer choosing an upgrade. Only standard
// tiers are offered — Enterprise+ is scoped and priced by conversation, and
// ai_model / delivery_cost are never exposed.
router.get('/packages', async (req, res) => {
  const { rows } = await db.query(
    `select id, name, target_tier, setup_fee, retainer, quota, overage_rate,
            msgs_per_session, automation, data_layer, channels
       from products
      where archived = false and is_standard = true
      order by sort_order asc, created_at asc`
  );
  const pending = await db.query(
    `select r.id, r.product_id, r.created_at, p.name as product_name
       from package_requests r join products p on p.id = r.product_id
      where r.client_id = $1 and r.status = 'pending'
      order by r.created_at desc limit 1`,
    [req.portalClient.id]
  );
  res.json({
    current_product_id: req.portalClient.product_id,
    packages: rows.map((r) => ({
      id: r.id, name: r.name, target_tier: r.target_tier,
      setup_fee: +r.setup_fee, retainer: +r.retainer, quota: +r.quota,
      overage_rate: +r.overage_rate, msgs_per_session: +r.msgs_per_session,
      automation: r.automation, data_layer: r.data_layer, channels: r.channels,
    })),
    pending_request: pending.rows[0] || null,
  });
});

// Requests a package change. Nothing bills and nothing moves until an admin
// approves it in the CRM.
router.post('/subscribe', async (req, res) => {
  const client = req.portalClient;
  const productId = (req.body || {}).product_id;
  const note = String((req.body || {}).note || '').slice(0, 500);
  if (!productId) return res.status(400).json({ error: 'product_id is required' });

  const { rows: prod } = await db.query(
    `select id, name, is_standard, archived from products where id = $1`, [productId]
  );
  if (!prod[0] || prod[0].archived) return res.status(404).json({ error: 'That package is not available.' });
  if (prod[0].is_standard === false) {
    return res.status(400).json({ error: 'Enterprise+ is scoped individually — please contact us to discuss it.' });
  }
  if (client.product_id === productId) {
    return res.status(409).json({ error: 'You are already on that package.' });
  }

  const { rows: dupe } = await db.query(
    `select id from package_requests where client_id = $1 and status = 'pending'`, [client.id]
  );
  if (dupe[0]) return res.status(409).json({ error: 'You already have a package change awaiting review.' });

  const { rows } = await db.query(
    `insert into package_requests (client_id, product_id, note) values ($1,$2,$3) returning *`,
    [client.id, productId, note]
  );
  res.status(201).json({
    id: rows[0].id, status: rows[0].status, product_name: prod[0].name,
    message: 'Thanks — your request has been sent to Vantriq AI for review. Nothing changes on your account until it is approved.',
  });
});

/* ---------------------------- Change your own password ---------------------------- */
/**
 * A signed-in customer changing their own password.
 *
 * The current password is required, so a borrowed laptop with a live session
 * cannot be used to lock the real owner out. Every other session for this
 * client is dropped, which is what makes changing a password useful after
 * someone else has seen it. A note goes to the address on their record — not
 * to an address they can supply, because that is exactly how an attacker
 * would hide the change from them.
 */
router.post('/change-password', async (req, res) => {
  const client = req.portalClient;
  const current = String((req.body || {}).current_password || '');
  const next = String((req.body || {}).new_password || '');

  if (!current || !next) return res.status(400).json({ error: 'Enter your current password and the new one.' });
  if (next.length < 10) return res.status(400).json({ error: 'Your new password needs to be at least 10 characters.' });
  if (next === current) return res.status(400).json({ error: 'That is the password you already have.' });

  const { rows } = await db.query(`select portal_password_hash from clients where id = $1`, [client.id]);
  if (!rows[0] || !verifyPassword(current, rows[0].portal_password_hash)) {
    // Deliberately 403, not 401. The session IS valid — it is the re-check of
    // the current password that failed. A 401 here would look identical to an
    // expired session to the browser, and sign the customer out for a typo.
    return res.status(403).json({ error: 'That is not your current password.' });
  }

  await db.query(
    `update clients set portal_password_hash = $2, portal_password_set_at = now(),
            portal_password_set_by = 'customer'
      where id = $1`,
    [client.id, hashPassword(next)]
  );

  // Every other session goes, including any an attacker was holding. The one
  // making the change stays, so the customer is not thrown out of the page
  // they are standing on.
  const token = String(req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  await db.query(`delete from portal_sessions where client_id = $1 and token <> $2`, [client.id, token]);

  if (client.email && mailConfigured()) {
    try {
      const settings = await getSettings();
      await sendMail({
        to: client.email,
        subject: `Your ${settings.company_name || 'Vantriq AI'} portal password was changed`,
        text: [
          `Hi ${client.name || client.company},`,
          ``,
          `The password for your ${settings.company_name || 'Vantriq AI'} customer portal was just changed, and every other signed-in device has been signed out.`,
          ``,
          `If this was you, there is nothing to do.`,
          `If it was not, reply to this email immediately — someone else has your password.`,
        ].join('\n'),
      });
    } catch (err) {
      // The password HAS been changed. Failing the request over an email that
      // did not send would tell the customer the opposite of the truth.
      console.error('Portal password-change notice failed to send', err);
    }
  }

  res.json({ ok: true, message: 'Your password has been changed. Other devices have been signed out.' });
});

/* ---------------------------- Agents ---------------------------- */
/**
 * Every agent running under this company. A customer with a WhatsApp agent,
 * an Instagram agent and a website assistant should see three things here,
 * not one account and no detail.
 *
 * session_id is never exposed: it contains the end consumer's phone number,
 * which belongs to our customer's customer and to nobody else.
 */
router.get('/agents', async (req, res) => {
  const client = req.portalClient;
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const { rows } = await db.query(
    `select a.id, a.name, a.kind, a.status, a.created_at,
            coalesce(u.sessions, 0) as sessions_this_month,
            coalesce(u.messages, 0) as messages_this_month,
            u.last_seen_at
       from client_agents a
       left join (
         select agent_id,
                count(distinct session_id) as sessions,
                sum(messages_count) as messages,
                max(occurred_at) as last_seen_at
           from usage_events
          where client_id = $1 and agent_id is not null
            and occurred_at >= $2::date
          group by agent_id
       ) u on u.agent_id = a.id
      where a.client_id = $1 and a.status <> 'retired'
      order by a.kind, a.name`,
    [client.id, month]
  );
  const { rows: bundles } = await db.query(
    `select agent_id, sum(qty * unit_quota) as quota from client_bundles
      where client_id = $1 and status = 'active' and agent_id is not null group by agent_id`,
    [client.id]
  );
  const byAgent = new Map(bundles.map((b) => [b.agent_id, Number(b.quota)]));

  res.json(rows.map((a) => ({
    ...a,
    sessions_this_month: Number(a.sessions_this_month),
    messages_this_month: Number(a.messages_this_month),
    dedicated_quota: byAgent.get(a.id) || 0,
  })));
});

/* ---------------------------- Bundles ---------------------------- */
/**
 * What the customer has added on top of their package, and what they could.
 *
 * A bundle is deliberately self-serve where a package change is not. Moving
 * tier changes what somebody is paying every month from here on and is worth
 * a conversation; adding a bundle is buying more of what they already have,
 * and making them wait for us to approve that helps nobody.
 */
router.get('/bundles', async (req, res) => {
  const client = req.portalClient;
  const [{ rows: mine }, { rows: available }, settings] = await Promise.all([
    db.query(
      `select b.id, b.name, b.qty, b.unit_retainer, b.unit_quota, b.overage_rate, b.recurring,
              b.status, b.starts_on, b.ends_on, b.added_by, a.name as agent_name
         from client_bundles b
         left join client_agents a on a.id = b.agent_id
        where b.client_id = $1 and b.status in ('active','scheduled')
        order by b.starts_on desc`,
      [client.id]
    ),
    db.query(
      `select id, name, target_tier, setup_fee, retainer, quota, overage_rate, channels
         from products where archived = false and is_standard = true
        order by sort_order, created_at`
    ),
    getSettings(),
  ]);

  const { rows: agents } = await db.query(
    `select id, name, kind from client_agents where client_id = $1 and status = 'active' order by kind, name`,
    [client.id]
  );

  const addedQuota = mine.reduce((s, b) => s + Number(b.qty) * Number(b.unit_quota), 0);
  const addedMonthly = mine
    .filter((b) => b.recurring && b.status === 'active')
    .reduce((s, b) => s + Number(b.qty) * Number(b.unit_retainer), 0);

  res.json({
    currency: settings.currency || 'PKR',
    bundles: mine,
    agents,
    added_quota: addedQuota,
    added_monthly: addedQuota ? Math.round(addedMonthly * 100) / 100 : Math.round(addedMonthly * 100) / 100,
    available: available.map((p) => ({
      id: p.id, name: p.name, target_tier: p.target_tier,
      setup_fee: +p.setup_fee, retainer: +p.retainer, quota: +p.quota,
      overage_rate: +p.overage_rate, channels: p.channels,
    })),
  });
});

/**
 * The customer adding a bundle themselves. It takes effect now, it adds to
 * their allowance from this moment, and it appears on the next monthly
 * invoice as its own line — so what they will be charged is on the screen
 * before they press the button, not discovered at month end.
 */
router.post('/bundles', async (req, res) => {
  const client = req.portalClient;
  const b = req.body || {};
  if (client.service_status === 'suspended') {
    return res.status(409).json({ error: 'Your service is paused. Please settle your account before adding to it.' });
  }
  if (!b.product_id) return res.status(400).json({ error: 'Pick a package to add.' });

  const { rows: prod } = await db.query(
    `select * from products where id = $1 and archived = false and is_standard = true`, [b.product_id]
  );
  if (!prod[0]) return res.status(404).json({ error: 'That package is not available as a bundle.' });

  const qty = Math.max(1, Math.min(20, parseInt(b.qty, 10) || 1));
  if (b.agent_id) {
    const { rows: agent } = await db.query(
      `select id from client_agents where id = $1 and client_id = $2`, [b.agent_id, client.id]
    );
    if (!agent[0]) return res.status(400).json({ error: 'That is not one of your agents.' });
  }

  const eff = effectivePackage(client, prod[0]);
  // A customer-added bundle carries no setup fee: they are buying more of a
  // service already set up for them, and charging to switch it on again
  // would be a fee for nothing.
  const { rows } = await db.query(
    `insert into client_bundles
       (client_id, agent_id, product_id, name, qty, unit_setup_fee, unit_retainer, unit_quota,
        overage_rate, recurring, status, starts_on, added_by, setup_billed, note)
     values ($1,$2,$3,$4,$5,0,$6,$7,$8,true,'active',current_date,'customer',true,$9)
     returning *`,
    [
      client.id, b.agent_id || null, prod[0].id, `${eff.name} bundle`, qty,
      eff.retainer, eff.quota, eff.overage_rate,
      String(b.note || '').slice(0, 300),
    ]
  );

  await db.query(
    `insert into client_stage_history (client_id, from_stage, to_stage, comment)
     values ($1, $2, $2, $3)`,
    [client.id, client.stage,
      `Customer added ${qty}× ${eff.name} bundle from their portal — +${(eff.quota * qty).toLocaleString('en-US')} conversations, +${(eff.retainer * qty).toLocaleString('en-US')} per month.`]
  );

  res.status(201).json({
    bundle: rows[0],
    message: `Added. Your allowance is up by ${(eff.quota * qty).toLocaleString('en-US')} conversations from today, and this will appear on your next monthly invoice.`,
  });
});

/** Ending a bundle. It runs to the end of the month already paid for. */
router.delete('/bundles/:id', async (req, res) => {
  const client = req.portalClient;
  const { rows } = await db.query(
    `select * from client_bundles where id = $1 and client_id = $2`, [req.params.id, client.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'That bundle is not on your account.' });
  if (rows[0].added_by !== 'customer') {
    return res.status(409).json({ error: 'This bundle was arranged with us — get in touch and we will sort it out.' });
  }
  // The month has been billed, so it runs to the end of it.
  const endOfMonth = new Date();
  const ends = new Date(Date.UTC(endOfMonth.getUTCFullYear(), endOfMonth.getUTCMonth() + 1, 0))
    .toISOString().slice(0, 10);
  const { rows: updated } = await db.query(
    `update client_bundles set ends_on = $2 where id = $1 returning *`, [rows[0].id, ends]
  );
  res.json({
    bundle: updated[0],
    message: `This bundle will run until ${ends} — the month is already covered — and will not be billed again after that.`,
  });
});

/* ---------------------------- Quotes ---------------------------- */
/** Quotes we have sent this customer, and the ones they have decided on. */
router.get('/quotes', async (req, res) => {
  const { rows } = await db.query(
    `select q.id, q.quote_number, q.title, q.status, q.valid_until, q.subtotal,
            q.tax_rate, q.tax_amount, q.total, q.notes, q.terms, q.sent_at, q.decided_at,
            q.invoice_id, p.name as product_name, bp.name as bundle_product_name
       from quotes q
       left join products p on p.id = q.product_id
       left join products bp on bp.id = q.bundle_product_id
      where q.client_id = $1 and q.status <> 'draft'
      order by q.created_at desc`,
    [req.portalClient.id]
  );
  const ids = rows.map((r) => r.id);
  const { rows: lines } = ids.length
    ? await db.query(`select * from quote_lines where quote_id = any($1::uuid[]) order by position`, [ids])
    : { rows: [] };
  const byQuote = new Map();
  for (const l of lines) {
    if (!byQuote.has(l.quote_id)) byQuote.set(l.quote_id, []);
    byQuote.get(l.quote_id).push(l);
  }
  res.json(rows.map((q) => ({ ...q, lines: byQuote.get(q.id) || [] })));
});

/** The printable quotation, same document the CRM produces. */
router.get('/quotes/:id/document', async (req, res) => {
  const { rows } = await db.query(
    `select id from quotes where id = $1 and client_id = $2 and status <> 'draft'`,
    [req.params.id, req.portalClient.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
  const doc = await buildQuoteDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Quote not found' });
  res.json(doc);
});

/** The customer accepting their own quote — this is what makes it real. */
router.post('/quotes/:id/accept', async (req, res) => {
  const { rows } = await db.query(
    `select id from quotes where id = $1 and client_id = $2 and status = 'sent'`,
    [req.params.id, req.portalClient.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'That quote is not open for acceptance.' });
  const result = await acceptQuote(req.params.id, { acceptedBy: req.portalClient.company });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json({
    quote: result.quote,
    invoice: { id: result.invoice.id, invoice_number: result.invoice.invoice_number, net_payable: result.invoice.net_payable },
    message: `Thank you — invoice ${result.invoice.invoice_number} has been raised${result.applied.length ? `, and we have ${result.applied.join(' and ')}` : ''}.`,
  });
});

router.post('/quotes/:id/decline', async (req, res) => {
  const { rows } = await db.query(
    `update quotes set status='declined', decided_at=now()
      where id = $1 and client_id = $2 and status = 'sent' returning id, status`,
    [req.params.id, req.portalClient.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'That quote is not open.' });
  res.json({ ...rows[0], message: 'Thanks for letting us know.' });
});

module.exports = router;
