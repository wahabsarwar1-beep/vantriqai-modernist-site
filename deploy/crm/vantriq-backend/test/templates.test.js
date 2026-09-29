/**
 * The Echo template library (v9.19), through the API: every industry's
 * template and its shelf, the client's industry (set by staff or by the
 * customer), the starter survey made when an admin switches Echo on, and the
 * preview page that shows a template before any survey exists.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Builds its own
 * throwaway clients and deletes them afterwards.
 *
 *   node test/templates.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const get = (p, h) => call('GET', p, undefined, h);
const post = (p, b, h) => call('POST', p, b, h);
const patch = (p, b, h) => call('PATCH', p, b, h);
const page = (p) => fetch(B + p).then(async (r) => ({ status: r.status, text: await r.text(), headers: r.headers }));
const boot = (html) => {
  const m = /window\.__VQS__\s*=\s*(\{.*?\});\s*<\/script>/s.exec(html);
  return m ? JSON.parse(m[1]) : null;
};

(async () => {
  const stamp = Date.now();
  const products = (await get('/api/products')).body;
  const growth = products.find((p) => p.name === 'Growth');
  const mk = async (company) => (await post('/api/clients', {
    name: 'Tpl Test', company: `${company} ${stamp}`, email: `tpl-${stamp}@example.com`, phone: '923001110000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: `tpl-${company}-${stamp}`,
    ntn: '1234567-8', billing_address: 'Lahore',
  })).body;
  const A = await mk('Tpl Pharmacy');
  const Bc = await mk('Tpl Other');
  const Cc = await mk('Tpl Blank');

  try {
    console.log('\n== the library ==');
    const tpls = (await get('/api/surveys/templates')).body;
    ok(Array.isArray(tpls) && tpls.length === 28, `28 templates (${tpls && tpls.length})`);
    const keys = new Set(tpls.map((t) => t.key));
    for (const k of ['pharmacy', 'insurance', 'software_it', 'events', 'home_services', 'public_services', 'nonprofit', 'b2b_supplier', 'website_app']) {
      ok(keys.has(k), `v9.19 adds the ${k} template`);
    }
    const lib = (await get('/api/surveys/templates/library')).body;
    ok(lib && lib.client === null, 'staff with no client chosen: nobody\'s industry');
    ok(lib.categories.length === 8 && lib.categories.reduce((t, c) => t + c.count, 0) === 28, 'eight shelves hold all 28, each once',
      JSON.stringify(lib.categories));
    ok(tpls.every((t) => lib.categories.some((c) => c.key === t.category)), 'every template sits on a shelf that exists');
    ok(tpls.every((t) => t.category_label && t.category_icon && t.minutes >= 1 && t.question_count === t.outline.length),
      'each has its shelf, how long it takes and every question in outline');
    ok(tpls.every((t) => t.keywords || t.key === 'blank'), 'and words people search for');
    ok(tpls.filter((t) => t.is_industry).length === 25 && !tpls.find((t) => t.key === 'blank').is_industry
      && !tpls.find((t) => t.key === 'support_chat').is_industry, '25 are industries; a chat, a website and a blank page are not');
    ok(tpls.find((t) => t.key === 'general').industry_label === 'Other / any business', 'General reads as "Other / any business" in the industry list');
    ok(tpls.filter((t) => t.is_industry).every((t) => t.related.length >= 3 && t.related.every((k) => keys.has(k) && k !== t.key)),
      'every industry recommends three others that exist');
    const rest = tpls.find((t) => t.key === 'restaurant');
    const improve = rest.outline.find((q) => /better/.test(q.title));
    ok(improve && improve.when === 'if they score 0–8 out of 10', 'a follow-on question says when it is asked', JSON.stringify(improve));
    ok(rest.outline.filter((q) => q.about_you).length === 2, 'and "about you" questions are marked');
    ok(tpls.filter((t) => t.popular).length === 6, 'six popular ones for a first look');

    console.log('\n== the client\'s industry, set by staff ==');
    ok((await patch(`/api/clients/${A.id}/industry`, { industry: 'spaceships' })).status === 400, 'an unknown industry is refused');
    ok((await patch(`/api/clients/${A.id}/industry`, { industry: 'blank' })).status === 400, 'so is a template that is not an industry');
    ok((await patch(`/api/clients/${A.id}/industry`, { industry: 'support_chat' })).status === 400, '…such as the after-chat survey');
    ok((await patch('/api/clients/00000000-0000-0000-0000-000000000000/industry', { industry: 'pharmacy' })).status === 404, 'an unknown client is not found');
    ok((await patch('/api/clients/not-an-id/industry', { industry: 'pharmacy' })).status === 404, 'nor is a malformed id');
    const set = await patch(`/api/clients/${A.id}/industry`, { industry: 'pharmacy' });
    ok(set.status === 200 && set.body.industry === 'pharmacy', 'staff set it on the client\'s page');
    ok((await get(`/api/clients/${A.id}`)).body.industry === 'pharmacy', 'and the client record carries it');
    const libA = (await get(`/api/surveys/templates/library?client_id=${A.id}`)).body;
    ok(libA.client && libA.client.id === A.id && libA.client.industry === 'pharmacy', 'the library knows whose it is and their industry');
    ok((await get('/api/surveys/templates/library?client_id=nope')).status === 400, 'a malformed client_id is refused');
    const viaStudio = await patch('/api/surveys/industry', { industry: 'healthcare', client_id: Bc.id });
    ok(viaStudio.status === 200 && viaStudio.body.industry === 'healthcare', 'staff can set it from the Echo library too');
    ok((await patch('/api/surveys/industry', { industry: 'healthcare' })).status === 400, 'where they must say which client');
    const cleared = await patch(`/api/clients/${Bc.id}/industry`, { industry: '' });
    ok(cleared.status === 200 && cleared.body.industry === '', 'an empty industry clears it');

    console.log('\n== switching Echo on makes a starter survey ==');
    const on = await patch(`/api/clients/${A.id}/surveys`, { enabled: true, starter_survey: true });
    ok(on.status === 200 && on.body.surveys_enabled && on.body.starter_survey, 'switched on, with a starter survey', JSON.stringify(on.body));
    const starter = on.body.starter_survey || {};
    ok(starter.industry === 'pharmacy' && /Pharmacy/.test(starter.title), 'made from their industry\'s template', JSON.stringify(starter));
    ok(on.body.surveys === 1 && on.body.live_surveys === 1, 'and the counts include it');
    const full = (await get(`/api/surveys/${starter.id}`)).body;
    ok(full.status === 'live' && full.languages.join() === 'en,ur' && full.display_name === A.company, 'live, in English and Urdu, in their name');
    ok(full.alert_emails === A.email, 'unhappy answers go to the client\'s email');
    ok((await page(`/s/${full.slug}`)).status === 200, 'its public page is up');
    const listed = (await get(`/api/surveys?client_id=${A.id}`)).body.surveys[0];
    const L = listed.links || {};
    ok(L.url === listed.url && /\/poster$/.test(L.poster) && /^https:\/\/wa\.me\//.test(L.whatsapp) && /\?kiosk=1$/.test(L.kiosk) && /^<iframe /.test(L.embed),
      'the survey list carries every way to share each survey: link, poster, WhatsApp, kiosk, website (v9.19.2)', JSON.stringify(L).slice(0, 200));
    await patch(`/api/clients/${A.id}/surveys`, { enabled: false });
    const again = await patch(`/api/clients/${A.id}/surveys`, { enabled: true, starter_survey: true });
    ok(again.status === 200 && again.body.starter_survey === null && again.body.surveys === 1, 'off and on again never makes a second');
    const plain = await patch(`/api/clients/${Bc.id}/surveys`, { enabled: true });
    ok(plain.body.starter_survey === null && plain.body.surveys === 0, 'without starter_survey nothing is made');
    await patch(`/api/clients/${Bc.id}/surveys`, { enabled: false });
    const offStarter = await patch(`/api/clients/${Bc.id}/surveys`, { enabled: false, starter_survey: true });
    ok(offStarter.body.starter_survey === null && offStarter.body.surveys === 0, 'nor when switching off');
    const withInd = await patch(`/api/clients/${Cc.id}/surveys`, { enabled: true, starter_survey: true, industry: 'hotel' });
    ok(withInd.body.industry === 'hotel' && withInd.body.starter_survey && withInd.body.starter_survey.industry === 'hotel',
      'the industry can be set in the same call', JSON.stringify(withInd.body));
    const badInd = await patch(`/api/clients/${Cc.id}/surveys`, { enabled: true, industry: 'spaceships' });
    ok(badInd.status === 400, 'and a bad one there is refused too');
    const Dc = await mk('Tpl General');
    const gen = await patch(`/api/clients/${Dc.id}/surveys`, { enabled: true, starter_survey: true });
    ok(gen.body.starter_survey && gen.body.starter_survey.industry === 'general', 'no industry said: the starter is General satisfaction');
    await call('DELETE', `/api/clients/${Dc.id}`);

    console.log('\n== the customer\'s own industry, in the portal ==');
    await post(`/api/clients/${A.id}/portal-credentials`, { username: `tpl-a-${stamp}`, password: 'TplTestPassA1' });
    await post(`/api/clients/${Bc.id}/portal-credentials`, { username: `tpl-b-${stamp}`, password: 'TplTestPassB1' });
    const la = (await post('/api/portal/login', { username: `tpl-a-${stamp}`, password: 'TplTestPassA1' }, { 'Content-Type': 'application/json' })).body;
    const lb = (await post('/api/portal/login', { username: `tpl-b-${stamp}`, password: 'TplTestPassB1' }, { 'Content-Type': 'application/json' })).body;
    const PA = { 'Content-Type': 'application/json', Authorization: `Bearer ${la.session}` };
    const PB = { 'Content-Type': 'application/json', Authorization: `Bearer ${lb.session}` };
    ok((await get('/api/portal/account', PA)).body.industry === 'pharmacy', 'their account says their industry');
    const plib = (await get('/api/portal/surveys/templates/library', PA)).body;
    ok(plib.client && plib.client.id === A.id && plib.client.industry === 'pharmacy' && plib.templates.length === 28,
      'their library is theirs, with every template');
    const own = await patch('/api/portal/surveys/industry', { industry: 'retail', client_id: Bc.id }, PA);
    ok(own.status === 200 && own.body.id === A.id && own.body.industry === 'retail', 'a customer sets their own industry — never another\'s');
    ok((await get(`/api/clients/${Bc.id}`)).body.industry === '', 'the other client is untouched');
    ok((await patch('/api/portal/surveys/industry', { industry: 'blank' }, PA)).status === 400, 'a customer cannot pick a non-industry either');
    ok((await get('/api/portal/surveys/templates/library', PB)).status === 403, 'with Echo off, there is no library');
    ok((await patch('/api/portal/surveys/industry', { industry: 'retail' }, PB)).status === 403, 'and no industry to set there');
    ok((await get('/api/portal/surveys/templates/library')).status === 401, 'and nothing without signing in');

    console.log('\n== previewing a template ==');
    const pv = await page(`/s/_template/pharmacy?business=${encodeURIComponent('Shifa <b>Pharmacy</b>')}`);
    const data = boot(pv.text);
    ok(pv.status === 200 && data && data.state === 'ok', 'a template opens in the survey app', String(pv.status));
    ok(data.preview === true && data.slug === null && data.invite === null, 'always as a preview, with no address to answer to');
    ok(data.survey.display_name === 'Shifa <b>Pharmacy</b>' && data.survey.questions.length === tpls.find((t) => t.key === 'pharmacy').question_count,
      'with the business\'s name and every question', data && data.survey && data.survey.display_name);
    ok(data.survey.languages.join() === 'en,ur', 'in English and Urdu');
    ok(!pv.text.includes('<b>Pharmacy</b>'), 'the name is never markup in the page');
    ok(/noindex/.test(pv.headers.get('x-robots-tag') || ''), 'and search engines are asked not to index it');
    const noName = boot((await page('/s/_template/restaurant')).text);
    ok(noName.survey.display_name === 'Your business', 'without a name it says "Your business"');
    ok((await page('/s/_template/spaceships')).status === 404, 'an unknown template is not found');
    const everyOne = await Promise.all(tpls.map((t) => page(`/s/_template/${t.key}`)));
    ok(everyOne.every((r) => r.status === 200), 'every template in the library previews');
    ok((await page('/s/_template')).status === 404, 'the preview path is no survey\'s address');
  } finally {
    for (const c of [A, Bc, Cc]) await call('DELETE', `/api/clients/${c.id}`);
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
