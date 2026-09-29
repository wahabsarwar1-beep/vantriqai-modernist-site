/**
 * Surveys in a real browser: the respondent's app on a phone, the portal's
 * Surveys tab and the CRM's Surveys view.
 *
 * Builds its own throwaway client and removes it afterwards. Needs the API on
 * 8099 and an admin key in /tmp/adminkey.
 *
 *   node test/surveys-ui.test.js
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const api = (method, p, b) => fetch(B + p, { method, headers: AH, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => null));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const stamp = Date.now();
  const products = await api('GET', '/api/products');
  const client = await api('POST', '/api/clients', {
    name: 'UI Surveys', company: `UI Surveys Co ${stamp}`, email: 'ui-surveys@example.com', phone: '923001119999',
    product_id: products.find((p) => p.name === 'Growth').id, stage: 'active', est_value: 0, source: 'Referral',
    external_ref: `ui-surveys-${stamp}`, ntn: '1234567-8', billing_address: 'Islamabad',
  });
  // Surveys are an add-on an admin switches on per client (v9.15).
  await api('PATCH', `/api/clients/${client.id}/surveys`, { enabled: true });
  const survey = await api('POST', '/api/surveys', {
    client_id: client.id, template: 'restaurant', title: 'UI dine-in', display_name: 'Café <b>Test</b>',
    locations: ['Blue Area', 'F-7'], review_url: 'https://g.page/r/ui-test/review',
  });
  const responses = async () => (await api('GET', `/api/surveys/${survey.id}/responses?limit=50`)).items;

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  const phone = async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`survey: ${e.message}`));
    return { ctx, p };
  };
  const tap = async (p, sel) => { await p.click(sel); await sleep(450); };

  console.log('\n== a promoter answers on a phone ==');
  {
    const { ctx, p } = await phone();
    await p.goto(`${B}/s/${survey.slug}?ch=qr`, { waitUntil: 'domcontentloaded' });
    ok(await p.locator('h1').first().innerText() === 'Café <b>Test</b>', 'the business name is shown as text, never as markup');
    await tap(p, '[data-act=start]');
    ok(/Which branch/.test(await p.innerText('.qtitle')), 'with two locations and no ?loc=, it asks which branch first');
    await tap(p, '[data-opt=f_7]');
    await tap(p, '[data-opt=dine_in]');
    ok(await p.locator('[data-act=next]').isDisabled(), 'Next stays off until a required question is answered');
    await tap(p, '.face[data-val="5"]');
    ok(/rate us/i.test(await p.innerText('.qtitle')), 'a face moves straight on to the next question');
    await p.click('.star[data-row="food"][data-star="5"]');
    await p.click('.star[data-row="speed"][data-star="4"]');
    await tap(p, '[data-act=next]');
    await tap(p, '.pt[data-val="10"]');
    ok(/like most/i.test(await p.innerText('.qtitle')), 'a promoter is asked what they liked — not what to improve');
    await p.fill('#text', 'Lovely chai <img src=x onerror=alert(1)>');
    await tap(p, '[data-act=next]');
    ok(/Are you/i.test(await p.innerText('.qtitle')), 'then the optional "about you" questions: gender…');
    await tap(p, '[data-opt=female]');
    ok(/Which city/i.test(await p.innerText('.qtitle')), '…and city (v9.17)');
    await tap(p, '[data-act=next]');
    ok(/get back to you/i.test(await p.innerText('.qtitle')), 'then the optional contact question');
    ok(/Submit/.test(await p.innerText('[data-act=next]')), 'which is last, so the button says Submit');
    await tap(p, '[data-act=next]');
    await p.waitForSelector('.tick', { timeout: 10000 });
    ok(/Thank you/.test(await p.innerText('h1')), 'the thank-you screen');
    ok(!!(await p.$('a[href="https://g.page/r/ui-test/review"]')), 'with the Google review link for a promoter');
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= 390, 'no sideways scroll on the phone', String(sw));
    await ctx.close();
    const rs = await responses();
    const r = rs[0];
    ok(rs.length === 1 && r.score === 5 && r.nps === 10, 'one response stored: CSAT 5, NPS 10', JSON.stringify(rs).slice(0, 200));
    ok(r.location && r.location.id === 'f_7' && r.channel === 'qr', 'from F-7, by QR code');
    ok(r.answers.aspects.food === 5 && r.answers.aspects.speed === 4 && r.answers.loved.startsWith('Lovely chai'), 'every answer as given');
  }

  console.log('\n== in Urdu, right to left ==');
  {
    const { ctx, p } = await phone();
    await p.goto(`${B}/s/${survey.slug}?loc=blue_area&lang=ur`, { waitUntil: 'domcontentloaded' });
    ok(await p.evaluate(() => document.documentElement.dir) === 'rtl', 'the page turns right to left');
    ok((await p.innerText('[data-act=start]')).includes('شروع'), 'and speaks Urdu');
    await p.click('.lang button[data-lang=en]');
    ok(await p.evaluate(() => document.documentElement.dir) === 'ltr' && /Start/.test(await p.innerText('[data-act=start]')), 'one tap switches to English');
    await p.click('.lang button[data-lang=ur]');
    await tap(p, '[data-act=start]');
    ok(!/branch/i.test(await p.innerText('.qtitle')), 'a ?loc= QR code skips the branch question');
    await ctx.close();
  }

  console.log('\n== an interrupted respondent picks up where they left off ==');
  {
    const { ctx, p } = await phone();
    await p.goto(`${B}/s/${survey.slug}?loc=blue_area`, { waitUntil: 'domcontentloaded' });
    await tap(p, '[data-act=start]');
    await tap(p, '[data-opt=takeaway]');
    await tap(p, '.face[data-val="2"]');
    await p.reload({ waitUntil: 'domcontentloaded' });
    await sleep(500);
    ok(/rate us/i.test(await p.innerText('.qtitle').catch(() => '')), 'after a reload they are back on the question they reached');
    await tap(p, '[data-act=next]');
    await tap(p, '.pt[data-val="3"]');
    ok(/better/i.test(await p.innerText('.qtitle')), 'a detractor is asked what to improve');
    await p.fill('#text', 'Slow counter');
    await tap(p, '[data-act=next]');
    await tap(p, '[data-act=next]'); // gender — optional, skipped
    await tap(p, '[data-act=next]'); // city — optional, skipped
    await p.fill('[data-field=name]', 'Sana');
    await p.fill('[data-field=phone]', '12');
    await p.locator('[data-field=phone]').blur();
    ok(await p.locator('[data-act=next]').isDisabled() && /phone/i.test(await p.innerText('#err')), 'a phone number that cannot be one is caught before sending');
    await p.fill('[data-field=phone]', '+92 300 5550000');
    await p.check('#consent');

    // The connection drops as they press Submit.
    await ctx.setOffline(true);
    await p.click('[data-act=next]');
    await p.waitForFunction(() => /offline|could not be sent/i.test((document.getElementById('err') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    ok(/offline|could not be sent/i.test(await p.innerText('#err').catch(() => '')), 'offline: they are told, and the answers are kept');
    await ctx.setOffline(false);
    await p.evaluate(() => window.dispatchEvent(new Event('online')));
    await p.waitForSelector('.tick', { timeout: 15000 }).catch(() => {});
    ok(!!(await p.$('.tick')), 'back online, it sends by itself');
    ok(/sorry/i.test(await p.innerText('.panel').catch(() => '')), 'and an unhappy customer is told the team will look into it');
    await ctx.close();
    const rs = await responses();
    ok(rs.length === 2, 'exactly one more response — the retry did not double it', String(rs.length));
    const sad = rs.find((x) => x.score === 2);
    ok(sad && sad.followup.status === 'open' && sad.contact.name === 'Sana' && sad.contact.consent, 'with a follow-up opened and their consent to be contacted');
  }

  console.log('\n== kiosk mode starts over for the next customer ==');
  {
    const { ctx, p } = await phone();
    await p.goto(`${B}/s/${survey.slug}?kiosk=1&loc=blue_area`, { waitUntil: 'domcontentloaded' });
    await tap(p, '[data-act=start]');
    await tap(p, '[data-opt=dine_in]');
    await tap(p, '.face[data-val="4"]');
    await tap(p, '[data-act=next]');
    await tap(p, '.pt[data-val="8"]');
    await tap(p, '[data-act=next]');
    await tap(p, '[data-act=next]'); // gender — optional, skipped
    await tap(p, '[data-act=next]'); // city — optional, skipped
    await tap(p, '[data-act=next]');
    await p.waitForSelector('.tick', { timeout: 10000 });
    ok(!!(await p.$('#restart')), 'a countdown to the next customer');
    await p.click('[data-act=again]');
    await sleep(400);
    ok(!!(await p.$('[data-act=start]')), 'and a fresh start');
    await ctx.close();
    const rs = await responses();
    ok(rs.some((x) => x.channel === 'kiosk'), 'answers from a kiosk are tagged as such');
  }

  console.log('\n== the portal\'s Surveys tab ==');
  const username = `ui-surveys-${stamp}`;
  await api('POST', `/api/clients/${client.id}/portal-credentials`, { username, password: 'UiSurveysPass123' });
  {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    page.on('pageerror', (e) => errors.push(`portal: ${e.message}`));
    page.on('dialog', (d) => d.accept());
    await page.goto(`${B}/portal.html#surveys`);
    await page.fill('#lg_user', username);
    await page.fill('#lg_pass', 'UiSurveysPass123');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.vqs-scard', { timeout: 10000 });
    ok(await page.locator('.tab.active').innerText() === 'Echo', 'a #surveys link opens straight onto the tab');
    const home = await page.innerText('.vqs');
    ok(/UI dine-in/.test(home) && /1 waiting for a reply/.test(home), 'the survey, and one unhappy customer waiting', home.slice(0, 300));

    await page.click('.vqs-btn.primary:has-text("New survey")');
    await page.click('.vqs-tpl[data-tpl="healthcare"]');
    await page.fill('input[data-nf="title"]', 'Patient feedback');
    await page.click('.vqs-btn.primary:has-text("Create and go live")');
    await page.waitForSelector('.vqs-banner.ok', { timeout: 10000 });
    ok(/live/i.test(await page.innerText('.vqs-banner.ok')), 'a survey created from the healthcare template is live');
    ok(!!(await page.$('img[src*="/qr.svg"]')), 'with its QR code ready to print');

    await page.click('.vqs-tabs button:has-text("Questions")');
    await page.waitForSelector('#vqs-preview');
    await page.waitForTimeout(1500);
    await page.click('.vqs-q .qh >> nth=1');
    const input = page.locator('input[data-path="questions.1.title.en"]');
    await input.fill('How was your visit today?');
    await page.waitForTimeout(900);
    const frame = page.frameLocator('#vqs-preview');
    const previewTitle = await frame.locator('.qtitle').innerText().catch(() => '');
    ok(previewTitle === 'How was your visit today?', 'the phone preview shows the edit as it is typed', previewTitle);
    const phoneW = await frame.locator('html').evaluate(() => innerWidth);
    ok(phoneW === 390 && !!(await page.$('.vqs-phone-wrap .vqs-dev .vqs-dev-bar')), 'on a real phone\'s screen, with its status bar (v9.19.1)', String(phoneW));
    ok(!!(await page.$('#vqs-savebar')), 'and the save bar appears');
    await page.click('.vqs-savebar .vqs-btn.primary');
    await page.waitForFunction(() => !document.getElementById('vqs-savebar'), null, { timeout: 8000 }).catch(() => {});
    const saved = (await api('GET', `/api/surveys?client_id=${client.id}`)).surveys.find((s) => s.title === 'Patient feedback');
    const full = await api('GET', `/api/surveys/${saved.id}`);
    ok(full.questions[1].title.en === 'How was your visit today?', 'saving keeps it');

    await page.click('.vqs-link:has-text("All surveys")');
    await page.click('.vqs-scard:has-text("UI dine-in")');
    await page.waitForSelector('#vqsResp', { timeout: 10000 });
    ok(await page.evaluate(() => typeof Chart !== 'undefined' && Chart.getChart(document.getElementById('vqsResp')) != null), 'results draw their charts');
    ok(/Blue Area/.test(await page.innerText('.vqs')), 'with results by location');
    await page.click('.vqs-tabs button:has-text("Responses")');
    await page.waitForSelector('.vqs-resp');
    const txt = await page.innerText('.vqs');
    ok(txt.includes('Lovely chai <img src=x onerror=alert(1)>'), 'what respondents wrote is shown as text, never run');
    await page.click('.vqs-fu button:has-text("Resolved") >> nth=0');
    await page.waitForTimeout(800);
    await page.close();
  }

  console.log('\n== the CRM\'s Surveys view ==');
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => errors.push(`crm: ${e.message}`));
    await page.goto(B + '/');
    await page.evaluate((k) => localStorage.setItem('vantriq_api_key', k), ADMIN_KEY);
    await page.goto(B + '/');
    await page.click('.nav-item:has-text("Vantriq Echo")');
    await page.waitForSelector('.vqs-scard', { timeout: 10000 });
    await page.selectOption('select[data-a-change="client-filter"]', client.id);
    await page.waitForFunction((co) => document.querySelectorAll('.vqs-scard').length === 2 && document.querySelector('.vqs').innerText.includes(co), client.company, { timeout: 8000 }).catch(() => {});
    ok((await page.$$('.vqs-scard')).length === 2, 'filtered to one client: their two surveys');
    ok((await page.innerText('.vqs')).includes(client.company), 'each labelled with the client');
    await page.click('.vqs-scard:has-text("UI dine-in")');
    await page.waitForSelector('#vqsResp', { timeout: 10000 });
    ok(/UI dine-in/.test(await page.innerText('.vqs h2')), 'staff open the same results the customer sees');
    await page.close();
  }

  await browser.close();
  ok(errors.length === 0, 'no script errors on any page', errors.join(' | '));
  await fetch(`${B}/api/clients/${client.id}`, { method: 'DELETE', headers: AH });
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
