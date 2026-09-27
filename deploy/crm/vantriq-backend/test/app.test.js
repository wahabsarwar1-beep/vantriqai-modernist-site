/**
 * The VantriqAI app (v9.15): the installable portal, the kiosk app, the
 * Play Store verification file and the privacy page. HTTP checks, then a real
 * browser: the service worker registers, and a page that cannot be reached
 * shows the offline screen.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey.  node test/app.test.js
 */
const fs = require('fs');
const { chromium } = require('playwright-core');
const B = 'http://127.0.0.1:8099';
const AH = { 'Content-Type': 'application/json', 'x-api-key': fs.readFileSync('/tmp/adminkey', 'utf8').trim() };
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const get = (p, h) => fetch(B + p, { headers: h });
const put = (p, b) => fetch(B + p, { method: 'PUT', headers: AH, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const FP = Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':');

(async () => {
  console.log('\n== the installable portal ==');
  const m = await get('/app/manifest.webmanifest');
  const man = await m.json();
  ok(m.status === 200 && /manifest\+json|json/.test(m.headers.get('content-type')), 'the manifest is served', m.headers.get('content-type'));
  ok(man.name === 'VantriqAI' && man.start_url === '/' && man.display === 'standalone', 'named VantriqAI, opens the portal full screen');
  ok(man.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable') && man.icons.some((i) => i.sizes === '192x192'), 'with 192, 512 and maskable icons');
  for (const i of man.icons) ok((await get(i.src)).status === 200, `icon ${i.src} is there`);
  const sw = await get('/sw.js');
  ok(sw.status === 200 && /javascript/.test(sw.headers.get('content-type')) && (await sw.text()).includes('offline.html'), 'the service worker is served');
  ok((await get('/app/offline.html')).status === 200, 'and its offline page');
  const portal = await (await get('/portal.html')).text();
  ok(portal.includes('rel="manifest"') && portal.includes('apple-touch-icon') && portal.includes("register('/sw.js')"), 'the portal links the manifest, iPhone icon and service worker');

  console.log('\n== the kiosk app ==');
  const growth = (await (await get('/api/products', AH)).json()).find((p) => p.name === 'Growth');
  const stamp = Date.now();
  const client = await (await fetch(B + '/api/clients', { method: 'POST', headers: AH, body: JSON.stringify({ name: 'App', company: `App Test ${stamp}`, email: 'app@example.com', phone: '923001234000', product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: `app-${stamp}`, ntn: '1234567-8', billing_address: 'Lahore' }) })).json();
  await fetch(`${B}/api/clients/${client.id}/surveys`, { method: 'PATCH', headers: AH, body: JSON.stringify({ enabled: true }) });
  const sv = await (await fetch(B + '/api/surveys', { method: 'POST', headers: AH, body: JSON.stringify({ client_id: client.id, template: 'restaurant', display_name: 'Khan Kitchen', locations: ['Gulberg'] }) })).json();
  try {
    const kioskPage = await (await get(`/s/${sv.slug}?kiosk=1&loc=gulberg`)).text();
    const phonePage = await (await get(`/s/${sv.slug}`)).text();
    ok(kioskPage.includes(`/s/${sv.slug}/app.webmanifest?loc=gulberg`), 'the kiosk link offers its own app');
    ok(!phonePage.includes('rel="manifest"'), 'a customer on their own phone is never offered an install');
    const km = await (await get(`/s/${sv.slug}/app.webmanifest?loc=gulberg`)).json();
    ok(km.start_url === `/s/${sv.slug}?kiosk=1&loc=gulberg` && km.display === 'fullscreen' && /Khan Kitchen/.test(km.name), 'which opens full screen, straight into the kiosk', JSON.stringify(km).slice(0, 200));
  } finally {
    await fetch(`${B}/api/clients/${client.id}`, { method: 'DELETE', headers: AH });
  }

  console.log('\n== the Play Store app ==');
  const before = await (await get('/api/settings', AH)).json();
  try {
    await put('/api/settings', { android_sha256: '' });
    ok(JSON.stringify(await (await get('/.well-known/assetlinks.json')).json()) === '[]', 'with no fingerprint, Android is told nothing');
    ok((await put('/api/settings', { android_sha256: 'not-a-fingerprint' })).status === 400, 'a fingerprint that is not one is refused');
    ok((await put('/api/settings', { android_package: 'Not A Package' })).status === 400, 'so is a package name that is not one');
    const saved = await put('/api/settings', { android_package: 'com.vantriqai.app', android_sha256: `${FP.toLowerCase()}\n${FP}` });
    ok(saved.status === 200 && saved.body.android_sha256 === `${FP}\n${FP}`, 'a real one is saved, upper-cased');
    const al = await (await get('/.well-known/assetlinks.json')).json();
    ok(al[0] && al[0].target.package_name === 'com.vantriqai.app' && al[0].target.sha256_cert_fingerprints[0] === FP
      && al[0].relation[0] === 'delegate_permission/common.handle_all_urls', 'and published for Android to verify the app', JSON.stringify(al));
  } finally {
    await put('/api/settings', { android_package: before.android_package || 'com.vantriqai.app', android_sha256: before.android_sha256 || '' });
  }
  const priv = await get('/privacy');
  ok(priv.status === 200 && (await priv.text()).includes('Privacy policy'), 'the privacy policy the listing points to is there');

  console.log('\n== in a real browser ==');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${B}/portal.html`);
  const scope = await page.evaluate(() => navigator.serviceWorker.ready.then((r) => r.scope));
  ok(scope === `${B}/`, 'the service worker registers for the whole app', scope);
  await page.reload();
  await ctx.setOffline(true);
  await page.goto(`${B}/portal.html`).catch(() => {});
  ok(/You're offline/.test(await page.content()), 'offline, the app shows its offline screen instead of an error');
  await ctx.setOffline(false);
  ok(!errors.length, 'no script errors', errors.join(' | '));
  await browser.close();

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
