require('dotenv').config();
const db = require('../db');
const { hashPassword, generatePassword } = require('../utils/password');

/**
 * Bootstraps the first internal login, before anyone can sign in to create
 * others:  npm run create-user -- "you@vantriqai.com" "Your Name" admin
 */
async function run() {
  const [email, name, role = 'staff'] = process.argv.slice(2);
  const domain = (process.env.COMPANY_EMAIL_DOMAIN || 'vantriqai.com').toLowerCase();

  if (!email || !name) {
    console.error('Usage: npm run create-user -- "someone@' + domain + '" "Their Name" [admin|staff]');
    process.exit(1);
  }
  if (!email.toLowerCase().endsWith('@' + domain)) {
    console.error(`Internal logins must use an @${domain} address.`);
    process.exit(1);
  }
  if (!['admin', 'staff'].includes(role)) {
    console.error('Role must be admin or staff.');
    process.exit(1);
  }

  const password = generatePassword(16);
  try {
    const { rows } = await db.query(
      `insert into internal_users (email, name, password_hash, role) values ($1,$2,$3,$4) returning id, email, role`,
      [email.toLowerCase(), name, hashPassword(password), role]
    );
    console.log('\nInternal login created. Copy this password now — it will not be shown again:\n');
    console.log(`  Email:    ${rows[0].email}`);
    console.log(`  Password: ${password}`);
    console.log(`  Role:     ${rows[0].role}\n`);
    console.log('Signing in also needs the 6-digit code emailed to that address,');
    console.log('so make sure HOSTINGER_MAIL_TOKEN and HOSTINGER_MAILBOX_ID are set.\n');
  } catch (err) {
    if (err.code === '23505') console.error('That email already has a login.');
    else console.error('Could not create the login:', err.message);
    process.exit(1);
  }
  await db.pool.end();
}

run().catch((e) => { console.error(e); process.exit(1); });
