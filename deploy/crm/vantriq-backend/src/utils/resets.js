const crypto = require('crypto');
const db = require('../db');
const { hashPassword } = require('./password');

/**
 * Self-service password resets, shared by internal staff and customer portal
 * logins. The emailed token is the only secret; only its hash is stored, it
 * expires, and redeeming it burns it.
 *
 * Every reply to "I forgot my password" is deliberately identical whether or
 * not the address exists — otherwise the form becomes a way to enumerate
 * customers and employees.
 */
const RESET_MINUTES = 60;
const MIN_PASSWORD = 10;

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function baseUrl(subjectType) {
  return subjectType === 'portal'
    ? (process.env.PORTAL_BASE_URL || 'https://portal.vantriqai.com')
    : (process.env.APP_BASE_URL || 'https://crm.vantriqai.com');
}

/** Issues a token and returns { token, url, expires_at }. Caller emails it. */
async function issueReset(subjectType, subjectId) {
  // One live token at a time: asking again invalidates the previous email.
  await db.query(
    `update password_resets set used_at = now()
      where subject_type = $1 and subject_id = $2 and used_at is null`,
    [subjectType, subjectId]
  );
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + RESET_MINUTES * 60 * 1000);
  await db.query(
    `insert into password_resets (subject_type, subject_id, token_hash, expires_at) values ($1,$2,$3,$4)`,
    [subjectType, subjectId, hashToken(token), expires]
  );
  return {
    token,
    expires_at: expires.toISOString(),
    url: `${baseUrl(subjectType)}/reset.html?type=${subjectType}&token=${token}`,
  };
}

/**
 * Redeems a token and writes the new password. Returns { ok: false, error }
 * rather than throwing, so routes can answer with the right status code.
 */
async function redeemReset(subjectType, token, newPassword) {
  if (String(newPassword || '').length < MIN_PASSWORD) {
    return { ok: false, status: 400, error: `Choose a password of at least ${MIN_PASSWORD} characters.` };
  }
  const { rows } = await db.query(
    `select * from password_resets where token_hash = $1 and subject_type = $2`,
    [hashToken(token), subjectType]
  );
  const row = rows[0];
  const dead = { ok: false, status: 400, error: 'That reset link is no longer valid. Request a new one.' };
  if (!row || row.used_at) return dead;
  if (new Date(row.expires_at) < new Date()) return dead;

  const hash = hashPassword(newPassword);
  if (subjectType === 'staff') {
    const { rows: u } = await db.query(
      `update internal_users set password_hash = $2, must_change_password = false, password_set_by = 'self'
        where id = $1 and active = true returning id, email`,
      [row.subject_id, hash]
    );
    if (!u[0]) return dead;
    await db.query(`delete from staff_sessions where user_id = $1`, [row.subject_id]);
  } else {
    const { rows: c } = await db.query(
      `update clients set portal_password_hash = $2, portal_password_set_at = now(), portal_password_set_by = 'customer'
        where id = $1 and portal_username is not null returning id, company`,
      [row.subject_id, hash]
    );
    if (!c[0]) return dead;
    await db.query(`delete from portal_sessions where client_id = $1`, [row.subject_id]);
  }
  await db.query(`update password_resets set used_at = now() where id = $1`, [row.id]);
  return { ok: true };
}

module.exports = { issueReset, redeemReset, RESET_MINUTES, MIN_PASSWORD };
