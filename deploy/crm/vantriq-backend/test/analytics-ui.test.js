/**
 * The Analytics pages in a real browser: the portal tab (desktop and phone
 * width) and the CRM view's three tabs. Builds its own throwaway client so it
 * never depends on what else is in the database, and removes it afterwards.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey.
 *
 *   node test/analytics-ui.test.js
 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const post = (p, b) => fetch(B + p, { method: 'POST', headers: AH, body: JSON.stringify(b) }).then((r) => r.json());

(async () => {
  const stamp = Date.now();
  const products = await fetch(`${B}/api/products`, { headers: AH }).then((r) => r.json());
  const client = await post('/api/clients', {
    name: 'UI Analytics', company: `UI Analytics Co ${stamp}`, email: 'ui-analytics@example.com', phone: '923001112222',
    product_id: products.find((p) => p.name === 'Growth').id, stage: 'active', est_value: 0, source: 'Referral',
    external_ref: `ui-analytics-${stamp}`, ntn: '1234567-8', billing_address: 'Karachi',
  });
  for (let i = 0; i < 6; i++) {
    await post('/api/webhooks/usage', { external_ref: `ui-analytics-${stamp}`, session_id: `9230055500${i}-2026-01-01`, messages_count: 2 });
  }
  await post('/api/webhooks/csat', { client_id: client.id, score: 5, comment: 'Lovely <b>not bold</b>' });
  const username = `ui-analytics-${stamp}`;
  await post(`/api/clients/${client.id}/portal-credentials`, { username, password: 'UiAnalyticsPass123' });

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];

  for (const [width, tag] of [[1280, 'desktop'], [390, 'phone']]) {
    console.log(`\n== portal, ${tag} ==`);
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    await page.goto(`${B}/portal.html`);
    await page.fill('input[type=text], input[autocomplete=username]', username);
    await page.fill('input[type=password]', 'UiAnalyticsPass123');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.tab');
    await page.click('.tab:has-text("Pulse")');
    await page.waitForSelector('#vqaConv', { timeout: 10000 }).catch(() => {});
    ok(!!(await page.$('#vqaConv')), 'the conversations chart is drawn');
    ok(await page.evaluate(() => !!document.querySelector('#vqaConv') && Chart.getChart(document.querySelector('#vqaConv')) != null), 'as a live Chart.js chart');
    const text = await page.innerText('#tab-content');
    ok(/Conversations\s*\n?\s*6/.test(text), 'the tile shows the six conversations', text.slice(0, 300));
    ok(text.includes('Lovely <b>not bold</b>'), 'survey comments are shown as text, never as markup');
    ok(!text.includes('9230055500'), 'no end customer\'s number appears on the page');
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(sw <= width, `no sideways scroll at ${width}px`, String(sw));

    await page.click('.vqa-seg button:has-text("Year")');
    await page.waitForFunction(() => document.querySelector('.vqa-note') && /This year/.test(document.querySelector('.vqa-note').textContent), null, { timeout: 10000 }).catch(() => {});
    ok(/This year/.test(await page.innerText('.vqa-note')), 'switching to Year reloads the page for years');
    const appWidth = () => page.evaluate(() => document.getElementById('app').getBoundingClientRect().width);
    const pulseWidth = await appWidth();
    await page.click('.tab:has-text("Overview")');
    ok(Math.abs((await appWidth()) - pulseWidth) < 1, 'every tab is the same width — Overview is not squeezed after Pulse', `${pulseWidth} vs ${await appWidth()}`);
    if (width >= 1200) ok(pulseWidth > 1000, 'and on a desktop that width is the wide one', String(pulseWidth));
    else ok(pulseWidth <= width, 'and on a phone it still fits the screen', String(pulseWidth));
    await page.close();
  }

  console.log('\n== CRM ==');
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(`crm: ${e.message}`));
  await page.goto(B + '/');
  await page.evaluate((k) => localStorage.setItem('vantriq_api_key', k), ADMIN_KEY);
  await page.goto(B + '/');
  await page.click('.nav-item:has-text("Vantriq Pulse")');
  await page.waitForSelector('#vqaLeads', { timeout: 10000 }).catch(() => {});
  ok(!!(await page.$('#vqaLeads')), 'Sales & leads: the new-leads chart is drawn');
  ok(!!(await page.$('text=Funnel')), 'with the funnel');
  await page.click('.stage-tab:has-text("All customer")');
  await page.waitForSelector('#vqaConv', { timeout: 10000 }).catch(() => {});
  ok(!!(await page.$('text=Busiest customers')), 'All customer conversations: the busiest-customers list');
  await page.click('.stage-tab:has-text("One customer")');
  await page.waitForSelector('.field select');
  await page.selectOption('.field select', client.id);
  await page.waitForFunction(() => /Conversations\s*\n?\s*6/.test(document.querySelector('.vqa') ? document.querySelector('.vqa').innerText : ''), null, { timeout: 10000 }).catch(() => {});
  ok(/Conversations\s*\n?\s*6/.test(await page.innerText('.vqa')), 'One customer: the same six conversations the customer sees');
  await page.click('.nav-item:has-text("Dashboard")');
  ok(await page.evaluate(() => typeof VQA !== 'undefined'), 'leaving the view is clean');
  await browser.close();

  ok(errors.length === 0, 'no script errors on any page', errors.join(' | '));

  await fetch(`${B}/api/clients/${client.id}`, { method: 'DELETE', headers: AH });
  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
