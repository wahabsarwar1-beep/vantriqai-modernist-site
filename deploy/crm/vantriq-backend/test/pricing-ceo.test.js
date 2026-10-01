/**
 * Pricing is the CEO's (v9.21).
 *
 * Products & Pricing, Financials, every cost and margin, and the business
 * documents open for one account: ceo@vantriqai.com, the protected owner,
 * signed in as itself. Not another admin, not the break-glass admin key.
 * The documents live in the database: upload, versions, the file back byte
 * for byte, never cached, delete — and the CRM page that shows them.
 *
 * Needs Postgres (.env) and the API on 8099 with an admin key in /tmp/adminkey.
 *
 *   node test/pricing-ceo.test.js
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const { ceoSession, adminSession, db } = require('./ceo-session');

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const K = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, body, headers) => fetch(B + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  .then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

// A one-page PDF, small enough to read.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj '
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const stamp = Date.now().toString(36);

(async () => {
  const ceo = await ceoSession();
  const other = await adminSession();
  const made = [];
  try {
    console.log('\n== only the CEO ==');
    for (const [who, h] of [['the break-glass admin key', K], ['another admin', other.headers], ['nobody signed in', { 'Content-Type': 'application/json' }]]) {
      const r = await call('GET', '/api/pricing/documents', undefined, h);
      ok(r.status === 403 || r.status === 401, `${who} cannot list the business documents`, r.status);
    }
    let r = await call('POST', '/api/pricing/documents', { filename: 'x.pdf', data: PDF.toString('base64') }, other.headers);
    ok(r.status === 403, 'another admin cannot upload one', r.status);
    // A large body from nobody is refused before the server reads it.
    const big = 'A'.repeat(3 * 1024 * 1024);
    r = await call('POST', '/api/pricing/documents', { filename: 'x.pdf', data: big }, { 'Content-Type': 'application/json' });
    ok(r.status === 401, 'a 3 MB body from nobody is turned away unread (401, not 413)', r.status);
    for (const p of ['/api/costing', '/api/financials']) {
      r = await call('GET', p, undefined, K);
      ok(r.status === 403, `${p}: the admin key is refused`, r.status);
      r = await call('GET', p, undefined, other.headers);
      ok(r.status === 403, `${p}: another admin is refused`, r.status);
      r = await call('GET', p, undefined, ceo.headers);
      ok(r.status === 200, `${p}: the CEO opens it`, r.status);
    }
    r = await call('GET', '/api/auth/me', undefined, ceo.headers);
    ok(r.body && r.body.pricing === true, '/me tells the page the CEO opens Pricing', JSON.stringify(r.body));
    r = await call('GET', '/api/auth/me', undefined, other.headers);
    ok(r.body && r.body.pricing === false, 'and tells another admin they do not', JSON.stringify(r.body));
    // What a package costs us to run travels to the CEO alone; the prices stay
    // readable for quotes and invoices.
    const costOf = async (h) => (await call('GET', '/api/products', undefined, h)).body || [];
    const [cat, theirs, keys] = [await costOf(ceo.headers), await costOf(other.headers), await costOf(K)];
    ok(cat.length > 0 && cat.every((p) => 'delivery_cost_full' in p), 'the CEO reads delivery costs in the catalogue');
    ok(theirs.length === cat.length && theirs.every((p) => !('delivery_cost_full' in p) && !('premium_model' in p) && 'retainer' in p),
      'another admin reads the prices but not the costs', JSON.stringify(theirs[0] || {}).slice(0, 160));
    ok(keys.every((p) => !('delivery_cost_full' in p)), 'and so does the admin key');
    const kpisOf = async (h) => ((await call('GET', '/api/dashboard', undefined, h)).body || {}).kpis || {};
    const [dc, dx] = [await kpisOf(ceo.headers), await kpisOf(other.headers)];
    ok('margin_pct' in dc && 'total_delivery_cost' in dc, 'the dashboard shows the CEO the margin', Object.keys(dc).join(','));
    ok(!('margin_pct' in dx) && !('total_delivery_cost' in dx) && !('net_monthly_result' in dx) && 'active_clients' in dx,
      'and withholds it from another admin', Object.keys(dx).join(','));
    r = await call('PUT', `/api/products/${cat[0].id}`, { retainer: cat[0].retainer }, other.headers);
    ok(r.status === 403, 'another admin cannot change a package', r.status);

    console.log('\n== the documents ==');
    const up = (filename, buf, extra = {}) => call('POST', '/api/pricing/documents',
      { filename, content_type: 'application/pdf', data: buf.toString('base64'), ...extra }, ceo.headers);
    r = await up(`VantriqAI_Business_Model_test-${stamp}.pdf`, PDF);
    ok(r.status === 201 && r.body.kind === 'business_model' && r.body.title === 'Business Model' && r.body.size_bytes === PDF.length,
      'a business model PDF is recognised by its name', JSON.stringify(r.body));
    const v1 = r.body; made.push(v1.id);
    ok(r.body.content === undefined, 'the list and the upload never carry the bytes');
    r = await up(`VantriqAI_Business_Model_test-${stamp}.pdf`, PDF);
    ok(r.status === 200 && r.body.duplicate === true && r.body.id === v1.id, 'the same file twice is one version', JSON.stringify(r.body));
    const PDF2 = Buffer.concat([PDF, Buffer.from('% v2\n')]);
    r = await up(`VantriqAI_Business_Model_test-${stamp}.pdf`, PDF2, { note: 'second version' });
    ok(r.status === 201 && r.body.id !== v1.id, 'a changed file is a new version', r.status);
    const v2 = r.body; made.push(v2.id);
    r = await up(`VantriqAI_Client_Pitch_Deck_test-${stamp}.pdf`, PDF);
    ok(r.status === 201 && r.body.kind === 'pitch_deck', 'the pitch deck is recognised', r.body && r.body.kind); made.push(r.body.id);
    r = await up(`VantriqAI_Product_Portfolio_test-${stamp}.pdf`, PDF);
    ok(r.status === 201 && r.body.kind === 'portfolio', 'and the portfolio', r.body && r.body.kind); made.push(r.body.id);

    r = await call('GET', '/api/pricing/documents', undefined, ceo.headers);
    const mine = r.body.documents.filter((d) => made.includes(d.id));
    const cur = (id) => (mine.find((d) => d.id === id) || {}).current;
    ok(cur(v2.id) === true && cur(v1.id) === false, 'the newest version is current, the older one history', JSON.stringify(mine.map((d) => [d.filename, d.current])));

    const res = await fetch(`${B}/api/pricing/documents/${v2.id}/file`, { headers: ceo.headers });
    const got = Buffer.from(await res.arrayBuffer());
    ok(res.status === 200 && got.equals(PDF2), 'the file comes back byte for byte', res.status);
    ok(/no-store/.test(res.headers.get('cache-control') || '') && /attachment/.test(res.headers.get('content-disposition') || '')
      && res.headers.get('content-type') === 'application/pdf', 'never cached, always a download, typed',
      [res.headers.get('cache-control'), res.headers.get('content-disposition'), res.headers.get('content-type')].join(' | '));
    r = await call('GET', `/api/pricing/documents/${v2.id}/file`, undefined, other.headers);
    ok(r.status === 403, 'another admin cannot fetch the file even with its id', r.status);
    const { rows: opened } = await db.query(`select opened_count from owner_documents where id = $1`, [v2.id]);
    ok(opened[0].opened_count === 1, 'each opening is counted', opened[0].opened_count);

    r = await up('notes.exe', PDF);
    ok(r.status === 400, 'an executable is refused', r.status);
    r = await call('POST', '/api/pricing/documents', { filename: 'x.pdf', data: '' }, ceo.headers);
    ok(r.status === 400, 'an empty file is refused', r.status);
    r = await call('POST', '/api/pricing/documents', { filename: 'x.pdf', data: '%%%not base64%%%' }, ceo.headers);
    ok(r.status === 400, 'so is data that is not base64', r.status);
    r = await up('big.pdf', Buffer.alloc(25 * 1024 * 1024 + 1, 65));
    ok(r.status === 413, 'files over 25 MB are refused', r.status);

    r = await call('DELETE', `/api/pricing/documents/${v1.id}`, undefined, other.headers);
    ok(r.status === 403, 'another admin cannot delete one', r.status);
    r = await call('DELETE', `/api/pricing/documents/${v1.id}`, undefined, ceo.headers);
    ok(r.status === 200, 'the CEO deletes an old version', r.status);
    made.splice(made.indexOf(v1.id), 1);
    r = await call('GET', `/api/pricing/documents/${v1.id}/file`, undefined, ceo.headers);
    ok(r.status === 404, 'and it is gone', r.status);

    console.log('\n== the page ==');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    try {
      const token = ceo.headers.Authorization.slice(7);
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
      await page.addInitScript(([b, t]) => { localStorage.setItem('vantriq_api_base', b); localStorage.setItem('vantriq_staff_session', t); }, [B, token]);
      await page.goto(B, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
      const nav = await page.locator('.sidebar').innerText();
      ok(/Products & Pricing/.test(nav) && /Financials/.test(nav), 'the CEO sees Products & Pricing and Financials', nav.slice(0, 300));
      await page.getByText('Products & Pricing', { exact: true }).first().click(); await page.waitForTimeout(2000);
      let body = await page.locator('body').innerText();
      ok(/Business documents/.test(body) && /Yours alone/.test(body), 'the Business documents card is at the top', body.slice(0, 300));
      ok(/Fixed by the business model/.test(body) && (await page.locator('.prod-card button:has-text("Edit")').count()) === 1,
        'standard packages stay fixed, Enterprise+ alone editable');
      ok(/Unit economics/.test(body), 'the costing is there for the CEO');
      const file = `${process.env.TMPDIR || '/tmp'}/VantriqAI_Product_Portfolio_ui-${stamp}.pdf`;
      fs.writeFileSync(file, PDF2);
      await page.setInputFiles('.odoc-grid ~ * input[type=file], .section-title input[type=file]', file);
      await page.waitForTimeout(2000);
      body = await page.locator('body').innerText();
      ok(/Product Portfolio/.test(body) && /Document saved/.test(body), 'a file dropped in through the page is saved', body.slice(0, 200));
      const { rows: ui } = await db.query(`select id from owner_documents where filename = $1`, [`VantriqAI_Product_Portfolio_ui-${stamp}.pdf`]);
      if (ui[0]) made.push(ui[0].id);
      await page.locator('.odoc button:has-text("View")').first().click(); await page.waitForTimeout(1200);
      ok(await page.locator('.modal iframe.odoc-frame').count() === 1, 'View opens the PDF in the page');
      await page.screenshot({ path: `${process.env.SHOTS || '/tmp'}/pricing-ceo.png`, fullPage: false });
      ok(errs.length === 0, 'no page errors', errs.join(' | '));

      // Another admin; emergency access is the same (test/breakglass.test.js).
      const page2 = await browser.newPage();
      await page2.addInitScript(([b, t]) => { localStorage.setItem('vantriq_api_base', b); localStorage.setItem('vantriq_staff_session', t); }, [B, other.headers.Authorization.slice(7)]);
      await page2.goto(B, { waitUntil: 'networkidle' }); await page2.waitForTimeout(1500);
      const nav2 = await page2.locator('.sidebar').innerText();
      ok(!/Products & Pricing/.test(nav2) && !/Financials/.test(nav2), 'another admin sees neither', nav2.slice(0, 300));
    } finally { await browser.close(); }
  } finally {
    if (made.length) await db.query(`delete from owner_documents where id = any($1::uuid[])`, [made]);
    await other.end(); await ceo.end(); await db.pool.end();
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); process.exit(1); });
