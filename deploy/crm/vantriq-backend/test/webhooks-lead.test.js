/**
 * Unit tests for the two agent-facing webhook routes, /lead and
 * /conversation.
 *
 * Unlike the api-*.test.js suites these need no Postgres and no running
 * server: the db and mailer modules are stubbed in the require cache and
 * the real router is mounted on a throwaway express app. That makes them
 * safe to run anywhere, including CI.
 *
 *   node test/webhooks-lead.test.js
 */
const path = require('path');
const assert = require('assert');
const express = require('express');

const SRC = path.join(__dirname, '..', 'src');

// With no lead_notify_emails configured, the route falls back to MAIL_FROM so
// a fresh install still reaches somebody. Set it here to exercise that path.
process.env.MAIL_FROM = 'support@vantriqai.com';
delete process.env.LEAD_NOTIFY_EMAIL;

// --- stubs ------------------------------------------------------------
const state = { clients: [], agents: [], usage: [], products: [{ id: 'uuid-starter', sort_order: 1 }], conversations: [], alerts: {}, stageHistory: [], settings: { lead_notify_emails: '' } };
const sent = [];
let nextId = 1;

const dbStub = {
  async query(sql, params = []) {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('select * from clients where external_ref')) {
      return { rows: state.clients.filter((c) => c.external_ref === params[0]) };
    }
    if (q.startsWith('select id from clients where external_ref')) {
      const hit = state.clients.find((c) => c.external_ref === params[0]);
      return { rows: hit ? [{ id: hit.id }] : [] };
    }
    if (q.startsWith('select id from products')) {
      return { rows: state.products.map((p) => ({ id: p.id })) };
    }
    if (q.startsWith('select lead_notify_emails from settings')) {
      return { rows: [state.settings] };
    }
    if (q.startsWith('update clients set')) {
      const client = state.clients.find((c) => c.id === params[0]);
      // Only the SET clause. Scanning the whole statement would also match
      // "id = $1" from the WHERE and overwrite the row's own id.
      const setClause = q.slice(q.indexOf(' set ') + 5, q.lastIndexOf(' where '));
      const fields = [...setClause.matchAll(/(\w+) = \$\d+/g)].map((m) => m[1]);
      fields.forEach((f, i) => { client[f] = params[i + 1]; });
      return { rows: [client] };
    }
    if (q.startsWith('insert into clients')) {
      const [name, company, email, phone, external_ref, product_id, source, notes] = params;
      if (state.clients.some((c) => c.external_ref === external_ref)) {
        const err = new Error('duplicate key'); err.code = '23505'; throw err;
      }
      const row = { id: 'client-' + nextId++, name, company, email, phone, external_ref, product_id, stage: 'lead', est_value: 0, source, notes };
      state.clients.push(row);
      return { rows: [row] };
    }
    if (q.startsWith('insert into client_stage_history')) {
      state.stageHistory.push({ client_id: params[0], comment: params[1] });
      return { rows: [] };
    }
    // v9.17: a ref that is no client's may be one of a client's agents; v9.20.4
    // takes the agent named outright, by id or by ref, as /usage does.
    if (q.startsWith('select id, client_id from client_agents where')) {
      const byId = q.includes('id::text = $1');
      const hit = state.agents.find((a) => (byId ? a.id === params[0] : a.external_ref === params[0]));
      return { rows: hit ? [{ id: hit.id, client_id: hit.client_id }] : [] };
    }
    // v9.20.4: the day usage filed a chat under (the nearest in time), and who metered it.
    if (q.startsWith('select session_id from usage_events where session_id = any')) {
      const at = new Date(params[1]).getTime();
      const hits = state.usage.filter((u) => params[0].includes(u.session_id))
        .sort((a, b) => Math.abs(new Date(a.occurred_at) - at) - Math.abs(new Date(b.occurred_at) - at));
      return { rows: hits.slice(0, 1).map((u) => ({ session_id: u.session_id })) };
    }
    if (q.startsWith('select distinct client_id, agent_id from usage_events where session_id')) {
      const owners = new Map();
      for (const u of state.usage.filter((x) => x.session_id === params[0])) owners.set(`${u.client_id}|${u.agent_id}`, { client_id: u.client_id, agent_id: u.agent_id });
      return { rows: [...owners.values()] };
    }
    if (q.startsWith('insert into conversation_messages')) {
      // One group of values per turn, as many as the statement names columns
      // (created_at's value is the time it was said, or null for now). A
      // message id already stored is skipped, as the unique index does.
      const cols = q.slice(q.indexOf('(') + 1, q.indexOf(')')).split(',').map((c) => c.trim());
      const stored = [];
      for (let i = 0; i < params.length; i += cols.length) {
        const row = {};
        cols.forEach((c, j) => { row[c] = params[i + j]; });
        if (row.external_id && state.conversations.some((x) => x.external_ref === row.external_ref && x.external_id === row.external_id)) continue;
        row.created_at = row.created_at || new Date().toISOString();
        state.conversations.push(row);
        stored.push(row);
      }
      return { rows: stored };
    }
    // v9.20.2: at most one undelivered-reply email an hour per agent.
    if (q.startsWith('update delivery_alerts')) {
      const a = state.alerts[params[0]];
      if (a && a.hoursAgo >= 1) { const missed = a.missed; state.alerts[params[0]] = { hoursAgo: 0, missed: 0 }; return { rows: [{ missed }] }; }
      return { rows: [] };
    }
    if (q.startsWith('insert into delivery_alerts')) {
      const a = state.alerts[params[0]];
      if (a) { a.missed += 1; return { rows: [{ fresh: false }] }; }
      state.alerts[params[0]] = { hoursAgo: 0, missed: 0 };
      return { rows: [{ fresh: true }] };
    }
    if (q.startsWith('select c.company, a.name as agent from clients c')) {
      const c = state.clients.find((x) => x.id === params[0]);
      return { rows: c ? [{ company: c.company, agent: null }] : [] };
    }
    throw new Error('unstubbed query: ' + q.slice(0, 90));
  },
};

require.cache[require.resolve(path.join(SRC, 'db'))] = { id: 'db', filename: 'db', loaded: true, exports: dbStub };
require.cache[require.resolve(path.join(SRC, 'utils', 'mailer'))] = {
  id: 'mailer', filename: 'mailer', loaded: true,
  exports: {
    mailConfigured: () => true,
    async sendMail(msg) { sent.push(msg); return true; },
  },
};

const usageRoutes = require(path.join(SRC, 'routes', 'usage'));

const app = express();
app.use(express.json());
app.use('/api/webhooks', usageRoutes);
app.use((err, req, res, _next) => { console.error(err); res.status(500).json({ error: String(err) }); });

// --- harness ----------------------------------------------------------
const server = app.listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;
const post = async (p, body) => {
  const res = await fetch(base() + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
// The notification is fire-and-forget, so give its promise a tick to land.
const settle = () => new Promise((r) => setTimeout(r, 20));

(async () => {
  // 1. A cold lead with nothing but a number still gets recorded.
  let r = await post('/api/webhooks/lead', { external_ref: '923001112233' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.created, true);
  let row = state.clients[0];
  assert.strictEqual(row.name, '—', 'placeholder rather than an invented name');
  assert.strictEqual(row.phone, '923001112233', 'phone defaults to the ref');
  assert.strictEqual(row.product_id, 'uuid-starter', 'starts on the entry package');
  assert.strictEqual(row.stage, 'lead');
  assert.strictEqual(state.stageHistory.length, 1);
  console.log('✓ a bare number creates a lead without inventing fields');

  // 2. A later call fills the blanks it left.
  r = await post('/api/webhooks/lead', {
    external_ref: '923001112233', name: 'Ayesha Khan', company: 'Khan Textiles',
    email: 'ayesha@khan.test', notes: 'Wants order tracking.',
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.created, false);
  assert.deepStrictEqual([...r.body.filled].sort(), ['company', 'email', 'name']);
  row = state.clients[0];
  assert.strictEqual(row.name, 'Ayesha Khan');
  assert.strictEqual(row.notes, 'Wants order tracking.');
  console.log('✓ a second call fills the blanks it left behind');

  // 3. It must never overwrite what a human corrected.
  row.company = 'Khan Textiles (Pvt) Ltd';
  r = await post('/api/webhooks/lead', { external_ref: '923001112233', company: 'Kaan Textile', name: 'Ayesha K' });
  assert.deepStrictEqual(r.body.filled, [], 'nothing refilled');
  assert.strictEqual(state.clients[0].company, 'Khan Textiles (Pvt) Ltd', 'human edit survives');
  assert.strictEqual(state.clients[0].name, 'Ayesha Khan');
  console.log('✓ a human correction outranks the agent on the next message');

  // 4. Notes accumulate instead of replacing, and never duplicate.
  await post('/api/webhooks/lead', { external_ref: '923001112233', notes: 'Budget confirmed.' });
  assert.ok(state.clients[0].notes.includes('Wants order tracking.'));
  assert.ok(state.clients[0].notes.includes('Budget confirmed.'));
  await post('/api/webhooks/lead', { external_ref: '923001112233', notes: 'Budget confirmed.' });
  assert.strictEqual(state.clients[0].notes.match(/Budget confirmed\./g).length, 1, 'repeat note not appended twice');
  console.log('✓ notes accumulate without duplicating');

  // 5. external_ref is the one thing that is genuinely required.
  r = await post('/api/webhooks/lead', { name: 'Nobody' });
  assert.strictEqual(r.status, 400);
  console.log('✓ a lead with no external_ref is rejected');

  // 6. The team gets an email, once, on creation only.
  await settle();
  assert.strictEqual(sent.length, 1, 'exactly one notification, for the new lead');
  assert.ok(/New whatsapp lead/.test(sent[0].subject));
  assert.strictEqual(sent[0].to, 'support@vantriqai.com', 'falls back to MAIL_FROM when nothing is configured');
  console.log('✓ one notification email on creation, none on updates');

  // 7. The notify list is honoured and split.
  state.settings.lead_notify_emails = 'sales@vantriqai.com, founder@vantriqai.com';
  await post('/api/webhooks/lead', { external_ref: '923444555666', name: 'Bilal', company: 'Bilal Motors', channel: 'website' });
  await settle();
  const recent = sent.slice(1);
  assert.deepStrictEqual(recent.map((m) => m.to), ['sales@vantriqai.com', 'founder@vantriqai.com']);
  assert.ok(/New website lead: Bilal \(Bilal Motors\)/.test(recent[0].subject));
  console.log('✓ every configured recipient is notified, channel named correctly');

  // 7b. Semicolons are what people actually paste, so they must work too.
  sent.length = 0;
  state.settings.lead_notify_emails = 'sales@vantriqai.com; ceo@vantriqai.com ;md@vantriqai.com';
  await post('/api/webhooks/lead', { external_ref: '923777888999', name: 'Sana', company: 'Sana Foods' });
  await settle();
  assert.deepStrictEqual(
    sent.map((m) => m.to),
    ['sales@vantriqai.com', 'ceo@vantriqai.com', 'md@vantriqai.com'],
    'semicolon-separated list is split and trimmed',
  );
  console.log('✓ a semicolon-separated list reaches every recipient');

  // 8. Transcript turns land, and attach to the client when one exists.
  r = await post('/api/webhooks/conversation', {
    external_ref: '923001112233', session_id: 's-1', channel: 'whatsapp',
    messages: [{ role: 'customer', content: 'Do you do Urdu?' }, { role: 'agent', content: 'Haan ji, bilkul.' }],
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.stored, 2);
  assert.strictEqual(state.conversations[0].client_id, 'client-1', 'linked to the client');
  assert.strictEqual(state.conversations[1].content, 'Haan ji, bilkul.');
  console.log('✓ transcript turns are stored and linked to the client');

  // 9. A turn from someone with no client record still stores.
  r = await post('/api/webhooks/conversation', {
    external_ref: 'unknown-visitor', messages: [{ role: 'customer', content: 'hi' }],
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(state.conversations.at(-1).client_id, null);
  console.log('✓ an unrecognised visitor is still recorded');

  // 10. Junk turns are dropped, not fatal; an all-junk batch is a 400.
  r = await post('/api/webhooks/conversation', {
    external_ref: '923001112233',
    messages: [{ role: 'system', content: 'ignore me' }, { role: 'agent', content: '  ' }, { role: 'agent', content: 'kept' }],
  });
  assert.strictEqual(r.body.stored, 1);
  assert.strictEqual(state.conversations.at(-1).content, 'kept');
  r = await post('/api/webhooks/conversation', { external_ref: 'x', messages: [{ role: 'system', content: 'no' }] });
  assert.strictEqual(r.status, 400);
  console.log('✓ unusable turns are dropped, an empty batch is rejected');

  // 11. An unknown channel falls back rather than violating the check constraint.
  await post('/api/webhooks/conversation', {
    external_ref: '923001112233', channel: 'carrier-pigeon', messages: [{ role: 'agent', content: 'x' }],
  });
  assert.strictEqual(state.conversations.at(-1).channel, 'whatsapp');
  console.log('✓ an unknown channel falls back to a permitted one');

  // 12. v9.20.2: the time it was said, and the channel's id, are kept; the
  // same message sent twice (an n8n retry, a backfill run again) is stored once.
  const said = Math.floor(Date.now() / 1000) - 3600;
  r = await post('/api/webhooks/conversation', {
    external_ref: '923001112233', session_id: '923005550000-2026-09-25', channel: 'whatsapp',
    messages: [{ role: 'customer', content: 'Timings?', at: said, id: 'wamid.A' }, { role: 'agent', content: '9 to 9.', at: new Date(said * 1000 + 4000).toISOString(), id: 'wamid.B' }],
  });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.stored, 2);
  assert.strictEqual(state.conversations.at(-2).created_at, new Date(said * 1000).toISOString(), 'Unix seconds become the time it was said');
  assert.strictEqual(state.conversations.at(-2).external_id, 'wamid.A');
  r = await post('/api/webhooks/conversation', {
    external_ref: '923001112233', session_id: '923005550000-2026-09-25',
    messages: [{ role: 'customer', content: 'Timings?', at: said, id: 'wamid.A' }, { role: 'agent', content: '9 to 9.', id: 'wamid.B' }],
  });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.body.stored, r.body.duplicates], [0, 2]);
  r = await post('/api/webhooks/conversation', { external_ref: '923001112233', messages: [{ role: 'customer', content: 'far future', at: '2999-01-01T00:00:00Z' }] });
  assert.strictEqual(state.conversations.at(-1).created_at && state.conversations.at(-1).created_at.startsWith('2999'), false, 'a time in the future is not trusted');
  console.log('✓ times and message ids are kept; a repeat is stored once; a future time is ignored');

  // 13. A reply WhatsApp refused: the customer's words are kept, the reply is
  // marked not delivered, and the team hears about it — once an hour.
  sent.length = 0;
  state.settings.lead_notify_emails = 'ops@vantriqai.com';
  const refused = (content, extra = {}) => post('/api/webhooks/conversation', {
    external_ref: '923001112233', session_id: '923701917578-2026-09-29', channel: 'whatsapp',
    delivered: false, error: 'Cannot call API for app 1775 on behalf of user 1221',
    messages: [{ role: 'customer', content }, { role: 'agent', content: 'Assalam o alaikum! We build AI agents…' }], ...extra,
  });
  r = await refused('Hi, I have an IT business');
  await settle();
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.undelivered, 1);
  assert.strictEqual(state.conversations.at(-2).delivered, true, 'the customer line is never "undelivered"');
  assert.strictEqual(state.conversations.at(-1).delivered, false);
  assert.match(state.conversations.at(-1).delivery_error, /Cannot call API/);
  assert.strictEqual(sent.length, 1, 'one alert');
  assert.deepStrictEqual(sent.map((m) => m.to), ['ops@vantriqai.com']);
  assert.match(sent[0].subject, /not answered: \+923701917578/);
  assert.match(sent[0].text, /Hi, I have an IT business/);
  assert.match(sent[0].text, /wa\.me\/923701917578/);
  assert.match(sent[0].text, /System users/, 'a token error says where the fix is');
  await refused('Hello?');
  await settle();
  assert.strictEqual(sent.length, 1, 'a second failure within the hour does not email again');
  state.alerts['client-1'].hoursAgo = 2;
  await refused('Anyone there?');
  await settle();
  assert.strictEqual(sent.length, 2, 'an hour later it does');
  assert.match(sent[1].text, /1 more message went unanswered since the last email/);
  await refused('Old one', { messages: [{ role: 'customer', content: 'Last week', at: said - 7 * 86400 }, { role: 'agent', content: 'x', at: said - 7 * 86400 + 5 }] });
  state.alerts['client-1'].hoursAgo = 2;
  await settle();
  assert.strictEqual(sent.length, 2, 'a backfilled old failure is history, not an alert');
  console.log('✓ a refused reply is kept as not delivered and alerts the team at most hourly');

  // 14. The AI model failing to write a reply at all (a revoked OpenAI key)
  // alerts the same way, and points at the AI credential, not WhatsApp.
  state.alerts['client-1'].hoursAgo = 2;
  await post('/api/webhooks/conversation', {
    external_ref: '923001112233', session_id: '923455100726-2026-09-29', channel: 'whatsapp',
    messages: [{ role: 'customer', content: 'hello' },
      { role: 'agent', content: '(No reply was written: the AI model failed.)', delivered: false, error: 'The AI model failed: Your API key has been invalidated.' }],
  });
  await settle();
  assert.strictEqual(sent.length, 3);
  assert.match(sent[2].text, /could not answer a customer: no reply was written/);
  assert.match(sent[2].text, /OpenAI credential/);
  assert.doesNotMatch(sent[2].text, /System users/, 'no WhatsApp-token advice for an AI failure');
  console.log('✓ an AI failure alerts too, with the right fix');

  // 15. v9.20.4: a website chat. It sends its own id with no day, under a ref
  // that is the chat's and no business's — and still lands with the agent
  // that metered that chat, in the very conversation usage counted, even when
  // the sender's clock had already moved on to tomorrow.
  const dayOf = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const chat = 'c9d5a29e-6f10-4fb4-b863-1226d518ca84';
  state.clients.push({ id: 'client-web', external_ref: 'shopco', name: 'Shop Co', company: 'Shop Co' });
  state.agents.push({ id: 'agent-web', client_id: 'client-web', external_ref: 'shop.example' });
  state.usage.push(
    { session_id: `${chat}-${dayOf(-1)}`, client_id: 'client-web', agent_id: 'agent-web', occurred_at: new Date(Date.now() - 30 * 3600000).toISOString() },
    { session_id: `${chat}-${dayOf(1)}`, client_id: 'client-web', agent_id: 'agent-web', occurred_at: new Date().toISOString() },
  );
  r = await post('/api/webhooks/conversation', {
    external_ref: `web-${chat}`, session_id: chat, channel: 'website',
    messages: [{ role: 'customer', content: 'Appointment booking' }, { role: 'agent', content: 'Our Booking Agent…' }],
  });
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual([r.body.client_id, r.body.agent_id], ['client-web', 'agent-web'], 'the agent that metered the chat owns it');
  assert.strictEqual(state.conversations.at(-1).session_id, `${chat}-${dayOf(1)}`, 'the day usage filed it under');
  assert.strictEqual(state.conversations.at(-1).channel, 'website');
  // Two agents metering one session is a question, not an answer.
  state.usage.push({ session_id: 'shared-2026-09-28', client_id: 'client-1', agent_id: null, occurred_at: new Date().toISOString() },
    { session_id: 'shared-2026-09-28', client_id: 'client-web', agent_id: 'agent-web', occurred_at: new Date().toISOString() });
  r = await post('/api/webhooks/conversation', { external_ref: 'nobody', session_id: 'shared-2026-09-28', messages: [{ role: 'customer', content: 'hm' }] });
  assert.strictEqual(r.body.client_id, null, 'ambiguous usage attributes nothing');
  // A chat never metered (the AI failed before it answered) names its agent
  // outright, gets today's day, and the alert speaks of a web visitor.
  sent.length = 0;
  r = await post('/api/webhooks/conversation', {
    external_ref: 'shop.example', agent_ref: 'shop.example', session_id: 'f00dbabe-0000-4000-8000-00000a1b2c3d', channel: 'website',
    messages: [{ role: 'customer', content: 'Do you deliver to Lahore?' },
      { role: 'agent', content: '(No reply was written: the AI model failed.)', delivered: false, error: 'The AI model failed: insufficient_quota' }],
  });
  await settle();
  assert.deepStrictEqual([r.body.client_id, r.body.agent_id], ['client-web', 'agent-web']);
  assert.strictEqual(state.conversations.at(-1).session_id, `f00dbabe-0000-4000-8000-00000a1b2c3d-${dayOf(0)}`);
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /not answered: Web visitor 1b2c3d \(Shop Co\)/);
  assert.doesNotMatch(sent[0].text, /wa\.me/, 'no WhatsApp link for a web visitor');
  assert.match(sent[0].text, /left their details/);
  console.log('✓ a website chat lands with the agent that metered it, on the day usage counted it');

  // 16. v9.28: Instagram and Messenger. A social lead's ref is not a phone
  // number, so it is not written into the phone field; a Messenger turn is
  // filed as 'facebook' rather than falling back to WhatsApp; and the alert
  // for an unanswered Instagram DM names the person and the inbox to use.
  r = await post('/api/webhooks/lead', { external_ref: 'ig-17841400000123456', name: 'Sara', channel: 'instagram', source: 'Instagram' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(state.clients.find((c) => c.external_ref === 'ig-17841400000123456').phone, '', 'an Instagram id is not a phone');
  r = await post('/api/webhooks/conversation', {
    external_ref: '1291897617346380', session_id: `fb-2400000000000001-${dayOf(0)}`, channel: 'facebook',
    messages: [{ role: 'customer', content: 'Salam' }, { role: 'agent', content: 'Wa alaikum salam!' }],
  });
  assert.strictEqual(state.conversations.at(-1).channel, 'facebook');
  sent.length = 0;
  await post('/api/webhooks/conversation', {
    external_ref: '17841414904483393', session_id: `ig-17841400000123456-${dayOf(0)}`, channel: 'instagram',
    messages: [{ role: 'customer', content: 'Price?' },
      { role: 'agent', content: 'It depends on scope.', delivered: false, error: 'Instagram refused the reply: (#200) Invalid OAuth access token' }],
  });
  await settle();
  assert.strictEqual(sent.length, 1);
  assert.match(sent[0].subject, /not answered: Instagram user 123456/);
  assert.match(sent[0].text, /Instagram inbox/);
  assert.match(sent[0].text, /Page access token/);
  assert.doesNotMatch(sent[0].text, /wa\.me|WhatsApp access token/);
  console.log('✓ Instagram and Messenger leads, turns and alerts are filed under their own channel');

  console.log('\nAll webhook lead/conversation tests passed.');
  server.close();
})().catch((err) => { console.error(err); server.close(); process.exit(1); });
