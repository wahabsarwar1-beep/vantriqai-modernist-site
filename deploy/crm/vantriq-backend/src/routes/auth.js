const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { sendMail, otpEmail, resetEmail, breakglassEmail, mailConfigured } = require('../utils/mailer');
const { issueReset, redeemReset, RESET_MINUTES } = require('../utils/resets');
const { randomSecret, verifyTotp, otpauthUri } = require('../utils/totp');
const { alertOwner } = require('../utils/securityAlerts');
const {
  isPricingOwner, PRICING_EMAIL, hashKey, apiKeyLoginAllowed, BREAKGLASS_PREFIX, requireScope, requireCeo,
} = require('../middleware/auth');
const { clientIp } = require('../utils/clientIp');

const router = express.Router();
const { rateLimit } = require('../middleware/security');
const accountLimit = rateLimit('staff-login', { max: 10, seconds: 900, identity: req => String((req.body || {}).email || '').trim().toLowerCase() });
const recoveryLimit = rateLimit('staff-recovery', { max: 3, seconds: 900, identity: req => String((req.body || {}).email || '').trim().toLowerCase() });
const factorLimit = rateLimit('staff-factor', { max: 10, seconds: 900, identity: req => req.header('authorization') || '' });

const COMPANY_DOMAIN = (process.env.COMPANY_EMAIL_DOMAIN || 'vantriqai.com').toLowerCase();
const OTP_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const SESSION_HOURS = 12;

/**
 * Internal employee sign-in: company email + password, then a one-time code
 * emailed to that address. The password alone never yields a session.
 *
 * Both steps answer with the same wording on failure so the form cannot be
 * used to work out which addresses exist.
 */

function sixDigitCode() {
  // Uniform over 000000-999999; avoids the modulo bias of randomBytes % 1e6.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}
const hashCode = (c) => crypto.createHash('sha256').update(String(c)).digest('hex');

function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  const shown = user.slice(0, 2);
  return `${shown}${'•'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/* ---------------------------- Step 1: password ---------------------------- */
router.post('/login', accountLimit, async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const fail = () => res.status(401).json({ error: 'Incorrect email or password.' });
  if (!email || !password) return fail();

  const { rows } = await db.query(`select * from internal_users where email = $1`, [email]);
  const user = rows[0];
  if (!user || !user.active) return fail();
  if (!verifyPassword(password, user.password_hash)) return fail();

  // An authenticator-app second factor, where one is set up, replaces the
  // emailed code rather than adding to it: the point is a factor that does
  // not live in the same inbox a password reset would also reach. No email
  // is sent at all for this branch.
  if (user.totp_enabled) {
    const expires = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
    const { rows: ch } = await db.query(
      `insert into login_challenges (user_id, code_hash, method, expires_at) values ($1,null,'totp',$2) returning id, expires_at`,
      [user.id, expires]
    );
    return res.json({
      challenge_id: ch[0].id,
      expires_at: ch[0].expires_at,
      method: 'totp',
      message: 'Enter the 6-digit code from your authenticator app.',
    });
  }

  if (!mailConfigured()) {
    return res.status(503).json({
      error: 'Two-factor email is not configured on the server, so sign-in cannot complete. Contact your administrator.',
    });
  }

  const code = sixDigitCode();
  const expires = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  const { rows: ch } = await db.query(
    `insert into login_challenges (user_id, code_hash, method, expires_at) values ($1,$2,'email',$3) returning id, expires_at`,
    [user.id, hashCode(code), expires]
  );

  try {
    const { subject, text, html } = otpEmail(code, user.name);
    await sendMail({ to: user.email, subject, text, html });
  } catch (err) {
    console.error('OTP send failed', err);
    // Bin the challenge — a code nobody received must not stay redeemable.
    await db.query(`delete from login_challenges where id = $1`, [ch[0].id]);
    return res.status(502).json({ error: 'Could not send your sign-in code. Try again, or contact your administrator.' });
  }

  res.json({
    challenge_id: ch[0].id,
    expires_at: ch[0].expires_at,
    method: 'email',
    sent_to: maskEmail(user.email),
    message: `We emailed a 6-digit code to ${maskEmail(user.email)}. It expires in ${OTP_MINUTES} minutes.`,
  });
});

/* ---------------------------- Step 2: the code ---------------------------- */
router.post('/verify', async (req, res) => {
  const challengeId = String((req.body || {}).challenge_id || '');
  const code = String((req.body || {}).code || '').trim();
  if (!challengeId || !code) return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });

  let ch;
  try {
    const { rows } = await db.query(
      `select c.*, u.email, u.name, u.role, u.active, u.must_change_password, u.must_setup_totp, u.totp_secret, u.totp_enabled
         from login_challenges c join internal_users u on u.id = c.user_id
        where c.id = $1`,
      [challengeId]
    );
    ch = rows[0];
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That sign-in attempt is no longer valid. Start again.' });
    throw err;
  }
  if (!ch || ch.consumed) return res.status(400).json({ error: 'That code has already been used. Start again.' });
  if (!ch.active) return res.status(403).json({ error: 'This account has been deactivated.' });
  if (new Date(ch.expires_at) < new Date()) return res.status(400).json({ error: 'That code has expired. Sign in again to get a new one.' });
  if (ch.attempts >= OTP_MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many incorrect codes. Sign in again to get a new one.' });

  // The two methods verify against completely different things — a hash of
  // an emailed code, or a live computation off a shared secret — so the
  // challenge's own method decides which check runs, never the shape of the
  // code typed in.
  if (ch.method !== 'totp' && ch.totp_enabled) return res.status(401).json({ error: 'Your sign-in protection changed. Please sign in again.' });
  const correct = ch.method === 'totp'
    ? verifyTotp(ch.totp_secret, code)
    : hashCode(code) === ch.code_hash;

  if (!correct) {
    await db.query(`update login_challenges set attempts = attempts + 1 where id = $1 and not consumed and attempts < 5`, [challengeId]);
    const left = OTP_MAX_ATTEMPTS - (ch.attempts + 1);
    return res.status(401).json({
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect codes. Sign in again to get a new one.',
    });
  }

  const claimed = await db.query(`update login_challenges set consumed = true where id = $1 and not consumed and attempts < $2 and expires_at > now() returning id`, [challengeId, OTP_MAX_ATTEMPTS]);
  if (!claimed.rowCount) return res.status(400).json({ error: 'That sign-in attempt has ended. Sign in again.' });
  const token = 'ss_' + crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await db.query(`insert into staff_sessions (token, user_id, expires_at) values ($1,$2,$3)`, [token, ch.user_id, expires]);
  await db.query(`update internal_users set last_login_at = now() where id = $1`, [ch.user_id]);

  res.json({
    session: token,
    expires_at: expires.toISOString(),
    user: {
      id: ch.user_id, email: ch.email, name: ch.name, role: ch.role,
      must_change_password: ch.must_change_password, must_setup_totp: ch.must_setup_totp,
    },
  });
});

/* ---------------------------- Session helpers ---------------------------- */
router.post('/logout', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (token.startsWith(BREAKGLASS_PREFIX)) {
    await db.query(
      `update breakglass_sessions set ended_at = now(), ended_by = 'signed out' where token_hash = $1 and ended_at is null`,
      [hashKey(token)]
    );
  } else if (token) {
    await db.query(`delete from staff_sessions where token = $1`, [token]);
  }
  res.status(204).end();
});

router.get('/me', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  if (token.startsWith(BREAKGLASS_PREFIX)) return res.json(await emergencyMe(token, res));
  const { rows } = await db.query(
    `select u.id, u.email, u.name, u.role, u.must_change_password, u.is_owner,
            u.totp_enabled, u.must_setup_totp, s.expires_at
       from staff_sessions s join internal_users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now() and u.active = true`,
    [token]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Not signed in' });
  // Whether this account opens Pricing — the CEO's alone (middleware/auth.js).
  res.json({ ...rows[0], pricing: isPricingOwner(rows[0]) });
});

// Changing your own password. Requires the current one, and ends every other
// session you have open.
router.post('/change-password', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const current = String((req.body || {}).current_password || '');
  const next = String((req.body || {}).new_password || '');
  if (next.length < 10) return res.status(400).json({ error: 'Choose a password of at least 10 characters.' });

  const { rows } = await db.query(
    `select u.* from staff_sessions s join internal_users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now() and u.active = true`,
    [token]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (!verifyPassword(current, user.password_hash)) return res.status(401).json({ error: 'Your current password is not correct.' });

  await db.query(
    `update internal_users set password_hash = $2, must_change_password = false, pending_totp_secret = null, pending_totp_expires_at = null, pending_totp_session_hash = null where id = $1`,
    [user.id, hashPassword(next)]
  );
  await db.query(`delete from staff_sessions where user_id = $1 and token <> $2`, [user.id, token]);
  await db.query(`update login_challenges set consumed = true where user_id = $1`, [user.id]);
  if (user.is_owner) {
    alertOwner('Your password was just changed', [
      `Account: ${user.email}`, `Time: ${new Date().toISOString()}`,
      'If this was not you, someone had your current password — rotate it again immediately and enable an authenticator app if you have not already.',
    ]);
  }
  res.json({ ok: true });
});

/* ------------------------------ Authenticator app (TOTP) ------------------------------ */
/**
 * Adding, confirming and removing a second factor that does not depend on
 * email. Any signed-in user can set this up for their own account; the
 * owner account is simply the one where it starts required (must_setup_totp)
 * rather than optional — see seedOwner.js.
 */

async function currentUser(req) {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const { rows } = await db.query(
    `select u.* from staff_sessions s join internal_users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now() and u.active = true`,
    [token]
  );
  return rows[0] || null;
}

// Step 1: generate a secret and hand back the otpauth:// URI to scan or
// type in. Not yet enabled — a secret nobody has confirmed they can
// generate codes from must not be able to lock the account.
router.post('/totp/setup', factorLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const password = String((req.body || {}).password || '');
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Enter your current password to set up an authenticator.' });
  if (user.must_change_password) return res.status(403).json({ error: 'Change your initial password before setting up an authenticator.' });
  if (user.totp_enabled && !verifyTotp(user.totp_secret, String((req.body || {}).current_code || ''))) {
    return res.status(401).json({ error: 'Enter the code from your existing authenticator to replace it.' });
  }
  const secret = randomSecret();
  const token = (req.header('authorization') || '').slice(7).trim();
  // Keep the existing factor active until the pending one is confirmed.
  await db.query(`update internal_users set pending_totp_secret = $2,
    pending_totp_expires_at = now() + interval '15 minutes', pending_totp_session_hash = $3
    where id = $1`, [user.id, secret, hashKey(token)]);
  res.set('Cache-Control', 'no-store').json({ secret, otpauth_url: otpauthUri(secret, { account: user.email }),
    message: 'Add this secret to your authenticator and confirm its code within 15 minutes.' });
});

router.post('/totp/confirm', factorLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  const token = (req.header('authorization') || '').slice(7).trim();
  if (user.must_change_password || !user.pending_totp_secret ||
      !user.pending_totp_expires_at || new Date(user.pending_totp_expires_at) <= new Date() ||
      user.pending_totp_session_hash !== hashKey(token)) {
    return res.status(400).json({ error: 'Start authenticator setup again in this session.' });
  }
  if (!verifyTotp(user.pending_totp_secret, String((req.body || {}).code || ''))) {
    return res.status(401).json({ error: 'Incorrect authenticator code.' });
  }
  const saved = await db.query(`update internal_users set totp_secret = pending_totp_secret,
    totp_enabled = true, must_setup_totp = false, pending_totp_secret = null,
    pending_totp_expires_at = null, pending_totp_session_hash = null
    where id = $1 and pending_totp_secret = $2 and pending_totp_session_hash = $3
      and pending_totp_expires_at > now() returning id`, [user.id, user.pending_totp_secret, hashKey(token)]);
  if (!saved.rowCount) return res.status(409).json({ error: 'Authenticator setup changed. Please start again.' });
  await db.query(`delete from staff_sessions where user_id = $1 and token <> $2`, [user.id, token]);
  await db.query(`update login_challenges set consumed = true where user_id = $1`, [user.id]);
  if (user.is_owner) alertOwner('Your authenticator was enabled or replaced', [`Account: ${user.email}`, `Time: ${new Date().toISOString()}`, 'Other sessions were ended. If this was not you, secure your account immediately.']);
  res.json({ ok: true, message: 'Authenticator sign-in is enabled. Other sessions have been ended.' });
});

router.post('/totp/disable', factorLimit, async (req, res) => {
  const user = await currentUser(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (user.is_owner || user.must_setup_totp) return res.status(403).json({ error: 'Authenticator protection is required for this account. Replace the factor instead.' });
  const password = String((req.body || {}).password || '');
  const code = String((req.body || {}).current_code || '');
  if (!verifyPassword(password, user.password_hash) || !user.totp_enabled || !verifyTotp(user.totp_secret, code)) {
    return res.status(401).json({ error: 'Your current password and authenticator code are required.' });
  }
  const token = (req.header('authorization') || '').slice(7).trim();
  await db.query(`update internal_users set totp_enabled = false, totp_secret = null,
    pending_totp_secret = null, pending_totp_expires_at = null, pending_totp_session_hash = null where id = $1`, [user.id]);
  await db.query(`delete from staff_sessions where user_id = $1 and token <> $2`, [user.id, token]);
  await db.query(`update login_challenges set consumed = true where user_id = $1`, [user.id]);
  res.json({ ok: true, message: 'Authenticator sign-in is off. Email codes will be required.' });
});

/* ------------------------- Emergency access (v9.22) ------------------------- */
/**
 * The admin API key is break-glass: the way in when nobody who could fix
 * things can sign in as themselves. Until v9.22 it opened everything by itself,
 * for as long as a browser kept it. Now it is only half. Typed here it sends a
 * one-time code to the CEO — never to whoever typed the key — and only that
 * code, read out by the CEO if they agree, opens an emergency session of
 * BG_SESSION_HOURS. Every opening is emailed to the CEO, who sees them all and
 * ends any of them under Team → Emergency access. An emergency session is an
 * admin everywhere except the CEO's own areas (Pricing, Financials).
 *
 * If email is down, so is this: the way in then is the server itself (SSH),
 * where the key still works on its own (middleware/auth.js, isOnServer).
 */
const BG_CODE_MINUTES = 10;
const BG_MAX_ATTEMPTS = 5;
const BG_SESSION_HOURS = 2;
const BG_CODES_PER_HOUR = 5;

const browserOf = (req) => String(req.header('user-agent') || '').slice(0, 300);
const bgSwitchedOff = (res) => res.status(403).json({
  error: 'Emergency access is switched off on this server. Use your Vantriq Ops account.',
});

/** What /me answers for an emergency session — or why it has ended. */
async function emergencyMe(token, res) {
  const { rows } = await db.query(
    `select s.expires_at, k.name as key_name
       from breakglass_sessions s join api_keys k on k.id = s.key_id
      where s.token_hash = $1 and s.ended_at is null and s.expires_at > now()
        and not k.revoked and k.scope = 'admin'`,
    [hashKey(token)]
  );
  if (!rows[0] || !apiKeyLoginAllowed()) {
    res.status(401);
    return { error: 'Emergency access has ended. Sign in again.', signed_out: true };
  }
  return {
    id: null, email: '', name: 'Emergency access', role: 'admin', breakglass: true,
    key_name: rows[0].key_name, expires_at: rows[0].expires_at,
    must_change_password: false, is_owner: false, totp_enabled: false, must_setup_totp: false,
    pricing: false,
  };
}

// Step 1: the key. Answers with a challenge, and emails its code to the CEO.
router.post('/breakglass/start', async (req, res) => {
  if (!apiKeyLoginAllowed()) return bgSwitchedOff(res);
  const provided = String((req.body || {}).key || '').trim();
  if (!provided) return res.status(400).json({ error: 'Paste the admin API key.' });
  const { rows } = await db.query(
    `select id, name, scope, revoked from api_keys where key_hash = $1 limit 1`, [hashKey(provided)]);
  const key = rows[0];
  if (!key || key.revoked || key.scope !== 'admin') {
    return res.status(401).json({ error: 'That is not an admin key, or it has been revoked.' });
  }

  // A key in the wrong hands must not become a way to flood the CEO's inbox.
  const { rows: recent } = await db.query(
    `select count(*)::int as n from breakglass_challenges
      where key_id = $1 and created_at > now() - interval '1 hour'`, [key.id]);
  if (recent[0].n >= BG_CODES_PER_HOUR) {
    return res.status(429).json({ error: 'Too many codes have been asked for with this key in the last hour. Try again later.' });
  }
  if (!mailConfigured()) {
    return res.status(503).json({
      error: 'Email is not configured on the server, so no code can reach the CEO. Emergency access needs the server itself (SSH).',
    });
  }

  const to = PRICING_EMAIL();
  const code = sixDigitCode();
  const ip = clientIp(req);
  const browser = browserOf(req);
  const expires = new Date(Date.now() + BG_CODE_MINUTES * 60 * 1000);
  const { rows: ch } = await db.query(
    `insert into breakglass_challenges (key_id, code_hash, sent_to, expires_at, ip, user_agent)
     values ($1,$2,$3,$4,$5,$6) returning id, expires_at`,
    [key.id, hashCode(code), to, expires, ip, browser]
  );
  try {
    const { subject, text, html } = breakglassEmail(code, {
      keyName: key.name, ip, browser: browser.slice(0, 160), minutes: BG_CODE_MINUTES, hours: BG_SESSION_HOURS,
    });
    await sendMail({ to, subject, text, html });
  } catch (err) {
    console.error('Emergency code send failed', err);
    // A code nobody received must not stay redeemable.
    await db.query(`delete from breakglass_challenges where id = $1`, [ch[0].id]);
    return res.status(502).json({ error: 'Could not email the code to the CEO. Try again, or use the server itself (SSH).' });
  }

  res.json({
    challenge_id: ch[0].id,
    expires_at: ch[0].expires_at,
    method: 'ceo',
    sent_to: maskEmail(to),
    message: `A 6-digit code went to the CEO at ${maskEmail(to)}. Ask them for it: it expires in ${BG_CODE_MINUTES} minutes and opens the CRM for ${BG_SESSION_HOURS} hours.`,
  });
});

// Step 2: the CEO's code. Opens the emergency session.
router.post('/breakglass/verify', async (req, res) => {
  const challengeId = String((req.body || {}).challenge_id || '');
  const code = String((req.body || {}).code || '').trim();
  if (!challengeId || !code) return res.status(400).json({ error: 'Enter the 6-digit code the CEO gives you.' });
  if (!apiKeyLoginAllowed()) return bgSwitchedOff(res);

  let ch;
  try {
    const { rows } = await db.query(
      `select c.*, k.name as key_name, k.scope, k.revoked
         from breakglass_challenges c join api_keys k on k.id = c.key_id
        where c.id = $1`,
      [challengeId]
    );
    ch = rows[0];
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'That request for emergency access is no longer valid. Start again.' });
    throw err;
  }
  if (!ch || ch.consumed) return res.status(400).json({ error: 'That code has already been used. Start again.' });
  if (ch.revoked || ch.scope !== 'admin') return res.status(401).json({ error: 'That key has been revoked.' });
  if (new Date(ch.expires_at) < new Date()) return res.status(400).json({ error: 'That code has expired. Start again to send a new one.' });
  if (ch.attempts >= BG_MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many incorrect codes. Start again to send a new one.' });

  if (hashCode(code) !== ch.code_hash) {
    await db.query(`update breakglass_challenges set attempts = attempts + 1 where id = $1 and not consumed and attempts < 5`, [ch.id]);
    const left = BG_MAX_ATTEMPTS - (ch.attempts + 1);
    return res.status(401).json({
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect codes. Start again to send a new one.',
    });
  }
  // Spent exactly once, even if two tabs race to redeem it.
  const spent = await db.query(`update breakglass_challenges set consumed = true where id = $1 and not consumed and attempts < 5 and expires_at > now()`, [ch.id]);
  if (!spent.rowCount) return res.status(400).json({ error: 'That code has already been used. Start again.' });

  const token = BREAKGLASS_PREFIX + crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + BG_SESSION_HOURS * 3600 * 1000);
  const ip = clientIp(req);
  const browser = browserOf(req);
  await db.query(
    `insert into breakglass_sessions (token_hash, key_id, expires_at, ip, user_agent) values ($1,$2,$3,$4,$5)`,
    [hashKey(token), ch.key_id, expires, ip, browser]
  );
  db.query(`update api_keys set last_used_at = now() where id = $1`, [ch.key_id]).catch(() => {});
  alertOwner('Emergency access to the CRM was just opened', [
    `Key: ${ch.key_name}`,
    `From: ${ip}`,
    `Browser: ${browser.slice(0, 160) || 'unknown'}`,
    `Open until: ${expires.toISOString()}`,
    '',
    'It was opened with the code emailed to you. If you did not give that code to anyone, end it now (CRM → Team → Emergency access) and rotate the admin key.',
  ]);

  res.json({
    session: token,
    expires_at: expires.toISOString(),
    user: {
      id: null, email: '', name: 'Emergency access', role: 'admin', breakglass: true,
      key_name: ch.key_name, expires_at: expires.toISOString(), pricing: false,
    },
  });
});

const ceoOnly = [requireScope('admin'), requireCeo];

// The CEO's view of them: who opened one, from where, until when — and the
// means to end them. Not even an emergency session sees this list.
router.get('/breakglass/sessions', ...ceoOnly, async (req, res) => {
  const { rows } = await db.query(
    `select s.id, k.name as key_name, s.created_at, s.expires_at, s.last_seen_at, s.ip, s.user_agent,
            s.ended_at, s.ended_by, (s.ended_at is null and s.expires_at > now()) as live
       from breakglass_sessions s join api_keys k on k.id = s.key_id
      order by s.created_at desc limit 20`
  );
  const { rows: waiting } = await db.query(
    `select count(*)::int as n from breakglass_challenges where not consumed and expires_at > now()`);
  const { rows: keys } = await db.query(
    `select count(*)::int as n from api_keys where scope = 'admin' and not revoked`);
  res.json({
    enabled: apiKeyLoginAllowed(),
    sent_to: PRICING_EMAIL(),
    session_hours: BG_SESSION_HOURS,
    admin_keys: keys[0].n,
    codes_waiting: waiting[0].n,
    sessions: rows,
  });
});

// Ends one emergency session: whoever is using it is signed out on their
// next request.
router.post('/breakglass/sessions/:id/end', ...ceoOnly, async (req, res) => {
  let r;
  try {
    r = await db.query(
      `update breakglass_sessions set ended_at = now(), ended_by = $2 where id = $1 and ended_at is null`,
      [req.params.id, `ended by ${req.user.email}`]
    );
  } catch (err) {
    if (err.code === '22P02') return res.status(404).json({ error: 'No such emergency session.' });
    throw err;
  }
  res.json({ ok: true, ended: r.rowCount });
});

// Everyone in on emergency access, out — and no code still waiting can be used.
router.post('/breakglass/end-all', ...ceoOnly, async (req, res) => {
  const r = await db.query(
    `update breakglass_sessions set ended_at = now(), ended_by = $1 where ended_at is null and expires_at > now()`,
    [`ended by ${req.user.email}`]
  );
  await db.query(`update breakglass_challenges set consumed = true where not consumed and expires_at > now()`);
  res.json({ ok: true, ended: r.rowCount });
});

/* ---------------------------- Forgot password ---------------------------- */
/**
 * Emails a one-time link to choose a new password. The reply is the same
 * whether or not the address belongs to anyone — this form must not become a
 * way to find out who works here.
 */
router.post('/forgot-password', recoveryLimit, async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const same = () => res.json({
    ok: true,
    message: `If that address belongs to a Vantriq account, a reset link is on its way. It expires in ${RESET_MINUTES} minutes.`,
  });
  if (!email) return same();

  const { rows } = await db.query(`select id, email, name, active from internal_users where email = $1`, [email]);
  const user = rows[0];
  if (!user || !user.active || !mailConfigured()) return same();

  try {
    const { url } = await issueReset('staff', user.id);
    const { subject, text, html } = resetEmail(url, user.name, RESET_MINUTES);
    await sendMail({ to: user.email, subject, text, html });
  } catch (err) {
    // Logged, not surfaced: telling the caller the send failed would confirm
    // the address exists.
    console.error('Staff reset send failed', err);
  }
  same();
});

router.post('/reset-password', async (req, res) => {
  const token = String((req.body || {}).token || '');
  const password = String((req.body || {}).password || '');
  const result = await redeemReset('staff', token, password);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ ok: true, message: 'Your password has been changed. Sign in with it and complete your existing second factor. A password reset does not remove authenticator protection.' });
});

module.exports = { router, COMPANY_DOMAIN };
