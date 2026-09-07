const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { verifyPassword } = require('../utils/password');
const { sendMail, resetEmail, mailConfigured } = require('../utils/mailer');
const { issueReset, redeemReset, RESET_MINUTES } = require('../utils/resets');
const { quotaStatus } = require('../utils/quota');
const { buildTaxInvoice, getSettings } = require('../utils/billing');
const { requirePortalSession } = require('../middleware/portalAuth');
const { effectivePackage } = require('../utils/pkg');

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
  res.json(buildTaxInvoice(rows[0], req.portalClient, settings));
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
    period: inv.period, status: inv.status,
    issued_date: inv.issued_date, due_date: inv.due_date,
    overage_sessions: inv.overage_sessions,
  };
}

/* ---------------------------- Ledger ---------------------------- */
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

  const [countRes, rowsRes, monthsRes] = await Promise.all([
    db.query(
      `select count(*)::int as n from (
         select session_id from usage_events
          where client_id = $1
            and occurred_at >= $2::date
            and occurred_at <  ($2::date + interval '1 month')
          group by session_id
       ) s`,
      [client.id, month]
    ),
    db.query(
      `select session_id,
              min(occurred_at) as started_at,
              max(occurred_at) as ended_at,
              sum(messages_count)::int as messages,
              mode() within group (order by channel) as channel
         from usage_events
        where client_id = $1
          and occurred_at >= $2::date
          and occurred_at <  ($2::date + interval '1 month')
        group by session_id
        order by min(occurred_at) desc
        limit $3 offset $4`,
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
  res.json({
    period_month: month,
    months: monthsRes.rows.map((r) => r.m),
    total_sessions: total,
    page,
    per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
    sessions: rowsRes.rows.map((r) => {
      const started = new Date(r.started_at);
      const ended = new Date(r.ended_at);
      return {
        started_at: r.started_at,
        ended_at: r.ended_at,
        // A single-turn session has no span; report 0 rather than null so the
        // client never has to special-case it.
        duration_seconds: Math.max(0, Math.round((ended - started) / 1000)),
        channel: r.channel || 'whatsapp',
        messages: r.messages || 0,
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

module.exports = router;
