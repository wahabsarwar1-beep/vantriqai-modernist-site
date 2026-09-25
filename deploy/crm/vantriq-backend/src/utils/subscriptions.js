const db = require('../db');
const { effectivePackage } = require('./pkg');
const { ROUND, MONEY, resolveCurrency, createInvoice, monthLabel, getSettings } = require('./billing');
const { sendInvoice, previewInvoiceSend } = require('./invoiceDelivery');

/**
 * Subscriptions: what a client is on, what they have added to it, and what
 * that comes to at the end of a month.
 *
 * A client's package is their subscription. Three things sit on top of it:
 *
 *   bundles   another package added ALONGSIDE the first rather than
 *             replacing it. Its quota adds to the allowance and its
 *             retainer adds to the same invoice as its own line. A bundle
 *             may be pinned to one agent — that is how "the Instagram
 *             agent needs its own allowance" is said.
 *
 *   phases    a package change dated in the future. Recorded once, applied
 *             by the billing run on the day it falls due.
 *
 *   rates     metered pricing beyond one figure per session. The most
 *             specific rate wins: an agent's beats a client's, a client's
 *             beats a package's, and a package's beats the per-session
 *             overage built into the tier.
 *
 * Every figure a bundle carries is snapshotted when it is added, the same
 * way an invoice snapshots a tax rate: re-pricing the catalogue must never
 * silently re-price a bundle somebody is already paying for.
 */

const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const MONTH_START = (d) => `${DAY(d).slice(0, 7)}-01`;
function monthEnd(iso) {
  const d = new Date(`${MONTH_START(iso)}T00:00:00Z`);
  return DAY(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/**
 * The bundles live for a client across a window. A bundle counts if it had
 * started by the end of the window and had not ended before it began, which
 * is what "on this account during September" means.
 */
async function bundlesFor(clientId, from, to) {
  const { rows } = await db.query(
    `select b.*, a.name as agent_name, a.kind as agent_kind
       from client_bundles b
       left join client_agents a on a.id = b.agent_id
      where b.client_id = $1
        and b.status in ('active','scheduled','ended')
        and b.starts_on <= $3::date
        and (b.ends_on is null or b.ends_on >= $2::date)
      order by b.starts_on, b.created_at`,
    [clientId, DAY(from), DAY(to)]
  );
  // pg hands dates back as Date objects. Comparing one to a 'YYYY-MM-DD'
  // string coerces it to 'Tue Sep 16 2026 …' and compares lexically, which
  // is silently false for every date — so they are flattened here, once,
  // rather than at each of the places that reads them.
  return rows.map((b) => ({
    ...b,
    starts_on: DAY(b.starts_on),
    ends_on: b.ends_on ? DAY(b.ends_on) : null,
  }));
}

/**
 * A client's real allowance: what the package includes plus what every live
 * bundle adds. This is the number quota warnings and overage are measured
 * against — a client who bought a top-up has not "gone over" until they pass
 * the top-up too.
 */
function allowanceOf(effective, bundles) {
  const base = effective ? Number(effective.quota || 0) : 0;
  const added = (bundles || []).reduce(
    (s, b) => s + (Number(b.qty) * Number(b.unit_quota || 0)), 0
  );
  return { base, bundled: added, total: base + added };
}

/** The whole picture for one client on one date, package and bundles together. */
async function subscriptionOf(clientId, onDate) {
  const date = DAY(onDate || new Date());
  const { rows: cRows } = await db.query(`select * from clients where id = $1`, [clientId]);
  const client = cRows[0];
  if (!client) return null;

  let eff = null;
  if (client.product_id) {
    const { rows: p } = await db.query(`select * from products where id = $1`, [client.product_id]);
    eff = effectivePackage(client, p[0]);
  }
  const bundles = (await bundlesFor(clientId, date, date)).filter(
    (b) => b.status !== 'cancelled' && DAY(b.starts_on) <= date && (!b.ends_on || DAY(b.ends_on) >= date)
  );
  const allowance = allowanceOf(eff, bundles);
  const monthlyRetainer = ROUND(
    (eff ? Number(eff.retainer || 0) : 0) +
    bundles.filter((b) => b.recurring).reduce((s, b) => s + Number(b.qty) * Number(b.unit_retainer), 0)
  );

  const { rows: phases } = await db.query(
    `select p.*, pr.name as product_name from subscription_phases p
       join products pr on pr.id = p.product_id
      where p.client_id = $1 and p.status = 'scheduled'
      order by p.effective_on`,
    [clientId]
  );

  return {
    client_id: client.id,
    company: client.company,
    package: eff,
    bundles,
    allowance,
    monthly_retainer: monthlyRetainer,
    scheduled_changes: phases,
  };
}

/**
 * Metered rates for one client, most specific first. A rate row with a null
 * client and agent belongs to a package; one naming an agent is the narrowest
 * thing there is.
 */
async function ratesFor(client, agentId, onDate) {
  const date = DAY(onDate || new Date());
  const { rows } = await db.query(
    `select * from usage_rates
      where effective_from <= $1::date
        and (effective_to is null or effective_to >= $1::date)
        and (
          ($2::uuid is not null and agent_id = $2)
          or (agent_id is null and client_id = $3)
          or (agent_id is null and client_id is null and product_id = $4)
        )
      order by (agent_id is not null) desc, (client_id is not null) desc, effective_from desc`,
    [date, agentId || null, client.id, client.product_id || null]
  );
  // One rate per metric — the first row for a metric is the most specific.
  const best = new Map();
  for (const r of rows) if (!best.has(r.metric)) best.set(r.metric, r);
  return [...best.values()];
}

/** What a month's metered usage costs under those rates. */
async function meteredCharges(client, month) {
  // Token rates are tiny per unit; rounding these to cents before they are
  // summed throws the whole charge away on a quiet month.
  const settings = await getSettings();
  const M = (n) => MONEY(n, resolveCurrency(client, settings));
  const from = MONTH_START(month);
  const to = monthEnd(month);
  const rates = await ratesFor(client, null, to);
  if (!rates.length) return [];

  const { rows } = await db.query(
    `select count(distinct session_id)::numeric as session,
            coalesce(sum(messages_count),0)::numeric as message,
            coalesce(sum(input_tokens),0)::numeric  as input_token,
            coalesce(sum(output_tokens),0)::numeric as output_token
       from usage_events
      where client_id = $1 and occurred_at >= $2::date and occurred_at < ($3::date + 1)`,
    [client.id, from, to]
  );
  const used = rows[0] || {};

  const out = [];
  for (const r of rates) {
    // 'session' is already priced by the package's own overage; a session
    // rate card here means the client negotiated their own figure, so it
    // replaces the tier's rather than stacking on it.
    const quantity = Number(used[r.metric] || 0);
    const billable = Math.max(0, quantity - Number(r.included_units || 0));
    if (billable <= 0) continue;
    const units = Number(r.unit_size || 1) > 1 ? billable / Number(r.unit_size) : billable;
    const amount = M(units * Number(r.unit_rate));
    if (amount <= 0) continue;
    out.push({
      metric: r.metric,
      description: r.label || METRIC_LABEL[r.metric] || r.metric,
      detail: `${Math.round(quantity).toLocaleString('en-US')} used, ${Math.round(Number(r.included_units)).toLocaleString('en-US')} included`,
      // Token rates are priced per million, so a month's usage is a small
      // fraction of a unit. Rounded to two places that shows as 0, and the
      // line reads "0 x 0.15 = 0.000405", which is nonsense on an invoice.
      qty: Math.round(units * 1e6) / 1e6,
      unit_price: Number(r.unit_rate),
      amount,
      kind: 'overage',
    });
  }
  return out;
}

const METRIC_LABEL = {
  session: 'Conversations',
  message: 'Messages',
  input_token: 'Input tokens',
  output_token: 'Output tokens',
  automation_run: 'Automation runs',
};

/**
 * Everything one client should be billed for one month, as invoice lines.
 * Returns null when there is nothing to bill.
 *
 * The order is deliberate and it is the order the invoice prints in: the
 * package, then any bundle's one-off setup, then the bundles themselves,
 * then whatever ran past the allowance.
 */
/**
 * A bill made only of what was consumed — no retainer, no included quota,
 * priced from the first unit.
 *
 * Used for the internal account. A rate card on the client wins if one
 * exists, which is how you price by token rather than by conversation and
 * get closer to what OpenAI actually charges. Without one it falls back to
 * the package's own per-conversation rate, so the internal transfer price is
 * a figure already on the price list rather than something invented here.
 *
 * No usage means no invoice. A zero-value invoice in the pipeline is noise,
 * and pay-as-you-go with nothing used is genuinely nothing owed.
 */
async function buildUsageOnlyBill(client, eff, month, from, to, period) {
  const settings = await getSettings();
  const currency = resolveCurrency(client, settings);
  const M = (n) => MONEY(n, currency);
  const lines = [];
  let sessionsBilled = 0;

  const metered = await meteredCharges(client, month);
  if (metered.length) {
    lines.push(...metered);
    const s = metered.find((m) => m.metric === 'session');
    if (s) sessionsBilled = Math.round(s.qty);
  } else {
    const { rows } = await db.query(
      `select sessions from v_monthly_usage where client_id = $1 and period_month = $2::date`,
      [client.id, from]
    );
    const used = Number((rows[0] && rows[0].sessions) || 0);
    const rate = Number(eff.overage_rate) || 0;
    if (used > 0 && rate > 0) {
      sessionsBilled = used;
      lines.push({
        description: `${eff.name} — conversations used`,
        detail: `${period} · ${used.toLocaleString('en-US')} conversations at ${rate}/conversation · pay as you go, no included quota`,
        qty: used, unit_price: rate, amount: M(used * rate),
        kind: 'usage',
      });
    }
  }

  const amount = M(lines.reduce((s, l) => s + Number(l.amount), 0));
  if (amount <= 0) return null;
  return { period, lines, amount, overage_sessions: sessionsBilled, bundles: [], currency };
}

async function buildMonthlyBill(client, month) {
  const from = MONTH_START(month);
  const to = monthEnd(month);
  const period = monthLabel(from);
  if (!client.product_id) return null;

  const { rows: prodRows } = await db.query(`select * from products where id = $1`, [client.product_id]);
  const eff = effectivePackage(client, prodRows[0]);
  if (!eff) return null;

  // VantriqAI pays for what its own agents actually used, not a package
  // retainer it would be sitting on both sides of. The point of the internal
  // account is to put real cost against real usage: a flat 250,000 whether
  // the agents answered ten conversations or ten thousand tells you nothing
  // about what running them costs, which is the only question it exists to
  // answer.
  if (client.is_internal) return buildUsageOnlyBill(client, eff, month, from, to, period);

  const bundles = (await bundlesFor(client.id, from, to)).filter((b) => b.status !== 'cancelled');
  const lines = [];

  lines.push({
    description: `${eff.name} — monthly retainer`,
    detail: `${period} · ${Number(eff.quota).toLocaleString('en-US')} conversations included`,
    qty: 1, unit_price: Number(eff.retainer), amount: Number(eff.retainer),
    kind: 'retainer',
  });

  for (const b of bundles) {
    const on = b.agent_name ? ` · ${b.agent_name}` : '';
    if (Number(b.unit_setup_fee) > 0 && !b.setup_billed) {
      lines.push({
        description: `${b.name} — bundle setup`,
        detail: `One-off${on}`,
        qty: b.qty, unit_price: Number(b.unit_setup_fee), amount: ROUND(b.qty * Number(b.unit_setup_fee)),
        kind: 'bundle_setup', bundle_id: b.id, agent_id: b.agent_id,
      });
    }
    // A one-off bundle bills its retainer once, in the month it starts.
    const billsThisMonth = b.recurring || DAY(b.starts_on) >= from;
    if (Number(b.unit_retainer) > 0 && billsThisMonth) {
      lines.push({
        description: `${b.name} — bundle`,
        detail: `${period}${on} · +${(Number(b.unit_quota) * b.qty).toLocaleString('en-US')} conversations`,
        qty: b.qty, unit_price: Number(b.unit_retainer), amount: ROUND(b.qty * Number(b.unit_retainer)),
        kind: 'bundle', bundle_id: b.id, agent_id: b.agent_id,
      });
    }
  }

  // Extra numbers beyond what the package includes. client_agents already
  // pools every number's usage into this one client's quota — the schema
  // comment on v_monthly_usage is explicit that it groups by client_id, not
  // agent_id — which is the right shape for one business running several
  // branches on one account, and, left unpriced, also the shape of two
  // unrelated businesses splitting one bill. This is that other half:
  // charging for it where a package actually prices it.
  //
  // Counts every ACTIVE client_agents row regardless of kind — a second
  // WhatsApp line, an Instagram handle, a website domain — because that
  // mirrors exactly what pools together for quota. Paused or retired
  // numbers are not billed; they are not consuming anything this month.
  if (Number(eff.extra_agent_price) > 0) {
    const { rows: agentRows } = await db.query(
      `select count(*)::int as n from client_agents where client_id = $1 and status = 'active'`,
      [client.id]
    );
    const activeAgents = agentRows[0].n;
    const extra = Math.max(0, activeAgents - Number(eff.included_agents));
    if (extra > 0) {
      lines.push({
        description: `${eff.name} — extra numbers`,
        detail: `${period} · ${activeAgents} active, ${eff.included_agents} included`,
        qty: extra, unit_price: Number(eff.extra_agent_price), amount: ROUND(extra * Number(eff.extra_agent_price)),
        kind: 'extra_agents',
      });
    }
  }

  // Overage. Rate cards, where they exist, replace the tier's flat figure.
  const metered = await meteredCharges(client, month);
  let overageSessions = 0;
  if (metered.length) {
    lines.push(...metered);
    const s = metered.find((m) => m.metric === 'session');
    if (s) overageSessions = Math.round(s.qty);
  } else {
    const allowance = allowanceOf(eff, bundles.filter((b) => DAY(b.starts_on) <= to));
    const { rows: usage } = await db.query(
      `select sessions from v_monthly_usage where client_id = $1 and period_month = $2::date`,
      [client.id, from]
    );
    const used = Number((usage[0] && usage[0].sessions) || 0);
    const over = Math.max(0, used - allowance.total);
    if (over > 0 && Number(eff.overage_rate) > 0) {
      overageSessions = over;
      lines.push({
        description: 'Conversations over included quota',
        detail: allowance.bundled
          ? `${used.toLocaleString('en-US')} used against ${allowance.total.toLocaleString('en-US')} included (${allowance.base.toLocaleString('en-US')} on the package, ${allowance.bundled.toLocaleString('en-US')} from bundles)`
          : `${used.toLocaleString('en-US')} used against a quota of ${allowance.total.toLocaleString('en-US')}`,
        qty: over, unit_price: Number(eff.overage_rate), amount: ROUND(over * Number(eff.overage_rate)),
        kind: 'overage',
      });
    }
  }

  const amount = ROUND(lines.reduce((s, l) => s + Number(l.amount), 0));
  if (amount <= 0) return null;
  return { period, lines, amount, overage_sessions: overageSessions, bundles };
}

/**
 * Applies every scheduled package change that has come due. Called at the
 * top of the billing run so a client scheduled to move up on the 1st is
 * billed on the new tier that same month.
 */
async function applyDuePhases(onDate) {
  const date = DAY(onDate || new Date());
  const { rows } = await db.query(
    `select p.*, pr.name as product_name from subscription_phases p
       join products pr on pr.id = p.product_id
      where p.status = 'scheduled' and p.effective_on <= $1::date
      order by p.effective_on`,
    [date]
  );
  const applied = [];
  for (const p of rows) {
    await db.query(`update clients set product_id = $2 where id = $1`, [p.client_id, p.product_id]);
    await db.query(
      `update subscription_phases set status = 'applied', applied_at = now() where id = $1`, [p.id]
    );
    await db.query(
      `insert into client_stage_history (client_id, from_stage, to_stage, comment)
       values ($1, null, 'active', $2)`,
      [p.client_id, `Scheduled package change applied: now on ${p.product_name}.${p.note ? ` ${p.note}` : ''}`]
    );
    applied.push({ client_id: p.client_id, product: p.product_name, effective_on: p.effective_on });
  }
  return applied;
}

/**
 * Ends the bundles whose term has run out, so next month's bill and next
 * month's allowance both stop counting them.
 */
async function expireBundles(onDate) {
  const date = DAY(onDate || new Date());
  const { rows } = await db.query(
    `update client_bundles set status = 'ended'
      where status = 'active' and ends_on is not null and ends_on < $1::date
      returning id, client_id, name`,
    [date]
  );
  await db.query(
    `update client_bundles set status = 'active'
      where status = 'scheduled' and starts_on <= $1::date
        and (ends_on is null or ends_on >= $1::date)`,
    [date]
  );
  return rows;
}

/**
 * The monthly run. One call bills every active client for the month: their
 * package, their bundles and whatever ran past the allowance, as one invoice
 * with one line per thing.
 *
 * Idempotent by construction — a client who already has a retainer invoice
 * for the period is skipped, so running it twice cannot double-bill anyone.
 */
async function runMonthlyBilling({ month, dryRun, clientId } = {}) {
  const m = MONTH_START(month || new Date());
  const period = monthLabel(m);
  const phases = dryRun ? [] : await applyDuePhases(monthEnd(m));
  const expired = dryRun ? [] : await expireBundles(monthEnd(m));

  const { rows: clients } = await db.query(
    clientId
      ? `select * from clients where id = $1`
      : `select * from clients where stage = 'active' and product_id is not null order by company`,
    clientId ? [clientId] : []
  );

  const settings = await getSettings();
  // An unsent invoice is the bug, not the safe state — so this is on unless
  // switched off. A dry run still reports every recipient without sending.
  const emailInvoices = settings.email_invoices !== false;

  const raised = [];
  const skipped = [];
  for (const client of clients) {
    const { rows: already } = await db.query(
      `select id, invoice_number from invoices
        where client_id = $1 and type = 'retainer' and period = $2 limit 1`,
      [client.id, period]
    );
    if (already[0]) {
      skipped.push({ client: client.company, reason: 'already billed', invoice: already[0].invoice_number });
      continue;
    }
    const bill = await buildMonthlyBill(client, m);
    if (!bill) { skipped.push({ client: client.company, reason: 'nothing to bill' }); continue; }

    if (dryRun) {
      raised.push({
        client: client.company, client_id: client.id, period,
        // Carried so the billing-run panel prints the figure in the currency
        // it would actually be raised in — a dollar bill shown as rupees
        // reads as zero.
        amount: bill.amount, currency: bill.currency || resolveCurrency(client, settings), lines: bill.lines,
        // Who would receive it, worked out the same way the real send does.
        // Who would receive it, resolved exactly as the real send resolves it:
        // the internal account has its own address, because the "client" is us.
        delivery: (() => {
          if (!emailInvoices) return { outcome: 'skipped', detail: 'Invoice emails are switched off in Settings.' };
          const to = client.is_internal
            ? (settings.internal_invoice_email || '').trim()
            : client.email;
          if (!to) {
            return { outcome: 'skipped', detail: client.is_internal
              ? 'No internal invoice address set (Settings → internal invoice email).'
              : 'No email address on the client record.' };
          }
          return { outcome: 'would_send', detail: `Would email ${to}.` };
        })(),
      });
      continue;
    }
    const invoice = await createInvoice(client, {
      type: 'retainer', amount: bill.amount, period,
      overage_sessions: bill.overage_sessions,
      notes: `Monthly billing run for ${period}`,
      lines: bill.lines,
    });
    // Mark the bundle setup fees that have now been charged, and stamp the
    // lines with what they came from, so a query on the bill can be answered.
    await stampLines(invoice.id, bill.lines);
    for (const l of bill.lines) {
      if (l.kind === 'bundle_setup' && l.bundle_id) {
        await db.query(`update client_bundles set setup_billed = true where id = $1`, [l.bundle_id]);
      }
    }
    // Send it. This must never undo the invoice: sendInvoice returns an
    // outcome rather than throwing, and a failure is logged against the
    // invoice for someone to retry by hand.
    const delivery = emailInvoices
      ? await sendInvoice(invoice.id, { settings })
      : { outcome: 'skipped', detail: 'Invoice emails are switched off in Settings.' };

    raised.push({
      client: client.company, client_id: client.id, period,
      invoice_id: invoice.id, invoice_number: invoice.invoice_number, amount: bill.amount,
      currency: invoice.currency, delivery,
    });
  }

  return {
    period, month: m, dry_run: !!dryRun,
    invoices: raised, skipped,
    phases_applied: phases, bundles_ended: expired,
    emailed: raised.filter((r) => r.delivery && r.delivery.outcome === 'sent').length,
    email_invoices: emailInvoices,
  };
}

/** Writes kind/bundle_id/agent_id onto the lines createInvoice just inserted. */
async function stampLines(invoiceId, lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    await db.query(
      `update invoice_lines set kind = $3, bundle_id = $4, agent_id = $5
        where invoice_id = $1 and position = $2`,
      [invoiceId, i, l.kind || 'other', l.bundle_id || null, l.agent_id || null]
    );
  }
}

module.exports = {
  bundlesFor, allowanceOf, subscriptionOf, ratesFor, meteredCharges,
  buildMonthlyBill, applyDuePhases, expireBundles, runMonthlyBilling, stampLines,
  MONTH_START, monthEnd, DAY, METRIC_LABEL,
};
