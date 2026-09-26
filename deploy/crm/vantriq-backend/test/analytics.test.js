/**
 * Analytics and customer satisfaction (v9.13).
 *
 * Builds one throwaway client with a known set of conversations and survey
 * answers, then checks every audience gets the same, correct numbers — the
 * portal, the customer's own API token, and the CRM — and that none of them
 * leaks a session id or an end customer's phone number.
 *
 * Needs the API on 8099 and keys in /tmp/adminkey and /tmp/automationkey.
 *
 *   node test/analytics.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AUTOMATION_KEY = fs.readFileSync('/tmp/automationkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const aget = (p) => call('GET', p);
const apost = (p, b) => call('POST', p, b);

const stamp = Date.now();
const REF = `analytics-test-${stamp}`;
const AGENT_REF = `analytics-test-agent-${stamp}`;
// End customers' phone numbers. None of these may ever appear in what a
// customer can see.
const PHONE_A = `92300${String(stamp).slice(-7)}`;
const PHONE_B = `92301${String(stamp).slice(-7)}`;
const PHONE_C = `92302${String(stamp).slice(-7)}`;
const day = (d) => d.toISOString().slice(0, 10);
const now = new Date();
const longAgo = new Date(Date.now() - 400 * 86400000);

(async () => {
  console.log('\n== a throwaway client with one agent ==');
  const products = (await aget('/api/products')).body;
  const growth = products.find((p) => p.name === 'Growth');
  const created = await apost('/api/clients', {
    name: 'Analytics Test', company: `Analytics Test Co ${stamp}`, email: 'analytics-test@example.com',
    phone: '923004445555', product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral',
    external_ref: REF, ntn: '1234567-8', billing_address: 'Lahore',
  });
  ok(created.status === 201, 'client created', JSON.stringify(created.body).slice(0, 150));
  const clientId = created.body.id;
  const agent = await apost('/api/agents', { client_id: clientId, name: 'Test WhatsApp agent', kind: 'whatsapp', external_ref: AGENT_REF });
  ok(agent.status === 201, 'agent created', JSON.stringify(agent.body).slice(0, 150));

  console.log('\n== conversations with a known shape ==');
  // A: first time today, handed to a person.
  // B: first seen 400 days ago, back today (returning), handoff not reported.
  // C: first time today, two events in one session (counts once), AI only.
  const events = [
    { session_id: `${PHONE_A}-${day(now)}`, messages_count: 1, handoff: true },
    { session_id: `${PHONE_B}-${day(longAgo)}`, messages_count: 1, occurred_at: longAgo.toISOString() },
    { session_id: `${PHONE_B}-${day(now)}`, messages_count: 1 },
    { session_id: `${PHONE_C}-${day(now)}`, messages_count: 2, handoff: false },
    { session_id: `${PHONE_C}-${day(now)}`, messages_count: 3, handoff: false },
  ];
  for (const e of events) {
    const r = await apost('/api/webhooks/usage', { agent_ref: AGENT_REF, channel: 'whatsapp', ai_model: 'test', ...e });
    if (r.status !== 201) ok(false, 'usage event accepted', JSON.stringify(r.body));
  }
  ok(true, `${events.length} usage events recorded`);

  console.log('\n== satisfaction answers ==');
  const s1 = await apost('/api/webhooks/csat', { agent_ref: AGENT_REF, session_id: `${PHONE_A}-${day(now)}`, score: 5, nps: 10, resolved: true, comment: 'Brilliant, sorted in a minute', external_id: `r1-${stamp}` });
  ok(s1.status === 201 && s1.body.client_id === clientId, 'a full answer is recorded against the right client', JSON.stringify(s1.body));
  const s2 = await apost('/api/webhooks/csat', { external_ref: AGENT_REF, score: 2, nps: 3, resolved: false, external_id: `r2-${stamp}` });
  ok(s2.status === 201, 'an agent ref given as external_ref resolves too', JSON.stringify(s2.body));
  const s3 = await apost('/api/webhooks/csat', { client_id: clientId, score: 4 });
  ok(s3.status === 201, 'a one-tap score on its own is enough', JSON.stringify(s3.body));
  const dup = await apost('/api/webhooks/csat', { agent_ref: AGENT_REF, score: 1, external_id: `r1-${stamp}` });
  ok(dup.status === 200 && dup.body.duplicate === true, 'a retried delivery with the same external_id is ignored, not double-counted', JSON.stringify(dup.body));

  const bad1 = await apost('/api/webhooks/csat', { client_id: clientId, score: 6 });
  ok(bad1.status === 400, 'a score outside 1–5 is refused', JSON.stringify(bad1.body));
  const bad2 = await apost('/api/webhooks/csat', { client_id: clientId, comment: 'no score' });
  ok(bad2.status === 400, 'an answer with no score, NPS or resolved flag is refused', JSON.stringify(bad2.body));
  const bad3 = await apost('/api/webhooks/csat', { agent_ref: 'no-such-agent-' + stamp, score: 3 });
  ok(bad3.status === 404, 'an unknown agent is a 404', JSON.stringify(bad3.body));
  const bad4 = await apost('/api/webhooks/csat', { client_id: 'not-a-uuid', score: 3 });
  ok(bad4.status === 400, 'a malformed client_id is a 400, not a crash', JSON.stringify(bad4.body));
  const bad5 = await apost('/api/webhooks/csat', { client_id: clientId, nps: 11 });
  ok(bad5.status === 400, 'an NPS outside 0–10 is refused', JSON.stringify(bad5.body));

  console.log('\n== the CRM view of this one client ==');
  const crm = await aget(`/api/analytics/clients/${clientId}?grain=month`);
  ok(crm.status === 200, 'GET /api/analytics/clients/:id works', JSON.stringify(crm.body).slice(0, 200));
  const k = crm.body.kpis;
  ok(k.conversations.current === 3, 'three conversations this month — a two-event session counts once', JSON.stringify(k.conversations));
  ok(k.messages.current === 7, 'seven messages', JSON.stringify(k.messages));
  ok(k.contacts.current === 3, 'three people', JSON.stringify(k.contacts));
  ok(k.new_contacts.current === 2, 'two of them first-time contacts', JSON.stringify(k.new_contacts));
  ok(k.returning_contacts.current === 1, 'and one returning after 400 days', JSON.stringify(k.returning_contacts));
  ok(k.containment && k.containment.reported_conversations === 2 && k.containment.handed_off === 1 && k.containment.current === 50,
    'containment counts only conversations whose agent reported it: 1 of 2 handed off', JSON.stringify(k.containment));
  ok(crm.body.series.length === 12, 'month grain charts twelve months', String(crm.body.series.length));
  ok(crm.body.series[11].conversations === 3, 'and the current month is the last bar', JSON.stringify(crm.body.series[11]));
  ok(crm.body.channels[0].channel === 'whatsapp' && crm.body.channels[0].share_pct === 100, 'channel split', JSON.stringify(crm.body.channels));
  ok(crm.body.agents[0].name === 'Test WhatsApp agent' && crm.body.agents[0].conversations === 3, 'agent split', JSON.stringify(crm.body.agents));
  ok(crm.body.heatmap.flat().reduce((a, v) => a + v, 0) === 3, 'the heatmap holds every conversation in the window');

  const sat = crm.body.satisfaction.kpis;
  ok(sat.csat.responses === 3 && sat.csat.current === 66.7, 'CSAT is the share of 4s and 5s: 2 of 3', JSON.stringify(sat.csat));
  ok(sat.csat.average === 3.67, 'with the average alongside', JSON.stringify(sat.csat));
  ok(sat.nps.responses === 2 && sat.nps.current === 0 && sat.nps.promoters === 1 && sat.nps.detractors === 1, 'NPS: one promoter, one detractor, score 0', JSON.stringify(sat.nps));
  ok(sat.resolution.responses === 2 && sat.resolution.current === 50, 'resolution: 1 of 2', JSON.stringify(sat.resolution));
  ok(crm.body.satisfaction.distribution.map((d) => d.n).join(',') === '0,1,0,1,1', 'score distribution', JSON.stringify(crm.body.satisfaction.distribution));
  ok(crm.body.satisfaction.recent_feedback.length === 1 && crm.body.satisfaction.recent_feedback[0].comment === 'Brilliant, sorted in a minute', 'the comment comes through', JSON.stringify(crm.body.satisfaction.recent_feedback));
  ok(crm.body.quota && crm.body.quota.used === 3, 'package pace counts this month\'s conversations', JSON.stringify(crm.body.quota));
  ok(Array.isArray(crm.body.insights), 'insights are returned');

  console.log('\n== every grain, and a bad one ==');
  const lens = { day: 30, week: 12, month: 12, quarter: 8, year: 5 };
  for (const [g, len] of Object.entries(lens)) {
    const r = await aget(`/api/analytics/clients/${clientId}?grain=${g}`);
    ok(r.status === 200 && r.body.series.length === len && r.body.kpis.conversations.current === 3,
      `${g}: ${len} buckets, and today's conversations are in the current one`, JSON.stringify({ s: r.status, len: r.body && r.body.series.length, c: r.body && r.body.kpis.conversations }));
  }
  const bogus = await aget(`/api/analytics/clients/${clientId}?grain=fortnight`);
  ok(bogus.status === 200 && bogus.body.grain === 'month', 'an unknown grain falls back to month');
  const year = await aget(`/api/analytics/clients/${clientId}?grain=year`);
  const lastYearBucket = year.body.series[year.body.series.length - 2].conversations + year.body.series[year.body.series.length - 3].conversations;
  ok(lastYearBucket >= 1, 'the 400-day-old conversation lands in an earlier year', JSON.stringify(year.body.series));

  console.log('\n== the customer sees the same numbers, and nothing that identifies their customers ==');
  const username = `analytics-test-${stamp}`;
  await apost(`/api/clients/${clientId}/portal-credentials`, { username, password: 'AnalyticsTestPass123' });
  const login = await call('POST', '/api/portal/login', { username, password: 'AnalyticsTestPass123' }, { 'Content-Type': 'application/json' });
  ok(!!login.body.session, 'portal login', JSON.stringify(login.body));
  const PH = { Authorization: `Bearer ${login.body.session}` };
  const portal = await call('GET', '/api/portal/analytics?grain=month', null, PH);
  ok(portal.status === 200, 'GET /api/portal/analytics works');
  ok(JSON.stringify(portal.body.kpis) === JSON.stringify(crm.body.kpis), 'the portal\'s figures match the CRM\'s exactly');
  ok(JSON.stringify(portal.body.satisfaction.kpis) === JSON.stringify(crm.body.satisfaction.kpis), 'satisfaction too');
  const raw = JSON.stringify(portal.body);
  ok(!raw.includes('session_id'), 'no session_id field anywhere in the portal response');
  ok(![PHONE_A, PHONE_B, PHONE_C].some((p) => raw.includes(p)), 'no end customer\'s phone number anywhere in the portal response');
  ok(!('top_clients' in portal.body), 'and no other clients\' names');

  console.log('\n== and through their own API token, once an admin allows it ==');
  await call('PATCH', `/api/clients/${clientId}/api-access`, { enabled: true });
  const tok = await call('POST', '/api/portal/api-tokens', { name: 'Analytics test' }, { ...PH, 'Content-Type': 'application/json' });
  const ext = await call('GET', '/api/external/analytics?grain=month', null, { 'x-client-api-key': tok.body.token });
  ok(ext.status === 200 && JSON.stringify(ext.body.kpis) === JSON.stringify(crm.body.kpis), 'GET /api/external/analytics returns the same figures', JSON.stringify(ext.body).slice(0, 150));
  const extRaw = JSON.stringify(ext.body);
  ok(!extRaw.includes('session_id') && ![PHONE_A, PHONE_B, PHONE_C].some((p) => extRaw.includes(p)), 'with the same redactions');

  console.log('\n== the CRM\'s wider views ==');
  const platform = await aget('/api/analytics/platform?grain=month');
  ok(platform.status === 200 && platform.body.top_clients.some((c) => c.id === clientId), 'the platform view lists this client among the busiest', JSON.stringify(platform.body.top_clients).slice(0, 200));
  ok(platform.body.agents.some((a) => a.name === `Test WhatsApp agent — Analytics Test Co ${stamp}`), 'and names each agent with its company', JSON.stringify(platform.body.agents).slice(0, 300));
  const sales = await aget('/api/analytics/sales?grain=quarter');
  ok(sales.status === 200 && sales.body.funnel.length === 5 && sales.body.series.length === 8, 'the sales view: a five-stage funnel over eight quarters');
  ok(!sales.body.sources.some((s) => s.name === `Analytics Test Co ${stamp}`), 'a client added straight in as active is not counted as a lead we won');
  const auto = await call('GET', '/api/analytics/platform', null, { 'x-api-key': AUTOMATION_KEY });
  ok(auto.status === 403, 'an automation key cannot read CRM analytics', String(auto.status));
  const missing = await aget('/api/analytics/clients/00000000-0000-0000-0000-000000000000');
  ok(missing.status === 404, 'an unknown client is a 404');
  const garbage = await aget('/api/analytics/clients/undefined');
  ok(garbage.status === 404, 'a garbage id is a 404, not a crash');

  console.log('\n== cleanup ==');
  await call('DELETE', `/api/clients/${clientId}`);
  const gone = await aget(`/api/clients/${clientId}`);
  ok(gone.status === 404, 'the test client, its usage and its answers are gone');

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
