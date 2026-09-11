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
const state = { clients: [], products: [{ id: 'uuid-starter', sort_order: 1 }], conversations: [], stageHistory: [], settings: { lead_notify_emails: '' } };
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
    if (q.startsWith('insert into conversation_messages')) {
      for (let i = 0; i < params.length; i += 6) {
        state.conversations.push({
          client_id: params[i], external_ref: params[i + 1], session_id: params[i + 2],
          channel: params[i + 3], role: params[i + 4], content: params[i + 5],
        });
      }
      return { rows: [] };
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

  console.log('\nAll webhook lead/conversation tests passed.');
  server.close();
})().catch((err) => { console.error(err); server.close(); process.exit(1); });
