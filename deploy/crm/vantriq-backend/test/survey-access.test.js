/**
 * Surveys are an add-on an admin switches on per client (v9.15).
 *
 * A new client starts with surveys off: no survey can be made for them, their
 * portal has no Surveys tab (and its survey API refuses), and their agents'
 * after-chat invites are refused. Only an admin can switch it on. Switched on,
 * everything works; switched back off, their live surveys pause for
 * respondents at once, and nothing new can be started — while every survey
 * and answer is kept, and comes back when it is switched on again.
 *
 * Needs the API on 8099, an admin key in /tmp/adminkey, and the database in
 * .env (to make a short-lived automation key). Deletes what it makes.
 *
 *   node test/survey-access.test.js
 */
require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const db = require('../src/db');

const B = 'http://127.0.0.1:8099';
const AH = { 'Content-Type': 'application/json', 'x-api-key': fs.readFileSync('/tmp/adminkey', 'utf8').trim() };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const page = (p) => fetch(B + p).then(async (r) => ({ status: r.status, text: await r.text() }));
const stamp = Date.now();
const REF = `access-${stamp}`;

(async () => {
  const growth = (await call('GET', '/api/products')).body.find((p) => p.name === 'Growth');
  const client = (await call('POST', '/api/clients', {
    name: 'Access', company: `Survey Access Test ${stamp}`, email: 'access@example.com', phone: '923001234000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: REF,
    ntn: '1234567-8', billing_address: 'Lahore',
  })).body;
  ok(client && client.id, 'a new client');
  const autoKey = `vq_test_auto_${crypto.randomBytes(12).toString('hex')}`;
  const { rows: [keyRow] } = await db.query(
    `insert into api_keys (name, key_hash, scope) values ('survey access test', $1, 'automation') returning id`,
    [crypto.createHash('sha256').update(autoKey).digest('hex')]
  );
  const AUTO = { 'Content-Type': 'application/json', 'x-api-key': autoKey };
  try {
    await call('POST', `/api/clients/${client.id}/portal-credentials`, { username: `access-${stamp}`, password: 'AccessTestPass1' });
    const login = (await call('POST', '/api/portal/login', { username: `access-${stamp}`, password: 'AccessTestPass1' }, { 'Content-Type': 'application/json' })).body;
    const PH = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.session}` };

    console.log('\n== off by default ==');
    const listed = (await call('GET', '/api/clients')).body.find((c) => c.id === client.id);
    ok(listed && listed.surveys_enabled === false, 'a new client has surveys switched off');
    const made = await call('POST', '/api/surveys', { client_id: client.id, template: 'restaurant' });
    ok(made.status === 403 && /not switched on/.test(made.body.error), 'no survey can be made for them (403, says how to switch it on)', JSON.stringify(made.body));
    const acct = (await call('GET', '/api/portal/account', undefined, PH)).body;
    ok(acct && acct.surveys_enabled === false, 'their portal is told surveys are off (no Surveys tab)');
    const pList = await call('GET', '/api/portal/surveys', undefined, PH);
    ok(pList.status === 403 && pList.body.code === 'surveys_disabled', 'their portal\'s survey API refuses (403 surveys_disabled)', JSON.stringify(pList.body));
    const inv = await call('POST', '/api/webhooks/survey-invite', { external_ref: REF, session_id: `923001230000-${stamp}`, channel: 'whatsapp' });
    ok(inv.status === 403 && inv.body.code === 'surveys_disabled', 'an after-chat invite for them is refused (403)', JSON.stringify(inv.body));

    console.log('\n== only an admin switches it ==');
    const auto = await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: true }, AUTO);
    ok(auto.status === 403, 'an automation key cannot (403)', JSON.stringify(auto.body));
    const on = await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: true });
    ok(on.status === 200 && on.body.surveys_enabled === true && on.body.surveys_enabled_at && on.body.surveys_enabled_by === 'admin key',
      'an admin can, and it records when and by whom', JSON.stringify(on.body));
    ok((await call('PATCH', '/api/clients/00000000-0000-0000-0000-000000000000/surveys', { enabled: true })).status === 404, 'an unknown client is 404');

    console.log('\n== switched on ==');
    ok((await call('GET', '/api/portal/account', undefined, PH)).body.surveys_enabled === true, 'their portal shows the Surveys tab');
    const ps = await call('POST', '/api/portal/surveys', { template: 'restaurant', title: 'From the portal' }, PH);
    ok(ps.status === 201 && ps.body.status === 'live', 'they can make a survey from their portal', JSON.stringify(ps.body).slice(0, 160));
    const ss = await call('POST', '/api/surveys', { client_id: client.id, template: 'support_chat', title: 'After chat' });
    ok(ss.status === 201, 'staff can make one for them');
    const S1 = ps.body;
    const live = await page(`/s/${S1.slug}`);
    ok(live.status === 200 && live.text.includes('"state":"ok"'), 'the survey is live for respondents');
    const ans = await call('POST', `/api/public/surveys/${S1.slug}/responses`, { answers: { order_type: 'dine_in', csat: 5, nps: 9 }, submission_id: `acc-${stamp}-1` },
      { 'Content-Type': 'application/json', 'X-Real-IP': '10.99.0.1' });
    ok(ans.status === 201, 'and takes answers', JSON.stringify(ans.body));
    const inv2 = await call('POST', '/api/webhooks/survey-invite', { external_ref: REF, session_id: `923001230001-${stamp}`, channel: 'whatsapp' });
    ok(inv2.status === 201 && inv2.body.survey.slug === ss.body.slug, 'after-chat invites work, with their after-chat survey', JSON.stringify(inv2.body).slice(0, 160));

    console.log('\n== switched back off ==');
    const off = await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: false });
    ok(off.status === 200 && off.body.surveys_enabled === false && off.body.live_surveys === 2, 'switched off, and told how many live surveys that pauses', JSON.stringify(off.body));
    const paused = await page(`/s/${S1.slug}`);
    ok(paused.text.includes('"state":"paused"'), 'their survey page shows paused');
    const pubGet = await call('GET', `/api/public/surveys/${S1.slug}`, undefined, { 'Content-Type': 'application/json' });
    ok(pubGet.body.survey.status === 'paused', 'the public API says paused too');
    const ans2 = await call('POST', `/api/public/surveys/${S1.slug}/responses`, { answers: { order_type: 'dine_in', csat: 4, nps: 8 }, submission_id: `acc-${stamp}-2` },
      { 'Content-Type': 'application/json', 'X-Real-IP': '10.99.0.2' });
    ok(ans2.status === 409, 'and no answer is taken (409)', JSON.stringify(ans2.body));
    ok((await call('GET', '/api/portal/surveys', undefined, PH)).status === 403, 'their portal\'s surveys are refused again');
    ok((await call('POST', '/api/webhooks/survey-invite', { external_ref: REF, session_id: `923001230002-${stamp}` })).status === 403, 'after-chat invites are refused again');
    const staffList = (await call('GET', `/api/surveys?client_id=${client.id}`)).body.surveys;
    ok(staffList.length === 2 && staffList.every((x) => x.client_surveys_enabled === false), 'staff still see their surveys, marked as switched off');
    const an = (await call('GET', `/api/surveys/${S1.id}/analytics`)).body;
    ok(an.kpis.responses.current === 1, 'and every answer already given is kept');
    ok((await call('POST', `/api/surveys/${S1.id}/duplicate`)).status === 403, 'but cannot copy one (403)');
    ok((await call('POST', `/api/surveys/${S1.id}/invites`, { count: 2 })).status === 403, 'nor make personal links (403)');
    ok((await call('POST', '/api/surveys', { client_id: client.id, template: 'general' })).status === 403, 'nor make a new one (403)');

    console.log('\n== and on again ==');
    const again = await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: true });
    ok(again.body.surveys_enabled === true && new Date(again.body.surveys_enabled_at) >= new Date(on.body.surveys_enabled_at), 'switched on again, dated now');
    ok((await page(`/s/${S1.slug}`)).text.includes('"state":"ok"'), 'the same survey is live again, where it left off');
  } finally {
    await call('DELETE', `/api/clients/${client.id}`);
    await db.query(`delete from api_keys where id = $1`, [keyRow.id]);
    await db.pool.end().catch(() => {});
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
