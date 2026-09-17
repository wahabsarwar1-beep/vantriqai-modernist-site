const db = require('./../db');
const { sendMail, mailConfigured } = require('./mailer');
const { settlementOf, getSettings, ROUND } = require('./billing');

/**
 * Chasing an invoice, and the automations that sit on top of it.
 *
 * There is no card to retry here. Invoices are settled by bank transfer, so
 * the equivalent of a payment processor's smart retry is an escalating
 * schedule of reminders around the due date that ends, if nothing arrives,
 * in the service being suspended. What makes it safe to run daily is the
 * log: one step fires once per invoice, ever, enforced by a unique index
 * rather than by remembering.
 *
 * Steps are relative to the due date. A negative offset is before it — the
 * courtesy reminder that stops most invoices going late in the first place.
 */

const DEFAULT_STEPS = [
  { name: 'Courtesy reminder', offset_days: -3, action: 'email', position: 0,
    subject: 'Invoice {{invoice_number}} is due on {{due_date}}',
    body: 'Hi {{name}},\n\nA quick note that invoice {{invoice_number}} for {{amount}} falls due on {{due_date}}.\n\nIf it is already on its way, thank you — please ignore this.\n\n{{company}}' },
  { name: 'Due today', offset_days: 0, action: 'email', position: 1,
    subject: 'Invoice {{invoice_number}} is due today',
    body: 'Hi {{name}},\n\nInvoice {{invoice_number}} for {{amount}} is due today.\n\n{{company}}' },
  { name: 'First chase', offset_days: 3, action: 'email', position: 2,
    subject: 'Invoice {{invoice_number}} is now overdue',
    body: 'Hi {{name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}} and we have not seen it yet.\n\nIf there is a problem with the invoice, tell us and we will put it right.\n\n{{company}}' },
  { name: 'Second chase', offset_days: 10, action: 'email', position: 3,
    subject: 'Invoice {{invoice_number}} — {{days_overdue}} days overdue',
    body: 'Hi {{name}},\n\nInvoice {{invoice_number}} for {{amount}} is now {{days_overdue}} days overdue.\n\nPlease let us know when we can expect it.\n\n{{company}}' },
  { name: 'Final notice', offset_days: 21, action: 'email', position: 4,
    subject: 'Final notice — invoice {{invoice_number}}',
    body: 'Hi {{name}},\n\nInvoice {{invoice_number}} for {{amount}} is {{days_overdue}} days overdue. If it is not settled, your service will be paused while we sort it out.\n\nPlease get in touch today.\n\n{{company}}' },
  { name: 'Suspend service', offset_days: 30, action: 'suspend', position: 5,
    subject: '', body: '' },
];

/** Installs the default schedule, once. Does nothing if any step exists. */
async function ensureDefaultSteps() {
  const { rows } = await db.query(`select count(*)::int as n from dunning_steps`);
  if (rows[0].n > 0) return { created: 0 };
  for (const s of DEFAULT_STEPS) {
    await db.query(
      `insert into dunning_steps (name, offset_days, action, subject, body, position)
       values ($1,$2,$3,$4,$5,$6)`,
      [s.name, s.offset_days, s.action, s.subject, s.body, s.position]
    );
  }
  return { created: DEFAULT_STEPS.length };
}

const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const daysBetween = (a, b) => Math.round((new Date(DAY(b)) - new Date(DAY(a))) / 86400000);

function fill(template, vars) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

/**
 * Runs the schedule for one day.
 *
 * `dryRun` returns exactly what would be sent without sending or logging it,
 * which is the only responsible way to let someone change a chase template
 * and find out what it does to their customers.
 */
async function runDunning({ onDate, dryRun } = {}) {
  const today = DAY(onDate || new Date());
  const settings = await getSettings();
  if (!settings.dunning_enabled && !dryRun) {
    return { ran: false, reason: 'Dunning is switched off in Settings.', actions: [] };
  }

  const { rows: steps } = await db.query(
    `select * from dunning_steps where active = true order by offset_days, position`
  );
  if (!steps.length) return { ran: true, actions: [], note: 'No steps configured.' };

  // Only real, unsettled, non-internal invoices with a due date are chased.
  const { rows: invoices } = await db.query(
    `select i.*, c.company, c.name, c.email, c.service_status, c.is_internal
       from invoices i join clients c on c.id = i.client_id
      where i.status not in ('paid','void') and c.is_internal = false and i.due_date is not null`
  );
  const ids = invoices.map((i) => i.id);
  const byInvoice = new Map();
  if (ids.length) {
    const { rows: pays } = await db.query(
      `select * from payments where invoice_id = any($1::uuid[])`, [ids]
    );
    for (const p of pays) {
      if (!byInvoice.has(p.invoice_id)) byInvoice.set(p.invoice_id, []);
      byInvoice.get(p.invoice_id).push(p);
    }
  }
  const { rows: alreadySent } = ids.length
    ? await db.query(`select invoice_id, step_id from invoice_reminders where invoice_id = any($1::uuid[])`, [ids])
    : { rows: [] };
  const sent = new Set(alreadySent.map((r) => `${r.invoice_id}:${r.step_id}`));

  const actions = [];
  for (const inv of invoices) {
    const settlement = settlementOf(inv, byInvoice.get(inv.id));
    if (settlement.balance <= 0.009) continue;
    const overdueBy = daysBetween(inv.due_date, today);

    for (const step of steps) {
      if (overdueBy < step.offset_days) continue;           // not yet due to fire
      if (sent.has(`${inv.id}:${step.id}`)) continue;       // already fired, ever

      const vars = {
        name: inv.name || inv.company,
        company_name: inv.company,
        company: settings.company_name || 'Vantriq AI',
        invoice_number: inv.invoice_number || '',
        amount: `${settings.currency || 'PKR'} ${ROUND(settlement.balance).toLocaleString('en-US')}`,
        due_date: DAY(inv.due_date),
        days_overdue: Math.max(0, overdueBy),
      };
      const action = {
        invoice_id: inv.id, invoice_number: inv.invoice_number, client: inv.company,
        step: step.name, action: step.action, days_overdue: overdueBy,
        to: inv.email || null,
        subject: fill(step.subject, vars),
        body: fill(step.body, vars),
      };

      if (dryRun) { actions.push({ ...action, outcome: 'would_send' }); continue; }

      let outcome = 'sent';
      let detail = '';
      try {
        if (step.action === 'email') {
          if (!inv.email) { outcome = 'skipped'; detail = 'No email address on the client record.'; }
          else if (!mailConfigured()) { outcome = 'skipped'; detail = 'Email is not configured on the server.'; }
          else await sendMail({ to: inv.email, subject: action.subject, text: action.body });
        } else if (step.action === 'suspend') {
          if (inv.service_status === 'suspended') { outcome = 'skipped'; detail = 'Already suspended.'; }
          else {
            await db.query(
              `update clients set service_status = 'suspended', suspended_at = now(),
                      suspended_by = 'dunning', suspension_reason = $2
                where id = $1`,
              [inv.client_id, `Invoice ${inv.invoice_number} unpaid ${overdueBy} days past its due date.`]
            );
            detail = `Service paused over invoice ${inv.invoice_number}.`;
          }
        } else if (step.action === 'flag') {
          detail = 'Flagged for review.';
        }
      } catch (err) {
        outcome = 'failed';
        detail = String(err.message || err).slice(0, 300);
      }

      await db.query(
        `insert into invoice_reminders (invoice_id, step_id, action, outcome, detail)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [inv.id, step.id, step.action, outcome, detail]
      );
      sent.add(`${inv.id}:${step.id}`);
      actions.push({ ...action, outcome, detail });
    }
  }
  return { ran: true, on: today, dry_run: !!dryRun, actions };
}

/**
 * The rule engine. Three triggers, because three is what a small business
 * can reason about: an invoice going overdue, a client crossing their quota,
 * and a bundle about to run out.
 *
 * Every rule that fires writes an automation_runs row, and the unique index
 * on (automation, client, invoice) is what stops a daily run doing the same
 * thing to the same person every morning.
 */
async function runAutomations({ dryRun } = {}) {
  const settings = await getSettings();
  const { rows: rules } = await db.query(`select * from automations where active = true order by created_at`);
  const fired = [];

  for (const rule of rules) {
    let targets = [];

    if (rule.trigger === 'invoice_overdue') {
      const { rows } = await db.query(
        `select i.id as invoice_id, i.invoice_number, i.due_date, i.net_payable,
                c.id as client_id, c.company, c.name, c.email, c.service_status
           from invoices i join clients c on c.id = i.client_id
          where i.status = 'overdue' and c.is_internal = false
            and i.due_date <= current_date - $1::int`,
        [Number(rule.threshold_days || 0)]
      );
      targets = rows;
    } else if (rule.trigger === 'quota_exceeded') {
      const { rows } = await db.query(
        `select c.id as client_id, c.company, c.name, c.email, c.service_status,
                q.sessions_at_event, q.quota_at_event, null::uuid as invoice_id, null as invoice_number
           from quota_events q join clients c on c.id = q.client_id
          where q.threshold = 'exceeded' and q.decision is null
            and q.period_month = date_trunc('month', now())::date
            and q.quota_at_event > 0
            and (q.sessions_at_event::numeric / q.quota_at_event) * 100 >= $1::numeric`,
        [Number(rule.threshold_pct || 100)]
      );
      targets = rows;
    } else if (rule.trigger === 'bundle_ending') {
      const { rows } = await db.query(
        `select b.id as bundle_id, b.name as bundle_name, b.ends_on,
                c.id as client_id, c.company, c.name, c.email, c.service_status,
                null::uuid as invoice_id, null as invoice_number
           from client_bundles b join clients c on c.id = b.client_id
          where b.status = 'active' and b.ends_on is not null
            and b.ends_on between current_date and current_date + $1::int`,
        [Number(rule.threshold_days || 7)]
      );
      targets = rows;
    } else if (rule.trigger === 'subscription_renewal') {
      const { rows } = await db.query(
        `select p.id as phase_id, p.effective_on, pr.name as product_name,
                c.id as client_id, c.company, c.name, c.email, c.service_status,
                null::uuid as invoice_id, null as invoice_number
           from subscription_phases p
           join clients c on c.id = p.client_id
           join products pr on pr.id = p.product_id
          where p.status = 'scheduled'
            and p.effective_on between current_date and current_date + $1::int`,
        [Number(rule.threshold_days || 7)]
      );
      targets = rows;
    }

    for (const t of targets) {
      // Already done for this client (and this invoice, where there is one)?
      const { rows: done } = await db.query(
        t.invoice_id
          ? `select 1 from automation_runs where automation_id = $1 and client_id = $2 and invoice_id = $3`
          : `select 1 from automation_runs where automation_id = $1 and client_id = $2 and invoice_id is null
               and created_at > now() - interval '25 days'`,
        t.invoice_id ? [rule.id, t.client_id, t.invoice_id] : [rule.id, t.client_id]
      );
      if (done[0]) continue;

      const params = rule.params || {};
      const entry = {
        automation: rule.name, trigger: rule.trigger, action: rule.action,
        client: t.company, client_id: t.client_id, invoice_number: t.invoice_number || null,
      };
      if (dryRun) { fired.push({ ...entry, outcome: 'would_fire' }); continue; }

      let outcome = 'done';
      let detail = '';
      try {
        if (rule.action === 'email_customer') {
          const subject = fill(params.subject || `A note about your ${settings.company_name || 'Vantriq AI'} account`, t);
          const body = fill(params.body || 'Hi {{name}},\n\nWe wanted to let you know about your account.\n\n{{company}}',
            { ...t, company: settings.company_name || 'Vantriq AI' });
          if (!t.email) { outcome = 'skipped'; detail = 'No email on the client record.'; }
          else if (!mailConfigured()) { outcome = 'skipped'; detail = 'Email is not configured.'; }
          else { await sendMail({ to: t.email, subject, text: body }); detail = `Emailed ${t.email}.`; }
        } else if (rule.action === 'suspend_service') {
          if (t.service_status === 'suspended') { outcome = 'skipped'; detail = 'Already suspended.'; }
          else {
            await db.query(
              `update clients set service_status='suspended', suspended_at=now(), suspended_by=$2, suspension_reason=$3 where id=$1`,
              [t.client_id, `automation:${rule.name}`, params.reason || `Automation "${rule.name}" paused this account.`]
            );
            detail = 'Service paused.';
          }
        } else if (rule.action === 'notify_team') {
          const to = params.to || process.env.MAIL_FROM || 'support@vantriqai.com';
          if (!mailConfigured()) { outcome = 'skipped'; detail = 'Email is not configured.'; }
          else {
            await sendMail({
              to,
              subject: `[${rule.name}] ${t.company}`,
              text: `Rule "${rule.name}" (${rule.trigger}) fired for ${t.company}.\n\n${JSON.stringify(t, null, 2)}`,
            });
            detail = `Notified ${to}.`;
          }
        } else if (rule.action === 'flag_review' || rule.action === 'offer_upgrade') {
          detail = rule.action === 'offer_upgrade'
            ? 'Flagged as an upgrade conversation.'
            : 'Flagged for review.';
        }
      } catch (err) {
        outcome = 'failed';
        detail = String(err.message || err).slice(0, 300);
      }

      await db.query(
        `insert into automation_runs (automation_id, client_id, invoice_id, outcome, detail)
         values ($1,$2,$3,$4,$5) on conflict do nothing`,
        [rule.id, t.client_id, t.invoice_id || null, outcome, detail]
      );
      fired.push({ ...entry, outcome, detail });
    }

    if (!dryRun) {
      await db.query(
        `update automations set last_run_at = now(), run_count = run_count + $2 where id = $1`,
        [rule.id, targets.length ? 1 : 0]
      );
    }
  }
  return { dry_run: !!dryRun, fired };
}

module.exports = { runDunning, runAutomations, ensureDefaultSteps, DEFAULT_STEPS, fill };
