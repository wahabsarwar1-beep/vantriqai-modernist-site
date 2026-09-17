const express = require('express');
const db = require('../db');
const subs = require('../utils/subscriptions');
const { runDunning, runAutomations, ensureDefaultSteps } = require('../utils/dunning');
const { importCredits, openInvoices, restate } = require('../utils/bankMatch');
const { settlementOf, ROUND } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Billing operations: the things that run rather than the things that are
 * looked at. The monthly run, the rate cards it prices with, the chase
 * schedule, the rules on top of it, and the bank statement coming back in.
 *
 * Everything here that changes money can be asked what it would do first.
 * `dry_run` is not a convenience — it is the only responsible way to let
 * someone edit a chase template or a rate card and find out what it does to
 * their customers before it does it.
 */

/* ------------------------- The monthly run ------------------------- */

/**
 * POST /api/billing/run-monthly { month?, dry_run?, client_id? }
 *
 * Bills every active client for the month: their package, their bundles and
 * whatever ran past the allowance, as one invoice with a line for each.
 * Applies any scheduled package change that has come due first, and ends the
 * bundles whose term has run out.
 *
 * Safe to call twice — a client who already has a retainer invoice for the
 * period is skipped rather than billed again.
 */
router.post('/run-monthly', async (req, res) => {
  const { month, dry_run, client_id } = req.body || {};
  const result = await subs.runMonthlyBilling({ month, dryRun: !!dry_run, clientId: client_id });
  res.json(result);
});

/* ---------------------------- Rate cards ---------------------------- */
router.get('/rates', async (req, res) => {
  const { client_id } = req.query;
  const { rows } = await db.query(
    `select r.*, c.company, a.name as agent_name, p.name as product_name
       from usage_rates r
       left join clients c on c.id = r.client_id
       left join client_agents a on a.id = r.agent_id
       left join products p on p.id = r.product_id
      ${client_id ? 'where r.client_id = $1' : ''}
      order by (r.agent_id is not null) desc, (r.client_id is not null) desc, r.metric`,
    client_id ? [client_id] : []
  );
  res.json(rows);
});

const METRICS = ['session', 'message', 'input_token', 'output_token', 'automation_run'];

router.post('/rates', async (req, res) => {
  const b = req.body || {};
  if (!METRICS.includes(b.metric)) return res.status(400).json({ error: `metric must be one of ${METRICS.join(', ')}` });
  if (!b.client_id && !b.agent_id && !b.product_id) {
    return res.status(400).json({ error: 'A rate has to belong to a client, an agent or a package.' });
  }
  const { rows } = await db.query(
    `insert into usage_rates (client_id, agent_id, product_id, metric, unit_rate, included_units, unit_size, label, effective_from, effective_to)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::date, current_date), $10) returning *`,
    [
      b.client_id || null, b.agent_id || null, b.product_id || null, b.metric,
      Number(b.unit_rate || 0), Number(b.included_units || 0), Number(b.unit_size || 1),
      b.label || '', b.effective_from || null, b.effective_to || null,
    ]
  );
  res.status(201).json(rows[0]);
});

router.delete('/rates/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from usage_rates where id = $1`, [req.params.id]);
  res.status(204).end();
});

/* ------------------------- Chase schedule ------------------------- */
router.get('/dunning', async (req, res) => {
  const [{ rows: steps }, { rows: log }, settings] = await Promise.all([
    db.query(`select * from dunning_steps order by offset_days, position`),
    db.query(
      `select r.*, i.invoice_number, c.company from invoice_reminders r
         join invoices i on i.id = r.invoice_id
         join clients c on c.id = i.client_id
        order by r.sent_at desc limit 100`
    ),
    db.query(`select dunning_enabled, dunning_suspend_after_days from settings where id = 1`).then((r) => r.rows[0] || {}),
  ]);
  res.json({ enabled: !!settings.dunning_enabled, steps, recent: log });
});

/** Installs a sensible default schedule so nobody starts from a blank page. */
router.post('/dunning/defaults', async (req, res) => {
  res.json(await ensureDefaultSteps());
});

router.post('/dunning/steps', async (req, res) => {
  const b = req.body || {};
  if (!b.name || b.offset_days === undefined) {
    return res.status(400).json({ error: 'name and offset_days are required' });
  }
  if (!['email', 'flag', 'suspend'].includes(b.action || 'email')) {
    return res.status(400).json({ error: "action must be 'email', 'flag' or 'suspend'" });
  }
  const { rows } = await db.query(
    `insert into dunning_steps (name, offset_days, action, subject, body, active, position)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.name, Number(b.offset_days), b.action || 'email', b.subject || '', b.body || '',
      b.active !== false, Number(b.position || 0)]
  );
  res.status(201).json(rows[0]);
});

router.patch('/dunning/steps/:id', async (req, res) => {
  const allowed = ['name', 'offset_days', 'action', 'subject', 'body', 'active', 'position'];
  const sets = [];
  const params = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    params.push(req.body[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(`update dunning_steps set ${sets.join(', ')} where id = $1 returning *`, params);
  if (!rows[0]) return res.status(404).json({ error: 'Step not found' });
  res.json(rows[0]);
});

router.delete('/dunning/steps/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from dunning_steps where id = $1`, [req.params.id]);
  res.status(204).end();
});

/**
 * POST /api/billing/run-dunning { dry_run?, on? }
 *
 * The daily chase. Run it from cron, or from n8n on a schedule trigger. With
 * dry_run it reports exactly what it would send, and sends nothing.
 */
router.post('/run-dunning', async (req, res) => {
  const { dry_run, on } = req.body || {};
  res.json(await runDunning({ dryRun: !!dry_run, onDate: on }));
});

/* ---------------------------- Automations ---------------------------- */
const TRIGGERS = ['invoice_overdue', 'quota_exceeded', 'bundle_ending', 'subscription_renewal'];
const ACTIONS = ['email_customer', 'notify_team', 'suspend_service', 'flag_review', 'offer_upgrade'];

router.get('/automations', async (req, res) => {
  const [{ rows: rules }, { rows: runs }] = await Promise.all([
    db.query(`select * from automations order by created_at`),
    db.query(
      `select r.*, a.name as automation_name, c.company from automation_runs r
         join automations a on a.id = r.automation_id
         left join clients c on c.id = r.client_id
        order by r.created_at desc limit 100`
    ),
  ]);
  res.json({ automations: rules, recent: runs });
});

router.post('/automations', async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'name is required' });
  if (!TRIGGERS.includes(b.trigger)) return res.status(400).json({ error: `trigger must be one of ${TRIGGERS.join(', ')}` });
  if (!ACTIONS.includes(b.action)) return res.status(400).json({ error: `action must be one of ${ACTIONS.join(', ')}` });
  const { rows } = await db.query(
    `insert into automations (name, trigger, threshold_days, threshold_pct, action, params, active)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.name, b.trigger, Number(b.threshold_days || 0), Number(b.threshold_pct || 100),
      b.action, JSON.stringify(b.params || {}), b.active !== false]
  );
  res.status(201).json(rows[0]);
});

router.patch('/automations/:id', async (req, res) => {
  const allowed = ['name', 'trigger', 'threshold_days', 'threshold_pct', 'action', 'active'];
  const sets = [];
  const params = [req.params.id];
  for (const f of allowed) {
    if (req.body[f] === undefined) continue;
    if (f === 'trigger' && !TRIGGERS.includes(req.body[f])) return res.status(400).json({ error: 'Unknown trigger' });
    if (f === 'action' && !ACTIONS.includes(req.body[f])) return res.status(400).json({ error: 'Unknown action' });
    params.push(req.body[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (req.body.params !== undefined) {
    params.push(JSON.stringify(req.body.params));
    sets.push(`params = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  const { rows } = await db.query(`update automations set ${sets.join(', ')} where id = $1 returning *`, params);
  if (!rows[0]) return res.status(404).json({ error: 'Automation not found' });
  res.json(rows[0]);
});

router.delete('/automations/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from automations where id = $1`, [req.params.id]);
  res.status(204).end();
});

router.post('/run-automations', async (req, res) => {
  res.json(await runAutomations({ dryRun: !!(req.body || {}).dry_run }));
});

/* ------------------------ Bank reconciliation ------------------------ */

/**
 * POST /api/billing/bank-import
 * { credits: [{ received_date, amount, reference, payer, bank_ref }], auto_post? }
 *
 * Takes statement lines and matches what it safely can — see
 * src/utils/bankMatch.js for the order the rules run in and why anything
 * ambiguous is deliberately left for a person.
 */
router.post('/bank-import', async (req, res) => {
  const body = req.body || {};
  const credits = Array.isArray(body.credits) ? body.credits : [];
  if (!credits.length) return res.status(400).json({ error: 'Send a credits array of statement lines.' });
  if (credits.length > 2000) return res.status(413).json({ error: 'That is more than 2,000 lines — split the statement up.' });
  const result = await importCredits(credits, {
    autoPost: body.auto_post !== false,
    recordedBy: (req.user && req.user.email) || req.authKind || '',
  });
  res.status(201).json(result);
});

router.get('/bank-credits', async (req, res) => {
  const { status } = req.query;
  const { rows } = await db.query(
    `select b.*, i.invoice_number, c.company from bank_credits b
       left join invoices i on i.id = b.matched_invoice_id
       left join clients c on c.id = i.client_id
      ${status ? 'where b.status = $1' : ''}
      order by b.received_date desc, b.created_at desc limit 500`,
    status ? [status] : []
  );
  // An unmatched line is more use with a shortlist attached than without one.
  const open = await openInvoices();
  res.json(rows.map((r) => {
    if (r.status !== 'unmatched') return r;
    const near = open
      .filter((i) => Math.abs(i.settlement.balance - Number(r.amount)) < 0.01)
      .slice(0, 5)
      .map((i) => ({ id: i.id, invoice_number: i.invoice_number, company: i.company, balance: i.settlement.balance }));
    return { ...r, candidates: near };
  }));
});

/** Matching one by hand, when the rules would not commit to an answer. */
router.post('/bank-credits/:id/match', async (req, res) => {
  const { invoice_id } = req.body || {};
  if (!invoice_id) return res.status(400).json({ error: 'invoice_id is required' });
  const { rows: cRows } = await db.query(`select * from bank_credits where id = $1`, [req.params.id]);
  const credit = cRows[0];
  if (!credit) return res.status(404).json({ error: 'Bank credit not found' });
  if (credit.status === 'matched') return res.status(409).json({ error: 'That line is already matched.' });

  const { rows: iRows } = await db.query(`select * from invoices where id = $1`, [invoice_id]);
  const invoice = iRows[0];
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
  const { rows: pays } = await db.query(`select * from payments where invoice_id = $1`, [invoice_id]);
  const balance = settlementOf(invoice, pays).balance;
  const post = Math.min(Number(credit.amount), balance);
  if (post <= 0) return res.status(409).json({ error: 'There is nothing outstanding on that invoice.' });

  const { rows: pay } = await db.query(
    `insert into payments (invoice_id, client_id, amount, kind, method, reference, received_date, notes, recorded_by)
     values ($1,$2,$3,'receipt','Bank transfer',$4,$5,$6,$7) returning *`,
    [invoice.id, invoice.client_id, ROUND(post), credit.reference, credit.received_date,
      'Matched by hand from the bank statement.', (req.user && req.user.email) || req.authKind || '']
  );
  await db.query(
    `update bank_credits set status='matched', matched_invoice_id=$2, matched_payment_id=$3, match_confidence='Matched by hand.'
      where id = $1`,
    [credit.id, invoice.id, pay[0].id]
  );
  const status = await restate(invoice.id);
  res.json({ ok: true, posted: ROUND(post), invoice_status: status });
});

router.post('/bank-credits/:id/ignore', async (req, res) => {
  const { rows } = await db.query(
    `update bank_credits set status='ignored' where id = $1 and status = 'unmatched' returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'No unmatched line with that id.' });
  res.json(rows[0]);
});

module.exports = router;
