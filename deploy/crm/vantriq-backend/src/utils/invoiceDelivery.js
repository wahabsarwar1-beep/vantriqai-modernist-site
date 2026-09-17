const db = require('../db');
const { buildTaxInvoice, getSettings } = require('./billing');
const { sendMail, invoiceEmail, mailConfigured } = require('./mailer');

/**
 * Sending an invoice to the customer.
 *
 * The CRM raised invoices silently: the monthly run created them and the
 * customer only ever saw one by signing into the portal. The first thing that
 * reached them was a dunning reminder days later saying an invoice was due —
 * a bill they had never been sent.
 *
 * This closes that. The email is built from the SAME printable document the
 * CRM and the portal render (buildTaxInvoice), so the figures a customer reads
 * in their inbox cannot drift from the figures on the invoice itself.
 *
 * Three rules it will not break:
 *
 *   - An internal invoice is never sent. VantriqAI billing itself is a
 *     transfer; emailing ourselves a bill is noise.
 *   - A send is recorded, so the monthly run cannot email the same invoice
 *     twice, and a human can see what went out and when.
 *   - A failure to send NEVER undoes the invoice. The invoice is the record;
 *     the email is a courtesy. It returns an outcome rather than throwing.
 */

const PORTAL_URL = () => process.env.PORTAL_URL || 'https://portal.vantriqai.com';

/** Has this invoice already been emailed? */
async function alreadySent(invoiceId) {
  const { rows } = await db.query(
    `select 1 from invoice_reminders
      where invoice_id = $1 and action = 'invoice_issued' and outcome = 'sent' limit 1`,
    [invoiceId]
  );
  return !!rows[0];
}

/**
 * Sends one invoice. Returns { outcome, detail } and never throws.
 *
 * outcome is 'sent', 'skipped' or 'failed' — the same vocabulary the dunning
 * log uses, so both appear in one history with one meaning.
 */
async function sendInvoice(invoiceId, { force = false, settings = null } = {}) {
  const record = async (outcome, detail) => {
    await db.query(
      `insert into invoice_reminders (invoice_id, action, outcome, detail)
       values ($1, 'invoice_issued', $2, $3)`,
      [invoiceId, outcome, String(detail || '').slice(0, 300)]
    ).catch(() => {});
    return { outcome, detail };
  };

  try {
    const { rows } = await db.query(
      `select i.*, c.company, c.name, c.email, c.phone, c.is_internal
         from invoices i join clients c on c.id = i.client_id
        where i.id = $1`,
      [invoiceId]
    );
    const inv = rows[0];
    if (!inv) return { outcome: 'skipped', detail: 'Invoice not found.' };

    // Never email ourselves a bill we raised to ourselves.
    if (inv.is_internal) return { outcome: 'skipped', detail: 'Internal account — not sent.' };
    if (inv.status === 'void') return { outcome: 'skipped', detail: 'Invoice is void.' };
    if (!inv.email) return await record('skipped', 'No email address on the client record.');
    if (!mailConfigured()) {
      return await record('skipped', 'Email is not configured on the server (HOSTINGER_MAIL_TOKEN / HOSTINGER_MAILBOX_ID).');
    }
    if (!force && await alreadySent(invoiceId)) {
      return { outcome: 'skipped', detail: 'Already emailed — pass force to send it again.' };
    }

    const [{ rows: lines }, { rows: pays }, s] = await Promise.all([
      db.query(`select * from invoice_lines where invoice_id = $1 order by position`, [invoiceId]),
      db.query(`select * from payments where invoice_id = $1`, [invoiceId]),
      settings ? Promise.resolve(settings) : getSettings(),
    ]);

    const doc = buildTaxInvoice(inv, inv, s, lines, pays);
    const { subject, text, html } = invoiceEmail(doc, PORTAL_URL());
    await sendMail({ to: inv.email, subject, text, html });
    return await record('sent', `Emailed ${inv.email}.`);
  } catch (err) {
    return await record('failed', err.message || String(err));
  }
}

/** What a send WOULD do, without sending anything. */
async function previewInvoiceSend(invoiceId) {
  const { rows } = await db.query(
    `select i.invoice_number, i.status, c.company, c.email, c.is_internal
       from invoices i join clients c on c.id = i.client_id where i.id = $1`,
    [invoiceId]
  );
  const inv = rows[0];
  if (!inv) return { outcome: 'skipped', detail: 'Invoice not found.' };
  if (inv.is_internal) return { outcome: 'skipped', detail: 'Internal account — not sent.', ...inv };
  if (!inv.email) return { outcome: 'skipped', detail: 'No email address on the client record.', ...inv };
  if (!mailConfigured()) return { outcome: 'skipped', detail: 'Email is not configured on the server.', ...inv };
  if (await alreadySent(invoiceId)) return { outcome: 'skipped', detail: 'Already emailed.', ...inv };
  return { outcome: 'would_send', detail: `Would email ${inv.email}.`, ...inv };
}

/** Everything that has been sent for one invoice, newest first. */
async function deliveryHistory(invoiceId) {
  const { rows } = await db.query(
    `select r.*, s.name as step_name from invoice_reminders r
       left join dunning_steps s on s.id = r.step_id
      where r.invoice_id = $1 order by r.sent_at desc`,
    [invoiceId]
  );
  return rows;
}

module.exports = { sendInvoice, previewInvoiceSend, deliveryHistory, alreadySent };
