const express = require('express');
const db = require('../db');
const { recordQuotaCrossing } = require('../utils/quota');
const { serviceStatusFor } = require('../utils/serviceStatus');
const { sendMail, mailConfigured } = require('../utils/mailer');
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
  const { external_ref, client_id } = req.query;
  if (!external_ref && !client_id) {
    return res.status(400).json({ error: 'external_ref or client_id is required' });
  }
  try {
    res.json(await serviceStatusFor({ external_ref, client_id }));
  } catch (err) {
    console.error('service-status check failed, allowing', err);
    res.json({ allow: true, reason: 'check_failed', detail: 'The status check failed, so service continues.' });
  }
});

/**
 * POST /api/webhooks/lead
 *
 * Called by the WhatsApp and website agents the moment they have enough to
 * identify a prospect. Deliberately on the webhook scope, not automation:
 * this is machine traffic from the same n8n instance that already posts
 * usage, and issuing it a second, more powerful key just to record a name
 * would be the wrong trade.
 *
 * It is far more forgiving than POST /api/clients, and that is the point.
 * A cold WhatsApp lead has no package, no deal value and often no email
 * yet; demanding them would either block the write or, worse, invite the
 * agent to invent them. Only external_ref is required.
 *
 * Body:
 * {
 *   "external_ref": "923001234567",   // required — the prospect's WhatsApp number, or the web session id
 *   "name": "Ayesha Khan",
 *   "company": "Khan Textiles",
 *   "email": "ayesha@khantextiles.pk",
 *   "phone": "923001234567",
 *   "channel": "whatsapp",            // whatsapp | website | instagram | voice | email
 *   "source": "WhatsApp AI agent",
 *   "notes": "Order tracking on WhatsApp. ~200 msgs/day. Wants it this month."
 * }
 *
 * An existing prospect is never overwritten: a second call fills in the
 * blanks only. Whatever a human has typed into the CRM outranks whatever
 * the agent inferred on the next message.
 */
router.post('/lead', async (req, res) => {
  const body = req.body || {};
  const externalRef = String(body.external_ref || '').trim();
  if (!externalRef) return res.status(400).json({ error: 'external_ref is required' });

  const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
  const incoming = {
    name: text(body.name, 160),
    company: text(body.company, 200),
    email: text(body.email, 200),
    phone: text(body.phone, 40) || externalRef,
    notes: text(body.notes, 4000),
    source: text(body.source, 120) || 'AI agent',
  };

  try {
    const { rows: existingRows } = await db.query(
      `select * from clients where external_ref = $1`, [externalRef]
    );
    const existing = existingRows[0];

    if (existing) {
      // Fill blanks only. A human who corrected a misheard company name must
      // not have it overwritten the next time the agent guesses.
      const fills = ['name', 'company', 'email', 'phone']
        .filter((f) => {
          const current = String(existing[f] || '').trim();
          return (current === '' || current === '—') && incoming[f] !== '';
        });
      const notes = incoming.notes && !String(existing.notes || '').includes(incoming.notes)
        ? [existing.notes, incoming.notes].filter(Boolean).join('\n---\n').slice(0, 8000)
        : existing.notes;

      const sets = fills.map((f, i) => `${f} = $${i + 2}`);
      sets.push(`notes = $${fills.length + 2}`, 'updated_at = now()');
      const { rows } = await db.query(
        `update clients set ${sets.join(', ')} where id = $1 returning *`,
        [existing.id, ...fills.map((f) => incoming[f]), notes]
      );
      return res.json({ ok: true, created: false, client_id: rows[0].id, stage: rows[0].stage, filled: fills });
    }

    // A brand-new prospect starts on the entry package. Staff set the real
    // one when they qualify it; picking here would be a guess with a price
    // attached to it.
    const { rows: productRows } = await db.query(
      `select id from products where archived = false order by sort_order asc, created_at asc limit 1`
    );

    const { rows } = await db.query(
      `insert into clients (name, company, email, phone, external_ref, product_id, stage, est_value, source, notes, join_date)
       values ($1,$2,$3,$4,$5,$6,'lead',0,$7,$8, current_date) returning *`,
      [
        // name and company are NOT NULL. An em dash is an honest placeholder
        // a human can spot in the pipeline; a fabricated name is not.
        incoming.name || '—',
        incoming.company || '—',
        incoming.email,
        incoming.phone,
        externalRef,
        productRows[0] ? productRows[0].id : null,
        incoming.source,
        incoming.notes,
      ]
    );
    const client = rows[0];

    await db.query(
      `insert into client_stage_history (client_id, from_stage, to_stage, comment) values ($1,null,'lead',$2)`,
      [client.id, `Created by ${incoming.source}`.slice(0, 1000)]
    );

    // Notification is best-effort: a mail outage must not cost us the lead
    // row we just wrote, so this never throws into the response.
    notifyNewLead(client, text(body.channel, 40) || 'whatsapp').catch((err) =>
      console.error('lead notification failed', err)
    );

    res.status(201).json({ ok: true, created: true, client_id: client.id, stage: client.stage });
  } catch (err) {
    if (err.code === '23505') {
      // Two agent turns raced. The other one won; that is a success here.
      return res.json({ ok: true, created: false, raced: true });
    }
    throw err;
  }
});

/** Emails whoever is on the notify list that a new lead just arrived. */
async function notifyNewLead(client, channel) {
  if (!mailConfigured()) return;
  let configured = '';
  try {
    const { rows } = await db.query(`select lead_notify_emails from settings limit 1`);
    configured = (rows[0] && rows[0].lead_notify_emails) || '';
  } catch (err) {
    // Settings row or column missing on an un-migrated install — fall back.
  }
  const recipients = (configured || process.env.LEAD_NOTIFY_EMAIL || process.env.MAIL_FROM || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!recipients.length) return;

  const named = client.company && client.company !== '—' ? ` (${client.company})` : '';
  const lines = [
    `A new lead came in through the ${channel} agent.`,
    '',
    `Name:     ${client.name}`,
    `Company:  ${client.company}`,
    `Email:    ${client.email || '—'}`,
    `Phone:    ${client.phone || '—'}`,
    `Ref:      ${client.external_ref}`,
    '',
    client.notes || '(no notes captured yet)',
  ].join('\n');

  await Promise.all(recipients.map((to) =>
    sendMail({ to, subject: `New ${channel} lead: ${client.name}${named}`, text: lines })
  ));
}

/**
 * POST /api/webhooks/conversation
 *
 * Stores what was actually said. The agents keep only a short in-memory
 * buffer that a restart wipes, so without this the transcript behind a
 * lead is gone by the time anyone opens the CRM to read it.
 *
 * Body: { external_ref, session_id, channel, messages: [{ role, content }] }
 * role is "customer" or "agent". Unknown roles are dropped rather than
 * failing the batch — a lost turn is better than a lost conversation.
 */
router.post('/conversation', async (req, res) => {
  const body = req.body || {};
  const externalRef = String(body.external_ref || '').trim();
  if (!externalRef) return res.status(400).json({ error: 'external_ref is required' });

  const CHANNELS = ['whatsapp', 'website', 'instagram', 'voice', 'email'];
  const channel = CHANNELS.includes(body.channel) ? body.channel : 'whatsapp';
  const sessionId = String(body.session_id || '').trim().slice(0, 200);

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const messages = incoming
    .map((m) => ({ role: m && m.role, content: String((m && m.content) ?? '').trim() }))
    .filter((m) => (m.role === 'customer' || m.role === 'agent') && m.content !== '')
    .slice(0, 50);
  if (!messages.length) {
    return res.status(400).json({ error: 'messages must contain at least one customer or agent turn' });
  }

  const { rows: clientRows } = await db.query(`select id from clients where external_ref = $1`, [externalRef]);
  const clientId = clientRows[0] ? clientRows[0].id : null;

  const values = [];
  const placeholders = messages.map((m, i) => {
    const base = i * 6;
    values.push(clientId, externalRef, sessionId, channel, m.role, m.content.slice(0, 8000));
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
  });

  await db.query(
    `insert into conversation_messages (client_id, external_ref, session_id, channel, role, content)
     values ${placeholders.join(',')}`,
    values
  );

  res.status(201).json({ ok: true, stored: messages.length, client_id: clientId });
});

module.exports = router;
