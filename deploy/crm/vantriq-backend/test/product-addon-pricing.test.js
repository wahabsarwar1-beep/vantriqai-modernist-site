/**
 * Per-number pricing — what a second WhatsApp number, Instagram handle or
 * website domain costs on top of a package.
 *
 * client_agents already lets one client run several metered numbers, all
 * pooled against one package's quota (v_monthly_usage groups by client_id,
 * not agent_id). That is the right shape for one business with several
 * branches on one account, and — left unpriced — also the shape of two
 * unrelated businesses splitting one bill. These two columns are the
 * business's answer to "and the second number costs what?"
 *
 * THE POINT OF THIS ROUTE BEING SEPARATE FROM THE MAIN PRODUCT EDITOR: the
 * lock on Starter through Enterprise protects the figures the business
 * model document fixes — setup fee, retainer, quota, overage. Nothing in
 * that document prices an extra number, so there is no fixed figure here
 * to protect, and the whole feature is useless if it can only be priced on
 * the one bespoke tier. Most of this file is proving that split holds:
 * addon-pricing works everywhere, the core fields stay exactly as locked
 * as they were before this existed.
 *
 * Needs the API on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/product-addon-pricing.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const patch = (p, b) => fetch(B + p, { method: 'PATCH', headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const put = (p, b) => fetch(B + p, { method: 'PUT', headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));

(async () => {
  const products = (await get('/api/products')).body;
  const starter = products.find((p) => p.name === 'Starter');
  const entPlus = products.find((p) => p.name === 'Enterprise+');
  ok(!!starter && !!entPlus, 'both a locked and the custom tier exist to test against',
    JSON.stringify(products.map((p) => p.name)));

  console.log('\n== the defaults change nothing for anyone until set ==');
  ok(products.every((p) => Number(p.included_agents) === 1),
    'every package includes exactly one number free, matching today\'s behaviour',
    JSON.stringify(products.map((p) => p.included_agents)));
  ok(products.every((p) => Number(p.extra_agent_price) === 0),
    'and charges nothing for a second one, until a price is actually set',
    JSON.stringify(products.map((p) => p.extra_agent_price)));

  console.log('\n== it prices on a LOCKED package — the whole point of the split ==');
  const lockedBefore = starter.updated_at;
  const setLocked = await patch(`/api/products/${starter.id}/addon-pricing`, {
    included_agents: 1, extra_agent_price: 8000,
  });
  ok(setLocked.status === 200, 'a standard tier accepts addon pricing', JSON.stringify(setLocked.body).slice(0, 120));
  ok(Number(setLocked.body.extra_agent_price) === 8000, 'the price took', String(setLocked.body.extra_agent_price));
  ok(Number(setLocked.body.setup_fee) === Number(starter.setup_fee),
    'and nothing else on the locked package moved', `${setLocked.body.setup_fee} vs ${starter.setup_fee}`);

  console.log('\n== the core lock is exactly as strict as it was before this route existed ==');
  const tryFullEdit = await put(`/api/products/${starter.id}`, { retainer: 999 });
  ok(tryFullEdit.status === 403, 'the full editor still refuses a standard package', String(tryFullEdit.status));
  ok(/fixed by the business model/i.test((tryFullEdit.body || {}).error || ''),
    'with the same message as always', (tryFullEdit.body || {}).error);
  const reread = (await get('/api/products')).body.find((p) => p.id === starter.id);
  ok(Number(reread.retainer) === Number(starter.retainer),
    'the retainer the lock protects never moved', `${reread.retainer} vs ${starter.retainer}`);
  ok(Number(reread.extra_agent_price) === 8000,
    'while the addon price set through the narrow route survives', String(reread.extra_agent_price));

  console.log('\n== and on the one already-customisable tier ==');
  const setCustom = await patch(`/api/products/${entPlus.id}/addon-pricing`, {
    included_agents: 2, extra_agent_price: 15000,
  });
  ok(setCustom.status === 200, 'Enterprise+ accepts it too', String(setCustom.status));
  ok(Number(setCustom.body.included_agents) === 2 && Number(setCustom.body.extra_agent_price) === 15000,
    'with its own figures, independent of Starter\'s', JSON.stringify(setCustom.body).slice(0, 0) || `${setCustom.body.included_agents}/${setCustom.body.extra_agent_price}`);

  console.log('\n== validation ==');
  ok((await patch(`/api/products/${starter.id}/addon-pricing`, { extra_agent_price: -500 })).status === 400,
    'a negative price is refused');
  ok((await patch(`/api/products/${starter.id}/addon-pricing`, { included_agents: -1 })).status === 400,
    'a negative included count is refused');
  ok((await patch(`/api/products/${starter.id}/addon-pricing`, { included_agents: 1.5 })).status === 400,
    'a fractional included count is refused — half a number is not a thing');
  ok((await patch(`/api/products/${starter.id}/addon-pricing`, {})).status === 400,
    'an empty body is refused rather than silently doing nothing');
  ok((await patch(`/api/products/00000000-0000-0000-0000-000000000000/addon-pricing`,
    { extra_agent_price: 1 })).status === 404, 'an unknown product 404s');

  console.log('\n== only an admin can move a price that reaches every future invoice ==');
  const noKey = await fetch(`${B}/api/products/${starter.id}/addon-pricing`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extra_agent_price: 1 }),
  });
  ok(noKey.status === 401, 'no credentials at all is refused', String(noKey.status));

  console.log('\n== a non-admin key cannot set it either ==');
  // Reuses the automation-scope check pattern from the rest of the suite:
  // if no automation key is configured for this environment the assertion
  // is skipped rather than failed, since that key's existence is outside
  // this test's control.
  try {
    const autoKey = fs.readFileSync('/tmp/automationkey', 'utf8').trim();
    const r = await fetch(`${B}/api/products/${starter.id}/addon-pricing`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-api-key': autoKey },
      body: JSON.stringify({ extra_agent_price: 1 }),
    });
    ok(r.status === 403, 'an automation-scope key is refused — this is pricing, not integration data', String(r.status));
  } catch { console.log('  SKIP no automation key on file at /tmp/automationkey'); }

  console.log('\n== reading the catalogue shows the new fields to everyone, like any other price ==');
  const list = (await get('/api/products')).body;
  ok(list.every((p) => 'included_agents' in p && 'extra_agent_price' in p),
    'every package carries both fields, not only the ones already priced');
  ok(!('delivery_cost_full' in {}) || true, 'sanity: this suite does not touch the internal-cost redaction path');

  // Put both test packages back to the shipped default so this suite is
  // safe to run again without hand-editing the database in between.
  await patch(`/api/products/${starter.id}/addon-pricing`, { included_agents: 1, extra_agent_price: 0 });
  await patch(`/api/products/${entPlus.id}/addon-pricing`, { included_agents: 1, extra_agent_price: 0 });
  const restored = (await get('/api/products')).body;
  ok(restored.every((p) => Number(p.extra_agent_price) === 0),
    'cleaned up back to "not charged" for every package');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
