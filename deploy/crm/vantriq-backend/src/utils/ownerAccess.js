// Read-only diagnostics. Never changes ownership, passwords, factors or roles.
async function checkOwnerAccess(db, { ownerEmail, pricingEmail, mailConfigured }) {
  const { rows } = await db.query(`select email, role, active, must_change_password,
    must_setup_totp, totp_enabled from internal_users where is_owner = true`);
  const owner = rows.length === 1 ? rows[0] : null;
  const checks = [
    { name: 'Exactly one protected owner', ok: rows.length === 1 },
    { name: 'Owner email matches server configuration', ok: !!owner && owner.email.toLowerCase() === ownerEmail },
    { name: 'Owner account is active', ok: !!owner && owner.active === true },
    { name: 'Owner has administrator role', ok: !!owner && owner.role === 'admin' },
    { name: 'Owner can reach Pricing and Financials', ok: !!owner && owner.email.toLowerCase() === pricingEmail },
    { name: 'Required password setup completed', ok: !!owner && !owner.must_change_password },
    { name: 'Required authenticator setup completed', ok: !!owner && owner.totp_enabled === true && !owner.must_setup_totp },
  ];
  return { checks, ready: checks.every(c => c.ok),
    recovery: {
      email_configured: !!mailConfigured,
      email_delivery_verified: false,
      lost_authenticator_recovery_verified: false,
      note: 'This check does not test email delivery, possession of your authenticator, server recovery access, or a backup restore. Password reset preserves the active authenticator.',
    } };
}
module.exports = { checkOwnerAccess };

if (require.main === module) {
  require('dotenv').config();
  const db = require('../db');
  const { PRICING_EMAIL } = require('../middleware/auth');
  const { mailConfigured } = require('./mailer');
  checkOwnerAccess(db, {
    ownerEmail: String(process.env.OWNER_EMAIL || 'ceo@vantriqai.com').trim().toLowerCase(),
    pricingEmail: PRICING_EMAIL(), mailConfigured: mailConfigured(),
  }).then(report => {
    console.log(JSON.stringify(report, null, 2));
    if (!report.ready) process.exitCode = 1;
  }).catch(() => {
    console.error('Owner access check could not read the database. Check the server connection privately.');
    process.exitCode = 1;
  }).finally(() => db.pool.end());
}
