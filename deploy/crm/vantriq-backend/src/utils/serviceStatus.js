const db = require('./../db');
const { effectivePackage } = require('./pkg');
const { periodOf } = require('./quota');

/**
 * Should we answer this client's customers right now?
 *
 * Called by n8n before it generates a reply, so it has to be quick and it has
 * to be careful: the cost of wrongly saying "no" is a real customer of theirs
 * getting silence from a WhatsApp number. Two rules decide it.
 *
 *   1. An admin suspended the client. That is a deliberate decision — usually
 *      non-payment — and it always wins.
 *   2. The company's over-quota policy, which defaults to 'serve': keep
 *      answering past the allowance and settle it on the invoice. An admin can
 *      switch it to 'grace' (stop at a multiple of quota) or 'block' (stop at
 *      the allowance).
 *
 * Anything this function cannot determine resolves to ALLOW. A client must
 * never lose service because a lookup failed — see the caller, which also
 * fails open.
 */
async function serviceStatusFor({ external_ref, client_id }) {
  const { rows } = await db.query(
    client_id
      ? `select * from clients where id = $1`
      : `select * from clients where external_ref = $1`,
    [client_id || external_ref]
  );
  const client = rows[0];
  if (!client) {
    return {
      allow: true,
      reason: 'unknown_client',
      detail: `No client matches ${client_id ? 'that id' : `external_ref "${external_ref}"`}. Serving anyway — set the reference on the client record so usage is billed.`,
      client_id: null,
    };
  }

  const base = { client_id: client.id, company: client.company };

  if (client.service_status === 'suspended') {
    return {
      ...base,
      allow: false,
      reason: 'suspended',
      detail: client.suspension_reason || 'This account is suspended.',
      suspended_at: client.suspended_at,
    };
  }

  const settings = (await db.query(`select overage_policy, overage_grace_pct from settings where id = 1`)).rows[0] || {};
  const policy = settings.overage_policy || 'serve';

  let eff = null;
  if (client.product_id) {
    const prod = await db.query(`select * from products where id = $1`, [client.product_id]);
    eff = effectivePackage(client, prod.rows[0]);
  }
  // No package means nothing to measure against, so nothing to stop.
  if (!eff || !eff.quota) return { ...base, allow: true, reason: 'no_quota' };

  const period = periodOf();
  const usage = await db.query(
    `select sessions from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [client.id, period]
  );
  const used = Number((usage.rows[0] && usage.rows[0].sessions) || 0);
  const quota = Number(eff.quota);
  const ceiling = policy === 'block' ? quota
    : policy === 'grace' ? Math.floor(quota * (Number(settings.overage_grace_pct) || 120) / 100)
    : null;

  const info = {
    ...base,
    period_month: period,
    quota,
    sessions_used: used,
    percent_used: Math.round((used / quota) * 100),
    policy,
  };

  if (ceiling !== null && used >= ceiling) {
    return {
      ...info,
      allow: false,
      reason: 'over_quota',
      ceiling,
      detail: `Used ${used} of ${quota} included conversations this month; the ${policy} policy stops at ${ceiling}.`,
    };
  }
  return { ...info, allow: true, reason: 'ok', ceiling };
}

module.exports = { serviceStatusFor };
