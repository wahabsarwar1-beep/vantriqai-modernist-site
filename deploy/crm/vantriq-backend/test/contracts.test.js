/**
 * Contracts — one record, two doors.
 *
 * The Contracts tab and a client's own panel read the SAME row through the
 * same endpoint, which is the point of holding contracts in the system rather
 * than a folder somebody has to remember to update twice. This asserts the
 * two cannot drift, and guards the one rule that is easy to get wrong.
 *
 * That rule: the counterparty's legal identity is SNAPSHOT onto the contract
 * when it is created. A contract records what was agreed with whom on the day
 * it was signed. If the client re-registers under a new NTN next year, last
 * year's contract must still show the number it was actually signed under —
 * so editing the client record must never reach back and rewrite it.
 *
 * Needs the API running on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/contracts.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const send = (m) => (p, body) => fetch(B + p, { method: m, headers: H, body: JSON.stringify(body || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const post = send('POST'), patch = send('PATCH'), put = send('PUT'), del = send('DELETE');

(async () => {
  const clients = (await get('/api/clients')).body;
  const client = clients.find((c) => !c.is_internal);
  if (!client) { console.error('no client to test against'); process.exit(1); }

  console.log('\n== a contract takes the identity it was signed under ==');
  const made = await post('/api/contracts', {
    client_id: client.id,
    title: 'Test agreement ' + Date.now(),
    kind: 'service', status: 'signed',
    start_date: '2026-01-01', end_date: '2026-12-31',
    value: 120000, billing_frequency: 'monthly', notice_days: 30,
    client_ntn: '1111111-1', client_strn: 'STRN-SIGNED', client_legal_name: 'As Signed Ltd',
  });
  ok(made.status === 201, 'it is created', JSON.stringify(made.body).slice(0, 120));
  const id = made.body.id;
  ok(/-C-\d{4}-\d{4}$/.test(made.body.contract_number || ''),
    'and gets its own contract number, not an invoice number', made.body.contract_number);
  ok(made.body.ntn === '1111111-1' && made.body.strn === 'STRN-SIGNED',
    'carrying the identity given at signing', `${made.body.ntn} / ${made.body.strn}`);

  console.log('\n== changing the client does NOT rewrite a signed contract ==');
  const before = (await get('/api/clients')).body.find((c) => c.id === client.id);
  // The clients route is PUT, not PATCH. A PATCH here 404s silently, the
  // client never moves, and the assertion below passes while proving nothing
  // — which is exactly what happened the first time this test was written.
  const moved = await put(`/api/clients/${client.id}`, { ...before, ntn: '2222222-2' });
  ok(moved.status === 200, 'the client record accepts a new NTN', String(moved.status));
  ok((await get('/api/clients')).body.find((c) => c.id === client.id).ntn === '2222222-2',
    'and has actually moved on — without this the next check proves nothing');
  const after = (await get(`/api/contracts/${id}`)).body;
  ok(after.ntn === '1111111-1',
    'yet the contract still shows the NTN it was signed under', after.ntn);
  // Put the client back the way it was found.
  await put(`/api/clients/${client.id}`, { ...before });

  console.log('\n== the tab and the client panel read the same row ==');
  const all = (await get('/api/contracts')).body;
  const mine = (await get(`/api/contracts?client_id=${client.id}`)).body;
  const fromAll = all.find((c) => c.id === id);
  const fromClient = mine.find((c) => c.id === id);
  ok(!!fromAll && !!fromClient, 'it appears in both listings');
  ok(JSON.stringify(fromAll) === JSON.stringify(fromClient),
    'and both listings return byte-identical rows for it');

  console.log('\n== status follows the term, not somebody remembering ==');
  const past = await post('/api/contracts', {
    client_id: client.id, title: 'Lapsed', status: 'signed',
    start_date: '2020-01-01', end_date: '2020-12-31',
  });
  ok(past.body.status === 'expired', 'a term that has ended reads expired', past.body.status);
  ok(past.body.stored_status === 'signed',
    'while the stored status is left untouched for the record', past.body.stored_status);
  ok(past.body.days_remaining < 0, 'and days remaining has gone negative', String(past.body.days_remaining));

  // A deliberate end state is a decision, not a date, and must survive one.
  const killed = await patch(`/api/contracts/${past.body.id}`, { status: 'terminated' });
  ok(killed.body.status === 'terminated',
    'a terminated contract is not relabelled expired by its dates', killed.body.status);

  console.log('\n== a renewal replaces its predecessor in one step ==');
  const renewal = await post(`/api/contracts/${id}/supersede`, { end_date: '2027-12-31' });
  ok(renewal.status === 201 && renewal.body.kind === 'renewal', 'the renewal is drafted', String(renewal.status));
  ok(renewal.body.ntn === '1111111-1', 'carrying the identity forward', renewal.body.ntn);
  ok(renewal.body.status === 'draft', 'as a draft, not live', renewal.body.status);
  const old = (await get(`/api/contracts/${id}`)).body;
  ok(old.status === 'superseded' && old.superseded_by === renewal.body.id,
    'and the old one is marked superseded, pointing at its replacement', old.status);
  ok((await post(`/api/contracts/${id}/supersede`, {})).status === 409,
    'replacing it twice is refused rather than leaving two live contracts');

  console.log('\n== a nonsense term is refused, however it arrives ==');
  ok((await post('/api/contracts', { client_id: client.id, title: 'x', start_date: '2026-06-01', end_date: '2026-01-01' })).status === 400,
    'end before start, in one request');
  // The same typo arriving one field at a time is the one that slips through.
  const t = await post('/api/contracts', { client_id: client.id, title: 'term test', start_date: '2026-01-01', end_date: '2026-06-01' });
  ok((await patch(`/api/contracts/${t.body.id}`, { start_date: '2027-01-01' })).status === 400,
    'and end before start assembled across two requests');
  ok((await post('/api/contracts', { client_id: client.id, title: 'x', kind: 'nope' })).status === 400, 'an unknown type');
  ok((await post('/api/contracts', { client_id: client.id, title: '' })).status === 400, 'a contract with no title');
  ok((await post('/api/contracts', { title: 'orphan' })).status === 400, 'a contract with no client');
  ok((await post('/api/contracts', { client_id: '00000000-0000-0000-0000-000000000000', title: 'ghost' })).status === 404,
    'a contract against a client that does not exist');

  // Clean up everything this run created.
  for (const x of [renewal.body.id, id, past.body.id, t.body.id]) await del(`/api/contracts/${x}`);
  ok((await get(`/api/contracts/${id}`)).status === 404, 'deleted contracts are gone');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
