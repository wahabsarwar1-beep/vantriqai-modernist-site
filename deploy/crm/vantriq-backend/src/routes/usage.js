const express = require('express');
const db = require('../db');
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
 *   "external_ref": "923001234567",      // required unless client_id given — the client's WhatsApp number or configured ref
 *   "client_id": "uuid",                 // alternative to external_ref, if n8n already knows Vantriq's internal client id
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
  const { external_ref, client_id, session_id, channel, ai_model,
    input_tokens, output_tokens, messages_count, occurred_at } = body;

  if (!session_id) return res.status(400).json({ error: 'session_id is required' });
  if (!external_ref && !client_id) return res.status(400).json({ error: 'external_ref or client_id is required' });

  let resolvedClientId = client_id;
  if (!resolvedClientId) {
    const { rows } = await db.query(`select id from clients where external_ref = $1`, [external_ref]);
    if (!rows[0]) {
      return res.status(404).json({ error: `No client found with external_ref "${external_ref}". Set it on the client record first.` });
    }
    resolvedClientId = rows[0].id;
  }

  const { rows: inserted } = await db.query(
    `insert into usage_events (client_id, session_id, channel, ai_model, input_tokens, output_tokens, messages_count, occurred_at, raw_payload)
     values ($1,$2,$3,$4,$5,$6,$7, coalesce($8, now()), $9) returning id`,
    [
      resolvedClientId, session_id, channel || 'whatsapp', ai_model || '',
      input_tokens || 0, output_tokens || 0, messages_count || 1,
      occurred_at || null, JSON.stringify(body),
    ]
  );

  // Return the client's live month-to-date usage so n8n / a bot flow can
  // react immediately (e.g. flag when a client is approaching quota).
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const { rows: usageRows } = await db.query(
    `select * from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [resolvedClientId, month]
  );

  res.status(201).json({
    event_id: inserted[0].id,
    client_id: resolvedClientId,
    month_to_date: usageRows[0] || { sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0 },
  });
});

module.exports = router;
