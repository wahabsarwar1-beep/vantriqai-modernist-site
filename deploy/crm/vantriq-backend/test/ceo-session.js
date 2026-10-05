/**
 * A signed-in CEO, for tests (v9.21).
 *
 * Pricing, Financials and every cost and margin open only for the protected
 * owner account at ceo@vantriqai.com, signed in as itself — no API key does.
 * This finds that account (or makes it, when a test database has no owner,
 * and removes it again afterwards) and gives it a session the way
 * /api/auth/verify would after password and authenticator code.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const db = require('../src/db');

async function ceoSession() {
  const email = String(process.env.PRICING_EMAIL || 'ceo@vantriqai.com').trim().toLowerCase();
  let created = false;
  let { rows } = await db.query(`select id, is_owner from internal_users where lower(email) = $1`, [email]);
  if (!rows[0]) {
    const { rows: owner } = await db.query(`select email from internal_users where is_owner`);
    if (owner[0]) throw new Error(`This database's owner account is ${owner[0].email}, not ${email}.`);
    ({ rows } = await db.query(
      `insert into internal_users (email, name, password_hash, role, is_owner, must_change_password, must_setup_totp)
       values ($1, 'CEO (test)', 'x', 'admin', true, false, false) returning id, is_owner`, [email]));
    created = true;
  }
  if (!rows[0].is_owner) throw new Error(`${email} exists but is not the owner account.`);
  const token = crypto.randomBytes(24).toString('hex');
  await db.query(`insert into staff_sessions (token, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
    [token, rows[0].id]);
  return {
    email,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    async end() {
      await db.query(`delete from staff_sessions where token = $1`, [token]);
      if (created) await db.query(`delete from internal_users where id = $1`, [rows[0].id]);
    },
  };
}

/** Another admin — everything an admin opens, except the CEO's. */
async function adminSession(role = 'admin') {
  const email = `pricing-test-${crypto.randomBytes(3).toString('hex')}@vantriqai.com`;
  const { rows } = await db.query(
    `insert into internal_users (email, name, password_hash, role, must_change_password)
     values ($1, 'Pricing Test', 'x', $2, false) returning id`, [email, role]);
  const token = crypto.randomBytes(24).toString('hex');
  await db.query(`insert into staff_sessions (token, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
    [token, rows[0].id]);
  return {
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    async end() { await db.query(`delete from internal_users where id = $1`, [rows[0].id]); },
  };
}

module.exports = { ceoSession, adminSession, db };
