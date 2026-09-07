const express = require('express');
const db = require('../db');
const { createInvoice, monthLabel } = require('../utils/billing');
const { quotaStatus } = require('../utils/quota');
const router = express.Router();

/**
 * Quota decisions.
 *
 * When a client uses up the conversations their package includes, nothing is
 * switched off — the month is flagged here and stays on this list until an
 * admin says what to do about it: bill the overage, move them up a tier, or
 * let it go this once. That decision is recorded with who made it, so a
 * customer asking "why was I charged extra in September" has an answer.
 */

const DECISIONS = ['bill_overage', 'upgrade', 'waive'];

router.get('/', async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.month) { params.push(req.query.month); clauses.push(`q.period_month = $${params.length}::date`); }
  if (req.query.client_id) { params.push(req.query.client_id); clauses.push(`q.client_id = $${params.length}`); }
  // Default view is the work still to do.
  if (String(req.query.status || 'open') === 'open') clauses.push(`q.decision is null`);
  const where = clauses.length ? `where ${clauses.join(' and ')}` : '';

  const { rows } = await db.query(
    `select q.*, c.company, c.name as contact_name, c.parent_client_id,
            p.name as package_name, p.overage_rate,
            coalesce(u.sessions, 0)::int as sessions_now
       from quota_events q
       join clients c on c.id = q.client_id
       left join products p on p.id = c.product_id
       left join v_monthly_usage u on u.client_id = q.client_id and u.period_month = q.period_month
       ${where}
      order by q.period_month desc, q.created_at desc
      limit 500`,
    params
  );
  res.json(rows.map((r) => ({
    ...r,
    over_quota_sessions: Math.max(0, Number(r.sessions_now) - Number(r.quota_at_event || 0)),
    estimated_overage_cost: r.overage_rate != null
      ? Math.max(0, Number(r.sessions_now) - Number(r.quota_at_event || 0)) * Number(r.overage_rate)
      : null,
  })));
});

/**
 * Records the decision. 'bill_overage' also raises the overage invoice there
 * and then, priced off the client's live usage for that month, so the decision
 * and the charge cannot drift apart.
 */
router.post('/:id/decision', async (req, res) => {
  const decision = String((req.body || {}).decision || '');
  const note = String((req.body || {}).note || '').slice(0, 1000);
  if (!DECISIONS.includes(decision)) {
    return res.status(400).json({ error: `Decision must be one of: ${DECISIONS.join(', ')}.` });
  }

  const { rows: found } = await db.query(`select * from quota_events where id = $1`, [req.params.id]);
  const event = found[0];
  if (!event) return res.status(404).json({ error: 'Quota flag not found' });
  if (event.decision) return res.status(409).json({ error: `This month was already decided: ${event.decision}.` });

  const decidedBy = (req.user && req.user.email) || (req.authKind === 'apikey' ? `api-key (${req.apiKeyScope})` : 'unknown');

  let invoice = null;
  if (decision === 'bill_overage') {
    const status = await quotaStatus(event.client_id, event.period_month);
    if (!status || !status.over_quota_sessions) {
      return res.status(400).json({ error: 'This client is not over quota for that month — there is nothing to bill.' });
    }
    const { rows: clientRows } = await db.query(`select * from clients where id = $1`, [event.client_id]);
    const period = monthLabel(event.period_month);
    const { rows: dupe } = await db.query(
      `select id from invoices where client_id = $1 and type = 'overage' and period = $2 limit 1`,
      [event.client_id, period]
    );
    if (dupe[0]) return res.status(409).json({ error: `An overage invoice for ${period} already exists.`, existing_invoice_id: dupe[0].id });

    invoice = await createInvoice(clientRows[0], {
      type: 'overage',
      amount: status.estimated_overage_cost,
      period,
      overage_sessions: status.over_quota_sessions,
      notes: `${status.over_quota_sessions} conversation${status.over_quota_sessions === 1 ? '' : 's'} over the ${status.quota} included in ${status.package_name || 'the package'}`,
    });
  }

  // An admin decides a month, not a threshold. Settling it closes both the
  // 80% warning and the over-quota flag for that client and month, so the
  // queue shows work that is genuinely outstanding.
  const { rows } = await db.query(
    `update quota_events set decision = $3, decided_at = now(), decided_by = $4, note = $5
      where client_id = $1 and period_month = $2 and decision is null
      returning *`,
    [event.client_id, event.period_month, decision, decidedBy, note]
  );
  res.json({
    quota_event: rows.find((r) => r.id === req.params.id) || rows[0],
    also_settled: rows.filter((r) => r.id !== req.params.id).map((r) => r.threshold),
    invoice,
  });
});

module.exports = router;
