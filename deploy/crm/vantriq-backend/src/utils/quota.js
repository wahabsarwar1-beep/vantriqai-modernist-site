const db = require('./../db');
const { effectivePackage } = require('./pkg');

/**
 * Quota is a billing signal, never a kill switch. A client who runs past the
 * conversations their package includes keeps being served; what happens is
 * that the month is flagged and an admin decides, per client, whether to bill
 * the overage or move them up a tier.
 *
 * Two thresholds are recorded, at most once each per client per month:
 *   warning  — 80% of the included sessions used
 *   exceeded — the quota is used up; every further session is billable
 */
const WARNING_AT = 0.8;

/** The month bucket a timestamp falls in, as YYYY-MM-01. */
function periodOf(date) {
  const d = date ? new Date(date) : new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Reads a client's live position against their quota for one month.
 * Returns null only when the client has no package assigned.
 */
async function quotaStatus(clientId, month) {
  const period = month || periodOf();
  const { rows: clientRows } = await db.query(`select * from clients where id = $1`, [clientId]);
  const client = clientRows[0];
  if (!client) return null;

  let eff = null;
  if (client.product_id) {
    const { rows: prod } = await db.query(`select * from products where id = $1`, [client.product_id]);
    eff = effectivePackage(client, prod[0]);
  }

  const { rows: usage } = await db.query(
    `select sessions, messages from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [clientId, period]
  );
  const sessions = Number((usage[0] && usage[0].sessions) || 0);
  const quota = eff ? Number(eff.quota) : null;
  const overageRate = eff ? Number(eff.overage_rate) : null;

  const over = quota ? Math.max(0, sessions - quota) : 0;
  return {
    period_month: period,
    package_name: eff ? eff.name : null,
    quota,
    sessions_used: sessions,
    sessions_remaining: quota != null ? Math.max(0, quota - sessions) : null,
    percent_used: quota ? Math.round((sessions / quota) * 100) : null,
    over_quota_sessions: over,
    overage_rate: overageRate,
    estimated_overage_cost: overageRate != null ? Math.round(over * overageRate * 100) / 100 : null,
    state: quota == null ? 'no_quota'
      : sessions >= quota ? 'exceeded'
      : sessions >= quota * WARNING_AT ? 'warning'
      : 'ok',
  };
}

/**
 * Records the crossing, if this client has just crossed one this month. The
 * unique (client_id, period_month, threshold) constraint makes this safe to
 * call on every single usage event — the second and later calls do nothing.
 *
 * Returns the status, with `flagged` naming a threshold that was newly
 * recorded (null when nothing changed), so the caller — n8n — can react the
 * moment a client tips over rather than discovering it at month end.
 */
async function recordQuotaCrossing(clientId, month) {
  const status = await quotaStatus(clientId, month);
  if (!status || status.state === 'ok' || status.state === 'no_quota') {
    return { ...(status || {}), flagged: null };
  }

  const { rows } = await db.query(
    `insert into quota_events (client_id, period_month, threshold, sessions_at_event, quota_at_event)
     values ($1,$2,$3,$4,$5)
     on conflict (client_id, period_month, threshold) do nothing
     returning id`,
    [clientId, status.period_month, status.state, status.sessions_used, status.quota]
  );
  return { ...status, flagged: rows[0] ? status.state : null };
}

module.exports = { quotaStatus, recordQuotaCrossing, periodOf, WARNING_AT };
