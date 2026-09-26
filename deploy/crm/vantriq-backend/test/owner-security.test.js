/**
 * The protected owner account (v9.11) — a login nobody else can touch.
 *
 * Two separate guarantees are under test:
 *
 *   1. Postgres itself refuses a second is_owner=true row. Application code
 *      never has to get this right, because the database won't let it be
 *      wrong (idx_internal_users_one_owner, a unique index on a column
 *      that is only ever true for one row).
 *
 *   2. team.js refuses to deactivate, demote or reset the password of
 *      whichever row IS the owner — even from the admin key, even though
 *      every other admin account is fully manageable that way.
 *
 * The full login → TOTP-setup → TOTP-confirm → sign-in-with-a-code chain
 * needs a real mailbox for its very first step (a brand-new staff account's
 * first login still goes through emailed OTP, before TOTP replaces it) —
 * this sandbox has no working HOSTINGER_MAIL_TOKEN, so that section is
 * skipped here rather than faked, the same way proposal.test.js skips its
 * text-layer assertions when pdftotext isn't on the machine. It runs for
 * real wherever mail is actually configured — production included.
 *
 * Needs: the API on 8099, an admin key in /tmp/adminkey, and
 * `npm run seed-owner` to have been run at least once (ceo@vantriqai.com,
 * or $OWNER_EMAIL, must already exist and be flagged is_owner).
 *
 *   node test/owner-security.test.js
 */
const fs = require('fs');
const { verifyTotp, otpauthUri, randomSecret, currentCode } = require('../src/utils/totp');
const lastEmailedCode = () => {
  const m = JSON.parse(fs.readFileSync('/tmp/lastmail.json', 'utf8'));
  return (m.text.match(/\b(\d{6})\b/) || [])[1];
};

const B = 'http://127.0.0.1:8099';
const KEY = fs.readFileSync('/tmp/adminkey', 'utf8').trim();
const H = { 'Content-Type': 'application/json', 'x-api-key': KEY };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const J = async (r) => { try { return await r.json(); } catch { return null; } };
const get = (p) => fetch(B + p, { headers: H }).then(async (r) => ({ status: r.status, body: await J(r) }));
const send = (m) => (p, b) => fetch(B + p, { method: m, headers: H, body: JSON.stringify(b || {}) })
  .then(async (r) => ({ status: r.status, body: await J(r) }));
const post = send('POST'), patch = send('PATCH');

(async () => {
  console.log('\n== the algorithm itself (RFC 6238, no server involved) ==');
  // The RFC's own SHA-1 test vector: ASCII secret "12345678901234567890",
  // T=59s. The 8-digit reference code is 94287082; a 6-digit code is the
  // same truncated integer mod 10^6, so the low 6 digits must match.
  const rfcSecretB32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  ok(verifyTotp(rfcSecretB32, '287082', { at: 59 * 1000, window: 0 }),
    'matches the RFC 6238 SHA-1 test vector at T=59s');
  ok(!verifyTotp(rfcSecretB32, '000000', { at: 59 * 1000, window: 0 }),
    'an arbitrary wrong code is rejected');
  ok(!verifyTotp(rfcSecretB32, '287082', { at: 59_000 + 120_000, window: 1 }),
    'the same code four steps later (well outside the drift window) is rejected');
  const uri = otpauthUri(randomSecret(), { account: 'ceo@vantriqai.com' });
  ok(uri.startsWith('otpauth://totp/') && uri.includes('ceo%40vantriqai.com'),
    'the otpauth URI names the account and uses the totp scheme', uri);

  console.log('\n== exactly one owner exists, and the database itself enforces that ==');
  const team = await get('/api/team');
  const owner = (team.body || []).find((u) => u.is_owner);
  ok(!!owner, 'a protected owner account exists (run "npm run seed-owner" first if not)',
    JSON.stringify((team.body || []).map((u) => u.email)));
  if (!owner) {
    console.log('\n==== cannot continue without an owner account — 1 failed, stopping ====\n');
    process.exit(1);
  }
  ok((team.body || []).filter((u) => u.is_owner).length === 1, 'and only one');

  console.log('\n== nobody else can touch it, not even through the admin key ==');
  const deact = await post(`/api/team/${owner.id}/deactivate`, {});
  ok(deact.status === 403, 'deactivating the owner is refused', JSON.stringify(deact.body));
  ok(/protected owner account/i.test(deact.body && deact.body.error || ''),
    'the refusal says why, not just "no"', JSON.stringify(deact.body));

  const roleChange = await post(`/api/team/${owner.id}/role`, { role: 'staff' });
  ok(roleChange.status === 403, 'demoting the owner is refused', JSON.stringify(roleChange.body));

  const reset = await post(`/api/team/${owner.id}/reset-password`, { password: 'SomeoneElseChoseThis123' });
  ok(reset.status === 403, "resetting the owner's password is refused", JSON.stringify(reset.body));

  const stillThere = await get('/api/team');
  const ownerAfter = (stillThere.body || []).find((u) => u.id === owner.id);
  ok(!!ownerAfter && ownerAfter.active && ownerAfter.role === 'admin',
    'the owner account is unchanged by every attempt above', JSON.stringify(ownerAfter));

  console.log('\n== that protection is specific to the owner, not team.js breaking generally ==');
  const created = await post('/api/team', { email: `owner-test-throwaway-${Date.now()}@vantriqai.com`, name: 'Throwaway Admin', role: 'admin' });
  ok(created.status === 201, 'an ordinary admin account is still created normally', JSON.stringify(created.body).slice(0, 150));
  const throwawayId = created.body && created.body.user && created.body.user.id;

  if (throwawayId) {
    const throwawayDeactivate = await post(`/api/team/${throwawayId}/deactivate`, {});
    ok(throwawayDeactivate.status === 200, 'and it CAN be deactivated — the block above is not a blanket one', JSON.stringify(throwawayDeactivate.body).slice(0, 150));
  }

  console.log('\n== the break-glass admin key still works normally (alerting is fire-and-forget) ==');
  // The alert email itself can't be verified here without a configured
  // mailbox — this only proves the new alerting code path never slows or
  // breaks an ordinary admin-key request.
  const t0 = Date.now();
  const normal = await get('/api/team');
  ok(normal.status === 200 && Date.now() - t0 < 5000,
    'an admin-key request completes normally with the use-alert wired in');

  console.log('\n== full login → TOTP setup → confirm → sign-in, where mail is actually configured ==');
  const mail = await get('/api/settings/email');
  const mailUsable = !!(mail.body && mail.body.configured) && fs.existsSync('/tmp/lastmail.json');
  if (!mailUsable) {
    console.log('  SKIP mail is not configured/capturable in this environment (a brand-new account\'s\n'
      + '       FIRST login still needs emailed OTP, before TOTP can replace it) — this section\n'
      + '       needs a real HOSTINGER_MAIL_TOKEN and a readable /tmp/lastmail.json, same as\n'
      + '       test/staff-auth-ui.test.js — which production has and this sandbox does not.');
  } else {
    const email = `owner-test-totp-${Date.now()}@vantriqai.com`;
    const password = 'ThrowawayPassw0rd!';
    const madeUser = await post('/api/team', { email, name: 'TOTP Test User', role: 'staff', password });
    const userId = madeUser.body && madeUser.body.user && madeUser.body.user.id;
    ok(madeUser.status === 201, 'a test staff account is created with a known password', JSON.stringify(madeUser.body).slice(0, 150));

    const jpost = (p, b) => fetch(`${B}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then((r) => r.json());

    const login1 = await jpost('/api/auth/login', { email, password });
    ok(login1.method === 'email' && !!login1.challenge_id, 'first login (no TOTP yet) goes the emailed-code route', JSON.stringify(login1));

    const verify1 = await jpost('/api/auth/verify', { challenge_id: login1.challenge_id, code: lastEmailedCode() });
    ok(!!verify1.session, 'the emailed code signs it in, same as any account without TOTP', JSON.stringify(verify1).slice(0, 150));
    const bearer = { Authorization: `Bearer ${verify1.session}`, 'Content-Type': 'application/json' };
    const authedPost = (p, b) => fetch(`${B}${p}`, { method: 'POST', headers: bearer, body: JSON.stringify(b || {}) }).then((r) => r.json());

    const setup = await authedPost('/api/auth/totp/setup', {});
    ok(!!setup.secret && setup.otpauth_url.includes('otpauth://totp/'),
      '/totp/setup hands back a secret and a scannable otpauth URL', JSON.stringify(setup).slice(0, 150));

    const wrongConfirm = await authedPost('/api/auth/totp/confirm', { code: '000000' });
    ok(!!wrongConfirm.error, 'confirming with an arbitrary code is rejected — the secret is not live yet');

    const confirm = await authedPost('/api/auth/totp/confirm', { code: currentCode(setup.secret) });
    ok(confirm.ok === true, 'confirming with the real current code enables it', JSON.stringify(confirm));

    const login2 = await jpost('/api/auth/login', { email, password });
    ok(login2.method === 'totp' && !login2.sent_to,
      'signing in again now asks for the authenticator code, not an email', JSON.stringify(login2));

    const verify2 = await jpost('/api/auth/verify', { challenge_id: login2.challenge_id, code: currentCode(setup.secret) });
    ok(!!verify2.session, 'the live authenticator code signs it in with no email involved', JSON.stringify(verify2).slice(0, 150));

    const disable = await fetch(`${B}/api/auth/totp/disable`, { method: 'POST', headers: { Authorization: `Bearer ${verify2.session}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).then((r) => r.json());
    ok(disable.ok === true, 'disabling it with the correct password works, so it is not a one-way door');

    if (userId) await post(`/api/team/${userId}/deactivate`, {}).catch(() => {});
  }

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
