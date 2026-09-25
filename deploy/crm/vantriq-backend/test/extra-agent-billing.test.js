/**
 * Charging for extra numbers — the other half of per-number pricing.
 *
 * v9.8 added the price. This wires it into the two places a customer
 * actually sees a figure: the monthly billing run, which is what invoices
 * them, and the proposal PDF, which is what they read before agreeing to
 * anything. Neither is worth having if they can disagree with each other —
 * a proposal promising one number free and a bill that charges for it
 * anyway is worse than not pricing this at all.
 *
 * Needs the API on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/extra-agent-billing.test.js
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
  const products = (await get('/api/products')).body;
  const growth = products.find((p) => p.name === 'Growth');
  ok(!!growth, 'Growth exists to price and bill against');

  // A throwaway client, on the record like any other — created rather than
  // reused, so a real client's billing history is never at risk from a test
  // run left mid-way.
  const client = await post('/api/clients', {
    name: 'Test Contact', company: 'Extra-Agent Test Co',
    email: 'billing-test@example.com', phone: '923000000000',
    product_id: growth.id, stage: 'active', est_value: 35000, source: 'Referral',
    external_ref: 'extra-agent-test-' + Date.now(),
    ntn: '1234567-8', billing_address: 'Islamabad, Pakistan',
  });
  ok(client.status === 201, 'the test client is created', JSON.stringify(client.body).slice(0, 150));
  const clientId = client.body.id;
  const agentsCreated = [];

  console.log('\n== priced at 0, extra numbers cost nothing — today\'s behaviour, untouched ==');
  for (let i = 0; i < 3; i += 1) {
    const a = await post('/api/agents', { client_id: clientId, name: `Line ${i + 1}`, kind: 'whatsapp' });
    agentsCreated.push(a.body.id);
  }
  const future1 = '2031-01-01'; // far enough out to never collide with a real invoice
  const dry1 = await post('/api/billing/run-monthly', { month: future1, dry_run: true, client_id: clientId });
  const bill1 = dry1.body.invoices[0];
  ok(!!bill1, 'the dry run bills the client at all', JSON.stringify(dry1.body).slice(0, 150));
  ok(!(bill1.lines || []).some((l) => l.kind === 'extra_agents'),
    'three numbers, unpriced, add no line — matches the pre-v9.8 behaviour exactly');

  console.log('\n== priced, but under the included count — still nothing extra ==');
  await patch(`/api/products/${growth.id}/addon-pricing`, { included_agents: 3, extra_agent_price: 5000 });
  const future2 = '2031-02-01';
  const dry2 = await post('/api/billing/run-monthly', { month: future2, dry_run: true, client_id: clientId });
  const bill2 = dry2.body.invoices[0];
  ok(!(bill2.lines || []).some((l) => l.kind === 'extra_agents'),
    '3 active numbers against 3 included bills nothing extra — headroom is headroom', JSON.stringify(bill2.lines.map(l=>l.kind)));

  console.log('\n== over the included count, it actually charges ==');
  await patch(`/api/products/${growth.id}/addon-pricing`, { included_agents: 1, extra_agent_price: 5000 });
  const future3 = '2031-03-01';
  const dry3 = await post('/api/billing/run-monthly', { month: future3, dry_run: true, client_id: clientId });
  const bill3 = dry3.body.invoices[0];
  const extraLine = (bill3.lines || []).find((l) => l.kind === 'extra_agents');
  ok(!!extraLine, 'a line appears for the numbers past the included count', JSON.stringify(bill3.lines));
  ok(extraLine && Number(extraLine.qty) === 2, '3 active minus 1 included is 2, not 3 or 1', String(extraLine && extraLine.qty));
  ok(extraLine && Number(extraLine.amount) === 10000, '2 × PKR 5,000 is PKR 10,000, not the per-unit price alone',
    String(extraLine && extraLine.amount));
  ok(extraLine && /3 active, 1 included/.test(extraLine.detail),
    'the line says what it counted, not just what it charged', extraLine && extraLine.detail);

  console.log('\n== a paused or retired number is not billed — it is not consuming anything ==');
  await patch(`/api/agents/${agentsCreated[2]}`, { status: 'retired' });
  const dry4 = await post('/api/billing/run-monthly', { month: future3, dry_run: true, client_id: clientId });
  const bill4 = dry4.body.invoices[0];
  // 3 numbers, 1 retired, 1 included: 2 active - 1 included = 1 extra. If
  // retiring one had no effect on the count, this would still read 2.
  const extraLine4 = (bill4.lines || []).find((l) => l.kind === 'extra_agents');
  ok(!!extraLine4 && Number(extraLine4.qty) === 1,
    'retiring one number drops the billed count from 2 to 1', JSON.stringify(extraLine4));
  await patch(`/api/agents/${agentsCreated[2]}`, { status: 'active' });

  console.log('\n== this actually persists to a real invoice, not only the dry-run preview ==');
  const real = await post('/api/billing/run-monthly', { month: future3, dry_run: false, client_id: clientId });
  const raised = real.body.invoices[0];
  ok(!!raised && !!raised.invoice_id, 'a real invoice is raised', JSON.stringify(real.body).slice(0, 200));
  const invoice = (await get(`/api/invoices/${raised.invoice_id}`)).body;
  const storedLine = (invoice.lines || []).find((l) => l.kind === 'extra_agents');
  ok(!!storedLine, 'the extra-agents line survives being written to the database', JSON.stringify(invoice.lines.map((l) => l.kind)));
  ok(Number(storedLine.amount) === 10000, 'at the same amount the dry run promised', String(storedLine.amount));
  // This is the real regression risk: invoice_lines.kind has a fixed check
  // constraint, and an insert with a value outside it fails loudly rather
  // than quietly, which is exactly why the invoice creation above would have
  // 500'd instead of returning 201 if the constraint had not been extended.
  ok(real.body.invoices[0].invoice_id !== undefined, 'the insert did not fail the whole invoice on the new kind value');

  console.log('\n== and the proposal PDF shows the same figure, not a different one ==');
  const quote = await post('/api/quotes', {
    client_id: clientId, product_id: growth.id, title: 'Extra-agent pricing check',
  });
  const proposal = (await get(`/api/quotes/${quote.body.id}/proposal`)).body;
  const propPkg = proposal.packages.find((p) => p.id === growth.id);
  ok(!!propPkg, 'Growth appears in the proposal');
  ok(Number(propPkg.extra_agent_price) === 5000 && Number(propPkg.included_agents) === 1,
    'with the exact figures just set on the product — not a cached or stale copy',
    JSON.stringify({ extra_agent_price: propPkg.extra_agent_price, included_agents: propPkg.included_agents }));

  const pdfRes = await fetch(`${B}/api/quotes/${quote.body.id}/proposal.pdf`, { headers: H });
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  ok(pdfRes.status === 200 && buf.slice(0, 5).toString() === '%PDF-',
    'the proposal still renders as a real PDF with this data present', String(pdfRes.status));

  console.log('\n== cleanup ==');
  await del(`/api/quotes/${quote.body.id}`);
  await del(`/api/invoices/${raised.invoice_id}`);
  for (const id of agentsCreated) await del(`/api/agents/${id}`);
  await patch(`/api/products/${growth.id}/addon-pricing`, { included_agents: 1, extra_agent_price: 0 });
  await del(`/api/clients/${clientId}`);
  const gone = await get(`/api/clients/${clientId}`);
  ok(gone.status === 404, 'the test client is gone, nothing left behind on the real books');
  const restored = (await get('/api/products')).body.find((p) => p.id === growth.id);
  ok(Number(restored.extra_agent_price) === 0, 'Growth\'s pricing is back to "not charged"');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
