/**
 * Customer paperwork, and what happens when a company renames.
 *
 * The rename half guards a tax rule with real consequences. Every invoice
 * snapshots the buyer's identity at issue, so an invoice filed with FBR under
 * the old NTN keeps saying so and one raised afterwards uses the new details.
 * That was ALMOST true: the NTN, STRN and address came off the invoice, but
 * the company NAME was read live from the client record at print time — so a
 * renamed company's old invoices reprinted under the new name against the old
 * registration number. Two different entities on one tax document, which is
 * worse than either field being stale on its own.
 *
 * The documents half guards an upload endpoint, which is the kind of thing
 * that quietly becomes a stored-XSS hole if it will accept text/html and hand
 * it back on your own origin.
 *
 * Needs the API on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/client-documents.test.js
 */
const fs = require('fs');
const crypto = require('crypto');
const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const send = (m) => (p, b) => fetch(B + p, { method: m, headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const post = send('POST'), put = send('PUT'), del = send('DELETE');

const PDF = Buffer.from('%PDF-1.4\nbody\n%%EOF\n');
const b64 = (buf) => buf.toString('base64');

(async () => {
  const clients = (await get('/api/clients')).body;
  const client = clients.find((c) => !c.is_internal);
  const id = client.id;
  const created = [];

  console.log('\n== a document goes in and comes back out unchanged ==');
  const up = await post(`/api/clients/${id}/documents`, {
    doc_type: 'saf', title: 'SAF', filename: 'saf.pdf',
    content_type: 'application/pdf', data: b64(PDF),
  });
  ok(up.status === 201, 'it uploads', JSON.stringify(up.body).slice(0, 120));
  created.push(up.body.id);
  ok(up.body.byte_size === PDF.length, 'the stored size is the real size', String(up.body.byte_size));
  ok(up.body.sha256 === crypto.createHash('sha256').update(PDF).digest('hex'),
    'and the hash is of the real bytes');

  const dl = await fetch(`${B}/api/clients/${id}/documents/${up.body.id}/download`, { headers: H });
  const back = Buffer.from(await dl.arrayBuffer());
  ok(back.equals(PDF), 'the download is byte-identical to the upload');
  ok(/^attachment;/.test(dl.headers.get('content-disposition') || ''),
    'served as an attachment, never inline', dl.headers.get('content-disposition'));
  ok(dl.headers.get('x-content-type-options') === 'nosniff',
    'and the browser is told not to sniff a type of its own');

  console.log('\n== the upload field is not an open door ==');
  ok((await post(`/api/clients/${id}/documents`, {
    doc_type: 'other', filename: 'x.html', content_type: 'text/html',
    data: b64(Buffer.from('<script>alert(1)</script>')),
  })).status === 400, 'HTML is refused — it would run on our origin when downloaded');
  ok((await post(`/api/clients/${id}/documents`, {
    doc_type: 'other', filename: 'x.svg', content_type: 'image/svg+xml', data: b64(Buffer.from('<svg/>')),
  })).status === 400, 'so is SVG, which can carry script');
  ok((await post(`/api/clients/${id}/documents`, {
    doc_type: 'other', filename: 'e.pdf', content_type: 'application/pdf', data: '',
  })).status === 400, 'an empty upload');
  ok((await post(`/api/clients/${id}/documents`, {
    doc_type: 'nonsense', filename: 'a.pdf', content_type: 'application/pdf', data: b64(PDF),
  })).status === 400, 'an unknown document type');

  // The filename lands in a response header, so a crafted one must not be
  // able to climb out of it.
  const nasty = await post(`/api/clients/${id}/documents`, {
    doc_type: 'cnic', filename: '../../etc/pa"ss\nwd.pdf',
    content_type: 'application/pdf', data: b64(Buffer.from('%PDF-1.4 other\n')),
  });
  created.push(nasty.body.id);
  ok(!/[\\/]/.test(nasty.body.filename), 'a filename keeps no path separator', nasty.body.filename);
  ok(!/["\n\r]/.test(nasty.body.filename), 'and no quote or newline to break the header with', JSON.stringify(nasty.body.filename));

  console.log('\n== the same file twice is caught ==');
  const dupe = await post(`/api/clients/${id}/documents`, {
    doc_type: 'ntn', filename: 'copy.pdf', content_type: 'application/pdf', data: b64(PDF),
  });
  ok(dupe.status === 409, 'a byte-identical re-upload is refused', String(dupe.status));
  const forced = await post(`/api/clients/${id}/documents`, {
    doc_type: 'ntn', filename: 'copy.pdf', content_type: 'application/pdf',
    data: b64(PDF), allow_duplicate: true,
  });
  ok(forced.status === 201, 'unless you say you meant it');
  created.push(forced.body.id);

  console.log('\n== listing does not drag the bytes along ==');
  const list = (await get(`/api/clients/${id}/documents`)).body;
  ok(Array.isArray(list) && list.length >= 3, 'the documents are listed', String(list.length));
  ok(list.every((d) => d.content === undefined),
    'and no row carries its file content — a list of names must not be megabytes');

  console.log('\n== a rename does not reach back into an issued invoice ==');
  const before = (await get(`/api/clients/${id}`)).body;
  const inv = await post('/api/invoices', { client_id: id, type: 'addon', amount: 1000, notes: 'before rename' });
  ok(inv.status === 201, 'an invoice is raised under the current identity', String(inv.status));
  const stampedName = (await get(`/api/invoices/${inv.body.id}/tax-invoice`)).body.buyer.company;
  const stampedNtn = (await get(`/api/invoices/${inv.body.id}/tax-invoice`)).body.buyer.ntn;

  const renamed = await put(`/api/clients/${id}`, {
    ...before, company: 'Renamed Test Ltd', ntn: '9876543-2',
    identity_reason: 'test rename', identity_effective_from: '2026-09-10',
  });
  ok(renamed.status === 200, 'the client is renamed', JSON.stringify(renamed.body).slice(0, 120));

  const reprinted = (await get(`/api/invoices/${inv.body.id}/tax-invoice`)).body.buyer;
  ok(reprinted.company === stampedName,
    'the issued invoice still prints the NAME it was raised under', `${reprinted.company} vs ${stampedName}`);
  ok(reprinted.ntn === stampedNtn,
    'and the NTN it was raised under', `${reprinted.ntn} vs ${stampedNtn}`);
  // The pairing is the point: a document showing a new name against an old
  // number is worse than one that is simply out of date.
  ok(!(reprinted.company === 'Renamed Test Ltd' && reprinted.ntn === stampedNtn),
    'never the new name against the old number');

  const next = await post('/api/invoices', { client_id: id, type: 'addon', amount: 1000, notes: 'after rename' });
  const fresh = (await get(`/api/invoices/${next.body.id}/tax-invoice`)).body.buyer;
  ok(fresh.company === 'Renamed Test Ltd' && fresh.ntn === '9876543-2',
    'while the next invoice uses the new identity', `${fresh.company} / ${fresh.ntn}`);

  console.log('\n== and the change is on the record ==');
  const hist = (await get(`/api/clients/${id}/identity-history`)).body;
  const latest = hist[0];
  ok(latest && latest.new_company === 'Renamed Test Ltd', 'the change is logged', JSON.stringify(latest || {}).slice(0, 120));
  ok(latest && latest.old_company === before.company, 'with what it was before', latest && latest.old_company);
  ok(latest && latest.changed.includes('name') && latest.changed.includes('NTN'),
    'naming which details moved', JSON.stringify(latest && latest.changed));
  ok(latest && String(latest.effective_from).slice(0, 10) === '2026-09-10',
    'and when it takes effect, not when it was typed', String(latest && latest.effective_from).slice(0, 10));
  ok(latest && latest.reason === 'test rename', 'and why');

  // An edit that touches nothing identity-related must not fabricate a change.
  const n0 = (await get(`/api/clients/${id}/identity-history`)).body.length;
  await put(`/api/clients/${id}`, { ...(await get(`/api/clients/${id}`)).body, notes: 'just a note ' + Date.now() });
  ok((await get(`/api/clients/${id}/identity-history`)).body.length === n0,
    'editing something else logs nothing');

  // Put it all back.
  await put(`/api/clients/${id}`, { ...before });
  for (const d of created) await del(`/api/clients/${id}/documents/${d}`);
  for (const i of [inv.body.id, next.body.id]) await del(`/api/invoices/${i}`);
  ok((await get(`/api/clients/${id}/documents`)).body.length === 0, 'test documents cleaned up');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
