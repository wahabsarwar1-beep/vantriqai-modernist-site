const express = require('express');
const db = require('../db');
const { recordQuotaCrossing } = require('../utils/quota');
const { serviceStatusFor } = require('../utils/serviceStatus');
const router = express.Router();

/**
 * POST /api/webhooks/usage
 *
 * Called by n8n (or any automation step) immediately after an AI model
 * call returns, or when a WhatsApp 24-hour session closes. This is what
 * makes usage numbers real-time instead of manually entered.
 *
 * Body:
 * {
 *   "external_ref": "923001234567",      // required unless client_id given — the client's ref, or one of its agents' refs
 *   "client_id": "uuid",                 // alternative to external_ref, if n8n already knows Vantriq's internal client id
 *   "agent_ref": "instagram:@khantraders", // optional — which of the client's agents handled this
 *   "agent_id": "uuid",                  // alternative to agent_ref
 *   "session_id": "923009998888-2026-08-16", // required — one id per 24h conversation window
 *   "channel": "whatsapp",               // whatsapp | web | voice | instagram
 *   "ai_model": "claude-sonnet-4-6",
 *   "input_tokens": 812,
 *   "output_tokens": 340,
 *   "messages_count": 1,
 *   "occurred_at": "2026-08-16T10:32:00Z" // optional, defaults to now()
 * }
 *
 * n8n gets input_tokens/output_tokens straight from the AI provider's
 * response JSON (Claude, OpenAI, and DeepSeek all return a `usage` object
 * on every completion) — no extra computation needed on the n8n side.
 */
router.post('/usage', async (req, res) => {
  const body = req.body || {};
  const { external_ref, client_id, agent_ref, agent_id, session_id, channel, ai_model,
    input_tokens, output_tokens, messages_count, occurred_at } = body;

  if (!session_id) return res.status(400).json({ error: 'session_id is required' });
  if (!external_ref && !client_id && !agent_ref && !agent_id) {
    return res.status(400).json({ error: 'external_ref, client_id, agent_ref or agent_id is required' });
  }

  // Who sent this, and which of their agents?
  //
  // A client can run several agents, so a ref can identify either the client
  // or one of its agents. Agent refs are looked up first when one was named
  // explicitly; otherwise external_ref is tried against clients (which is
  // what every pre-v7 caller means by it) and then against agents, so an
  // existing n8n flow keeps working unchanged while a new one can point
  // straight at an agent.
  let resolvedClientId = client_id || null;
  let resolvedAgentId = null;

  if (agent_id || agent_ref) {
    const { rows } = agent_id
      ? await db.query(`select id, client_id from client_agents where id = $1`, [agent_id])
      : await db.query(`select id, client_id from client_agents where external_ref = $1`, [String(agent_ref).trim()]);
    if (!rows[0]) {
      return res.status(404).json({ error: `No agent found for "${agent_id || agent_ref}". Add it to the client in the CRM first.` });
    }
    resolvedAgentId = rows[0].id;
    resolvedClientId = resolvedClientId || rows[0].client_id;
  }

  if (!resolvedClientId) {
    const { rows } = await db.query(`select id from clients where external_ref = $1`, [external_ref]);
    if (rows[0]) {
      resolvedClientId = rows[0].id;
    } else {
      const { rows: byAgent } = await db.query(
        `select id, client_id from client_agents where external_ref = $1`, [external_ref]
      );
      if (!byAgent[0]) {
        return res.status(404).json({ error: `No client or agent found with external_ref "${external_ref}". Set it on the client record first.` });
      }
      resolvedAgentId = resolvedAgentId || byAgent[0].id;
      resolvedClientId = byAgent[0].client_id;
    }
  }

  // A channel was already being sent; when the event names an agent, the
  // agent's kind is the better answer and overrides a caller that left the
  // default in place.
  let resolvedChannel = channel || 'whatsapp';
  if (resolvedAgentId && !channel) {
    const { rows: kindRows } = await db.query(`select kind from client_agents where id = $1`, [resolvedAgentId]);
    if (kindRows[0] && kindRows[0].kind !== 'automation' && kindRows[0].kind !== 'other') {
      resolvedChannel = kindRows[0].kind;
    }
  }

  const { rows: inserted } = await db.query(
    `insert into usage_events (client_id, agent_id, session_id, channel, ai_model, input_tokens, output_tokens, messages_count, occurred_at, raw_payload)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, now()), $10) returning id`,
    [
      resolvedClientId, resolvedAgentId, session_id, resolvedChannel, ai_model || '',
      input_tokens || 0, output_tokens || 0, messages_count || 1,
      occurred_at || null, JSON.stringify(body),
    ]
  );

  // Return the client's live month-to-date usage and their position against
  // quota, so an n8n flow can react on the spot rather than at month end.
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const { rows: usageRows } = await db.query(
    `select * from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [resolvedClientId, month]
  );

  // Crossing the 80% line or the quota itself is recorded once per client per
  // month, for an admin to decide on. Service is never cut off here — running
  // over quota is a billing question, not a reason to stop answering the
  // customer's customers.
  let quota = null;
  try {
    quota = await recordQuotaCrossing(resolvedClientId, month);
  } catch (err) {
    // Usage must be recorded even if the quota check trips over something;
    // the event is the billable fact, the flag is a convenience.
    console.error('Quota check failed', err);
  }

  res.status(201).json({
    event_id: inserted[0].id,
    client_id: resolvedClientId,
    agent_id: resolvedAgentId,
    month_to_date: usageRows[0] || { sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0 },
    quota,
  });
});

/**
 * GET /api/webhooks/service-status?external_ref=923001234567
 *
 * Ask before replying: should this client's customers be answered right now?
 * n8n calls this at the top of the WhatsApp flow and branches on `allow`.
 *
 *   { "allow": true,  "reason": "ok" }
 *   { "allow": false, "reason": "suspended",  "detail": "..." }
 *   { "allow": false, "reason": "over_quota", "detail": "..." }
 *
 * Out of the box `allow` is always true — the default policy is to keep
 * serving and settle overage on the invoice, which is what the business model
 * assumes. It only starts denying once an admin suspends a client or changes
 * the over-quota policy in Settings.
 *
 * It fails OPEN. If the lookup throws, this answers allow:true rather than
 * 500, because a database hiccup must never take a client's WhatsApp agent
 * off the air. The error is logged for us, not surfaced to the caller.
 */
router.get('/service-status', async (req, res) => {
  const { external_ref, client_id, agent_ref } = req.query;
  if (!external_ref && !client_id && !agent_ref) {
    return res.status(400).json({ error: 'external_ref, client_id or agent_ref is required' });
  }
  try {
    res.json(await serviceStatusFor({ external_ref, client_id, agent_ref }));
  } catch (err) {
    console.error('service-status check failed, allowing', err);
    res.json({ allow: true, reason: 'check_failed', detail: 'The status check failed, so service continues.' });
  }
});

module.exports = router;
