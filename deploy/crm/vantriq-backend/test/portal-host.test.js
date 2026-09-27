/**
 * portal.vantriqai.com opens the customer portal; crm.vantriqai.com (and any
 * other host) opens the staff console. Both reach the same app, told apart by
 * the Host header the proxy passes through.
 *
 * Needs the API on 8099.
 *
 *   node test/portal-host.test.js
 */
const http = require('http');
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };

// Plain http.request: fetch() will not let a caller set Host.
const get = (path, host) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: 8099, path, headers: { Host: host } }, (res) => {
    let body = '';
    res.on('data', (c) => { body += c; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject);
  req.end();
});
const title = (b) => (b.match(/<title>([^<]*)/) || [])[1] || '';

(async () => {
  const PORTAL = 'Account Portal', CRM = 'Revenue Console';

  const p = await get('/', 'portal.vantriqai.com');
  ok(p.status === 200 && title(p.body).includes(PORTAL), 'portal.vantriqai.com/ is the customer portal', title(p.body));
  const pi = await get('/index.html', 'portal.vantriqai.com');
  ok(title(pi.body).includes(PORTAL), 'so is /index.html on the portal address', title(pi.body));
  const pDeep = await get('/some/old/link', 'portal.vantriqai.com');
  ok(title(pDeep.body).includes(PORTAL), 'and an unknown path on it falls back to the portal', title(pDeep.body));
  const pPortal = await get('/portal.html', 'portal.vantriqai.com');
  ok(title(pPortal.body).includes(PORTAL), 'the old /portal.html links keep working', title(pPortal.body));
  const pReset = await get('/reset.html', 'portal.vantriqai.com');
  ok(pReset.status === 200 && !title(pReset.body).includes(CRM), 'the password-reset page is still served as itself', title(pReset.body));
  const pUpper = await get('/', 'Portal.VantriqAI.com');
  ok(title(pUpper.body).includes(PORTAL), 'the host match ignores case', title(pUpper.body));
  const pApi = await get('/api/health', 'portal.vantriqai.com');
  ok(pApi.status === 200 && pApi.body.includes('"ok":true'), 'the API still answers on the portal address');

  const c = await get('/', 'crm.vantriqai.com');
  ok(title(c.body).includes(CRM), 'crm.vantriqai.com/ is still the staff console', title(c.body));
  const cDeep = await get('/some/view', 'crm.vantriqai.com');
  ok(title(cDeep.body).includes(CRM), 'and so is its fallback', title(cDeep.body));
  const cPortal = await get('/portal.html', 'crm.vantriqai.com');
  ok(title(cPortal.body).includes(PORTAL), 'the portal is still reachable at /portal.html on the CRM address', title(cPortal.body));
  const local = await get('/', '127.0.0.1:8099');
  ok(title(local.body).includes(CRM), 'any other host gets the staff console, as before', title(local.body));

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
