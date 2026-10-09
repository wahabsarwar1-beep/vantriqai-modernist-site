/**
 * Scope sign-off, end to end (v9.33): prepared in the CRM, sent to the
 * portal, signed by the client against the exact document they saw — and
 * conversation history deleted once its retention period is up.
 *
 * Needs Postgres (DATABASE_URL in .env) and the API on 8099 with an admin key
 * in /tmp/adminkey.
 *
 *   node test/scope-signoff.test.js
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const db = require('../src/db');
const { purgeConversations } = require('../src/utils/conversationRetention');

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const A = { 'Content-Type': 'application/json', 'x-api-key': KEY };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, body, headers = A) => fetch(B + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null), raw: r }));

(async () => {
  const ref = 'scope-test-' + crypto.randomBytes(3).toString('hex');
  const { rows: prod } = await db.query(`select id from products where name = 'Growth'`);
  const { rows: cl } = await db.query(
    `insert into clients (name, company, email, phone, external_ref, product_id, ntn, billing_address)
     values ('Sara Malik', 'Malik Foods', 'sara@example.test', '923001234567', $1, $2, '1234567-8', 'Lahore') returning *`,
    [ref, prod[0].id]);
  const client = cl[0];
  await db.query(`insert into client_agents (client_id, name, kind, external_ref) values ($1, 'WhatsApp', 'whatsapp', $2), ($1, 'Instagram', 'instagram', $3)`,
    [client.id, ref + '-wa', ref + '-ig']);
  const token = 'ps_' + crypto.randomBytes(24).toString('hex');
  await db.query(`insert into portal_sessions (token, client_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [token, client.id]);
  const P = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  try {
    console.log('\n== the CRM prepares a draft ==');
    let r = await call('POST', '/api/scope-signoffs', { client_id: client.id });
    ok(r.status === 201 && r.body.status === 'draft' && /^VAI-S-\d{4}-\d{4}$/.test(r.body.number) && r.body.version === 1,
      'a draft is created with its own number, version 1', JSON.stringify(r.body && { s: r.body.status, n: r.body.number }));
    const draft = r.body;
    const c = draft.content;
    ok(c.package && c.package.name === 'Growth' && c.package_includes.length > 5 && c.out_of_scope.some((x) => /Meta/.test(x)),
      'it is prefilled with the package, what it includes and what it does not');
    ok(c.channels.length === 2 && c.channels.some((x) => /WhatsApp/.test(x)) && c.channels.some((x) => /Instagram/.test(x)),
      'and the client\'s own channels', JSON.stringify(c.channels));
    ok(c.access_required.some((x) => /partner/.test(x) && /WhatsApp/.test(x)) && c.access_required.some((x) => /Instagram/.test(x))
      && !c.access_required.some((x) => /^Website/.test(x)),
      'the access asked for is exactly what those channels need', JSON.stringify(c.access_required));
    ok(c.acceptance_criteria.length >= 3 && c.client_responsibilities.length >= 3 && c.vantriq_responsibilities.length >= 3,
      'with acceptance criteria and responsibilities on both sides');

    r = await call('PATCH', `/api/scope-signoffs/${draft.id}`, { content: { integrations: ['Shopify order lookup'], deliverables: 'one line' } });
    ok(r.status === 400, 'a list must be sent as a list', r.status);
    r = await call('PATCH', `/api/scope-signoffs/${draft.id}`, {
      content: { integrations: ['  Shopify order lookup ', ''], package: { name: 'Free' }, commercial: { total: 1 } } });
    ok(r.status === 200 && r.body.content.integrations.length === 1 && r.body.content.integrations[0] === 'Shopify order lookup',
      'staff can edit a draft; blank lines are dropped', JSON.stringify(r.body && r.body.content.integrations));
    ok(r.body.content.package.name === 'Growth' && r.body.content.commercial.total !== 1,
      'but never the package or the commercials, which come from the CRM\'s own records');

    r = await call('POST', `/api/scope-signoffs/${draft.id}/send`);
    ok(r.status === 409 && /portal/.test(r.body.error), 'it cannot be sent to a client with no portal access', r.status);
    await db.query(`update clients set portal_username = $2 where id = $1`, [client.id, ref]);
    r = await call('GET', '/api/portal/scope-signoffs', undefined, P);
    ok(r.status === 200 && r.body.length === 0, 'the client cannot see a draft', JSON.stringify(r.body));

    r = await call('POST', `/api/scope-signoffs/${draft.id}/send`);
    ok(r.status === 200 && r.body.status === 'sent' && /^[0-9a-f]{64}$/.test(r.body.content_hash) && r.body.terms_version === require('../src/content/terms.json').version,
      'sending freezes it with a SHA-256 fingerprint and the terms version in force', r.status);
    ok(r.body.terms && r.body.terms.sections.length >= 10 && r.body.client_snapshot.ntn === '1234567-8',
      'the full terms and the client\'s legal identity are snapshotted into it');
    const sent = r.body;
    r = await call('PATCH', `/api/scope-signoffs/${draft.id}`, { title: 'Changed' });
    ok(r.status === 409, 'a sent scope cannot be edited', r.status);
    r = await call('DELETE', `/api/scope-signoffs/${draft.id}`);
    ok(r.status === 409, 'nor deleted', r.status);

    console.log('\n== the client reads it, and asks for a change ==');
    r = await call('GET', '/api/portal/scope-signoffs', undefined, P);
    ok(r.status === 200 && r.body.length === 1 && r.body[0].content_hash === sent.content_hash && r.body[0].terms,
      'the portal shows the sent scope with its terms', r.status);
    ok(r.body[0].signer_ip === undefined && r.body[0].created_by === undefined, 'without our internal fields');
    const pdf = await fetch(`${B}/api/portal/scope-signoffs/${draft.id}/pdf`, { headers: P });
    const buf = Buffer.from(await pdf.arrayBuffer());
    ok(pdf.status === 200 && buf.slice(0, 4).toString() === '%PDF' && buf.length > 8000, 'the client can download it as a PDF', `${pdf.status} ${buf.length}`);
    r = await call('POST', `/api/portal/scope-signoffs/${draft.id}/request-changes`, { message: 'Please add Facebook Messenger.' }, P);
    ok(r.status === 200 && r.body.status === 'changes_requested', 'the client can ask for changes', r.status);

    console.log('\n== a revision replaces it ==');
    r = await call('POST', `/api/scope-signoffs/${draft.id}/revise`);
    ok(r.status === 201 && r.body.version === 2 && r.body.number === draft.number && r.body.status === 'draft'
      && /Facebook Messenger/.test(r.body.content.notes), 'revising makes version 2 as a draft, carrying the client\'s request', JSON.stringify(r.body && r.body.content.notes));
    const v2 = r.body;
    r = await call('POST', `/api/scope-signoffs/${draft.id}/revise`);
    ok(r.status === 409, 'only one revision can be in draft at a time', r.status);
    await call('PATCH', `/api/scope-signoffs/${v2.id}`, { content: { channels: [...v2.content.channels, 'Facebook Messenger — Malik Foods page'] } });
    r = await call('POST', `/api/scope-signoffs/${v2.id}/send`);
    ok(r.status === 200 && r.body.content_hash !== sent.content_hash, 'version 2 is sent with its own fingerprint', r.status);
    const v2sent = r.body;
    const { rows: v1 } = await db.query(`select status from scope_signoffs where id = $1`, [draft.id]);
    ok(v1[0].status === 'superseded', 'and the unsigned version 1 is superseded', v1[0].status);
    r = await call('POST', `/api/portal/scope-signoffs/${draft.id}/sign`,
      { signer_name: 'Sara Malik', signer_title: 'Director', accept_scope: true, accept_terms: true, authorised: true, content_hash: sent.content_hash }, P);
    ok(r.status === 409, 'a superseded version cannot be signed', r.status);

    console.log('\n== the client signs ==');
    const good = { signer_name: 'Sara Malik', signer_title: 'Director', signer_email: 'sara@example.test',
      accept_scope: true, accept_terms: true, authorised: true, content_hash: v2sent.content_hash };
    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, { ...good, authorised: false }, P);
    ok(r.status === 400 && /three/.test(r.body.error), 'all three confirmations are required', r.status);
    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, { ...good, signer_name: 'S' }, P);
    ok(r.status === 400, 'a full name is required', r.status);
    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, { ...good, content_hash: sent.content_hash }, P);
    ok(r.status === 409 && /changed/.test(r.body.error), 'a signature against a different version\'s fingerprint is refused', r.status);

    await db.query(`update scope_signoffs set content = jsonb_set(content, '{deliverables,0}', '"Something else"') where id = $1`, [v2.id]);
    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, good, P);
    ok(r.status === 409, 'a document altered after it was sent cannot be signed', r.status);
    await db.query(`update scope_signoffs set content = $2::jsonb where id = $1`, [v2.id, JSON.stringify(v2sent.content)]);

    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, good, P);
    ok(r.status === 200 && r.body.status === 'signed' && r.body.signer_name === 'Sara Malik' && r.body.acknowledgements.terms_version,
      'the client signs version 2', r.status);
    const { rows: row } = await db.query(`select * from scope_signoffs where id = $1`, [v2.id]);
    ok(row[0].signer_ip && row[0].contract_id, 'the signature records where it came from and files a contract', JSON.stringify({ ip: row[0].signer_ip }));
    const { rows: ct } = await db.query(`select * from contracts where id = $1`, [row[0].contract_id]);
    ok(ct[0] && ct[0].kind === 'sow' && ct[0].status === 'signed' && ct[0].signed_by_client === 'Sara Malik, Director' && /VAI-C-/.test(ct[0].contract_number),
      'as a signed statement of work under Contracts', JSON.stringify(ct[0] && { k: ct[0].kind, n: ct[0].contract_number }));
    r = await call('POST', `/api/portal/scope-signoffs/${v2.id}/sign`, good, P);
    ok(r.status === 409, 'it cannot be signed twice', r.status);
    r = await call('POST', `/api/scope-signoffs/${v2.id}/withdraw`);
    ok(r.status === 409, 'a signed scope cannot be withdrawn', r.status);
    const spdf = await fetch(`${B}/api/scope-signoffs/${v2.id}/pdf`, { headers: A });
    ok(spdf.status === 200 && Buffer.from(await spdf.arrayBuffer()).length > 8000, 'the signed PDF downloads from the CRM', spdf.status);

    console.log('\n== another client cannot see it ==');
    const { rows: other } = await db.query(`insert into clients (name, company, external_ref, portal_username) values ('O', 'Other Co', $1, $1) returning id`, [ref + '-o']);
    const t2 = 'ps_' + crypto.randomBytes(24).toString('hex');
    await db.query(`insert into portal_sessions (token, client_id, expires_at) values ($1, $2, now() + interval '1 hour')`, [t2, other[0].id]);
    const P2 = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t2 };
    r = await call('GET', '/api/portal/scope-signoffs', undefined, P2);
    ok(r.status === 200 && r.body.length === 0, 'their list is empty', JSON.stringify(r.body));
    const op = await fetch(`${B}/api/portal/scope-signoffs/${v2.id}/pdf`, { headers: P2 });
    ok(op.status === 404, 'and the PDF is not theirs to download', op.status);
    await db.query(`delete from clients where id = $1`, [other[0].id]);

    console.log('\n== conversation history is kept for its retention period ==');
    await db.query(
      `insert into conversation_messages (client_id, external_ref, session_id, channel, role, content, created_at) values
         ($1, $2, 's-old', 'whatsapp', 'customer', 'thirteen months ago', now() - interval '13 months'),
         ($1, $2, 's-new', 'whatsapp', 'customer', 'last month', now() - interval '1 month')`, [client.id, ref]);
    let p = await purgeConversations();
    let { rows: left } = await db.query(`select content from conversation_messages where client_id = $1 order by created_at`, [client.id]);
    ok(p.months === 12 && left.length === 1 && left[0].content === 'last month', 'messages past 12 months are deleted; newer ones stay', JSON.stringify(left));
    await db.query(`update clients set conversation_retention_months = 24 where id = $1`, [client.id]);
    await db.query(`insert into conversation_messages (client_id, external_ref, session_id, channel, role, content, created_at)
                    values ($1, $2, 's-old2', 'whatsapp', 'customer', 'kept for 24', now() - interval '13 months')`, [client.id, ref]);
    p = await purgeConversations();
    ({ rows: left } = await db.query(`select content from conversation_messages where client_id = $1 order by created_at`, [client.id]));
    ok(left.length === 2 && left[0].content === 'kept for 24', 'a client agreed a longer period keeps theirs longer', JSON.stringify(left));
    r = await call('PUT', `/api/clients/${client.id}`, { conversation_retention_months: 500 });
    ok(r.status === 400, 'a period over ten years is refused', r.status);
  } finally {
    await db.query(`delete from contracts where client_id = $1`, [client.id]);
    await db.query(`delete from clients where id = $1`, [client.id]);
  }
  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* already closed */ } process.exit(1); });
