/**
 * Customers, Pulse and Echo (v9.17) in a real browser: the portal's Customers
 * tab (desktop and phone), one customer's page and editing it, the directory
 * download, Pulse's "Where your customers are" and its Pulse-only report,
 * Echo's report button, "Who answers" breakdowns and the About-you question
 * presets, and the CRM's Customers view with its client picker.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Builds its own
 * throwaway client and removes it afterwards.
 *
 *   node test/customers-ui.test.js
 */
const { chromium } = require('playwright-core');
const ExcelJS = require('exceljs');
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const os = require('os');
const path = require('path');
const SP = fs.mkdtempSync(path.join(os.tmpdir(), 'vqc-ui-'));
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const ADMIN_KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const AH = { 'Content-Type': 'application/json', 'x-api-key': ADMIN_KEY };
const api = (m, p, b, h = AH) => fetch(B + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined }).then((r) => r.json().catch(() => null));
const st = Date.now();
const at = (d, m = 0) => new Date(Date.now() - d * 86400000 - m * 60000);
(async () => {
  const growth = (await api('GET', '/api/products')).find((p) => p.name === 'Growth');
  const c = await api('POST', '/api/clients', { name: 'Demo', company: `Grill House ${st}`, email: 'g@example.com', phone: '923001119999', product_id: growth.id, stage: 'active', est_value: 0, source: 'x', external_ref: `ui17-${st}`, ntn: '1234567-8', billing_address: 'Karachi' });
  const AG = `ui17-agent-${st}`;
  await api('POST', '/api/agents', { client_id: c.id, name: 'Grill WhatsApp', kind: 'whatsapp', external_ref: AG });
  await api('PATCH', `/api/clients/${c.id}/surveys`, { enabled: true });
  const names = ['Ayesha Khan', 'Bilal Ahmed', 'Sara Malik', '', 'Hamza Ali', 'Fatima Noor', '', 'Usman Tariq'];
  const cities = ['Lahore', 'Karachi', 'Islamabad', '', 'Lahore', 'Karachi', '', 'Lahore'];
  for (let i = 0; i < names.length; i++) {
    const ph = `92300${String(st).slice(-6)}${i}`;
    const visits = [1, 5, 2, 1, 3, 1, 1, 2][i];
    for (let v = 0; v < visits; v++) {
      const t = at(v * 20 + i, 30);
      await api('POST', '/api/webhooks/usage', { agent_ref: AG, session_id: `${ph}-${t.toISOString().slice(0, 10)}`, messages_count: 3, occurred_at: t.toISOString(), contact_name: names[i] || 'there' });
      if (v === 0) await api('POST', '/api/webhooks/conversation', { external_ref: AG, session_id: `${ph}-${t.toISOString().slice(0, 10)}`, messages: [{ role: 'customer', content: 'Salam, do you have a table for 4 tonight?' }, { role: 'agent', content: 'Wa alaikum salam! Yes — 8pm or 9pm?' }, { role: 'customer', content: '8pm please' }] });
    }
    if (cities[i]) await api('POST', '/api/webhooks/contact', { agent_ref: AG, phone: ph, city: cities[i] });
  }
  const s = await api('POST', '/api/surveys', { client_id: c.id, template: 'general', title: 'How was your meal?' });
  const opts = [['female', 'lahore', '25_34', 5, 10], ['male', 'karachi', '35_44', 2, 3], ['female', 'karachi', '18_24', 4, 9], ['male', 'lahore', '25_34', 5, 9], ['prefer_not', 'islamabad', '45_54', 3, 7]];
  for (const [g, ci, a, sc, np] of opts) await api('POST', `/api/public/surveys/${s.slug}/responses`, { answers: { csat: sc, nps: np, gender: { choice: g }, city: { choice: ci }, age: { choice: a } } }, { 'Content-Type': 'application/json', 'X-Real-IP': `10.44.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await api('POST', `/api/clients/${c.id}/portal-credentials`, { username: `ui17-${st}`, password: 'Ui17TestPass1' });
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const errors = [];
  try {
    const p = await browser.newPage({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
    p.on('pageerror', (e) => errors.push('portal: ' + e.message));
    await p.goto(`${B}/portal.html#customers`);
    await p.fill('#lg_user', `ui17-${st}`); await p.fill('#lg_pass', 'Ui17TestPass1'); await p.keyboard.press('Enter');
    await p.waitForSelector('.vqc-table', { timeout: 15000 });
    ok(await p.locator('.tab.active').innerText() === 'Customers', 'a #customers link opens the Customers tab');
    ok(await p.locator('.vqc-table tr.r').count() === 8, 'all eight customers listed');
        await p.fill('[data-c="q"]', 'bil'); await p.waitForTimeout(900);
    ok(await p.locator('.vqc-table tr.r').count() === 1, 'searching "bil" finds Bilal');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-c')) === 'q', 'and typing is not interrupted by the refresh');
    await p.fill('[data-c="q"]', ''); await p.waitForTimeout(900);
    await p.click('.vqc-chip:has-text("Regulars")'); await p.waitForTimeout(700);
    ok(await p.locator('.vqc-table tr.r').count() === 1, 'the Regulars segment: one customer with five conversations');
    await p.click('.vqc-table tr.r >> nth=0'); await p.waitForSelector('.vqc-detail', { timeout: 10000 });
    await p.waitForTimeout(300);
    ok(/Bilal Ahmed/.test(await p.locator('.vqc-head').innerText()) && await p.locator('.vqc-conv').count() === 5, 'his page: name, and five conversations');
    ok(await p.locator('.vqc-msg').count() === 3, 'the latest opened, with what was said');
    ok(await p.evaluate(() => { const f = document.querySelector('form[data-f="profile"]'); const card = f.closest('.vqc-card').getBoundingClientRect(); return [...f.querySelectorAll('input,select,textarea')].every((e) => e.getBoundingClientRect().right <= card.right + 1); }), 'the profile form stays inside its card');
    await p.fill('form[data-f="profile"] [name="email"]', 'bilal@example.com');
    await p.selectOption('form[data-f="profile"] [name="gender"]', 'Male');
    await p.fill('form[data-f="profile"] [name="tags"]', 'regular, family');
    await p.click('form[data-f="profile"] button[type="submit"]'); await p.waitForTimeout(900);
    const head = await p.locator('.vqc-head').innerText();
    ok(/bilal@example\.com/.test(head) && /regular/.test(head) && /family/.test(head), 'saving the profile shows the email and tags at once', head);
    await p.click('[data-a="back"]'); await p.waitForSelector('.vqc-table');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a="export"]')]);
    const f = `${SP}/p-directory.xlsx`; await dl.saveAs(f);
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(f); ok(wb.worksheets.map((w) => w.name).join(',') === 'Customers,Segments,Conversations,Transcripts', 'the directory downloads as a workbook');
    await p.click('.tab:has-text("Pulse")'); await p.waitForSelector('.vqa-btn', { timeout: 15000 }); await p.waitForTimeout(600);
    const where = p.locator('.vqa-card:has-text("Where your customers are")');
    ok(/Lahore/.test(await where.innerText()) && /Not known yet/.test(await where.innerText()), 'Pulse: where the customers are, by city');
    ok(await p.locator('.vqa-btn').innerText() === 'Download Pulse report (Excel)', 'Pulse offers the Pulse report');
    await p.click('.tab:has-text("Echo")'); await p.waitForSelector('.vqs-scard', { timeout: 15000 }); await p.waitForTimeout(600);
    await p.waitForSelector('#vqeResp', { timeout: 15000 });
    ok(await p.locator('.vqa-card:has-text("By gender")').count() === 1 && await p.locator('.vqa-card:has-text("By city")').count() === 1, 'Echo dashboard: who answers, by gender, age and city');
    ok(await p.locator('.vqe canvas').count() >= 4, 'with its charts: answers, satisfaction, NPS spread and NPS over time');
    const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('.vqa-btn:has-text("Download Echo report")')]);
    const f2 = `${SP}/p-echo.xlsx`; await dl2.saveAs(f2);
    const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(f2); ok(wb2.worksheets[0].name === 'Summary' && wb2.getWorksheet('Who answered') && !wb2.getWorksheet('Contacts'), 'Echo downloads the Echo report, with nothing from Pulse');
    await p.click('.vqs-scard >> nth=0'); await p.waitForSelector('#vqsResp', { timeout: 10000 }); await p.waitForTimeout(500);
    ok(await p.locator('.vqs-card:has-text("By age group")').count() === 1, 'a survey\'s results split by age group too');
    await p.click('[data-a="tab"][data-tab="questions"]'); await p.waitForTimeout(400);
    await p.click('[data-a="add-open"]'); await p.waitForTimeout(300);
    ok(await p.locator('[data-a="add-profile"][disabled]').count() === 3, 'About-you presets are offered, and off once the survey already asks them');
    await p.close();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
    await phone.goto(`${B}/portal.html#customers`);
    await phone.fill('#lg_user', `ui17-${st}`); await phone.fill('#lg_pass', 'Ui17TestPass1'); await phone.keyboard.press('Enter');
    await phone.waitForSelector('.vqc-table', { timeout: 15000 });
    ok(!(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), 'on a phone: no sideways scroll');
    await phone.close();
    const crm = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    crm.on('pageerror', (e) => errors.push('crm: ' + e.message));
    await crm.goto(B + '/'); await crm.evaluate((k) => localStorage.setItem('vantriq_api_key', k), ADMIN_KEY); await crm.goto(B + '/');
    await crm.click('.nav-item:has-text("Customers")'); await crm.waitForSelector('.vqc-table', { timeout: 15000 });
    await crm.selectOption('select[data-c="client"]', c.id); await crm.waitForTimeout(1200);
    ok(await crm.locator('.vqc-table tr.r').count() === 8, 'CRM → Customers, picking the client: the same eight');
  } finally {
    await browser.close();
    await fetch(`${B}/api/clients/${c.id}`, { method: 'DELETE', headers: AH });
    ok(errors.length === 0, 'no script errors on any page', errors.join(' | '));
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });
