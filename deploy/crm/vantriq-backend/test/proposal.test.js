/**
 * The quotation that reads like a proposal.
 *
 * Two things are worth testing here and the rest is layout.
 *
 *   THE MONEY MUST NOT DRIFT. A proposal shows package prices from the
 *   products table AND a commercials page from the quote's own lines. If
 *   those two ever disagree, a customer signs one number and gets invoiced
 *   another. The commercials are asserted against the quote itself.
 *
 *   NOTHING INTERNAL MAY LEAK ONTO IT. quotes.created_by falls back to the
 *   auth kind, so a quote raised by an integration is stamped 'apikey' —
 *   which must never appear over a signature on a document a customer
 *   reads. Dates are the other half of the same problem: pg hands back Date
 *   objects in-process and String(d).slice(0,10) yields 'Fri Sep 25', which
 *   has already reached one production document.
 *
 * Needs the API on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/proposal.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const send = (m) => (p, b) => fetch(B + p, { method: m, headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const post = send('POST'), patch = send('PATCH'), del = send('DELETE');

(async () => {
  const clients = (await get('/api/clients')).body;
  const client = clients.find((c) => !c.is_internal);
  const products = (await get('/api/products')).body;
  const byName = Object.fromEntries(products.map((p) => [p.name, p]));
  const scale = byName.Scale, growth = byName.Growth;
  const made = [];

  console.log('\n== a quote with no proposal fields still works ==');
  const plain = await post('/api/quotes', {
    client_id: client.id, title: 'Plain', product_id: scale.id,
  });
  made.push(plain.body.id);
  ok(plain.status === 201, 'it is created', JSON.stringify(plain.body).slice(0, 120));
  const pd = (await get(`/api/quotes/${plain.body.id}/proposal`)).body;
  ok(!!pd.cover_letter && pd.cover_letter.length > 80,
    'a letter is generated rather than leaving page one blank', String(pd.cover_letter || '').slice(0, 40));
  ok(pd.packages.length === 1 && pd.packages[0].name === 'Scale',
    'the package it prices is the package it shows', JSON.stringify(pd.packages.map((p) => p.name)));
  ok(pd.packages[0].recommended === true,
    'and is marked recommended without anyone saying so twice');

  console.log('\n== the whole range, or only what was chosen ==');
  const all = await post('/api/quotes', {
    client_id: client.id, product_id: scale.id, show_all_packages: true,
  });
  made.push(all.body.id);
  const allDoc = (await get(`/api/quotes/${all.body.id}/proposal`)).body;
  ok(allDoc.packages.length === products.filter((p) => !p.archived).length,
    'every live package is shown', `${allDoc.packages.length} of ${products.length}`);
  ok(allDoc.packages.filter((p) => p.recommended).length === 1,
    'exactly one of them is recommended');

  const two = await post('/api/quotes', {
    client_id: client.id, product_id: scale.id,
    selected_product_ids: [growth.id, scale.id],
  });
  made.push(two.body.id);
  const twoDoc = (await get(`/api/quotes/${two.body.id}/proposal`)).body;
  ok(twoDoc.packages.length === 2, 'a selection shows only what was selected', String(twoDoc.packages.length));
  ok(twoDoc.packages.map((p) => p.name).join(',') === 'Growth,Scale',
    'in catalogue order, not the order they were ticked', twoDoc.packages.map((p) => p.name).join(','));

  // show_all wins: a sender who ticked it wants the ladder.
  await patch(`/api/quotes/${two.body.id}`, { show_all_packages: true });
  ok((await get(`/api/quotes/${two.body.id}/proposal`)).body.packages.length > 2,
    'ticking "show all" overrides a narrower selection');

  console.log('\n== a bad package id costs one package, never the quote ==');
  const junk = await post('/api/quotes', {
    client_id: client.id, product_id: scale.id,
    selected_product_ids: [growth.id, 'not-a-uuid', '../../etc/passwd'],
  });
  made.push(junk.body.id);
  ok(junk.status === 201, 'the quote is still created', String(junk.status));
  ok((await get(`/api/quotes/${junk.body.id}/proposal`)).body.packages.length === 1,
    'and only the real id survived');

  console.log('\n== the money does not drift ==');
  const q = (await get(`/api/quotes/${plain.body.id}`)).body;
  ok(Number(pd.totals.subtotal) === Number(q.subtotal)
    && Number(pd.totals.total) === Number(q.total),
    'the commercials page totals ARE the quote\'s totals',
    `${pd.totals.subtotal}/${pd.totals.total} vs ${q.subtotal}/${q.total}`);
  ok(pd.lines.length === q.lines.length,
    'and it prints every line, no more and no fewer', `${pd.lines.length} vs ${q.lines.length}`);
  const lineSum = pd.lines.reduce((s, l) => s + Number(l.amount), 0);
  ok(Math.abs(lineSum - Number(pd.totals.subtotal)) < 0.01,
    'the lines add up to the subtotal shown beneath them', `${lineSum} vs ${pd.totals.subtotal}`);
  // Package figures come from the catalogue, so they must match it exactly.
  ok(Number(pd.packages[0].retainer) === Number(scale.retainer)
    && Number(pd.packages[0].setup_fee) === Number(scale.setup_fee),
    'package pricing is the catalogue\'s, not a copy that can go stale');

  console.log('\n== nothing internal reaches the page ==');
  ok(pd.prepared_by === '',
    'a quote raised by an API key is not signed "apikey"', JSON.stringify(pd.prepared_by));
  const withPerson = await patch(`/api/quotes/${plain.body.id}`, { title: 'Plain' });
  ok(withPerson.status === 200, 'patching works');

  console.log('\n== dates print as dates ==');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(pd.issued_date)),
    'issued_date is an ISO day, not "Fri Sep 25"', String(pd.issued_date));
  ok(!/GMT|Coordinated Universal/.test(String(pd.notes || '')),
    'no raw Date object was interpolated into the notes', String(pd.notes || '').slice(-60));

  const dated = await post('/api/quotes', {
    client_id: client.id, product_id: scale.id, valid_until: '2026-12-31',
  });
  made.push(dated.body.id);
  const dd = (await get(`/api/quotes/${dated.body.id}/proposal`)).body;
  ok(/Dec 31, 2026/.test(dd.notes), 'a validity date reads "Dec 31, 2026"', String(dd.notes).slice(-60));

  console.log('\n== the letter is the sender\'s when they wrote one ==');
  const mine = 'Dear Ayesha,\n\nAs discussed on Tuesday.';
  await patch(`/api/quotes/${plain.body.id}`, { cover_letter: mine });
  ok((await get(`/api/quotes/${plain.body.id}/proposal`)).body.cover_letter === mine,
    'it is used verbatim');
  // Clearing it must bring the generated one back, not leave a blank page.
  await patch(`/api/quotes/${plain.body.id}`, { cover_letter: '' });
  const cleared = (await get(`/api/quotes/${plain.body.id}/proposal`)).body.cover_letter;
  ok(cleared && cleared !== mine && cleared.length > 80,
    'clearing it falls back to the generated letter', String(cleared).slice(0, 40));

  console.log('\n== it renders as a real PDF ==');
  const r = await fetch(`${B}/api/quotes/${all.body.id}/proposal.pdf`, { headers: H });
  const buf = Buffer.from(await r.arrayBuffer());
  ok(r.status === 200, 'it downloads', String(r.status));
  ok(buf.slice(0, 5).toString() === '%PDF-', 'with a PDF magic number', buf.slice(0, 8).toString());
  ok(buf.length > 8000, 'and is a real document, not an empty shell', String(buf.length));
  ok(/^attachment; filename="proposal-.*\.pdf"$/.test(r.headers.get('content-disposition') || ''),
    'served as a named attachment', r.headers.get('content-disposition'));
  ok(r.headers.get('x-content-type-options') === 'nosniff', 'and not sniffable');
  // The filename must carry no path separators or quotes, whatever the
  // client is called.
  const fn = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '')[1];
  ok(!/[\\/"]/.test(fn), 'the filename cannot break out of the header', fn);

  console.log('\n== the tier caption drops its hedge ==');
  ok(allDoc.packages.every((p) => !/^\s*typically/i.test(p.target_tier || '')),
    'no package caption still begins "Typically"',
    JSON.stringify(allDoc.packages.map((p) => p.target_tier).slice(0, 2)));
  ok(allDoc.packages.some((p) => /sessions\/mo/.test(p.target_tier || '')),
    'but the figure itself survived — only the hedge was cut',
    JSON.stringify(allDoc.packages[0].target_tier));

  console.log('\n== every column stays inside the right margin ==');
  // Both table layouts have now shipped a column measured from WIDTH rather
  // than to RIGHT, which put right-aligned money hard against the trim. The
  // arithmetic is asserted here because a PDF renders happily either way and
  // only a person looking at the page would notice.
  const { LAYOUT } = require('../src/utils/proposalPdf');
  for (const table of ['packages', 'commercials']) {
    const cols = LAYOUT[table];
    for (const c of cols) {
      ok(c.x + c.w <= LAYOUT.RIGHT + 0.01,
        `${table}.${c.h} ends at or before the right margin`,
        `${c.h}: ${(c.x + c.w).toFixed(2)} > ${LAYOUT.RIGHT}`);
    }
  }

  console.log('\n== an accepted proposal is frozen with its quote ==');
  const acc = await post('/api/quotes', { client_id: client.id, product_id: scale.id });
  made.push(acc.body.id);
  await post(`/api/quotes/${acc.body.id}/send`);
  const accepted = await post(`/api/quotes/${acc.body.id}/accept`);
  if (accepted.status === 200) {
    ok((await patch(`/api/quotes/${acc.body.id}`, { cover_letter: 'changed' })).status === 409,
      'the letter cannot be rewritten after the customer accepted it');
    ok((await patch(`/api/quotes/${acc.body.id}`, { show_all_packages: true })).status === 409,
      'nor which packages it showed');
    // The invoice it raised is part of the record; leave it.
    made.splice(made.indexOf(acc.body.id), 1);
  } else {
    ok(false, 'could not accept a quote to test freezing', JSON.stringify(accepted.body).slice(0, 120));
  }

  console.log('\n== 404 rather than a blank document ==');
  const missing = await fetch(`${B}/api/quotes/00000000-0000-0000-0000-000000000000/proposal.pdf`, { headers: H });
  ok(missing.status === 404, 'an unknown quote does not render', String(missing.status));

  for (const id of made) await del(`/api/quotes/${id}`);
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
