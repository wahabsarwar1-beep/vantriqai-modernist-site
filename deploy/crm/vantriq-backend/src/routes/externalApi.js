const express = require('express');
const db = require('../db');
const { effectivePackage } = require('../utils/pkg');
const { buildTaxInvoice, getSettings } = require('../utils/billing');
const { renderInvoicePdf, invoiceFilename } = require('../utils/invoicePdf');
const { formatInvoice } = require('./portal');

const router = express.Router();

/**
 * A customer's own read-only window into their own account, for their own
 * systems to call — an accounting package pulling invoices, a BI tool
 * pulling usage. Every route here answers only for req.apiClient, the one
 * client the x-client-api-key header resolved to (see
 * middleware/clientApiAuth.js); there is no path from here to any other
 * client's data or to a write of any kind.
 *
 * The token itself is generated and revoked by the customer, self-service,
 * from their own portal (see POST/GET/DELETE /api/portal/api-tokens) —
 * nobody at VantriqAI has to run a script to hand one out.
 *
 * Mirrors the shape of the equivalent human-facing portal.js routes
 * deliberately: the same redactions apply for the same reasons. ai_model
 * and delivery cost are never exposed (Vantriq's own delivery detail, not
 * the customer's). Raw session_id/usage session identifiers are never
 * exposed (built from the END CUSTOMER's own phone number — a third
 * party's data, not this client's, exactly as in portal.js's /activity).
 */

/** GET /api/external/account — company, package, service status. */
router.get('/account', async (req, res) => {
  const client = req.apiClient;
  const { rows } = client.product_id
    ? await db.query(`select * from products where id = $1`, [client.product_id])
    : { rows: [] };
  const eff = effectivePackage(client, rows[0] || null);
  res.json({
    company: client.company,
    stage: client.stage,
    join_date: client.join_date,
    service: {
      status: client.service_status || 'active',
      suspended_at: client.suspended_at || null,
    },
    package: eff ? {
      name: eff.name, retainer: eff.retainer, setup_fee: eff.setup_fee,
      quota: eff.quota, overage_rate: eff.overage_rate, channels: eff.channels,
    } : null,
  });
});

/** GET /api/external/invoices — every invoice on this account. */
router.get('/invoices', async (req, res) => {
  const { rows } = await db.query(
    `select * from invoices where client_id = $1 order by issued_date desc, created_at desc`,
    [req.apiClient.id]
  );
  res.json(rows.map(formatInvoice));
});

/** GET /api/external/invoices/:id — one invoice, with its line items. */
router.get('/invoices/:id', async (req, res) => {
  const { rows } = await db.query(
    `select * from invoices where id = $1 and client_id = $2`,
    [req.params.id, req.apiClient.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  const { rows: lines } = await db.query(
    `select description, detail, qty, unit_price, amount, kind from invoice_lines where invoice_id = $1 order by position`,
    [rows[0].id]
  );
  res.json({ ...formatInvoice(rows[0]), lines });
});

/** GET /api/external/invoices/:id/pdf — the same PDF the portal downloads. */
router.get('/invoices/:id/pdf', async (req, res) => {
  const [{ rows }, settings] = await Promise.all([
    db.query(`select * from invoices where id = $1 and client_id = $2`, [req.params.id, req.apiClient.id]),
    getSettings(),
  ]);
  if (!rows[0]) return res.status(404).json({ error: 'Invoice not found' });
  const [{ rows: lines }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [rows[0].id]),
    db.query(`select * from payments where invoice_id = $1 order by received_date, created_at`, [rows[0].id]),
  ]);
  const doc = buildTaxInvoice(rows[0], req.apiClient, settings, lines, pays);
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
 * GET /api/external/usage[?month=YYYY-MM] — session-level usage, the same
 * unit the invoice is billed on. Mirrors portal.js's GET /activity exactly,
 * including what it deliberately leaves out: the raw session_id.
 */
router.get('/usage', async (req, res) => {
  const client = req.apiClient;
  const monthParam = String(req.query.month || '').slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(monthParam) ? `${monthParam}-01` : new Date().toISOString().slice(0, 7) + '-01';
  const perPage = Math.min(200, Math.max(1, parseInt(req.query.per_page, 10) || 100));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const offset = (page - 1) * perPage;

  let quota = null, overageRate = null, packageName = null;
  if (client.product_id) {
    const { rows } = await db.query(`select * from products where id = $1`, [client.product_id]);
    const eff = effectivePackage(client, rows[0]);
    if (eff) { quota = eff.quota; overageRate = eff.overage_rate; packageName = eff.name; }
  }

  const SESSIONS_CTE = `
    with s as (
      select session_id, min(occurred_at) as started_at, max(occurred_at) as ended_at,
             sum(messages_count)::int as messages, mode() within group (order by channel) as channel
        from usage_events
       where client_id = $1 and occurred_at >= $2::date and occurred_at < ($2::date + interval '1 month')
       group by session_id
    )
    select s.*, row_number() over (order by started_at asc)::int as seq from s`;

  const [countRes, rowsRes] = await Promise.all([
    db.query(`select count(*)::int as n from (${SESSIONS_CTE}) t`, [client.id, month]),
    db.query(`select * from (${SESSIONS_CTE}) t order by started_at desc limit $3 offset $4`,
      [client.id, month, perPage, offset]),
  ]);
  const total = countRes.rows[0].n;

  res.json({
    period_month: month,
    package_name: packageName,
    quota,
    overage_rate: overageRate,
    total_sessions: total,
    page, per_page: perPage,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
    sessions: rowsRes.rows.map((r) => ({
      seq: r.seq,
      started_at: r.started_at,
      ended_at: r.ended_at,
      channel: r.channel || 'whatsapp',
      messages: r.messages || 0,
      billable: quota != null ? r.seq > quota : false,
    })),
  });
});

/** GET /api/external/agents — this account's agents (channels/numbers). */
router.get('/agents', async (req, res) => {
  const { rows } = await db.query(
    `select id, name, kind, status, created_at from client_agents
      where client_id = $1 and status <> 'retired' order by kind, name`,
    [req.apiClient.id]
  );
  res.json(rows);
});

module.exports = router;
