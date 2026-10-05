/**
 * Vantriq Echo's dashboard (v9.18): GET /api/surveys/dashboard — every survey
 * of a client together, by period, for the CRM and the client's portal.
 *
 * Builds one throwaway client with two surveys and known answers, then checks
 * the headline figures, trends, 1–5 and 0–10 spreads, breakdowns (survey,
 * channel, location, gender, age, city), the invite funnel, follow-ups,
 * themes and findings — and that the portal sees exactly its own.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey.
 *
 *   node test/echo-dashboard.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const AH = { 'Content-Type': 'application/json', 'x-api-key': fs.readFileSync('/tmp/adminkey', 'utf8').trim() };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const stamp = Date.now();
let ip = 0;
const answer = (slug, answers, extra = {}) => call('POST', `/api/public/surveys/${slug}/responses`, { answers, ...extra },
  { 'Content-Type': 'application/json', 'X-Real-IP': `10.97.${Math.floor(++ip / 250)}.${ip % 250}` });

(async () => {
  const growth = (await call('GET', '/api/products')).body.find((p) => p.name === 'Growth');
  const c = (await call('POST', '/api/clients', { name: 'Echo Dash', company: `Echo Dash ${stamp}`, email: 'e@example.com', phone: '923004440000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: `echo-dash-${stamp}`, ntn: '1234567-8', billing_address: 'Lahore' })).body;
  try {
    await call('PATCH', `/api/clients/${c.id}/surveys`, { enabled: true });
    const s1 = (await call('POST', '/api/surveys', { client_id: c.id, template: 'general', title: 'Store visit', locations: ['Gulberg', 'DHA'] })).body;
    const s2 = (await call('POST', '/api/surveys', { client_id: c.id, template: 'support_chat', title: 'After chat' })).body;
    const [gul, dha] = s1.locations.map((l) => l.id);
    const empty = (await call('GET', `/api/surveys/dashboard?client_id=${c.id}`)).body;
    ok(empty.window.responses === 0 && empty.series.length === 12, 'before any answer: an empty window of twelve months');

    // Six at Gulberg (5 women, happy), six at DHA (men, unhappy), two after-chat.
    for (let i = 0; i < 6; i++) await answer(s1.slug, { csat: 5, nps: 10, gender: { choice: 'female' }, city: { choice: 'lahore' }, age: { choice: '25_34' }, loved: 'friendly staff and quick service' }, { location: gul, channel: 'qr' });
    for (let i = 0; i < 6; i++) await answer(s1.slug, { csat: 2, nps: 3, gender: { choice: 'male' }, city: { choice: 'karachi' }, age: { choice: '35_44' }, improve: 'long queue and rude cashier' }, { location: dha, channel: 'link' });
    const inv = await call('POST', '/api/webhooks/survey-invite', { external_ref: `echo-dash-${stamp}`, session_id: `923001234567-${stamp}`, survey_slug: s2.slug });
    await answer(s2.slug, { csat: 4, resolved: true }, { invite: inv.body.token });
    await call('POST', '/api/webhooks/survey-invite', { external_ref: `echo-dash-${stamp}`, session_id: `923001234568-${stamp}`, survey_slug: s2.slug });

    const d = (await call('GET', `/api/surveys/dashboard?client_id=${c.id}&grain=month`)).body;
    ok(d.kpis.responses.current === 13 && d.window.responses === 13, 'thirteen answers this month', JSON.stringify(d.kpis.responses));
    ok(d.kpis.csat.current === 53.8 && d.kpis.csat.average === 3.54, 'satisfied: 7 of 13 scored 4–5; average 3.54', JSON.stringify(d.kpis.csat));
    ok(d.kpis.nps.current === 0 && d.window.promoters === 6 && d.window.detractors === 6, 'NPS 0: six promoters, six detractors', JSON.stringify(d.kpis.nps));
    ok(d.kpis.resolution.current === 100, 'the one resolved question: 100%');
    ok(d.kpis.unhappy.current === 6, 'six unhappy answers');
    ok(d.series.length === 12 && d.series[11].responses === 13, 'the current month is the last point of the trend');
    ok(d.distribution.map((x) => x.n).join(',') === '0,6,0,1,6', 'scores 1–5', JSON.stringify(d.distribution));
    ok(d.nps_distribution[3].n === 6 && d.nps_distribution[10].n === 6, 'NPS 0–10, point by point');
    ok(d.funnel.sent === 2 && d.funnel.answered === 1 && d.kpis.response_rate.current === 50, 'personal links: two sent, one answered — 50%', JSON.stringify(d.funnel));
    const sv = Object.fromEntries(d.surveys.map((x) => [x.name, x]));
    ok(sv['Store visit'].responses === 12 && sv['After chat'].responses === 1 && sv['After chat'].response_rate === 50, 'every survey, with its own response rate');
    const loc = Object.fromEntries(d.locations.map((x) => [x.name, x]));
    ok(loc.Gulberg.csat === 100 && loc.DHA.csat === 0, 'by location: Gulberg 100%, DHA 0%', JSON.stringify(d.locations));
    const ch = Object.fromEntries(d.channels.map((x) => [x.name, x]));
    ok(ch['QR code'].responses === 6 && ch['Survey link'].responses === 6 && ch.WhatsApp.responses === 1, 'by channel', JSON.stringify(d.channels));
    const gen = Object.fromEntries(d.demographics.gender.map((x) => [x.name, x]));
    ok(gen.Female.csat === 100 && gen.Male.csat === 0 && gen['Not given'].responses === 1, 'by gender', JSON.stringify(d.demographics.gender));
    ok(d.demographics.age[0].name === '25–34' && d.demographics.city.some((x) => x.name === 'Karachi'), 'by age group (in order) and city');
    ok(d.followups.open === 6, 'six follow-ups waiting', JSON.stringify(d.followups));
    ok(d.themes.unhappy.some((x) => x.word === 'queue') && !d.themes.unhappy.some((x) => x.word === 'friendly'), 'what the unhappy write about — words that set them apart', JSON.stringify(d.themes));
    ok(d.themes.happy.some((x) => x.word === 'friendly'), 'and what the happy love');
    ok(d.heatmap.flat().reduce((a, v) => a + v, 0) === 13, 'every answer on the day × hour grid');
    ok(d.insights.some((x) => /lowest at DHA/.test(x.text)) && d.insights.filter((x) => /lowest/.test(x.text)).length <= 2, 'findings in plain words: the widest gaps, not every one', JSON.stringify(d.insights));
    ok(d.recent_comments.length === 10 && d.recent_comments[0].comment, 'the latest comments', String(d.recent_comments.length));
    const w = (await call('GET', `/api/surveys/dashboard?client_id=${c.id}&grain=week`)).body;
    ok(w.series.length === 12 && w.kpis.responses.current === 13, 'by week too');

    await call('POST', `/api/clients/${c.id}/portal-credentials`, { username: `echo-dash-${stamp}`, password: 'EchoDashPass12' });
    const login = (await call('POST', '/api/portal/login', { username: `echo-dash-${stamp}`, password: 'EchoDashPass12' }, { 'Content-Type': 'application/json' })).body;
    const p = await call('GET', '/api/portal/surveys/dashboard?grain=month', null, { Authorization: `Bearer ${login.session}` });
    ok(p.status === 200 && JSON.stringify(p.body.kpis) === JSON.stringify(d.kpis), 'the portal gets exactly the same figures');
    ok(!JSON.stringify(p.body).includes('923001234567'), 'and no customer\'s number');
    const all = (await call('GET', '/api/surveys/dashboard?grain=month')).body;
    ok(all.window.responses >= 13 && all.surveys.some((x) => x.company === `Echo Dash ${stamp}`), 'every client together in the CRM, each survey named with its client');
    await call('PATCH', `/api/clients/${c.id}/surveys`, { enabled: false });
    ok((await call('GET', '/api/portal/surveys/dashboard', null, { Authorization: `Bearer ${login.session}` })).status === 403, 'Echo switched off: no dashboard in the portal (403)');
  } finally {
    await call('DELETE', `/api/clients/${c.id}`);
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
