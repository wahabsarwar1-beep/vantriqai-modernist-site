/**
 * What a package includes and does not, in writing (v9.33).
 *
 * Every quotation, proposal and portal quote prints the package's own
 * "Included" and "Not included" lists, read live from the package, and only
 * the CEO can change them.
 *
 * Needs Postgres (DATABASE_URL in .env) and the API on 8099 with an admin key
 * in /tmp/adminkey.
 *
 *   node test/package-scope.test.js
 */
require('dotenv').config();
const fs = require('fs');
const { ceoSession, adminSession, db } = require('./ceo-session');

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const K = { 'Content-Type': 'application/json', 'x-api-key': KEY };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, body, headers = K) => fetch(B + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

(async () => {
  const ceo = await ceoSession();
  const other = await adminSession();
  const made = [];
  let growth, before;
  try {
    console.log('\n== every package says what it includes ==');
    const products = (await call('GET', '/api/products')).body;
    const std = products.filter((p) => ['Starter', 'Growth', 'Scale', 'Pro', 'Enterprise', 'Enterprise+'].includes(p.name));
    ok(std.length === 6 && std.every((p) => p.includes.length >= 8 && p.excludes.length >= 5),
      'all six packages carry an Included and a Not-included list', JSON.stringify(std.map((p) => [p.name, p.includes.length, p.excludes.length])));
    growth = std.find((p) => p.name === 'Growth');
    before = { includes: growth.includes, excludes: growth.excludes };
    ok(growth.includes.some((x) => /CRM sync/.test(x)) && !std.find((p) => p.name === 'Starter').includes.some((x) => /CRM sync/.test(x)),
      'Growth includes CRM sync and Starter does not');
    ok(std.every((p) => p.excludes.some((x) => /Meta/.test(x)) && p.excludes.some((x) => /Voice notes/.test(x))),
      'every package says Meta fees and voice notes are not included');

    console.log('\n== only the CEO edits them ==');
    let r = await call('PATCH', `/api/products/${growth.id}/scope`, { includes: ['x'] });
    ok(r.status === 403, 'the break-glass admin key cannot', r.status);
    r = await call('PATCH', `/api/products/${growth.id}/scope`, { includes: ['x'] }, other.headers);
    ok(r.status === 403, 'nor another admin', r.status);
    r = await call('PATCH', `/api/products/${growth.id}/scope`, { includes: 'one line' }, ceo.headers);
    ok(r.status === 400, 'a list is required, not a string', r.status);
    r = await call('PATCH', `/api/products/${growth.id}/scope`, { includes: ['a'.repeat(301)] }, ceo.headers);
    ok(r.status === 400, 'a line over 300 characters is refused', r.status);
    r = await call('PATCH', `/api/products/${growth.id}/scope`, {}, ceo.headers);
    ok(r.status === 400, 'an empty change is refused', r.status);
    r = await call('PATCH', `/api/products/${growth.id}/scope`,
      { includes: ['  WhatsApp and Instagram  ', '', 'CRM sync'], excludes: ['Meta fees'] }, ceo.headers);
    ok(r.status === 200 && r.body.includes.length === 2 && r.body.includes[0] === 'WhatsApp and Instagram' && r.body.excludes[0] === 'Meta fees',
      'the CEO can change them on a standard package; blank lines are dropped and lines trimmed', JSON.stringify(r.body && r.body.includes));
    r = await call('PUT', `/api/products/${growth.id}`, { retainer: 1 }, ceo.headers);
    ok(r.status === 403, 'and the package\'s prices stay locked', r.status);

    console.log('\n== quotes and proposals print them ==');
    const client = (await call('GET', '/api/clients')).body.find((c) => !c.is_internal);
    r = await call('POST', '/api/quotes', { client_id: client.id, title: 'Scope test', product_id: growth.id,
      lines: [{ description: 'Growth setup', amount: 55000 }] });
    made.push(r.body.id);
    const doc = (await call('GET', `/api/quotes/${r.body.id}/document`)).body;
    ok(doc.package_scope && doc.package_scope.name === 'Growth' && doc.package_scope.includes.join('|') === 'WhatsApp and Instagram|CRM sync'
      && doc.package_scope.excludes[0] === 'Meta fees' && doc.package_scope.quota > 0,
      'the quotation carries the package\'s lists, read live', JSON.stringify(doc.package_scope));
    const prop = (await call('GET', `/api/quotes/${r.body.id}/proposal`)).body;
    ok(prop.packages[0].includes.length === 2 && prop.packages[0].excludes.length === 1, 'and so does the proposal', JSON.stringify(prop.packages[0]));
    const pdf = await fetch(`${B}/api/quotes/${r.body.id}/proposal.pdf`, { headers: K });
    ok(pdf.status === 200 && (await pdf.arrayBuffer()).byteLength > 10000, 'and the proposal still renders as a PDF', pdf.status);
    r = await call('POST', '/api/quotes', { client_id: client.id, title: 'Add-on only', lines: [{ description: 'Echo', amount: 6000 }] });
    made.push(r.body.id);
    const plain = (await call('GET', `/api/quotes/${r.body.id}/document`)).body;
    ok(plain.package_scope === null, 'a quote that names no package prints no package scope', JSON.stringify(plain.package_scope));
  } finally {
    if (growth && before) await db.query(`update products set includes = $2, excludes = $3 where id = $1`, [growth.id, before.includes, before.excludes]);
    for (const id of made) await db.query(`delete from quotes where id = $1`, [id]);
    await other.end();
    await ceo.end();
  }
  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* already closed */ } process.exit(1); });
