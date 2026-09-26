const db = require('../db');
const { sendMail, mailConfigured } = require('./mailer');

/**
 * Alerts for the two events that should never happen silently: the
 * break-glass admin key being used, and anyone other than the owner
 * touching the owner's own account. Both are rare by design, so an email
 * every time is signal, not noise — unlike routine sign-in, which this
 * deliberately does not alert on.
 *
 * Sent to the owner account itself. There is at most one (the database
 * enforces it — see idx_internal_users_one_owner), so there is nothing to
 * configure: whoever holds is_owner is who gets told.
 */
async function ownerEmail() {
  const { rows } = await db.query(`select email from internal_users where is_owner = true limit 1`);
  return rows[0] ? rows[0].email : '';
}

/** Fire-and-forget by design: a security alert must never slow down or
 *  fail the request that triggered it. Errors are logged, not thrown. */
function alertOwner(subject, lines) {
  (async () => {
    if (!mailConfigured()) return;
    const to = await ownerEmail();
    if (!to) return;
    await sendMail({
      to,
      subject: `[VantriqAI CRM security] ${subject}`,
      text: Array.isArray(lines) ? lines.join('\n') : String(lines),
    });
  })().catch((err) => console.error('Security alert email failed', err));
}

module.exports = { alertOwner, ownerEmail };
