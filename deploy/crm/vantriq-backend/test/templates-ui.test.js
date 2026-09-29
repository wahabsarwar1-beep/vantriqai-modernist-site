/**
 * The Echo template library (v9.19) in a real browser: a new customer's first
 * visit in the portal (industry, recommendations, shelves, search, preview,
 * starting a survey), the library under their surveys afterwards, the same on
 * a phone, and the CRM (the client's industry, the starter survey when Echo
 * is switched on, and the library for that client).
 *
 * Builds its own throwaway clients and removes them afterwards. Needs the API
 * on 8099 and an admin key in /tmp/adminkey.
 *
 *   node test/templates-ui.test.js
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const api = (method, p, b) => fetch(B + p, { method, headers: AH, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => null));

(async () => {
  const stamp = Date.now();
  const products = await api('GET', '/api/products');
  const mk = (company, ref) => api('POST', '/api/clients', {
    name: 'Library UI', company, email: `lib-ui-${stamp}@example.com`, phone: '923001116666',
    product_id: products.find((p) => p.name === 'Growth').id, stage: 'active', est_value: 0, source: 'Referral',
    external_ref: `lib-ui-${ref}-${stamp}`, ntn: '1234567-8', billing_address: 'Lahore',
  });
  const shop = await mk(`Shifa Pharmacy ${stamp}`, 'p');
  const cafe = await mk(`Chai Adda ${stamp}`, 'c');
  await api('PATCH', `/api/clients/${shop.id}/surveys`, { enabled: true });
  const username = `lib-ui-${stamp}`;
  await api('POST', `/api/clients/${shop.id}/portal-credentials`, { username, password: 'LibUiPass1234' });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  const signIn = async (p) => {
    await p.fill('#lg_user', username);
    await p.fill('#lg_pass', 'LibUiPass1234');
    await p.keyboard.press('Enter');
  };
  const cards = (p, sel = '#vqs-lib-grid .vqs-tcard') => p.$$eval(sel, (els) => els.map((e) => e.dataset.tpl));

  try {
    console.log('\n== a new customer\'s first visit ==');
    {
      const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
      page.on('pageerror', (e) => errors.push(`portal: ${e.message}`));
      const posts = [];
      page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/public\/surveys/.test(r.url())) posts.push(r.url()); });
      await page.goto(`${B}/portal.html`);
      await signIn(page);
      await page.waitForSelector('button:has-text("Open Echo")', { timeout: 10000 });
      ok(/ready for your industry/i.test(await page.innerText('body')), 'the overview points them to Echo\'s ready-made surveys');
      await page.click('button:has-text("Open Echo")');
      await page.waitForSelector('#vqs-lib-grid .vqs-tcard', { timeout: 10000 });
      ok(/Start hearing from every customer/.test(await page.innerText('.vqs')), 'no survey yet: the welcome, with how it works');
      ok((await cards(page)).length === 28, 'and the whole library underneath — 28 templates');
      ok(!(await page.$('.vqs-recs')), 'no recommendations before they say their industry');
      ok(/Tell us, and its templates come first/.test(await page.innerText('.vqs-lib-head')), 'they are asked for it');

      await page.selectOption('select[data-a-change="industry"]', 'pharmacy');
      await page.waitForSelector('.vqs-recs', { timeout: 5000 });
      const recs = await cards(page, '.vqs-recs .vqs-tcard');
      ok(recs[0] === 'pharmacy' && recs.length === 4, 'their industry\'s template comes first', recs.join());
      ok(recs.includes('healthcare') && recs.includes('support_chat'), 'with what suits a pharmacy: clinics, after-chat…', recs.join());
      ok(/✓ Your industry/.test(await page.innerText('.vqs-recs .vqs-tcard[data-tpl="pharmacy"]')), 'marked as theirs');
      await page.waitForTimeout(500);
      ok((await api('GET', `/api/clients/${shop.id}`)).industry === 'pharmacy', 'and the choice is saved to their account');

      await page.click('.vqs-cats button[data-cat="health"]');
      const health = (await cards(page)).sort().join();
      ok(health === 'healthcare,salon_fitness', 'a shelf shows only its templates', health);
      await page.click('.vqs-cats button[data-cat="popular"]');
      ok((await cards(page)).length === 6, 'Popular: six');
      await page.fill('input[data-a-tsearch]', 'clinic');
      ok((await cards(page)).join() === 'healthcare', 'searching "clinic" finds the hospital & clinic template');
      ok(await page.evaluate(() => document.activeElement && document.activeElement.hasAttribute('data-a-tsearch')), 'and the search box keeps the cursor');
      ok(await page.$eval('#vqs-lib-cats button[data-cat="all"]', (b) => !b.classList.contains('on')), 'while searching, no shelf is picked');
      await page.fill('input[data-a-tsearch]', 'courier parcel');
      ok((await cards(page)).includes('logistics'), 'every word counts: "courier parcel" finds logistics');
      await page.fill('input[data-a-tsearch]', 'zzzz');
      ok(/No template matches/.test(await page.innerText('#vqs-lib-grid')), 'nothing found says so, and offers General');
      await page.fill('input[data-a-tsearch]', '');
      await page.click('.vqs-cats button[data-cat="all"]');

      console.log('\n== previewing a template ==');
      await page.click('.vqs-recs .vqs-tcard[data-tpl="pharmacy"] button[data-a="tpl-preview"]');
      await page.waitForSelector('.vqs-modal', { timeout: 5000 });
      ok(await page.evaluate(() => document.body.classList.contains('vqs-noscroll')), 'the preview opens over the page, which stops scrolling');
      const frame = page.frameLocator('#vqs-tpl-frame');
      await frame.locator('h1').first().waitFor({ timeout: 8000 });
      ok((await frame.locator('h1').first().innerText()) === shop.company, 'the phone shows the survey in their own business name');
      ok(/answers are not saved/i.test(await frame.locator('.ribbon').innerText()), 'marked as a preview');
      const qs = await page.$$eval('.vqs-qlist li', (els) => els.map((e) => e.innerText));
      ok(qs.length === 10 && qs.some((q) => q.includes(shop.company)), 'beside it, every question it asks, in their name', qs.join(' | '));
      ok(qs.some((q) => /only if they score 0–8 out of 10/.test(q)), 'with when follow-on questions are asked');
      await frame.locator('[data-act=start]').click();
      await page.waitForTimeout(400);
      ok((await frame.locator('.qtitle').innerText()).length > 0, 'it can be tapped through like the real thing');
      await page.click('.vqs-steppers button >> nth=1');
      await page.waitForTimeout(300);
      const nextName = await page.innerText('#vqs-tpl-h');
      ok(nextName && nextName !== 'Pharmacy & medical store', 'the arrows step to the next template without closing', nextName);
      await page.keyboard.press('Escape');
      ok(!(await page.$('.vqs-modal')) && !(await page.evaluate(() => document.body.classList.contains('vqs-noscroll'))), 'Escape closes it');
      await page.click('.vqs-tcard[data-tpl="restaurant"] button[data-a="tpl-preview"]');
      await page.waitForSelector('.vqs-modal');
      await page.mouse.click(8, 450);
      ok(!(await page.$('.vqs-modal')), 'so does a click beside it');
      await page.click('.vqs-tcard[data-tpl="restaurant"] button[data-a="tpl-preview"]');
      await page.waitForSelector('.vqs-modal');
      await page.click('.vqs-modal-box h3');
      ok(!!(await page.$('.vqs-modal')), 'but not a click inside it');
      await page.click('.vqs-modal-x');
      ok(!(await page.$('.vqs-modal')), 'and the × closes it');

      console.log('\n== using a template ==');
      await page.click('.vqs-recs .vqs-tcard[data-tpl="pharmacy"] button[data-a="tpl-preview"]');
      await page.waitForSelector('.vqs-modal');
      await page.click('.vqs-modal button[data-a="use-tpl"]');
      await page.waitForSelector('#vqs-setup', { timeout: 5000 });
      ok(!(await page.$('.vqs-modal')), '"Use this template" closes the preview…');
      ok(/Step 2 of 2/.test(await page.innerText('.vqs')) && /Pharmacy & medical store/.test(await page.innerText('.vqs-chosen')), '…and goes straight to step 2 with it');
      await page.click('button[data-a="change-tpl"]');
      ok(/Step 1 of 2/.test(await page.innerText('.vqs')), '"Change template" goes back to the library');
      await page.click('.vqs-tcard[data-tpl="pharmacy"] >> nth=0');
      await page.waitForSelector('#vqs-setup');
      await page.fill('input[data-nf="title"]', 'Counter feedback');
      await page.click('.vqs-btn.primary:has-text("Create and go live")');
      await page.waitForSelector('.vqs-banner.ok', { timeout: 10000 });
      const made = (await api('GET', `/api/surveys?client_id=${shop.id}`)).surveys;
      ok(made.length === 1 && made[0].title === 'Counter feedback' && made[0].status === 'live' && made[0].industry === 'pharmacy',
        'a live pharmacy survey is made', JSON.stringify(made.map((s) => [s.title, s.status, s.industry])));
      ok(posts.length === 0, 'and nothing answered in a preview was ever sent', posts.join());

      await page.click('.vqs-link:has-text("All surveys")');
      await page.waitForSelector('.vqs-scard', { timeout: 10000 });
      await page.waitForSelector('#vqs-lib', { timeout: 10000 });
      ok(/Recommended for you/.test(await page.innerText('#vqs-lib')), 'with surveys, the library stays under them: recommended for you…');
      await page.click('#vqs-lib button[data-a="lib-open"][data-cat="money"]');
      await page.waitForSelector('#vqs-lib-grid');
      const money = (await cards(page)).sort().join();
      ok(money === 'automotive,banking,insurance,real_estate', '…and a shelf opens the library on it', money);
      ok(await page.$eval('#vqs-lib-cats button[data-cat="money"]', (b) => b.classList.contains('on')), 'with that shelf picked');
      await page.close();
    }

    console.log('\n== on a phone ==');
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const m = await ctx.newPage();
      m.on('pageerror', (e) => errors.push(`phone: ${e.message}`));
      await m.goto(`${B}/portal.html#surveys`);
      await signIn(m);
      await m.waitForSelector('#vqs-lib .vqs-tcard', { timeout: 10000 });
      ok(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, 'the library fits the screen');
      await m.tap('#vqs-lib .vqs-tcard[data-tpl="pharmacy"] button[data-a="tpl-preview"]');
      await m.waitForSelector('.vqs-modal', { timeout: 5000 });
      const box = await m.$eval('.vqs-modal-box', (b) => { const r = b.getBoundingClientRect(); return [r.left, r.width]; });
      ok(box[0] === 0 && box[1] === 390, 'the preview fills the phone', box.join());
      const x = await m.$eval('.vqs-modal-x', (b) => b.getBoundingClientRect().bottom);
      const phoneTop = await m.$eval('.vqs-modal .vqs-phone', (p) => p.getBoundingClientRect().top);
      ok(x <= phoneTop, 'with its close button clear of the phone', `${x} vs ${phoneTop}`);
      await m.tap('.vqs-modal-x');
      await m.tap('#vqs-lib button[data-a="lib-open"][data-cat="all"]');
      await m.waitForSelector('#vqs-lib-grid .vqs-tcard');
      ok(await m.evaluate(() => document.documentElement.scrollWidth) <= 390, 'and so does the full library');
      await ctx.close();
    }

    console.log('\n== the CRM ==');
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('pageerror', (e) => errors.push(`crm: ${e.message}`));
      page.on('dialog', (d) => d.accept());
      await page.goto(B + '/');
      await page.evaluate((k) => localStorage.setItem('vantriq_api_key', k), ADMIN_KEY);
      await page.goto(B + '/');
      await page.click('.nav-item:has-text("Clients")');
      await page.waitForSelector(`text=${cafe.company}`, { timeout: 10000 });
      await page.click(`tr:has-text("${cafe.company}")`);
      await page.waitForSelector(`#echo-industry-${cafe.id}`, { timeout: 8000 });
      ok(/General satisfaction/.test(await page.innerText(`label:has(#echo-starter-${cafe.id})`)), 'Echo off: the starter would be General until an industry is chosen');
      await page.selectOption(`#echo-industry-${cafe.id}`, 'restaurant');
      await page.waitForFunction((id) => state.clients.find((c) => c.id === id).industry === 'restaurant', cafe.id, { timeout: 5000 }).catch(() => {});
      ok((await api('GET', `/api/clients/${cafe.id}`)).industry === 'restaurant', 'staff set the client\'s industry on their page');
      ok(/Restaurant & café/.test(await page.innerText(`label:has(#echo-starter-${cafe.id})`)), 'and the starter follows it');
      ok(await page.isChecked(`#echo-starter-${cafe.id}`), 'making a starter survey is ticked by default');
      await page.check(`input[onchange^="setClientSurveys('${cafe.id}'"]`);
      await page.waitForFunction((id) => state.clients.find((c) => c.id === id).surveysEnabled, cafe.id, { timeout: 5000 }).catch(() => {});
      const theirs = (await api('GET', `/api/surveys?client_id=${cafe.id}`)).surveys;
      ok(theirs.length === 1 && theirs[0].status === 'live' && theirs[0].industry === 'restaurant', 'switching Echo on made their first survey, live, from it',
        JSON.stringify(theirs.map((s) => [s.title, s.status, s.industry])));
      ok(/is live and ready to share/.test(await page.innerText('body')), 'and says so');
      ok(!(await page.$(`#echo-starter-${cafe.id}`)), 'once on, the starter option is gone');

      await page.click(`a[onclick*="openEchoFor('${cafe.id}')"]`);
      await page.waitForSelector('.vqs-scard', { timeout: 10000 });
      ok(await page.$eval('select[data-a-change="client-filter"]', (s) => s.value) === cafe.id, 'its link opens Vantriq Echo on that client');
      await page.waitForSelector('#vqs-lib .vqs-recs', { timeout: 10000 });
      ok(new RegExp(`Recommended for ${cafe.company}`).test(await page.innerText('#vqs-lib')), 'with templates recommended for them');
      await page.click('.vqs-btn.primary:has-text("New survey")');
      await page.waitForSelector('#vqs-lib-grid');
      ok(await page.$eval('select[data-nf="client_id"]', (s) => s.value) === cafe.id, 'New survey starts with that client chosen');
      await page.selectOption('select[data-a-change="industry"]', 'hotel');
      await page.waitForFunction((id) => state.clients.find((c) => c.id === id).industry === 'hotel', cafe.id, { timeout: 5000 }).catch(() => {});
      ok(await page.evaluate((id) => state.clients.find((c) => c.id === id).industry, cafe.id) === 'hotel', 'an industry set in the library is the client\'s, on their page too');
      ok((await cards(page, '.vqs-recs .vqs-tcard'))[0] === 'hotel', 'and the recommendations follow it');
      await page.close();
    }
  } finally {
    await browser.close();
    for (const c of [shop, cafe]) await fetch(`${B}/api/clients/${c.id}`, { method: 'DELETE', headers: AH });
  }
  ok(errors.length === 0, 'no script errors on any page', errors.join(' | '));
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
