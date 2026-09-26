require('dotenv').config();
const db = require('../db');
const { hashPassword, generatePassword } = require('./password');

/**
 * npm run seed-owner — makes sure the one protected owner account exists.
 *
 * Idempotent, safe to run on every deploy (see upgrade-v9.sh): if the row
 * already exists and is already flagged is_owner, this does nothing. If it
 * exists but isn't flagged yet, it flags it. If it doesn't exist, it's
 * created — admin role, must change its generated password and set up an
 * authenticator app before anything else works for it (see routes/auth.js).
 *
 * Never moves ownership off a different row automatically: the unique
 * index in db/schema.sql (idx_internal_users_one_owner) means a second
 * is_owner=true would fail at the database, and that failure should stop
 * the deploy and get a human's attention, not be silently resolved either
 * way by a script.
 */
const OWNER_EMAIL = (process.env.OWNER_EMAIL || 'ceo@vantriqai.com').toLowerCase();
const OWNER_NAME = process.env.OWNER_NAME || 'CEO';

async function run() {
  const { rows: existingOwner } = await db.query(`select id, email from internal_users where is_owner = true`);

  const { rows: byEmail } = await db.query(`select * from internal_users where email = $1`, [OWNER_EMAIL]);

  if (existingOwner[0] && existingOwner[0].email !== OWNER_EMAIL) {
    console.error(
      `The owner account is already ${existingOwner[0].email}, not ${OWNER_EMAIL}. `
      + 'Only one account can hold it (the database enforces this). '
      + 'If you meant to move it, do that deliberately by hand — this script will not.'
    );
    process.exit(1);
  }

  if (byEmail[0]) {
    if (byEmail[0].is_owner) {
      console.log(`Owner account already set up: ${OWNER_EMAIL}. Nothing to do.`);
      return;
    }
    await db.query(`update internal_users set is_owner = true, role = 'admin', active = true where id = $1`, [byEmail[0].id]);
    console.log(`Existing account ${OWNER_EMAIL} is now the protected owner account.`);
    console.log('It already has a password. If it does not yet have an authenticator app set up, sign in and call POST /api/auth/totp/setup.');
    return;
  }

  const password = generatePassword(20);
  const { rows } = await db.query(
    `insert into internal_users (email, name, password_hash, role, is_owner, must_change_password, must_setup_totp, password_set_by)
     values ($1,$2,$3,'admin',true,true,true,'system') returning id, email`,
    [OWNER_EMAIL, OWNER_NAME, hashPassword(password)]
  );
  console.log('\nOwner account created. Copy this password now — it will not be shown again:\n');
  console.log(`  Email:    ${rows[0].email}`);
  console.log(`  Password: ${password}\n`);
  console.log('First sign-in will require changing this password and setting up an authenticator app');
  console.log('(POST /api/auth/totp/setup then /api/auth/totp/confirm) before anything else works for it.');
  console.log('\nThis account cannot be deactivated, demoted or password-reset by any other admin —');
  console.log('only by itself. Store this password somewhere durable and offline (a password manager,');
  console.log('or a physical safe), not in chat or a text file on this server.');
}

run()
  .then(() => db.pool.end())
  .catch((err) => { console.error('Failed to seed the owner account:', err.message); process.exit(1); });
