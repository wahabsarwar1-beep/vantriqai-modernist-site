/**
 * Surveys (v9.14), end to end through the API.
 *
 * Builds two throwaway clients, a survey from every industry template, and
 * checks the whole path a real answer takes: the public page and API, answer
 * validation and branching, retries, the honeypot, personal invites from the
 * n8n webhook, follow-ups, the survey's own results — and that the same
 * answers reach the dashboards that already existed (CRM and portal
 * Analytics), the portal, the customer's API and the Excel export. Also that
 * one customer can never see another's surveys, and that nothing internal
 * leaks to a respondent.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Cleans up after
 * itself (deleting the clients deletes everything hanging off them).
 *
 *   node test/surveys.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await J(r), headers: r.headers }));
const get = (p, h) => call('GET', p, undefined, h);
const post = (p, b, h) => call('POST', p, b, h);
const patch = (p, b, h) => call('PATCH', p, b, h);
const pub = (p, b, ip) => call(b ? 'POST' : 'GET', p, b, { 'Content-Type': 'application/json', ...(ip ? { 'X-Real-IP': ip } : {}) });
const page = (p) => fetch(B + p).then(async (r) => ({ status: r.status, text: await r.text(), type: r.headers.get('content-type') }));

const stamp = Date.now();
let ipN = 0;
const ip = () => `10.77.${Math.floor(++ipN / 250)}.${ipN % 250}`; // a fresh "device" per answer, clear of the rate limit

(async () => {
  const products = (await get('/api/products')).body;
  const growth = products.find((p) => p.name === 'Growth');
  const mkClient = async (tag) => {
    const r = await post('/api/clients', {
      name: `Survey ${tag}`, company: `Survey Test ${tag} ${stamp}`, email: `survey-${tag}@example.com`, phone: '923001234000',
      product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: `survey-${tag}-${stamp}`,
      ntn: '1234567-8', billing_address: 'Lahore',
    });
    return r.body;
  };
  const A = await mkClient('a');
  const Bc = await mkClient('b');
  ok(A && A.id && Bc && Bc.id, 'two throwaway clients');

  console.log('\n== the template gallery ==');
  const tpls = (await get('/api/surveys/templates')).body;
  ok(Array.isArray(tpls) && tpls.length >= 17, `${tpls.length} industry templates`);
  for (const k of ['restaurant', 'fmcg_consumer', 'fmcg_trade', 'telecom', 'healthcare', 'retail', 'banking', 'support_chat']) {
    ok(tpls.some((t) => t.key === k), `includes ${k}`);
  }

  console.log('\n== every template becomes a valid, bilingual survey ==');
  const made = [];
  for (const t of tpls) {
    const r = await post('/api/surveys', { client_id: A.id, template: t.key, status: 'draft' });
    made.push(r.body);
    const bothLangs = r.status === 201 && r.body.questions.every((q) => q.title.en && q.title.ur);
    ok(bothLangs, `${t.key}: created with every question in English and Urdu`, JSON.stringify(r.body).slice(0, 160));
  }
  ok(new Set(made.map((s) => s.slug)).size === made.length, 'every survey got its own address');
  ok(made.every((s) => /^[a-z0-9][a-z0-9-]{2,62}$/.test(s.slug) && /-[0-9a-f]{5}$/.test(s.slug)), 'addresses end in a random tail nobody can guess');

  console.log('\n== creating one for real ==');
  const created = await post('/api/surveys', {
    client_id: A.id, template: 'restaurant', title: 'Dine-in', locations: ['Gulberg', 'DHA Phase 5'],
    review_url: 'https://g.page/r/example/review', alert_emails: 'manager@example.com',
  });
  const S = created.body;
  ok(created.status === 201 && S.status === 'live', 'a live restaurant survey', JSON.stringify(S).slice(0, 200));
  ok(S.locations.map((l) => l.id).join() === 'gulberg,dha_phase_5', 'locations get stable ids');
  ok(S.links && S.links.url.endsWith(`/s/${S.slug}`) && S.links.locations.length === 2, 'share links, one per location');
  ok((await post('/api/surveys', { client_id: A.id, template: 'nope' })).status === 400, 'an unknown template is refused');
  ok((await post('/api/surveys', { template: 'general' })).status === 400, 'staff must say which client');
  ok((await post('/api/surveys', { client_id: A.id, template: 'general', brand_color: 'red' })).status === 400, 'a colour must be a hex colour');
  ok((await post('/api/surveys', { client_id: A.id, template: 'general', logo_url: 'http://insecure.example/logo.png' })).status === 400, 'a logo must be https');
  ok((await post('/api/surveys', { client_id: A.id, template: 'general', alert_emails: 'not-an-email' })).status === 400, 'alert addresses must be addresses');

  console.log('\n== what a respondent receives ==');
  const pg = await page(`/s/${S.slug}`);
  ok(pg.status === 200 && /text\/html/.test(pg.type), 'the survey page is served');
  ok(pg.text.includes(`"slug":"${S.slug}"`), 'with the survey inside it (no second round trip)');
  ok(/<meta property="og:title" content="[^"]*Tell us how we did/.test(pg.text), 'and a link-preview title for WhatsApp');
  ok(!/\{\{[A-Z_]+\}\}/.test(pg.text), 'with every placeholder filled');
  ok(!pg.text.includes('manager@example.com') && !pg.text.includes(A.id), 'without the alert list or the client id');
  const pj = (await pub(`/api/public/surveys/${S.slug}`)).body.survey;
  ok(pj && !('alert_emails' in pj) && !('client_id' in pj) && !('created_by' in pj), 'the public JSON carries only public fields', Object.keys(pj || {}).join());
  ok((await page('/s/no-such-survey-00000')).status === 404, 'an unknown address is a 404 page');

  console.log('\n== answers are checked against the questions ==');
  const R = `/api/public/surveys/${S.slug}/responses`;
  let r = await pub(R, { answers: { csat: 7 } }, ip());
  ok(r.status === 400 && Array.isArray(r.body.details), 'bad answers: 400 with a reason per question', JSON.stringify(r.body));
  ok(r.body.details.some((d) => d.question === 'csat') && r.body.details.some((d) => d.question === 'order_type'), 'naming the out-of-range score and the missing required answer');
  r = await pub(R, { answers: { order_type: { choice: 'helicopter' }, csat: 4, nps: 8 } }, ip());
  ok(r.status === 400, 'an option that does not exist is refused');
  r = await pub(R, { answers: {} }, ip());
  ok(r.status === 400, 'an empty submission is refused');

  console.log('\n== a delighted customer ==');
  const sid = `test-${stamp}-happy`;
  const happy = {
    answers: { order_type: 'dine_in', csat: 5, aspects: { food: 5, service: 4, speed: 4, clean: 5, value: 4 }, nps: 10,
      loved: 'The <script>alert(1)</script> biryani', improve: 'should be dropped: not shown to a promoter' },
    submission_id: sid, language: 'ur', location: 'gulberg', channel: 'qr', duration_ms: 42000,
  };
  const h1 = await pub(R, happy, ip());
  ok(h1.status === 201 && h1.body.id, 'recorded (201)', JSON.stringify(h1.body));
  ok(h1.body.review_url === 'https://g.page/r/example/review', 'and offered the Google review link');
  ok(h1.body.followup === false, 'no follow-up for a promoter');
  const h2 = await pub(R, happy, ip());
  ok(h2.status === 200 && h2.body.duplicate === true && h2.body.id === h1.body.id, 'a retry with the same submission id is recognised, not double-counted');

  console.log('\n== an unhappy one ==');
  const sad = await pub(R, {
    answers: { order_type: 'delivery', csat: 1, nps: 2, improve: 'Cold and late', contact: { name: 'Bilal', phone: '0300 1234567', consent: true } },
    submission_id: `test-${stamp}-sad`, language: 'en', location: 'dha_phase_5', channel: 'whatsapp',
  }, ip());
  ok(sad.status === 201 && sad.body.followup === true && !sad.body.review_url, 'recorded, with a follow-up opened and no review prompt');
  const neutral = await pub(R, { answers: { order_type: 'takeaway', csat: 3, nps: 7, improve: 'Fine' }, submission_id: `test-${stamp}-mid` }, ip());
  ok(neutral.status === 201 && neutral.body.followup === false, 'a neutral 3/5 does not open a follow-up');
  const hp = await pub(R, { answers: { order_type: 'dine_in', csat: 5, nps: 9 }, website: 'http://spam.example' }, ip());
  ok(hp.status === 201, 'the honeypot is told it succeeded');

  const list = (await get(`/api/surveys/${S.id}/responses?limit=50`)).body;
  ok(list.total === 3, 'three responses stored — the retry and the bot were not', String(list.total));
  const hr = list.items.find((x) => x.id === h1.body.id);
  ok(hr && hr.answers.loved && !('improve' in hr.answers), 'branching: the promoter\'s hidden question was dropped on the server');
  ok(hr.location && hr.location.name === 'Gulberg' && hr.channel === 'qr' && hr.language === 'ur', 'location, channel and language are kept');
  const sr = list.items.find((x) => x.id === sad.body.id);
  ok(sr.contact && sr.contact.phone === '0300 1234567' && sr.contact.consent === true, 'contact details with the respondent\'s consent');
  ok(sr.followup.status === 'open', 'the unhappy answer waits for a follow-up');
  ok(sr.readable.some((x) => /Overall/.test(x.question) && /1 \/ 5/.test(x.answer)), 'answers read as words');

  console.log('\n== the same answers reach the dashboards that already existed ==');
  const dash = (await get(`/api/analytics/clients/${A.id}?grain=month`)).body;
  ok(dash.satisfaction.kpis.csat.responses === 3, 'CRM Analytics (this client) counts all three CSAT answers', JSON.stringify(dash.satisfaction.kpis.csat));
  ok(dash.satisfaction.recent_feedback.some((f) => /Cold and late/.test(f.comment)), 'and shows what they wrote');
  const plat = (await get('/api/analytics/platform?grain=month')).body;
  ok(plat.satisfaction.responses_window >= 3, 'CRM Analytics (every customer) includes them');

  console.log('\n== the survey\'s own results ==');
  const an = (await get(`/api/surveys/${S.id}/analytics?grain=month`)).body;
  ok(an.kpis.responses.current === 3, 'three responses this month', JSON.stringify(an.kpis.responses));
  ok(an.kpis.csat.current === 33.3 && an.kpis.csat.average === 3, 'satisfied 33.3% (one of three), average 3.0', JSON.stringify(an.kpis.csat));
  ok(an.window.nps === 0 && an.window.promoters === 1 && an.window.detractors === 1, 'NPS 0 from one promoter, one passive, one detractor', JSON.stringify(an.window));
  const grid = an.questions.find((q) => q.type === 'rating_grid');
  ok(grid && grid.rows.find((x) => x.id === 'food').average === 5, 'the rating grid is broken out row by row');
  ok(an.locations.find((l) => l.id === 'gulberg').responses === 1, 'results by location');
  ok(an.followups.open === 1, 'one open follow-up');
  ok(Array.isArray(an.insights) && an.insights.length > 0, 'with plain-English findings');
  ok((await get(`/api/surveys/${S.id}/analytics?grain=year`)).status === 200, 'and by year');

  console.log('\n== closing the loop ==');
  const fu = await patch(`/api/surveys/${S.id}/responses/${sad.body.id}`, { followup_status: 'contacted', followup_note: 'Called, offered a voucher' });
  ok(fu.status === 200 && fu.body.followup.status === 'contacted' && fu.body.followup.by, 'marked contacted, with who did it');
  ok((await patch(`/api/surveys/${S.id}/responses/${sad.body.id}`, { followup_status: 'maybe' })).status === 400, 'an unknown follow-up status is refused');
  const ov = (await get(`/api/surveys/overview?client_id=${A.id}`)).body;
  ok(ov.followups.contacted === 1 && ov.followup_queue.length === 1, 'the overview\'s queue follows it');

  console.log('\n== editing ==');
  const qs = S.questions.slice();
  qs.push({ type: 'multi', title: { en: 'What did you order?', ur: 'آپ نے کیا آرڈر کیا؟' }, options: ['Biryani', 'Karahi', 'Tea'], allow_other: true });
  const ed = await patch(`/api/surveys/${S.id}`, { questions: qs, display_name: 'Khan & Sons "Kitchen"', brand_color: '#0f766e' });
  ok(ed.status === 200 && ed.body.questions.length === S.questions.length + 1, 'a question added', JSON.stringify(ed.body).slice(0, 200));
  const added = ed.body.questions[ed.body.questions.length - 1];
  ok(/^q_[0-9a-f]{6}$/.test(added.id) && added.options.map((o) => o.id).join() === 'biryani,karahi,tea', 'the new question gets a random id, its options readable ones');
  ok(ed.body.questions.slice(0, -1).every((q, i) => q.id === S.questions[i].id), 'existing questions keep their ids, so old answers still count');
  const bad = await patch(`/api/surveys/${S.id}`, { questions: [] });
  ok(bad.status === 400, 'a survey with no questions is refused');
  const dangling = await patch(`/api/surveys/${S.id}`, { questions: ed.body.questions.filter((q) => q.id !== 'nps') });
  ok(dangling.status === 200 && dangling.body.questions.every((q) => !q.show_if || q.show_if.q !== 'nps'), 'deleting a question drops rules that pointed at it, instead of failing');
  const esc = await page(`/s/${S.slug}`);
  ok(esc.text.includes('Khan &amp; Sons &quot;Kitchen&quot;'), 'a business name is escaped in the page\'s tags');
  ok(!esc.text.includes('<script>alert(1)</script>'), 'and nothing a respondent typed is ever sent back to the page');
  const taken = await patch(`/api/surveys/${made[0].id}`, { slug: S.slug });
  ok(taken.status === 409, 'an address already in use is refused (409)');

  console.log('\n== states ==');
  await patch(`/api/surveys/${S.id}`, { status: 'paused' });
  r = await pub(R, { answers: { order_type: 'dine_in', csat: 5, nps: 9 } }, ip());
  ok(r.status === 409, 'a paused survey accepts nothing (409)');
  ok((await page(`/s/${S.slug}`)).text.includes('"state":"paused"'), 'and shows respondents a paused notice');
  await patch(`/api/surveys/${S.id}`, { status: 'closed' });
  ok((await pub(R, { answers: { order_type: 'dine_in', csat: 5, nps: 9 } }, ip())).status === 410, 'a closed survey: 410');
  await patch(`/api/surveys/${S.id}`, { status: 'draft' });
  ok((await pub(`/api/public/surveys/${S.slug}`)).status === 404, 'a draft is invisible…');
  ok((await pub(`/api/public/surveys/${S.slug}?preview=1`)).status === 200, '…except as a preview');
  await patch(`/api/surveys/${S.id}`, { status: 'live', response_limit: 3 });
  ok((await pub(R, { answers: { order_type: 'dine_in', csat: 5, nps: 9 } }, ip())).status === 410, 'a survey at its response limit stops (410)');
  await patch(`/api/surveys/${S.id}`, { response_limit: null, closes_at: new Date(Date.now() - 60000).toISOString() });
  ok((await pub(R, { answers: { order_type: 'dine_in', csat: 5, nps: 9 } }, ip())).status === 410, 'past its closing date: 410');
  await patch(`/api/surveys/${S.id}`, { closes_at: null });

  console.log('\n== invites from the n8n webhook ==');
  const chat = await post('/api/surveys', { client_id: A.id, template: 'support_chat', title: 'After chat' });
  const inv = await post('/api/webhooks/survey-invite', { external_ref: A.external_ref, session_id: `923001230000-${stamp}`, channel: 'whatsapp' });
  ok(inv.status === 201 && inv.body.survey.slug === chat.body.slug, 'the client\'s after-chat survey is chosen by default', JSON.stringify(inv.body).slice(0, 200));
  ok(/\?i=[A-Za-z0-9_-]{16}$/.test(inv.body.url) && inv.body.message.en.includes(inv.body.url) && inv.body.message.ur.includes(inv.body.url), 'a personal link, and a message to send in both languages');
  const token = inv.body.token;
  const ipg = await page(`/s/${chat.body.slug}?i=${token}`);
  ok(ipg.text.includes(`"token":"${token}"`) && ipg.text.includes('"answered":false'), 'the page knows the invite');
  const IR = `/api/public/surveys/${chat.body.slug}/responses`;
  const ia = await pub(IR, { answers: { csat: 2, resolved: false, comment: 'Took too long' }, invite: token }, ip());
  ok(ia.status === 201 && ia.body.followup === true, 'answered once through the invite');
  const again = await pub(IR, { answers: { csat: 5, resolved: true }, invite: token }, ip());
  ok(again.status === 409 && again.body.already_answered, 'the same invite cannot answer twice');
  const csatRow = (await get(`/api/analytics/clients/${A.id}?grain=month`)).body.satisfaction.kpis.resolution;
  ok(csatRow.responses >= 1, 'the resolved answer reaches the dashboards\' resolution rate');
  const inv2 = await post('/api/webhooks/survey-invite', { external_ref: A.external_ref, survey_slug: made[1].slug });
  ok(inv2.status === 409, 'naming a survey that is not live is refused');
  const inv3 = await post('/api/webhooks/survey-invite', { external_ref: Bc.external_ref });
  ok(inv3.status === 404, 'a client with no live survey is told so (404)');
  // n8n on the VPS calls the CRM as http://crm_app:8080. A link built from
  // that Host would reach nobody, so it must come back as the public address.
  const viaContainer = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ external_ref: A.external_ref, session_id: `923001230001-${stamp}` });
    const rq = require('http').request({ host: '127.0.0.1', port: 8099, path: '/api/webhooks/survey-invite', method: 'POST',
      headers: { ...AH, Host: 'crm_app:8080', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let t = ''; res.on('data', (c) => { t += c; }); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(t) }));
    });
    rq.on('error', reject); rq.end(body);
  });
  ok(viaContainer.status === 201 && viaContainer.body.url.startsWith('https://portal.vantriqai.com/s/'),
    'an invite asked for by container name (as n8n does) still links to the public portal', viaContainer.body.url);
  const cAn = (await get(`/api/surveys/${chat.body.id}/analytics`)).body;
  ok(cAn.invites.sent === 2 && cAn.invites.answered === 1 && cAn.invites.response_rate === 50, 'the response rate counts invites sent against invites answered', JSON.stringify(cAn.invites));

  console.log('\n== the customer\'s portal: their own surveys only ==');
  await post(`/api/clients/${A.id}/portal-credentials`, { username: `survey-a-${stamp}`, password: 'SurveyTestPassA1' });
  await post(`/api/clients/${Bc.id}/portal-credentials`, { username: `survey-b-${stamp}`, password: 'SurveyTestPassB1' });
  const loginA = (await post('/api/portal/login', { username: `survey-a-${stamp}`, password: 'SurveyTestPassA1' }, { 'Content-Type': 'application/json' })).body;
  const loginB = (await post('/api/portal/login', { username: `survey-b-${stamp}`, password: 'SurveyTestPassB1' }, { 'Content-Type': 'application/json' })).body;
  const PA = { 'Content-Type': 'application/json', Authorization: `Bearer ${loginA.session}` };
  const PB = { 'Content-Type': 'application/json', Authorization: `Bearer ${loginB.session}` };
  const la = (await get('/api/portal/surveys', PA)).body;
  ok(la.surveys.length === made.length + 2 && la.surveys.every((x) => x.client_id === A.id), 'A sees exactly A\'s surveys');
  const lb = (await get('/api/portal/surveys', PB)).body;
  ok(lb.surveys.length === 0, 'B sees none of them');
  ok((await get(`/api/portal/surveys/${S.id}`, PB)).status === 404, 'B cannot open A\'s survey (404, not 403)');
  ok((await get(`/api/portal/surveys/${S.id}/responses`, PB)).status === 404, 'nor read its responses');
  ok((await patch(`/api/portal/surveys/${S.id}`, { title: 'hijacked' }, PB)).status === 404, 'nor change it');
  ok((await call('DELETE', `/api/portal/surveys/${S.id}`, undefined, PB)).status === 404, 'nor delete it');
  ok((await get(`/api/portal/surveys?client_id=${A.id}`, PB)).body.surveys.length === 0, 'and ?client_id= does not widen a customer\'s view');
  const own = await post('/api/portal/surveys', { template: 'telecom', client_id: A.id }, PB);
  ok(own.status === 201 && own.body.client_id === Bc.id, 'a customer creating a survey always creates their own, whatever they send');
  const pAn = (await get(`/api/portal/surveys/${S.id}/analytics`, PA)).body;
  ok(pAn.kpis && pAn.kpis.responses.current === an.kpis.responses.current, 'A\'s portal shows the same results as the CRM');
  ok((await get(`/api/portal/surveys/${S.id}/responses`, PA)).body.total === 3, 'and the same responses');
  const pFu = await patch(`/api/portal/surveys/${S.id}/responses/${sad.body.id}`, { followup_status: 'resolved' }, PA);
  ok(pFu.status === 200 && /portal/.test(pFu.body.followup.by), 'the customer can close their own follow-ups');
  ok((await get('/api/surveys', PA)).status === 401, 'a portal session cannot use the staff API');

  console.log('\n== the customer\'s own API ==');
  await patch(`/api/clients/${A.id}/api-access`, { enabled: true });
  const tok = (await post('/api/portal/api-tokens', { name: 'survey test' }, PA)).body;
  const CH = { 'x-client-api-key': tok.token };
  const ext = await get('/api/external/surveys', CH);
  ok(ext.status === 200 && ext.body.length === la.surveys.length, 'lists the account\'s surveys', JSON.stringify(ext.body).slice(0, 120));
  const extR = await get(`/api/external/surveys/${S.id}/responses?limit=10`, CH);
  ok(extR.status === 200 && extR.body.total === 3, 'and their responses');
  ok(!JSON.stringify(extR.body).includes('session_id'), 'with no conversation session ids');
  ok((await get(`/api/external/surveys/${own.body.id}/responses`, CH)).status === 404, 'never another account\'s');
  const since = await get(`/api/external/surveys/${S.id}/responses?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`, CH);
  ok(since.status === 200 && since.body.total === 0, '?since= returns only what is new');

  console.log('\n== export ==');
  const x = await fetch(`${B}/api/surveys/${S.id}/responses.xlsx`, { headers: AH });
  const buf = Buffer.from(await x.arrayBuffer());
  ok(x.status === 200 && /spreadsheetml/.test(x.headers.get('content-type')) && buf.slice(0, 2).toString() === 'PK', 'every response as an Excel workbook');
  const px = await fetch(`${B}/api/portal/surveys/${S.id}/responses.xlsx`, { headers: PA });
  ok(px.status === 200, 'the customer can download it too');

  console.log('\n== QR codes and posters ==');
  const qr = await fetch(`${B}/s/${S.slug}/qr.svg?loc=gulberg`);
  const svg = await qr.text();
  ok(qr.status === 200 && /image\/svg\+xml/.test(qr.headers.get('content-type')) && svg.startsWith('<svg') && svg.includes('<path d="M'), 'a QR code as SVG');
  const poster = await page(`/s/${S.slug}/poster?loc=gulberg&layout=cards`);
  ok(poster.status === 200 && (poster.text.match(/class="card small"/g) || []).length === 4 && poster.text.includes('Gulberg'), 'a printable sheet of four table cards for a location');

  console.log('\n== rate limiting ==');
  const rl = await post('/api/surveys', { client_id: A.id, template: 'blank', title: 'Rate limit' });
  const RL = `/api/public/surveys/${rl.body.slug}/responses`;
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await pub(RL, { answers: { csat: 4 } }, '10.200.0.1')).status;
  ok(last === 429, 'the 31st answer from one device in ten minutes is turned away', String(last));
  ok((await pub(RL, { answers: { csat: 4 } }, '10.200.0.2')).status === 201, 'another device is unaffected');

  console.log('\n== malformed ids are refusals, not crashes (the 502) ==');
  for (const p of ['/api/surveys/not-a-uuid', `/api/surveys/${S.id}/responses/not-a-uuid`, '/api/surveys?client_id=zzz', '/api/subscriptions/not-a-uuid/phases']) {
    const res = await get(p);
    ok(res.status >= 400 && res.status < 500, `${p} → ${res.status}`);
  }
  ok((await get('/api/health', {})).status === 200, 'and the server is still up afterwards');

  console.log('\n== deleting ==');
  const before = (await get(`/api/analytics/clients/${A.id}?grain=month`)).body.satisfaction.kpis.csat.responses;
  const del = await call('DELETE', `/api/surveys/${S.id}`);
  ok(del.status === 204, 'a survey is deleted');
  const after = (await get(`/api/analytics/clients/${A.id}?grain=month`)).body.satisfaction.kpis.csat.responses;
  ok(after === before - 3, 'and its answers leave the dashboards with it', `${before} -> ${after}`);
  ok((await page(`/s/${S.slug}`)).status === 404, 'its address stops answering');

  await call('DELETE', `/api/clients/${A.id}`);
  await call('DELETE', `/api/clients/${Bc.id}`);
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
