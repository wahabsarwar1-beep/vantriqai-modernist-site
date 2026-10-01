/**
 * Emergency access (v9.22): the admin API key no longer opens the CRM on its
 * own. It asks for a code, the code goes to the CEO, and only the code —
 * given out by the CEO — opens an emergency session, for two hours, which the
 * CEO sees and ends.
 *
 * Self-contained: it starts its own copy of the API on 8097, with a stand-in
 * for the Hostinger mail API on 8096 that keeps every email it is handed, so
 * the codes and alerts are read from what was actually "sent". Then a browser
 * goes through the sign-in screen the way a person would.
 *
 *   node test/breakglass.test.js
 */
const http = require('http');
const crypto = require('crypto');
const path = require('path');

const MAIL_PORT = 8096;
const PORT = 8097;
process.chdir(path.join(__dirname, '..'));
process.env.PORT = String(PORT);
process.env.HOSTINGER_MAIL_API = `http://127.0.0.1:${MAIL_PORT}`;
process.env.HOSTINGER_MAIL_TOKEN = 'test-token';
process.env.HOSTINGER_MAILBOX_ID = 'test-mailbox';
delete process.env.ALLOW_API_KEY_LOGIN;

const mails = [];
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    try { const m = JSON.parse(body); mails.push({ to: (m.to || [])[0], subject: m.subject || '', text: m.text || '' }); } catch { /* not JSON */ }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
  });
}).listen(MAIL_PORT, '127.0.0.1');

const { ceoSession, adminSession, db } = require('./ceo-session');
require('../src/index.js');

const B = `http://127.0.0.1:${PORT}`;
const OUTSIDE = { 'X-Forwarded-For': '203.0.113.7', 'X-Real-IP': '203.0.113.7' };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
async function call(method, p, body, headers = {}) {
  const r = await fetch(B + p, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: json };
}
/** The newest email matching, once it arrives (alerts are fire-and-forget). */
async function mailWhere(pred, since, ms = 4000) {
  for (let t = 0; t < ms; t += 100) {
    const hit = mails.slice(since).reverse().find(pred);
    if (hit) return hit;
    await sleep(100);
  }
  return null;
}
const codeIn = (m) => ((m && m.text.match(/\b(\d{6})\b/)) || [])[1];

const stamp = Date.now().toString(36);
const keyIds = [];
async function makeKey(scope = 'admin', label = scope) {
  const plain = 'vq_' + crypto.randomBytes(24).toString('hex');
  const { rows } = await db.query(
    `insert into api_keys (name, key_hash, scope) values ($1, $2, $3) returning id`,
    [`breakglass test ${label} ${stamp}`, sha(plain), scope]);
  keyIds.push(rows[0].id);
  return { plain, id: rows[0].id, name: `breakglass test ${label} ${stamp}` };
}
/** Key → code from the CEO's inbox → an emergency session. */
async function openEmergency(key) {
  const since = mails.length;
  const s = await call('POST', '/api/auth/breakglass/start', { key: key.plain }, OUTSIDE);
  const mail = await mailWhere((m) => /emergency access/i.test(m.subject) && m.text.includes(key.name), since);
  const v = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s.body && s.body.challenge_id, code: codeIn(mail) }, OUTSIDE);
  return { start: s, mail, verify: v, token: v.body && v.body.session, headers: { ...OUTSIDE, Authorization: 'Bearer ' + (v.body && v.body.session) } };
}

(async () => {
  for (let i = 0; i < 50; i += 1) { try { await fetch(B + '/api/health'); break; } catch { await sleep(100); } }
  const ceo = await ceoSession();
  const other = await adminSession();
  const key = await makeKey('admin', 'one');
  const hook = await makeKey('webhook');
  try {
    console.log('\n== the admin key on its own ==');
    let r = await call('GET', '/api/dashboard', undefined, { ...OUTSIDE, 'x-api-key': key.plain });
    ok(r.status === 401, 'from outside the server, the bare admin key is refused', r.status);
    ok(r.body && r.body.signed_out === true && r.body.breakglass === true, 'and the answer says the browser is signed out, and why', JSON.stringify(r.body));
    ok(/Emergency access/.test((r.body && r.body.error) || '') && /CEO/.test(r.body.error), 'it points to Emergency access and the CEO', r.body && r.body.error);
    const alert = await mailWhere((m) => /used on its own and refused/.test(m.subject), 0);
    ok(alert && alert.to === ceo.email, 'the CEO is told the key was tried', JSON.stringify(alert));
    ok(alert && /From: 203\.0\.113\.7/.test(alert.text) && alert.text.includes(key.name), 'with where it came from and which key', alert && alert.text);
    const before = mails.length;
    r = await call('GET', '/api/team', undefined, { 'X-Real-IP': '203.0.113.7', 'x-api-key': key.plain });
    ok(r.status === 401, 'a proxied request carrying only X-Real-IP is outside too', r.status);
    await sleep(400);
    ok(!mails.slice(before).some((m) => /refused/.test(m.subject)), 'one refusal email an hour per key, not one per request');
    r = await call('GET', '/api/dashboard', undefined, { 'x-api-key': key.plain });
    ok(r.status === 200, 'on the server itself the key still works (whoever is there holds the database anyway)', r.status);
    r = await call('POST', '/api/webhooks/lead', {}, { ...OUTSIDE, 'x-api-key': hook.plain });
    ok(r.status === 400, 'the webhook key, from outside, is untouched (n8n and the website keep working)', `${r.status} ${JSON.stringify(r.body)}`);

    console.log('\n== asking for a code ==');
    r = await call('POST', '/api/auth/breakglass/start', { key: 'vq_' + 'f'.repeat(48) }, OUTSIDE);
    ok(r.status === 401, 'a made-up key gets nothing', r.status);
    r = await call('POST', '/api/auth/breakglass/start', { key: hook.plain }, OUTSIDE);
    ok(r.status === 401, 'nor does a webhook key', r.status);
    r = await call('POST', '/api/auth/breakglass/start', {}, OUTSIDE);
    ok(r.status === 400, 'an empty request is asked for the key', r.status);
    let since = mails.length;
    const s1 = await call('POST', '/api/auth/breakglass/start', { key: key.plain }, { ...OUTSIDE, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0' });
    ok(s1.status === 200 && s1.body.challenge_id && s1.body.method === 'ceo', 'the admin key asks for a code', JSON.stringify(s1.body));
    ok(s1.body.sent_to === 'ce•@vantriqai.com', 'the screen says it went to the CEO, masked', s1.body.sent_to);
    const m1 = await mailWhere((m) => /emergency access/i.test(m.subject), since);
    const code1 = codeIn(m1);
    ok(m1 && m1.to === 'ceo@vantriqai.com', 'the code goes to ceo@vantriqai.com, not to whoever typed the key', m1 && m1.to);
    ok(!!code1 && !/\d{6}/.test(m1.subject), 'the code is in the body, never the subject (a locked phone shows subjects)', m1 && m1.subject);
    ok(/From: 203\.0\.113\.7/.test(m1.text) && /Chrome/.test(m1.text) && m1.text.includes(key.name), 'the email says who is asking: address, browser, key', m1 && m1.text);
    ok(!JSON.stringify(s1.body).includes(code1), 'the code is never in the answer to the person asking');
    const { rows: chRows } = await db.query(`select code_hash from breakglass_challenges where id = $1`, [s1.body.challenge_id]);
    ok(chRows[0] && chRows[0].code_hash !== code1 && chRows[0].code_hash === sha(code1), 'only a hash of the code is stored');

    console.log('\n== the code ==');
    const wrong = code1 === '000000' ? '111111' : '000000';
    r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s1.body.challenge_id, code: wrong }, OUTSIDE);
    ok(r.status === 401 && /4 attempts left/.test(r.body.error), 'a wrong code is refused, with the attempts left', JSON.stringify(r.body));
    since = mails.length;
    const v1 = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s1.body.challenge_id, code: code1 }, OUTSIDE);
    ok(v1.status === 200 && /^bg_[0-9a-f]{48}$/.test(v1.body.session), 'the right code opens an emergency session', JSON.stringify(v1.body));
    const hours = (new Date(v1.body.expires_at) - Date.now()) / 3600e3;
    ok(hours > 1.9 && hours <= 2.01, 'for two hours', hours.toFixed(2));
    ok(v1.body.user && v1.body.user.breakglass === true && v1.body.user.pricing === false, 'as emergency access, without Pricing', JSON.stringify(v1.body.user));
    r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s1.body.challenge_id, code: code1 }, OUTSIDE);
    ok(r.status === 400, 'a code opens once', r.status);
    const opened = await mailWhere((m) => /was just opened/.test(m.subject), since);
    ok(opened && opened.to === ceo.email && /Open until/.test(opened.text), 'the CEO is emailed that it opened, and until when', JSON.stringify(opened));
    const { rows: tok } = await db.query(`select count(*)::int as n from breakglass_sessions where token_hash = $1`, [sha(v1.body.session)]);
    const { rows: plain } = await db.query(`select count(*)::int as n from breakglass_sessions where token_hash = $1`, [v1.body.session]);
    ok(tok[0].n === 1 && plain[0].n === 0, 'the session is stored hashed, never as itself');

    console.log('\n== inside, as emergency access ==');
    const E = { ...OUTSIDE, Authorization: 'Bearer ' + v1.body.session };
    r = await call('GET', '/api/auth/me', undefined, E);
    ok(r.status === 200 && r.body.breakglass === true && r.body.role === 'admin' && r.body.pricing === false && r.body.name === 'Emergency access',
      '/me says emergency access: admin, no Pricing', JSON.stringify(r.body));
    r = await call('GET', '/api/dashboard', undefined, E);
    ok(r.status === 200, 'the dashboard opens', r.status);
    r = await call('GET', '/api/team', undefined, E);
    ok(r.status === 200, 'admin areas open (Team)', r.status);
    since = mails.length;
    const hire = `bg-hire-${stamp}@vantriqai.com`;
    r = await call('POST', '/api/team', { email: hire, name: 'Emergency hire', role: 'staff' }, E);
    ok(r.status === 201, 'it can add an employee, as an admin can', r.status);
    const hireId = r.body && r.body.user && r.body.user.id;
    let told = await mailWhere((m) => /changed the team/.test(m.subject) && m.text.includes(hire), since);
    ok(told && told.to === ceo.email && /added an employee/.test(told.text), 'and the CEO is emailed at once that it did', JSON.stringify(told));
    since = mails.length;
    r = await call('POST', `/api/team/${hireId}/role`, { role: 'admin' }, E);
    told = await mailWhere((m) => /changed the team/.test(m.subject) && /changed the role of/.test(m.text), since);
    ok(r.status === 200 && told && told.text.includes(`${hire} (now admin)`), 'a promotion too, naming who and to what', told && told.text);
    since = mails.length;
    r = await call('POST', '/api/team', { email: 'not-an-email', name: 'x' }, E);
    await sleep(400);
    ok(r.status === 400 && !mails.slice(since).some((m) => /changed the team/.test(m.subject)), 'a change that failed sends nothing');
    since = mails.length;
    r = await call('POST', `/api/team/${hireId}/role`, { role: 'staff' }, other.headers);
    await sleep(400);
    ok(r.status === 200 && !mails.slice(since).some((m) => /changed the team/.test(m.subject)), 'an admin\'s own session changing the team is not emailed (only emergency access is)');
    if (hireId) await db.query(`delete from internal_users where id = $1`, [hireId]);
    for (const p of ['/api/costing', '/api/financials', '/api/pricing/documents']) {
      r = await call('GET', p, undefined, E);
      ok(r.status === 403, `${p} stays the CEO's`, r.status);
    }
    r = await call('GET', '/api/auth/breakglass/sessions', undefined, E);
    ok(r.status === 403, 'it cannot see the list of emergency sessions', r.status);
    r = await call('POST', '/api/webhooks/lead', {}, E);
    ok(r.status === 403, 'nor post as a webhook', r.status);

    console.log('\n== the CEO sees it, and ends it ==');
    r = await call('GET', '/api/auth/breakglass/sessions', undefined, other.headers);
    ok(r.status === 403, 'another admin cannot see the list', r.status);
    r = await call('GET', '/api/auth/breakglass/sessions', undefined, ceo.headers);
    const mine = r.body && r.body.sessions.find((x) => x.key_name === key.name && x.live);
    ok(r.status === 200 && !!mine, 'the CEO sees the open session', JSON.stringify(r.body).slice(0, 300));
    ok(mine && mine.ip === '203.0.113.7' && r.body.sent_to === 'ceo@vantriqai.com', 'with where it came from', JSON.stringify(mine));
    ok(!JSON.stringify(r.body).includes(v1.body.session) && !JSON.stringify(r.body).includes(sha(v1.body.session)), 'and nothing in the list opens anything');
    r = await call('POST', `/api/auth/breakglass/sessions/${mine.id}/end`, {}, other.headers);
    ok(r.status === 403, 'another admin cannot end it', r.status);
    r = await call('POST', `/api/auth/breakglass/sessions/${mine.id}/end`, {}, ceo.headers);
    ok(r.status === 200 && r.body.ended === 1, 'the CEO ends it', JSON.stringify(r.body));
    r = await call('GET', '/api/dashboard', undefined, E);
    ok(r.status === 401 && r.body.signed_out === true && /ended/.test(r.body.error), 'and it is signed out on its next request', JSON.stringify(r.body));
    r = await call('GET', '/api/auth/me', undefined, E);
    ok(r.status === 401 && r.body.signed_out === true, '/me agrees', r.status);
    r = await call('POST', '/api/auth/breakglass/sessions/not-a-uuid/end', {}, ceo.headers);
    ok(r.status === 404, 'a malformed id is a 404, not a crash', r.status);

    console.log('\n== guessing ==');
    since = mails.length;
    const s2 = await call('POST', '/api/auth/breakglass/start', { key: key.plain }, OUTSIDE);
    const code2 = codeIn(await mailWhere((m) => /emergency access/i.test(m.subject), since));
    const bad = code2 === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i += 1) r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s2.body.challenge_id, code: bad }, OUTSIDE);
    ok(r.status === 401 && /Too many/.test(r.body.error), 'five wrong codes use the code up', JSON.stringify(r.body));
    r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: s2.body.challenge_id, code: code2 }, OUTSIDE);
    ok(r.status === 429, 'after which even the right code is refused', r.status);
    r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: 'nope', code: '123456' }, OUTSIDE);
    ok(r.status === 400, 'a malformed request id is a 400, not a crash', r.status);

    console.log('\n== the CEO\'s inbox cannot be flooded ==');
    for (let i = 0; i < 3; i += 1) r = await call('POST', '/api/auth/breakglass/start', { key: key.plain }, OUTSIDE);
    ok(r.status === 200, 'five codes an hour per key are allowed', r.status);
    r = await call('POST', '/api/auth/breakglass/start', { key: key.plain }, OUTSIDE);
    ok(r.status === 429, 'the sixth is refused', JSON.stringify(r.body));

    console.log('\n== End all, signing out, a revoked key, a stale session ==');
    const key2 = await makeKey('admin', 'two');
    const a = await openEmergency(key2);
    const b = await openEmergency(key2);
    ok(!!a.token && !!b.token, 'two emergency sessions open', `${a.verify.status} ${b.verify.status}`);
    since = mails.length;
    const pending = await call('POST', '/api/auth/breakglass/start', { key: key2.plain }, OUTSIDE);
    const pendingCode = codeIn(await mailWhere((m) => /emergency access/i.test(m.subject), since));
    r = await call('POST', '/api/auth/breakglass/end-all', {}, other.headers);
    ok(r.status === 403, 'another admin cannot end them', r.status);
    r = await call('POST', '/api/auth/breakglass/end-all', {}, ceo.headers);
    ok(r.status === 200 && r.body.ended === 2, 'End all ends both', JSON.stringify(r.body));
    ok((await call('GET', '/api/dashboard', undefined, a.headers)).status === 401
      && (await call('GET', '/api/dashboard', undefined, b.headers)).status === 401, 'both are signed out');
    r = await call('POST', '/api/auth/breakglass/verify', { challenge_id: pending.body.challenge_id, code: pendingCode }, OUTSIDE);
    ok(r.status === 400, 'and a code still waiting is cancelled with them', JSON.stringify(r.body));

    const c = await openEmergency(key2);
    r = await call('POST', '/api/auth/logout', undefined, c.headers);
    ok(r.status === 204, 'signing out', r.status);
    r = await call('GET', '/api/auth/me', undefined, c.headers);
    const { rows: so } = await db.query(`select ended_by from breakglass_sessions where token_hash = $1`, [sha(c.token)]);
    ok(r.status === 401 && so[0] && so[0].ended_by === 'signed out', 'ends the session, recorded as signed out', JSON.stringify(so));

    const key3 = await makeKey('admin', 'three');
    const d = await openEmergency(key3);
    await db.query(`update api_keys set revoked = true where id = $1`, [key3.id]);
    r = await call('GET', '/api/dashboard', undefined, d.headers);
    const { rows: rv } = await db.query(`select ended_by from breakglass_sessions where token_hash = $1`, [sha(d.token)]);
    ok(r.status === 401 && r.body.signed_out && rv[0].ended_by === 'key revoked', 'revoking the key ends its sessions', JSON.stringify(r.body));
    r = await call('POST', '/api/auth/breakglass/start', { key: key3.plain }, OUTSIDE);
    ok(r.status === 401, 'and a revoked key asks for nothing', r.status);

    const stale = 'bg_' + crypto.randomBytes(24).toString('hex');
    await db.query(`insert into breakglass_sessions (token_hash, key_id, expires_at, created_at) values ($1, $2, now() - interval '1 minute', now() - interval '2 hours')`, [sha(stale), key2.id]);
    r = await call('GET', '/api/dashboard', undefined, { ...OUTSIDE, Authorization: 'Bearer ' + stale });
    ok(r.status === 401 && r.body.signed_out && /expired/.test(r.body.error), 'two hours on, it has expired', JSON.stringify(r.body));
    r = await call('GET', '/api/dashboard', undefined, { ...OUTSIDE, Authorization: 'Bearer bg_' + 'a'.repeat(48) });
    ok(r.status === 401 && r.body.signed_out, 'a made-up emergency session gets nothing', r.status);

    console.log('\n== switched off, or no email ==');
    const key4 = await makeKey('admin', 'four');
    const e = await openEmergency(key4);
    process.env.ALLOW_API_KEY_LOGIN = 'false';
    r = await call('POST', '/api/auth/breakglass/start', { key: key4.plain }, OUTSIDE);
    ok(r.status === 403, 'ALLOW_API_KEY_LOGIN=false switches emergency access off', r.status);
    r = await call('GET', '/api/dashboard', undefined, e.headers);
    ok(r.status === 401 && r.body.signed_out, 'and ends the sessions already open', JSON.stringify(r.body));
    r = await call('GET', '/api/dashboard', undefined, { 'x-api-key': key4.plain });
    ok(r.status === 403, 'and the key on the server itself too', r.status);
    delete process.env.ALLOW_API_KEY_LOGIN;
    const token = process.env.HOSTINGER_MAIL_TOKEN;
    delete process.env.HOSTINGER_MAIL_TOKEN;
    r = await call('POST', '/api/auth/breakglass/start', { key: key4.plain }, OUTSIDE);
    ok(r.status === 503 && /SSH/.test(r.body.error), 'with no email on the server it says so, and points to SSH', JSON.stringify(r.body));
    process.env.HOSTINGER_MAIL_TOKEN = token;

    console.log('\n== the screens ==');
    const { chromium } = require('playwright-core');
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
    try {
      const key5 = await makeKey('admin', 'five');
      const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      const errs = []; page.on('pageerror', (x) => errs.push(String(x)));
      page.on('dialog', (dlg) => dlg.accept());
      // A browser still holding the key the old way.
      await page.addInitScript(([k]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('vantriq_api_key', k); sessionStorage.setItem('seeded', '1'); } }, [key5.plain]);
      await page.goto(B, { waitUntil: 'networkidle' });
      let body = await page.locator('body').innerText();
      ok(await page.locator('#lg_email').count() === 1 && /admin key alone has ended/.test(body), 'a browser holding the old key lands on sign-in, told why', body.slice(0, 300));
      ok(await page.evaluate(() => localStorage.getItem('vantriq_api_key')) === null, 'and the key is gone from the browser');
      await page.click('text=Emergency access with an API key');
      ok(await page.locator('#conn_base').count() === 0, 'emergency access asks for the key only');
      body = await page.locator('body').innerText();
      ok(/sends a 6-digit code to the CEO/.test(body), 'and says the key alone opens nothing', body.slice(0, 400));
      await page.fill('#conn_key', key5.plain);
      since = mails.length;
      await page.click('button:has-text("Send a code to the CEO")');
      await page.waitForSelector('#otp_code', { timeout: 5000 }).catch(() => {});
      body = await page.locator('body').innerText();
      ok(/Ask the CEO for the code/.test(body) && /ce•@vantriqai\.com/.test(body), 'then asks for the CEO\'s code', body.slice(0, 300));
      const code5 = codeIn(await mailWhere((m) => m.text.includes(key5.name), since));
      await page.fill('#otp_code', '000001' === code5 ? '000002' : '000001');
      await page.click('button:has-text("Verify and open emergency access")'); await page.waitForTimeout(600);
      ok(/Incorrect code/.test(await page.locator('body').innerText()), 'a wrong code is shown as wrong');
      await page.fill('#otp_code', code5);
      await page.click('button:has-text("Verify and open emergency access")');
      await page.waitForSelector('.sidebar', { timeout: 10000 }).catch(() => {});
      const nav = await page.locator('.sidebar').innerText().catch(() => '');
      ok(/Emergency access/.test(nav) && /ends \d\d:\d\d/.test(nav), 'inside, the sidebar says Emergency access and when it ends', nav.slice(-300));
      ok(!/Products & Pricing/.test(nav) && !/Financials/.test(nav), 'with no Products & Pricing or Financials', nav.slice(0, 300));
      ok(/Team/.test(nav), 'but the admin areas are there');
      await page.getByText('Team', { exact: true }).first().click(); await page.waitForTimeout(1200);
      ok(await page.locator('#emergency-card').count() === 0, 'the Emergency access card is not shown to emergency access itself');
      ok(await page.evaluate(() => !!localStorage.getItem('vantriq_staff_session')) && await page.evaluate(() => localStorage.getItem('vantriq_api_key')) === null,
        'the browser holds a session, not the key');

      // The CEO, on Team, ends it.
      const ceoPage = await browser.newPage({ viewport: { width: 1280, height: 860 } });
      ceoPage.on('pageerror', (x) => errs.push('ceo: ' + String(x)));
      ceoPage.on('dialog', (dlg) => dlg.accept());
      await ceoPage.addInitScript(([b, t]) => { localStorage.setItem('vantriq_api_base', b); localStorage.setItem('vantriq_staff_session', t); }, [B, ceo.headers.Authorization.slice(7)]);
      await ceoPage.goto(B, { waitUntil: 'networkidle' });
      await ceoPage.getByText('Team', { exact: true }).first().click();
      await ceoPage.waitForSelector('#emergency-card table', { timeout: 8000 }).catch(() => {});
      const card = await ceoPage.locator('#emergency-card').innerText().catch(() => '');
      ok(/Emergency access/.test(card) && /203\.0\.113\.7|127\.0\.0\.1/.test(card) && /Open until/.test(card), 'the CEO\'s Team page lists it, open', card.slice(0, 500));
      ok(/End all/.test(card), 'with End all');
      await ceoPage.screenshot({ path: `${process.env.SHOTS || '/tmp'}/breakglass-ceo-team.png` });
      await ceoPage.click('#emergency-card button:has-text("End all")'); await ceoPage.waitForTimeout(1500);
      ok(!/Open until/.test(await ceoPage.locator('#emergency-card').innerText()), 'End all closes every one');

      // The page checks in with the server every 20 seconds; the first check
      // after the CEO ends it is answered signed_out, and the page leaves.
      await page.waitForSelector('#lg_email', { timeout: 30000 }).catch(() => {});
      body = await page.locator('body').innerText();
      ok(await page.locator('#lg_email').count() === 1 && /Emergency access has ended/.test(body), 'the emergency browser is sent to sign-in within 20 seconds, told why', body.slice(0, 300));
      ok(await page.evaluate(() => localStorage.getItem('vantriq_staff_session')) === null, 'and holds nothing any more');

      const otherPage = await browser.newPage();
      await otherPage.addInitScript(([b, t]) => { localStorage.setItem('vantriq_api_base', b); localStorage.setItem('vantriq_staff_session', t); }, [B, other.headers.Authorization.slice(7)]);
      await otherPage.goto(B, { waitUntil: 'networkidle' });
      await otherPage.getByText('Team', { exact: true }).first().click(); await otherPage.waitForTimeout(1200);
      ok(await otherPage.locator('#emergency-card').count() === 0, 'another admin\'s Team page has no Emergency access card');
      ok(errs.length === 0, 'no page errors', errs.join(' | '));
    } finally { await browser.close(); }
  } finally {
    await db.query(`delete from api_keys where id = any($1::uuid[])`, [keyIds]);
    await other.end(); await ceo.end();
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
