const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../utils/password');
const { sendMail, otpEmail, mailConfigured } = require('../utils/mailer');

const router = express.Router();

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
router.post('/login', async (req, res) => {
  const email = String((req.body || {}).email || '').trim().toLowerCase();
  const password = String((req.body || {}).password || '');
  const fail = () => res.status(401).json({ error: 'Incorrect email or password.' });
  if (!email || !password) return fail();

  const { rows } = await db.query(`select * from internal_users where email = $1`, [email]);
  const user = rows[0];
  if (!user || !user.active) return fail();
  if (!verifyPassword(password, user.password_hash)) return fail();

  if (!mailConfigured()) {
    return res.status(503).json({
      error: 'Two-factor email is not configured on the server, so sign-in cannot complete. Contact your administrator.',
    });
  }

  const code = sixDigitCode();
  const expires = new Date(Date.now() + OTP_MINUTES * 60 * 1000);
  const { rows: ch } = await db.query(
    `insert into login_challenges (user_id, code_hash, expires_at) values ($1,$2,$3) returning id, expires_at`,
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
      `select c.*, u.email, u.name, u.role, u.active, u.must_change_password
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

  if (hashCode(code) !== ch.code_hash) {
    await db.query(`update login_challenges set attempts = attempts + 1 where id = $1`, [challengeId]);
    const left = OTP_MAX_ATTEMPTS - (ch.attempts + 1);
    return res.status(401).json({
      error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect codes. Sign in again to get a new one.',
    });
  }

  await db.query(`update login_challenges set consumed = true where id = $1`, [challengeId]);
  const token = 'ss_' + crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
  await db.query(`insert into staff_sessions (token, user_id, expires_at) values ($1,$2,$3)`, [token, ch.user_id, expires]);
  await db.query(`update internal_users set last_login_at = now() where id = $1`, [ch.user_id]);

  res.json({
    session: token,
    expires_at: expires.toISOString(),
    user: { id: ch.user_id, email: ch.email, name: ch.name, role: ch.role, must_change_password: ch.must_change_password },
  });
});

/* ---------------------------- Session helpers ---------------------------- */
router.post('/logout', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (token) await db.query(`delete from staff_sessions where token = $1`, [token]);
  res.status(204).end();
});

router.get('/me', async (req, res) => {
  const header = req.header('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const { rows } = await db.query(
    `select u.id, u.email, u.name, u.role, u.must_change_password, s.expires_at
       from staff_sessions s join internal_users u on u.id = s.user_id
      where s.token = $1 and s.expires_at > now() and u.active = true`,
    [token]
  );
  if (!rows[0]) return res.status(401).json({ error: 'Not signed in' });
  res.json(rows[0]);
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
      where s.token = $1 and s.expires_at > now()`,
    [token]
  );
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (!verifyPassword(current, user.password_hash)) return res.status(401).json({ error: 'Your current password is not correct.' });

  await db.query(
    `update internal_users set password_hash = $2, must_change_password = false where id = $1`,
    [user.id, hashPassword(next)]
  );
  await db.query(`delete from staff_sessions where user_id = $1 and token <> $2`, [user.id, token]);
  res.json({ ok: true });
});

module.exports = { router, COMPANY_DOMAIN };
