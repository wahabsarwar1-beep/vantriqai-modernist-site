const express = require('express');
const db = require('../db');
const { recordQuotaCrossing } = require('../utils/quota');
const { serviceStatusFor } = require('../utils/serviceStatus');
const { sendMail, mailConfigured } = require('../utils/mailer');
const S = require('../utils/surveys');
const C = require('../utils/contacts');
const router = express.Router();
const { validatePulse } = require('../utils/pulseAdvanced');
const { validateSiteEvent, recordSiteEvent } = require('../utils/siteAnalytics');

router.post('/site-event', async (req,res) => {
  try { validateSiteEvent(req.body); } catch(err){return res.status(400).json({error:err.message});}
  try { await recordSiteEvent(req.body);res.json({ok:true}); } catch(err){ console.error('[site-event]',err.message);res.status(500).json({error:'Could not record website activity'}); }
});

/** Non-billable, idempotent outcome/timing telemetry; protected by the existing webhook scope. */
router.post('/pulse-event', async (req,res) => {
  const body=req.body||{},uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let data;
  try {
    data=validatePulse(body.data);
    for(const key of ['client_id','agent_id']) if(body[key]&&!uuid.test(body[key]))throw new Error(key+' must be a UUID');
    for(const [key,max] of [['session_id',200],['event_id',128]])if(typeof body[key]!=='string'||!body[key].trim()||body[key].length>max)throw new Error(key+' is required (maximum '+max+' characters)');
    if(body.occurred_at && (!Number.isFinite(Date.parse(body.occurred_at))||Date.parse(body.occurred_at)>Date.now()+300000))throw new Error('occurred_at must be a valid timestamp, no more than five minutes ahead');
  } catch(err){return res.status(400).json({error:err.message});}
  try {
    let clientId=body.client_id||null,agentId=null;
    if(body.agent_id||body.agent_ref){
      const {rows}=await db.query('select id,client_id from client_agents where '+(body.agent_id?'id=$1':'external_ref=$1'),[body.agent_id||body.agent_ref]);
      if(!rows[0])return res.status(404).json({error:'Agent not found'});
      if(clientId&&clientId!==rows[0].client_id)return res.status(400).json({error:'Agent does not belong to this client'});
      clientId=rows[0].client_id;agentId=rows[0].id;
    }
    if(!clientId&&body.external_ref){
      const {rows}=await db.query('select id from clients where external_ref=$1',[body.external_ref]);
      if(rows[0])clientId=rows[0].id;
      else {const {rows:agents}=await db.query('select id,client_id from client_agents where external_ref=$1',[body.external_ref]);if(agents[0]){clientId=agents[0].client_id;agentId=agents[0].id;}}
    }
    if(!clientId)return res.status(400).json({error:'A valid client_id, external_ref, agent_id or agent_ref is required'});
    const {rows:clients}=await db.query('select id from clients where id=$1',[clientId]);if(!clients[0])return res.status(404).json({error:'Client not found'});
    const session=body.session_id.trim(),event=body.event_id.trim();
    const {rows}=await db.query(`insert into pulse_events(client_id,agent_id,session_id,event_id,occurred_at,data)
      values($1,$2,$3,$4,coalesce($5::timestamptz,now()),$6::jsonb) on conflict(client_id,event_id) do nothing returning id`,[clientId,agentId,session,event,body.occurred_at||null,JSON.stringify(data)]);
    if(!rows.length){
      const {rows:existing}=await db.query(`select id,(session_id=$2 and data=$3::jsonb and agent_id is not distinct from $4::uuid) matches from pulse_events where client_id=$1 and event_id=$5`,[clientId,session,JSON.stringify(data),agentId,event]);
      if(!existing[0]?.matches)return res.status(409).json({error:'event_id already exists with different measurements'});
      return res.json({event_id:event,duplicate:true});
    }
    res.status(201).json({event_id:event,duplicate:false});
  }catch(err){console.error('[pulse-event]',err.message);res.status(500).json({error:'Could not record Pulse measurements'});}
});

/**
 * What a caller says about the customer, in whichever shape it sends it:
 * { contact: { name, email, city, gender, age_band, company } } or the same
 * fields at the top level (contact_name, contact_email, city, gender, …).
 */
function contactFields(body) {
  const c = body && typeof body.contact === 'object' && body.contact ? body.contact : {};
  return {
    name: c.name || body.contact_name || body.name || '',
    email: c.email || body.contact_email || body.email || '',
    city: c.city || body.contact_city || body.city || '',
    gender: c.gender || body.gender || '',
    age_band: c.age_band || body.age_band || '',
    company: c.company || body.contact_company || '',
    phone: c.phone || body.contact_phone || '',
  };
}

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
 *   "channel": "whatsapp",               // whatsapp | web | voice | instagram | facebook
 *   "ai_model": "claude-sonnet-4-6",
 *   "input_tokens": 812,
 *   "output_tokens": 340,
 *   "messages_count": 1,
 *   "handoff": false,                    // optional — true if a human had to take over (drives AI containment)
 *   "occurred_at": "2026-08-16T10:32:00Z", // optional, defaults to now()
 *   "contact_name": "Ayesha"             // optional — the customer's WhatsApp profile name; also contact_email,
 *                                        // city, gender, age_band, or all of them as "contact": { … }.
 *                                        // Fills blanks on the customer's profile; never overwrites.
 * }
 *
 * n8n gets input_tokens/output_tokens straight from the AI provider's
 * response JSON (Claude, OpenAI, and DeepSeek all return a `usage` object
 * on every completion) — no extra computation needed on the n8n side.
 */
router.post('/usage', async (req, res) => {
  const body = req.body || {};
  const { external_ref, client_id, agent_ref, agent_id, session_id, channel, ai_model,
    input_tokens, output_tokens, messages_count, occurred_at, handoff } = body;

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
    `insert into usage_events (client_id, agent_id, session_id, channel, ai_model, input_tokens, output_tokens, messages_count, occurred_at, raw_payload, handoff)
     values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, now()), $10, $11) returning id`,
    [
      resolvedClientId, resolvedAgentId, session_id, resolvedChannel, ai_model || '',
      input_tokens || 0, output_tokens || 0, messages_count || 1,
      occurred_at || null, JSON.stringify(body),
      // Left null unless the flow actually says, so containment is never
      // claimed for an agent that does not report handoffs at all.
      typeof handoff === 'boolean' ? handoff : null,
    ]
  );

  // Return the client's live month-to-date usage and their position against
  // quota, so an n8n flow can react on the spot rather than at month end.
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const { rows: usageRows } = await db.query(
    `select * from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [resolvedClientId, month]
  );

  // Whatever the flow knows about the customer — the WhatsApp profile name at
  // least — fills the blanks on their profile. Never fails the event.
  await C.fillProfile(resolvedClientId, C.keyOf(session_id), contactFields(body), { source: resolvedChannel })
    .catch((err) => console.error('[usage] contact profile not updated:', err.message));

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
 *   "channel": "whatsapp",            // whatsapp | website | instagram | facebook | voice | email
 *   "source": "WhatsApp AI agent",
 *   "notes": "Order tracking on WhatsApp. ~200 msgs/day. Wants it this month."
 * }
 *
 * An existing prospect is never overwritten: a second call fills in the
 * blanks only. Whatever a human has typed into the CRM outranks whatever
 * the agent inferred on the next message.
 */
// Agent booking is separate from lead capture: a failed booking never loses a lead.
router.post('/appointment', async(req,res)=>{
  const {createEvent}=require('../utils/calendar');
  const saved=await createEvent(req.body||{},'AI agent webhook',true);
  res.status(saved.created?201:200).json({ok:true,created:saved.created,event_id:saved.event.id,client_id:saved.event.client_id});
});

router.post('/lead', async (req, res) => {
  const body = req.body || {};
  const externalRef = String(body.external_ref || '').trim();
  if (!externalRef) return res.status(400).json({ error: 'external_ref is required' });

  const text = (v, max = 500) => String(v ?? '').trim().slice(0, max);
  const incoming = {
    name: text(body.name, 160),
    company: text(body.company, 200),
    email: text(body.email, 200),
    // A WhatsApp lead's ref is its number, so it doubles as the phone. An
    // Instagram or Messenger ref ('ig-…', 'fb-…') is not a phone number.
    phone: text(body.phone, 40) || (/^\+?\d{7,15}$/.test(externalRef) ? externalRef : ''),
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
  const recipients = await teamRecipients();
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

// Time and delivery values as n8n sends them — see POST /api/webhooks/conversation.
const YEAR_MS = 366 * 86400000;
const ALERT_FRESH_MS = 30 * 60000;

function spokenAt(v) {
  if (v === undefined || v === null || v === '') return null;
  const numeric = typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim());
  // Seconds (WhatsApp, Unix) or milliseconds (JavaScript) — told apart by size.
  const ms = numeric ? (Number(v) < 1e11 ? Number(v) * 1000 : Number(v)) : Date.parse(String(v));
  if (!Number.isFinite(ms)) return null;
  const now = Date.now();
  return ms < now - YEAR_MS || ms > now + 10 * 60000 ? null : new Date(ms);
}

const isFalse = (v) => v === false || v === 'false';
const isTrue = (v) => v === true || v === 'true';

/**
 * POST /api/webhooks/conversation
 *
 * Stores what was actually said. The agents keep only a short in-memory
 * buffer that a restart wipes, so without this the transcript behind a
 * lead is gone by the time anyone opens the CRM to read it.
 *
 * Body: { external_ref, session_id, channel, messages: [{ role, content, at, id, delivered, error }] }
 * role is "customer" or "agent". Unknown roles are dropped rather than
 * failing the batch — a lost turn is better than a lost conversation.
 *
 *   external_ref  the client's ref, or one of its agents' (the number or site a
 *                 customer's customers write to) — or name the agent outright
 *                 with agent_ref / agent_id, exactly as /usage takes them. A ref
 *                 the CRM does not know still lands with whichever agent
 *                 metered the same session_id, when exactly one did.
 *   session_id    the conversation: "<customer>-<YYYY-MM-DD>", as /usage names
 *                 it. One sent without its day (a website chat's own id) gets
 *                 the day /usage filed that chat under, or else the day its
 *                 first line was said, UTC.
 *
 *   at         when it was said: ISO 8601, or Unix seconds / milliseconds
 *              (WhatsApp's own timestamp). Defaults to now. A time more than
 *              a year back or in the future is not trusted, and now is used.
 *   id         the channel's id for the message (a WhatsApp wamid). A message
 *              already stored under that id is skipped, so an n8n retry or a
 *              history backfill run twice never doubles a transcript.
 *   delivered  false, with error, for a reply the agent wrote but the channel
 *              refused. Given at the top level it applies to the batch's
 *              agent lines. The customer's words are kept either way; a fresh
 *              failure emails the team, at most once an hour per agent.
 */
router.post('/conversation', async (req, res) => {
  const body = req.body || {};
  const externalRef = String(body.external_ref || '').trim();
  if (!externalRef) return res.status(400).json({ error: 'external_ref is required' });

  // 'facebook' is Facebook Messenger.
  const CHANNELS = ['whatsapp', 'website', 'instagram', 'facebook', 'voice', 'email'];
  const channel = CHANNELS.includes(body.channel) ? body.channel : 'whatsapp';
  let sessionId = String(body.session_id || '').trim().slice(0, 200);
  const batchDelivered = !isFalse(body.delivered);
  const batchError = String(body.error || '').trim();

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const seen = new Set();
  const messages = incoming
    .map((m) => {
      const x = m || {};
      const delivered = x.role !== 'agent' ? true : isFalse(x.delivered) ? false : isTrue(x.delivered) ? true : batchDelivered;
      const id = x.id == null || String(x.id).trim() === '' ? null : String(x.id).trim().slice(0, 200);
      return {
        role: x.role,
        content: String(x.content ?? '').trim(),
        at: spokenAt(x.at),
        id,
        delivered,
        error: delivered ? '' : (String(x.error || batchError).trim() || 'The channel did not accept the reply.').slice(0, 500),
      };
    })
    .filter((m) => (m.role === 'customer' || m.role === 'agent') && m.content !== '')
    // The same id twice in one batch is one message.
    .filter((m) => !m.id || (!seen.has(m.id) && seen.add(m.id)))
    .slice(0, 50);
  if (!messages.length) {
    return res.status(400).json({ error: 'messages must contain at least one customer or agent turn' });
  }

  // A conversation is a customer and a day, the way usage names it. A website
  // chat sends its own id with no day, and its words then never met its
  // counts: the customer's page showed the conversation twice, once empty.
  // The day is the one usage filed this chat under, whatever clock the sender
  // keeps (never more than a day either side of UTC); failing that, the day
  // its first line was said, UTC.
  if (sessionId && !/-\d{4}-\d{2}-\d{2}$/.test(sessionId)) {
    const first = messages.find((m) => m.at);
    const at = first ? first.at : new Date();
    const chat = sessionId.slice(0, 188); // room for the day within the 200 kept
    const days = [-1, 0, 1].map((d) => `${chat}-${new Date(at.getTime() + d * 86400000).toISOString().slice(0, 10)}`);
    const { rows: filed } = await db.query(
      `select session_id from usage_events where session_id = any($1::text[])
        order by abs(extract(epoch from occurred_at - $2::timestamptz)) limit 1`,
      [days, at.toISOString()]
    );
    sessionId = filed[0] ? filed[0].session_id : days[1];
  }

  // Whose conversation? The agent named outright, as /usage takes it; or the
  // ref is a client's (a lead filed as wa-<number>, or a customer) or one of a
  // client's agents — the number or site a customer's customers write to.
  let clientId = null;
  let agentId = null;
  if (body.agent_id || body.agent_ref) {
    const { rows: named } = body.agent_id
      ? await db.query(`select id, client_id from client_agents where id::text = $1`, [String(body.agent_id)])
      : await db.query(`select id, client_id from client_agents where external_ref = $1`, [String(body.agent_ref).trim()]);
    if (named[0]) { agentId = named[0].id; clientId = named[0].client_id; }
  }
  if (!clientId) {
    const { rows: clientRows } = await db.query(`select id from clients where external_ref = $1`, [externalRef]);
    clientId = clientRows[0] ? clientRows[0].id : null;
  }
  if (!clientId) {
    const { rows: ag } = await db.query(`select id, client_id from client_agents where external_ref = $1`, [externalRef]);
    if (ag[0]) { agentId = ag[0].id; clientId = ag[0].client_id; }
  }
  // A ref nobody knows still belongs to whoever metered this conversation —
  // provided exactly one client's agent did. The website assistant logged its
  // lines under 'web-<chat id>', no client's ref, and for weeks they were
  // stored but belonged to no business, so no Customers page could show them.
  if (!clientId && sessionId) {
    const { rows: metered } = await db.query(
      `select distinct client_id, agent_id from usage_events where session_id = $1`, [sessionId]
    );
    if (metered.length === 1) { clientId = metered[0].client_id; agentId = metered[0].agent_id; }
  }

  const COLS = ['client_id', 'external_ref', 'session_id', 'channel', 'role', 'content', 'agent_id', 'external_id', 'delivered', 'delivery_error', 'created_at'];
  const values = [];
  // A batch shares one "now"; a millisecond apart each keeps the turns in the
  // order they were said when a transcript is read back — also when two lines
  // carry the same one-second WhatsApp timestamp.
  const placeholders = messages.map((m, i) => {
    const base = i * COLS.length;
    values.push(clientId, externalRef, sessionId, channel, m.role, m.content.slice(0, 8000), agentId,
      m.id, m.delivered, m.error, m.at ? m.at.toISOString() : null);
    const p = COLS.map((_, j) => `$${base + j + 1}`);
    p[COLS.length - 1] = `coalesce(${p[COLS.length - 1]}::timestamptz, now()) + interval '${i} milliseconds'`;
    return `(${p.join(',')})`;
  });

  const { rows: stored } = await db.query(
    `insert into conversation_messages (${COLS.join(', ')})
     values ${placeholders.join(',')}
     on conflict (external_ref, external_id) where external_id is not null do nothing
     returning role, content, delivered, delivery_error, created_at`,
    values
  );
  if (agentId && sessionId) {
    await C.fillProfile(clientId, C.keyOf(sessionId), contactFields(body), { source: channel })
      .catch((err) => console.error('[conversation] contact profile not updated:', err.message));
  }

  // A reply that never reached the customer is somebody's problem right now:
  // nobody who writes in is being answered. Only a fresh one alerts — a
  // backfill of last week's failures is history, not news.
  const failed = stored.find((r) => r.role === 'agent' && r.delivered === false
    && Date.now() - new Date(r.created_at).getTime() < ALERT_FRESH_MS);
  if (failed) {
    const said = stored.filter((r) => r.role === 'customer').map((r) => r.content).join('\n');
    notifyUndelivered({ ref: agentId || clientId || externalRef, clientId, agentId, externalRef, sessionId, channel, said, error: failed.delivery_error, at: failed.created_at })
      .catch((err) => console.error('[conversation] undelivered-reply alert failed:', err.message));
  }

  res.status(stored.length ? 201 : 200).json({
    ok: true, stored: stored.length, duplicates: messages.length - stored.length,
    undelivered: stored.filter((r) => r.delivered === false).length, client_id: clientId, agent_id: agentId,
  });
});

/** Everyone on the team's notify list: the CRM setting, then the environment. */
async function teamRecipients() {
  let configured = '';
  try {
    const { rows } = await db.query(`select lead_notify_emails from settings limit 1`);
    configured = (rows[0] && rows[0].lead_notify_emails) || '';
  } catch (err) {
    // Settings row or column missing on an un-migrated install — fall back.
  }
  // Semicolons as well as commas: mail clients separate addresses with a
  // semicolon, so that is what people paste in. Accepting only commas turns
  // the whole list into one malformed address and every send fails — and it
  // fails quietly, which is the worst way for an alert to break.
  // TEAM_NOTIFY_EMAIL is where the rest of the app sends internal alerts, so
  // it belongs in this chain. MAIL_FROM stays at the end because installs
  // predating its removal may still have it set, and losing an alert to
  // a rename would be a silent regression.
  return (configured
    || process.env.LEAD_NOTIFY_EMAIL
    || process.env.TEAM_NOTIFY_EMAIL
    || process.env.MAIL_FROM
    || '')
    .split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Tells the team a customer went unanswered: the channel refused the reply, or
 * the AI model never wrote one. One email an hour per agent while it lasts:
 * the first says what broke, later ones how many more messages went
 * unanswered in between.
 */
async function notifyUndelivered({ ref, clientId, agentId, sessionId, channel, said, error, at }) {
  if (!mailConfigured()) return;
  const { rows: due } = await db.query(
    `update delivery_alerts d set last_sent_at = now(), failures_since = 0
       from (select failures_since as missed from delivery_alerts where ref = $1) o
      where d.ref = $1 and d.last_sent_at < now() - interval '1 hour'
      returning o.missed`,
    [String(ref)]
  );
  let missed = 0;
  if (due[0]) {
    missed = due[0].missed || 0;
  } else {
    const { rows: first } = await db.query(
      `insert into delivery_alerts (ref) values ($1)
       on conflict (ref) do update set failures_since = delivery_alerts.failures_since + 1
       returning (xmax = 0) as fresh`,
      [String(ref)]
    );
    if (!first[0] || !first[0].fresh) return; // already told within the hour
  }
  const to = await teamRecipients();
  if (!to.length) return;

  const { rows: who } = await db.query(
    `select c.company, a.name as agent from clients c left join client_agents a on a.id = $2 where c.id = $1`,
    [clientId, agentId]
  );
  const company = who[0] && who[0].company ? who[0].company : '';
  const agent = (who[0] && who[0].agent) || `${channel} agent`;
  const key = C.keyOf(sessionId);
  const phone = /^\d{8,15}$/.test(key);
  // A website visitor has no number: "Web visitor 1b2c3d", as Customers names them.
  const number = phone ? `+${key}` : key ? C.labelOf(key) : 'unknown';
  const when = new Date(at || Date.now()).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  // Two causes so far, each with its own fix: WhatsApp refusing the send (the
  // access token), and the AI model refusing to write the reply (the API key).
  const aiFailed = /AI model|OpenAI|API key/i.test(error) && !/Cannot call API/i.test(error);
  const lines = [
    `${company ? `${company}'s ` : ''}${agent} could not answer a customer: ${aiFailed ? 'no reply was written' : 'the reply never reached them'}.`,
    '',
    `Customer:   ${number}`,
    `They said:  ${said ? `"${said.slice(0, 400)}"` : '(not recorded)'}`,
    `When:       ${when} (Karachi)`,
    `Why:        ${error}`,
    '',
    'Until this is fixed, customers who write in are not being answered.',
    phone ? `Reply to this one yourself: https://wa.me/${key}`
      : channel === 'website' ? 'A website visitor can only be written back to if they left their details in the chat.'
      : channel === 'instagram' ? 'Reply to them yourself from the Instagram inbox (Meta Business Suite → Inbox).'
      : channel === 'facebook' ? 'Reply to them yourself from the Page inbox (Meta Business Suite → Inbox).' : '',
    'The conversation is in the CRM, under Customers.',
    '',
    !aiFailed && (channel === 'instagram' || channel === 'facebook') && /OAuth|token|permission/i.test(error)
      ? 'This usually means the Page access token in n8n has expired or lost a permission. Generate a new Page token (pages_messaging, and instagram_manage_messages for Instagram) and paste it into n8n → Credentials → "VantriqAI Page Access Token".'
      : '',
    !aiFailed && channel !== 'instagram' && channel !== 'facebook' && /WhatsApp|Cannot call API|OAuth|token/i.test(error)
      ? 'This usually means the WhatsApp access token in n8n has expired or lost its access. Create a new one in Meta Business Settings → System users (permissions whatsapp_business_messaging and whatsapp_business_management), and paste it into n8n → Credentials → "WhatsApp account".'
      : '',
    aiFailed
      ? 'The AI service refused the request: check the OpenAI credential the agent uses in n8n (a revoked or mistyped API key, or no credit left on the OpenAI account).'
      : '',
    missed ? `${missed} more ${missed === 1 ? 'message' : 'messages'} went unanswered since the last email.` : '',
    'You get at most one of these an hour while the problem lasts.',
  ].filter((l, i, all) => l !== '' || (all[i - 1] !== '' && i > 0));

  await Promise.all(to.map((addr) =>
    sendMail({ to: addr, subject: `Customer not answered: ${number}${company ? ` (${company})` : ''}`, text: lines.join('\n') })
  ));
}

/**
 * POST /api/webhooks/csat
 *
 * A customer-satisfaction answer, from whatever asked the question — a
 * WhatsApp button reply at the end of a conversation, a web form, or a
 * separate survey app. One call per answer.
 *
 * Body:
 * {
 *   "external_ref": "923001234567",   // or client_id / agent_ref / agent_id, exactly as /usage
 *   "session_id": "923009998888-2026-08-16", // optional — the conversation being rated
 *   "channel": "whatsapp",
 *   "score": 5,          // optional — CSAT, 1 to 5
 *   "nps": 9,            // optional — 0 to 10
 *   "resolved": true,    // optional — "did we sort out what you needed?"
 *   "comment": "Quick and clear, thanks",
 *   "source": "survey-app",
 *   "external_id": "resp_8f2c", // optional — your id for this answer; a repeat is ignored, not double-counted
 *   "responded_at": "2026-08-16T11:02:00Z" // optional, defaults to now()
 * }
 *
 * At least one of score, nps or resolved is required.
 */
/**
 * POST /api/webhooks/contact
 *
 * What an agent learned about a customer during the conversation — "I'm
 * Ayesha, from Lahore" — saved to their profile so it shows in the CRM, the
 * business's portal (Customers) and every report.
 *
 * Body: { external_ref | agent_ref | client_id, session_id | phone,
 *         name, email, city, gender, age_band, company }
 * Fills blanks only: anything a person has typed into the profile stays.
 */
router.post('/contact', async (req, res) => {
  const body = req.body || {};
  let clientId = null;
  try {
    if (body.agent_ref || body.agent_id) {
      const { rows } = body.agent_id
        ? await db.query(`select client_id from client_agents where id = $1`, [body.agent_id])
        : await db.query(`select client_id from client_agents where external_ref = $1`, [String(body.agent_ref).trim()]);
      clientId = rows[0] ? rows[0].client_id : null;
    } else if (body.client_id) {
      const { rows } = await db.query(`select id from clients where id = $1`, [body.client_id]);
      clientId = rows[0] ? rows[0].id : null;
    } else if (body.external_ref) {
      const ref = String(body.external_ref).trim();
      const { rows } = await db.query(
        `select id as client_id from clients where external_ref = $1
         union all select client_id from client_agents where external_ref = $1 limit 1`, [ref]);
      clientId = rows[0] ? rows[0].client_id : null;
    } else {
      return res.status(400).json({ error: 'external_ref, agent_ref or client_id is required' });
    }
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That id is not valid.' });
    throw err;
  }
  if (!clientId) return res.status(404).json({ error: 'No client or agent found for that reference.' });
  const key = String(body.contact_key || '').trim() || C.keyOf(body.session_id) || C.phoneDigits(body.phone);
  if (!key) return res.status(400).json({ error: 'session_id or phone is required, to know who this is.' });
  // The number is who they are, not news about them: something else must come with it.
  const fields = { ...contactFields(body), phone: '' };
  const touched = await C.fillProfile(clientId, key, fields, { source: 'agent' });
  if (!touched) return res.status(400).json({ error: 'Nothing to save: send at least one of name, email, city, gender, age_band, company.' });
  const { rows } = await db.query(`select * from contacts where client_id = $1 and contact_key = $2`, [clientId, key]);
  res.status(201).json({ ok: true, client_id: clientId, contact_key: key, profile: rows[0] });
});

router.post('/csat', (req, res, next) => recordCsat(req, res).catch((err) => {
  // A malformed uuid is the caller's mistake, not a server fault.
  if (err.code === '22P02') return res.status(400).json({ error: 'client_id or agent_id is not a valid id' });
  next(err);
}));

async function recordCsat(req, res) {
  const body = req.body || {};
  const { external_ref, client_id, agent_ref, agent_id } = body;
  if (!external_ref && !client_id && !agent_ref && !agent_id) {
    return res.status(400).json({ error: 'external_ref, client_id, agent_ref or agent_id is required' });
  }

  const intIn = (v, lo, hi) => {
    if (v === undefined || v === null || v === '') return { ok: true, v: null };
    const n = Number(v);
    return Number.isInteger(n) && n >= lo && n <= hi ? { ok: true, v: n } : { ok: false };
  };
  const score = intIn(body.score, 1, 5);
  if (!score.ok) return res.status(400).json({ error: 'score must be a whole number from 1 to 5' });
  const nps = intIn(body.nps, 0, 10);
  if (!nps.ok) return res.status(400).json({ error: 'nps must be a whole number from 0 to 10' });
  if (body.resolved !== undefined && body.resolved !== null && typeof body.resolved !== 'boolean') {
    return res.status(400).json({ error: 'resolved must be true or false' });
  }
  const resolved = typeof body.resolved === 'boolean' ? body.resolved : null;
  if (score.v == null && nps.v == null && resolved == null) {
    return res.status(400).json({ error: 'At least one of score, nps or resolved is required' });
  }
  let respondedAt = null;
  if (body.responded_at) {
    const d = new Date(body.responded_at);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: 'responded_at is not a valid date' });
    respondedAt = d.toISOString();
  }

  // Same resolution order as /usage: a named agent first, then the client's
  // own ref, then any agent's ref.
  let resolvedClientId = client_id || null;
  let resolvedAgentId = null;
  if (agent_id || agent_ref) {
    const { rows } = agent_id
      ? await db.query(`select id, client_id from client_agents where id = $1`, [agent_id])
      : await db.query(`select id, client_id from client_agents where external_ref = $1`, [String(agent_ref).trim()]);
    if (!rows[0]) return res.status(404).json({ error: `No agent found for "${agent_id || agent_ref}".` });
    resolvedAgentId = rows[0].id;
    resolvedClientId = resolvedClientId || rows[0].client_id;
  }
  if (!resolvedClientId) {
    const { rows } = await db.query(`select id from clients where external_ref = $1`, [external_ref]);
    if (rows[0]) resolvedClientId = rows[0].id;
    else {
      const { rows: byAgent } = await db.query(`select id, client_id from client_agents where external_ref = $1`, [external_ref]);
      if (!byAgent[0]) return res.status(404).json({ error: `No client or agent found with external_ref "${external_ref}".` });
      resolvedAgentId = byAgent[0].id;
      resolvedClientId = byAgent[0].client_id;
    }
  }

  const text = (v, max) => String(v ?? '').trim().slice(0, max);
  const externalId = text(body.external_id, 200) || null;
  const { rows } = await db.query(
    `insert into csat_responses (client_id, agent_id, session_id, channel, score, nps, resolved, comment, source, external_id, responded_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce($11::timestamptz, now()))
     on conflict (client_id, external_id) where external_id is not null do nothing
     returning id`,
    [
      resolvedClientId, resolvedAgentId, text(body.session_id, 200), text(body.channel, 40) || 'whatsapp',
      score.v, nps.v, resolved, text(body.comment, 2000), text(body.source, 120), externalId, respondedAt,
    ]
  );
  if (!rows[0]) return res.json({ ok: true, duplicate: true, client_id: resolvedClientId });
  res.status(201).json({ ok: true, id: rows[0].id, client_id: resolvedClientId, agent_id: resolvedAgentId });
}

/**
 * POST /api/webhooks/survey-invite
 *
 * A personal survey link for the customer an agent has been talking to — n8n
 * sends it back on the same channel, and the answer is tied to that
 * conversation: it lands with its session id, and the survey's response rate
 * counts it.
 *
 * Body:
 * {
 *   "external_ref": "923001234567",   // or client_id / agent_ref / agent_id, exactly as /usage
 *   "session_id": "923009998888-2026-08-16", // the conversation it follows
 *   "channel": "whatsapp",            // how the link will be sent
 *   "language": "ur",                 // optional — what the customer wrote in (en | ur)
 *   "survey_slug": "khans-kitchen-3f2a1", // optional — otherwise the client's live
 *                                        // after-chat survey, or its newest live one
 *
 *   // Optional: "only if the conversation is over". Without quiet_minutes the
 *   // link is made at once. With it, n8n can ask after every reply and hear
 *   // yes exactly once per conversation — see chatRules in utils/surveys.js.
 *   "quiet_minutes": 55, "min_messages": 2, "within_hours": 23, "once_per_days": 14,
 *   "send_from": 9, "send_until": 21, "timezone": "Asia/Karachi",
 *   "dry_run": false                  // true: say what would happen, make nothing
 * }
 *
 * 201 { due: true, code: 'due', url, token, language, text, message: { en, ur }, survey: { slug, title } }
 *     — send `text` (the message in the customer's language).
 * 200 { due: false, code, reason, retry_at? } — not now: still_talking, too_short,
 *     already_asked, asked_recently, window_closed, no_conversation, or night
 *     (ask again at retry_at). Only with quiet_minutes.
 * 403 (code surveys_disabled) when surveys are not switched on for the client.
 * 404 when the client has no live survey — create one in the CRM or the portal.
 */
router.post('/survey-invite', async (req, res) => {
  const body = req.body || {};
  const { external_ref, client_id, agent_ref, agent_id } = body;
  if (!external_ref && !client_id && !agent_ref && !agent_id) {
    return res.status(400).json({ error: 'external_ref, client_id, agent_ref or agent_id is required' });
  }
  const rules = S.chatRules(body);
  const sessionId = String(body.session_id || '').trim();
  if (rules && !sessionId) {
    return res.status(400).json({ error: 'session_id is required with quiet_minutes: it is the conversation that has to be over.' });
  }

  // Same resolution order as /usage and /csat: a named agent first, then the
  // client's own ref, then any agent's ref.
  let clientId = client_id || null;
  if (agent_id || agent_ref) {
    const { rows } = agent_id
      ? await db.query(`select client_id from client_agents where id = $1`, [agent_id])
      : await db.query(`select client_id from client_agents where external_ref = $1`, [String(agent_ref).trim()]);
    if (!rows[0]) return res.status(404).json({ error: `No agent found for "${agent_id || agent_ref}".` });
    clientId = clientId || rows[0].client_id;
  }
  if (!clientId) {
    const { rows } = await db.query(`select id from clients where external_ref = $1`, [external_ref]);
    if (rows[0]) clientId = rows[0].id;
    else {
      const { rows: byAgent } = await db.query(`select client_id from client_agents where external_ref = $1`, [external_ref]);
      if (!byAgent[0]) return res.status(404).json({ error: `No client or agent found with external_ref "${external_ref}".` });
      clientId = byAgent[0].client_id;
    }
  }

  // An add-on an admin switches on per client: without it, no survey is
  // sent, whatever the agent's flow asks for.
  const { rows: [on] } = await db.query(`select surveys_enabled from clients where id = $1`, [clientId]);
  if (!on || !on.surveys_enabled) {
    return res.status(403).json({
      error: 'Vantriq Echo (customer-satisfaction surveys) is not switched on for this client. An admin turns it on in the CRM.',
      code: 'surveys_disabled',
    });
  }

  let survey;
  if (body.survey_slug) {
    survey = await S.getSurveyBySlug(body.survey_slug);
    if (!survey || survey.client_id !== clientId) return res.status(404).json({ error: `No survey "${body.survey_slug}" for this client.` });
    if (survey.status !== 'live' || S.isClosed(survey)) return res.status(409).json({ error: `Survey "${survey.slug}" is not live.` });
  } else {
    survey = await S.defaultSurveyFor(clientId);
    if (!survey) return res.status(404).json({ error: 'This client has no live survey. Create one in the CRM or the portal first.' });
  }
  const about = { slug: survey.slug, title: survey.title };
  const channel = body.channel || 'whatsapp';

  let invite;
  if (rules) {
    const verdict = await S.chatInvite({ survey, clientId, sessionId, channel, rules, dryRun: !!body.dry_run });
    const { invite: made, ...said } = verdict;
    if (!verdict.due || body.dry_run) return res.json({ ...said, ...(body.dry_run ? { dry_run: true } : {}), survey: about });
    invite = made;
  } else {
    [invite] = await S.createInvites(survey, { sessionId, channel });
  }

  // The survey opens in the language the customer wrote in, when it has it.
  const asked = String(body.language || '').toLowerCase();
  const language = (survey.languages || []).includes(asked) ? asked : survey.default_language;
  const url = `${S.publicBase(req)}/s/${survey.slug}?i=${invite.token}${asked === language ? `&lang=${language}` : ''}`;
  const message = S.inviteMessage(survey, url, { chat: !!sessionId });
  res.status(201).json({
    due: true,
    code: 'due',
    url,
    token: invite.token,
    language,
    text: message[language] || message.en,
    message,
    survey: about,
  });
});

module.exports = router;
