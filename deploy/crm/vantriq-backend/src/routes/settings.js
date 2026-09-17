const express = require('express');
const db = require('../db');
const { ensureInternalClient } = require('../utils/internalClient');
const { sendMail, mailConfigured, mailDiagnosis } = require('../utils/mailer');
const router = express.Router();

// Company details, including the registration numbers and tax rate printed on
// every invoice. invoice_prefix and payment_terms_days shape the invoices
// issued from here on; invoices already raised keep the numbers they were
// issued with.
const FIELDS = [
  'company_name', 'city', 'founder', 'currency', 'utilization',
  'ntn', 'strn', 'address', 'default_tax_rate', 'invoice_prefix', 'payment_terms_days',
  // What happens automatically when a client uses up their allowance.
  'overage_policy', 'overage_grace_pct',
  // v7: withholding tax, the seller block on the printed invoice, and the
  // one anchor the derived Balance Sheet needs.
  'default_ait_rate', 'seller_ntn', 'seller_strn', 'seller_address', 'seller_email',
  'opening_cash', 'opening_cash_date', 'internal_cost_label',
  // Whether the monthly run emails each invoice as it raises it.
  'email_invoices', 'dunning_enabled',
];

const OVERAGE_POLICIES = ['serve', 'grace', 'block'];

router.get('/', async (req, res) => {
  const { rows } = await db.query(`select * from settings where id = 1`);
  res.json(rows[0]);
});

router.put('/', async (req, res) => {
  const body = req.body || {};
  const cols = FIELDS.filter((f) => body[f] !== undefined && body[f] !== null);
  if (!cols.length) return res.status(400).json({ error: 'No settings to update' });

  for (const f of ['default_tax_rate', 'default_ait_rate']) {
    if (!cols.includes(f)) continue;
    const rate = Number(body[f]);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return res.status(400).json({
        error: `${f === 'default_tax_rate' ? 'GST' : 'Advance income tax'} must be a percentage between 0 and 100.`,
      });
    }
  }
  if (cols.includes('opening_cash') && !Number.isFinite(Number(body.opening_cash))) {
    return res.status(400).json({ error: 'Opening cash must be a number.' });
  }
  if (cols.includes('invoice_prefix') && !/^[A-Za-z0-9-]{1,10}$/.test(String(body.invoice_prefix))) {
    return res.status(400).json({ error: 'Invoice prefix must be 1–10 letters, digits or hyphens.' });
  }
  if (cols.includes('overage_policy') && !OVERAGE_POLICIES.includes(String(body.overage_policy))) {
    return res.status(400).json({ error: `Over-quota policy must be one of: ${OVERAGE_POLICIES.join(', ')}.` });
  }
  if (cols.includes('overage_grace_pct')) {
    const pct = Number(body.overage_grace_pct);
    // Below 100 the grace band would cut service off before the allowance is
    // even used up, which is never what anyone means by "grace".
    if (!Number.isInteger(pct) || pct < 100 || pct > 1000) {
      return res.status(400).json({ error: 'The grace band must be a whole number between 100 and 1000 percent of quota.' });
    }
  }

  const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const { rows } = await db.query(
    `update settings set ${setClause} where id = 1 returning *`,
    cols.map((c) => body[c])
  );
  res.json(rows[0]);
});

/**
 * VantriqAI's own account — the site assistant and the WhatsApp agent metered
 * and priced like any customer, with the billing landing as cost rather than
 * revenue. See src/utils/internalClient.js.
 */
router.get('/internal-account', async (req, res) => {
  const { rows } = await db.query(
    `select c.*, p.name as package_name from clients c
       left join products p on p.id = c.product_id
      where c.is_internal = true order by c.created_at limit 1`
  );
  if (!rows[0]) return res.json({ configured: false, client: null, agents: [] });
  const { rows: agents } = await db.query(
    `select * from client_agents where client_id = $1 order by kind, name`, [rows[0].id]
  );
  res.json({ configured: true, client: rows[0], agents });
});

/** Idempotent: creates what is missing, leaves what exists alone. */
router.post('/internal-account', async (req, res) => {
  const result = await ensureInternalClient(req.body || {});
  res.status(result.created.length ? 201 : 200).json(result);
});

/* ---------------------------- Email ---------------------------- */
/**
 * GET /api/settings/email — is email working, and if not, why?
 *
 * Every send path in the CRM fails soft: a chase that cannot send is logged
 * as skipped and the invoice still stands. That is the right behaviour and it
 * is also why a broken mail token is silent for weeks. This says it out loud,
 * without sending anything.
 */
router.get('/email', async (req, res) => {
  res.json(mailDiagnosis());
});

/**
 * POST /api/settings/email/test { to } — send one real email, and report
 * exactly what the mail API said.
 *
 * The alternative way to test this is to raise a real invoice for a real
 * customer, which is a poor way to find out your token is wrong.
 */
router.post('/email/test', async (req, res) => {
  const to = String((req.body || {}).to || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return res.status(400).json({ error: 'Give an email address to send the test to.' });
  }

  const diagnosis = mailDiagnosis();
  if (!diagnosis.configured) {
    return res.status(409).json({
      ok: false,
      error: diagnosis.problems[0] || 'Email is not configured on the server.',
      diagnosis,
    });
  }

  const { rows } = await db.query(`select company_name from settings where id = 1`);
  const company = (rows[0] && rows[0].company_name) || 'Vantriq AI';
  const when = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    await sendMail({
      to,
      subject: `${company} — email is working`,
      text: [
        `This is a test from the ${company} CRM.`,
        ``,
        `If you are reading it, the mail token and mailbox id are right, and`,
        `invoices and payment reminders will reach your customers.`,
        ``,
        `Sent ${when} UTC from mailbox ${diagnosis.mailbox_id}.`,
      ].join('\n'),
      html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;">
        <p>This is a test from the ${company} CRM.</p>
        <p>If you are reading it, the mail token and mailbox id are right, and
        invoices and payment reminders will reach your customers.</p>
        <p style="color:#6B6B66;font-size:12px;">Sent ${when} UTC from mailbox ${diagnosis.mailbox_id}.</p>
      </div>`,
    });
    res.json({ ok: true, sent_to: to, message: `Sent. Check ${to} — allow a minute, and look in spam.`, diagnosis });
  } catch (err) {
    // The mail API's own words, not a paraphrase: "ERR_UNAUTHORIZED" is the
    // difference between a wrong token and a wrong mailbox id.
    const detail = err.message || String(err);
    res.status(502).json({
      ok: false,
      error: detail,
      hint: /401|UNAUTHORIZED/i.test(detail)
        ? 'The token was rejected. Generate a fresh one in hPanel → Emails → the mailbox → API tokens, and restart the container.'
        : /403|FORBIDDEN/i.test(detail)
          ? 'The token is valid but not for this mailbox. Check HOSTINGER_MAILBOX_ID matches the mailbox the token was made for.'
          : /404/.test(detail)
            ? 'That mailbox id does not exist. It should look like AC639077da…'
            : 'The mail API refused it — the message above is its own wording.',
      diagnosis,
    });
  }
});

module.exports = router;
