/**
 * A customer's own read-only API token (v9.12) — self-service, scoped to
 * exactly one client, and never able to write anything.
 *
 * This is the answer to "how do I give a customer's own system access to
 * their own data": they generate this themselves from their portal login,
 * not something VantriqAI staff hand out by running a script.
 *
 * Needs the API on 8099, an admin key in /tmp/adminkey, and the standing
 * portal test account in /tmp/cred.txt (username on line 1, password on
 * line 2 — the same fixture test/portal-ui.test.js uses).
 *
 *   node test/client-api-tokens.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };
const [PORTAL_USER, PORTAL_PASS] = fs.readFileSync('/tmp/cred.txt', 'utf8').trim().split('\n');

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const aget = (p) => fetch(B + p, { headers: AH }).then(async (r) => ({ status: r.status, body: await J(r) }));
const apost = (p, b) => fetch(B + p, { method: 'POST', headers: AH, body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, body: await J(r) }));
const adel = (p) => fetch(B + p, { method: 'DELETE', headers: AH }).then(async (r) => ({ status: r.status, body: await J(r) }));

const portalHeaders = (session) => ({ Authorization: `Bearer ${session}`, 'Content-Type': 'application/json' });
const pget = (session, p) => fetch(B + p, { headers: portalHeaders(session) }).then(async (r) => ({ status: r.status, body: await J(r) }));
const ppost = (session, p, b) => fetch(B + p, { method: 'POST', headers: portalHeaders(session), body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, body: await J(r) }));

const cget = (token, p) => fetch(B + p, { headers: { 'x-client-api-key': token } }).then(async (r) => ({ status: r.status, body: await J(r) }));

(async () => {
  console.log('\n== signing in as the standing test customer ==');
  const login = await fetch(`${B}/api/portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: PORTAL_USER, password: PORTAL_PASS }) }).then((r) => r.json());
  ok(!!login.session, 'portal login succeeds', JSON.stringify(login));
  const session = login.session;

  console.log('\n== generating a token from the portal, self-service ==');
  const created = await ppost(session, '/api/portal/api-tokens', { name: 'Regression test token' });
  ok(created.status === 201, 'a token is created', JSON.stringify(created.body).slice(0, 150));
  ok(!!created.body.token && created.body.token.startsWith('vqc_'), 'the plaintext is shown once, with its own prefix', created.body.token);
  const token = created.body.token;
  const tokenId = created.body.id;

  const listed = await pget(session, '/api/portal/api-tokens');
  ok((listed.body || []).some((t) => t.id === tokenId), 'it shows up in the customer\'s own list');
  const mine = (listed.body || []).find((t) => t.id === tokenId) || {};
  ok(!('token' in mine), 'the list never carries the plaintext back', JSON.stringify(listed.body));

  console.log('\n== the token actually works, read-only, on this account\'s own data ==');
  const account = await cget(token, '/api/external/account');
  ok(account.status === 200 && !!account.body.company, 'GET /api/external/account works', JSON.stringify(account.body).slice(0, 150));
  ok(!('ai_model' in account.body) && !(account.body.package && 'ai_model' in account.body.package),
    'ai_model is never exposed here either, same rule as the human portal');

  const invoices = await cget(token, '/api/external/invoices');
  ok(invoices.status === 200 && Array.isArray(invoices.body), 'GET /api/external/invoices works');
  if (invoices.body.length) {
    const one = await cget(token, `/api/external/invoices/${invoices.body[0].id}`);
    ok(one.status === 200 && Array.isArray(one.body.lines), 'GET /api/external/invoices/:id includes line items');
    const pdfRes = await fetch(`${B}/api/external/invoices/${invoices.body[0].id}/pdf`, { headers: { 'x-client-api-key': token } });
    const buf = Buffer.from(await pdfRes.arrayBuffer());
    ok(pdfRes.status === 200 && buf.slice(0, 5).toString() === '%PDF-', 'GET /api/external/invoices/:id/pdf is a real PDF');
  }

  const usage = await cget(token, '/api/external/usage');
  ok(usage.status === 200 && Array.isArray(usage.body.sessions), 'GET /api/external/usage works');
  ok(!usage.body.sessions.some((s) => 'session_id' in s),
    'the raw session_id is never returned here either — same third-party-data rule as the portal');

  const agents = await cget(token, '/api/external/agents');
  ok(agents.status === 200 && Array.isArray(agents.body), 'GET /api/external/agents works');

  console.log('\n== and nothing else, and nobody else ==');
  const noKey = await fetch(`${B}/api/external/account`).then((r) => r.status);
  ok(noKey === 401, 'no key at all is refused');
  const badKey = await cget('vqc_totally_made_up', '/api/external/account');
  ok(badKey.status === 401, 'a garbage key is refused, not mistaken for a real one');

  console.log('\n== a second, unrelated client cannot be reached through this token ==');
  const products = (await aget('/api/products')).body;
  const growth = products.find((p) => p.name === 'Growth');
  const iso = await apost('/api/clients', {
    name: 'Isolation Test', company: 'Isolation Test Co', email: 'client-api-iso@example.com',
    phone: '923004443333', product_id: growth.id, stage: 'active', est_value: 1000, source: 'Referral',
    external_ref: 'client-api-iso-' + Date.now(), ntn: '1234567-8', billing_address: 'Islamabad',
  });
  ok(iso.status === 201, 'the isolation-test client is created', JSON.stringify(iso.body).slice(0, 150));
  const isoId = iso.body.id;
  const isoUsername = 'client-api-iso-portal-' + Date.now();
  await apost(`/api/clients/${isoId}/portal-credentials`, { username: isoUsername, password: 'IsoTokenTestPass123' });

  const isoLogin = await fetch(`${B}/api/portal/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: isoUsername, password: 'IsoTokenTestPass123' }) }).then((r) => r.json());
  const isoToken = (await ppost(isoLogin.session, '/api/portal/api-tokens', { name: 'Iso token' })).body.token;

  const isoAccount = await cget(isoToken, '/api/external/account');
  ok(isoAccount.body.company === 'Isolation Test Co', 'the second client\'s token sees its own company, not the first\'s', JSON.stringify(isoAccount.body));

  const crossCheck = await cget(token, '/api/external/account');
  ok(crossCheck.body.company !== 'Isolation Test Co', 'and the first client\'s original token still sees only its own', JSON.stringify(crossCheck.body));

  console.log('\n== revoking a token actually stops it ==');
  const revoke = await ppost(session, `/api/portal/api-tokens/${tokenId}/revoke`, {});
  ok(revoke.status === 200, 'revoking succeeds');
  const afterRevoke = await cget(token, '/api/external/account');
  ok(afterRevoke.status === 401, 'the revoked token no longer works');

  console.log('\n== cleanup ==');
  await adel(`/api/clients/${isoId}`);
  const gone = await aget(`/api/clients/${isoId}`);
  ok(gone.status === 404, 'the isolation-test client is gone, nothing left on the real books');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
