/**
 * Outbound mail through the Hostinger Email API. Node 20 has fetch built in,
 * so this needs no dependency — only two environment variables:
 *
 *   HOSTINGER_MAIL_TOKEN   API token from hPanel (Emails -> API tokens)
 *   HOSTINGER_MAILBOX_ID   the sending mailbox's resource id
 *
 * The sender is fixed: it is the mailbox HOSTINGER_MAILBOX_ID names, which is
 * the one the token is authorised for. The API accepts no `from`, so there is
 * no setting that changes who mail comes from — only MAIL_DISPLAY_NAME, the
 * name shown beside the address.
 *
 * If the token is missing the send throws, and the caller decides what the
 * user sees — we never silently swallow a failure to deliver a login code.
 */
const { formatDay: day } = require('./formatDate');

const API_BASE = process.env.HOSTINGER_MAIL_API || 'https://api.mail.hostinger.com';

function mailConfigured() {
  return !!(process.env.HOSTINGER_MAIL_TOKEN && process.env.HOSTINGER_MAILBOX_ID);
}

/**
 * @param {object}  msg
 * @param {Array}   [msg.attachments]  [{ filename, content: Buffer, contentType }]
 *                  Base64-encoded here rather than by the caller, so no call
 *                  site has to know the wire format.
 */
async function sendMail({ to, subject, text, html, attachments }) {
  if (!mailConfigured()) {
    throw new Error('Email is not configured on the server (HOSTINGER_MAIL_TOKEN / HOSTINGER_MAILBOX_ID).');
  }
  const url = `${API_BASE}/api/v1/mailboxes/${encodeURIComponent(process.env.HOSTINGER_MAILBOX_ID)}/send`;

  // The API takes NO `from` field: the sender IS the mailbox the token is
  // authorised for, named by HOSTINGER_MAILBOX_ID in the path. Sending a
  // `from` was at best ignored and at worst a validation failure, and it gave
  // the false impression that MAIL_FROM could change who the mail came from.
  // What you CAN set is the display name beside the address.
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HOSTINGER_MAIL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: [to],
      subject,
      text,
      html,
      displayName: process.env.MAIL_DISPLAY_NAME || 'Vantriq AI',
      ...(Array.isArray(attachments) && attachments.length ? {
        attachments: attachments.map((a) => ({
          filename: a.filename,
          contentType: a.contentType || 'application/octet-stream',
          encoding: 'base64',
          content: Buffer.isBuffer(a.content)
            ? a.content.toString('base64')
            : Buffer.from(String(a.content)).toString('base64'),
        })),
      } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Mail send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}

/**
 * Why email is not working, in words, without sending anything.
 *
 * Every send path fails soft by design — a failure is logged and the invoice
 * or the reply still happens. Which is right, and also means a
 * misconfiguration is quiet. This is the thing that makes it loud.
 */
function mailDiagnosis() {
  const token = process.env.HOSTINGER_MAIL_TOKEN || '';
  const mailbox = process.env.HOSTINGER_MAILBOX_ID || '';
  const problems = [];

  if (!token) {
    problems.push('HOSTINGER_MAIL_TOKEN is not set on the server.');
  } else if (/^(PASTE|CHANGE|REPLACE|xxx)/i.test(token)) {
    problems.push(`HOSTINGER_MAIL_TOKEN is still the placeholder ("${token.slice(0, 12)}…"). Paste the real token.`);
  } else if (token.length < 20) {
    problems.push('HOSTINGER_MAIL_TOKEN looks too short to be a real token.');
  }
  if (!mailbox) {
    problems.push('HOSTINGER_MAILBOX_ID is not set on the server.');
  } else if (!/^AC[0-9a-f]{10,}$/i.test(mailbox)) {
    problems.push(`HOSTINGER_MAILBOX_ID ("${mailbox}") does not look like a mailbox resource id — they start with "AC".`);
  }

  return {
    configured: mailConfigured() && problems.length === 0,
    token_set: !!token,
    // Never return the token. Enough to tell two tokens apart, not enough to use.
    token_fingerprint: token ? `${token.slice(0, 4)}…${token.slice(-4)} (${token.length} chars)` : null,
    mailbox_id: mailbox || null,
    api_base: API_BASE,
    display_name: process.env.MAIL_DISPLAY_NAME || 'Vantriq AI',
    problems,
  };
}

function otpEmail(code, name) {
  const subject = `${code} is your Vantriq Ops sign-in code`;
  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Your Vantriq Ops sign-in code is: ${code}`,
    ``,
    `It expires in 10 minutes and can only be used once.`,
    `If you did not try to sign in, someone may have your password — change it immediately.`,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;">
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Your Vantriq Ops sign-in code is:</p>
      <p style="font-size:30px;font-weight:700;letter-spacing:5px;font-family:ui-monospace,Menlo,monospace;margin:18px 0;">${escapeHtml(code)}</p>
      <p style="color:#555;font-size:13px;">It expires in 10 minutes and can only be used once.</p>
      <p style="color:#8F3527;font-size:13px;">If you did not try to sign in, someone may have your password — change it immediately.</p>
    </div>`;
  return { subject, text, html };
}

function resetEmail(url, name, minutes) {
  const subject = 'Reset your Vantriq password';
  const text = [
    `Hi ${name || 'there'},`,
    ``,
    `Use this link to choose a new password:`,
    url,
    ``,
    `The link works once and expires in ${minutes} minutes.`,
    `If you did not ask to reset your password, ignore this email — nothing has changed.`,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:460px;">
      <p>Hi ${escapeHtml(name || 'there')},</p>
      <p>Use this link to choose a new password:</p>
      <p style="margin:18px 0;">
        <a href="${escapeHtml(url)}" style="background:#8F3527;color:#fff;padding:11px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Choose a new password</a>
      </p>
      <p style="color:#555;font-size:13px;">The link works once and expires in ${escapeHtml(String(minutes))} minutes.</p>
      <p style="color:#555;font-size:13px;">If you did not ask to reset your password, ignore this email — nothing has changed.</p>
    </div>`;
  return { subject, text, html };
}

/**
 * The invoice, as the customer receives it.
 *
 * Built from the same printable document the CRM and the portal render, so
 * the figures in the email are the figures on the invoice — there is no second
 * calculation here that could drift from the first.
 *
 * The tax ladder is spelled out because a Pakistani service invoice has two
 * taxes moving in opposite directions, and "why is the transfer less than the
 * total" is otherwise the first question every customer asks.
 */
/**
 * The covering note that carries an invoice.
 *
 * The invoice itself is the PDF attached beside this — a document a customer
 * can file, print and hand to an accountant. This email exists to say what
 * arrived, what it comes to and when it is due; it is deliberately NOT the
 * invoice, because a bill pasted into an email body is not something anybody
 * can keep.
 *
 * The figures it does quote come from the same document the PDF renders, and
 * are formatted at the precision their currency needs. A token-priced USD
 * invoice reading "USD 0.00" is how this went wrong the first time.
 */
function invoiceEmail(doc, portalUrl, opts = {}) {
  const cur = doc.currency || 'PKR';
  // Two places for rupees; six for a dollar figure below one, because the
  // internal account is priced per million model tokens and a real month
  // costs a fraction of a cent.
  const money = (n) => {
    const v = Number(n || 0);
    const max = (cur === 'USD' && v !== 0 && Math.abs(v) < 1) ? 6 : 2;
    return `${cur} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max })}`;
  };
  const t = doc.totals || {};
  const who = doc.buyer.contact_name || doc.buyer.company || 'there';
  const withheld = Number(t.ait_amount || 0) > 0;
  const attached = opts.attachmentName || null;

  const eps = cur === 'USD' ? 0.0000009 : 0.009;
  const due = Number(doc.amount_due !== undefined && doc.amount_due !== null
    ? doc.amount_due
    : (t.net_payable !== undefined ? t.net_payable : t.total_payable || 0));
  const settled = due <= eps;

  const headline = settled
    ? `${money(t.net_payable !== undefined ? t.net_payable : t.total_payable || 0)} — paid, nothing outstanding`
    : `${money(due)} due${doc.due_date ? ` ${day(doc.due_date)}` : ''}`;

  const subject = settled
    ? `${doc.seller.name} — invoice ${doc.invoice_number}`
    : `${doc.seller.name} — invoice ${doc.invoice_number} for ${money(due)}`;

  const text = [
    `Hi ${who},`,
    ``,
    `Your invoice from ${doc.seller.name} is attached.`,
    ``,
    `Invoice   ${doc.invoice_number}`,
    `Issued    ${day(doc.issued_date)}`,
    doc.due_date ? `Due       ${day(doc.due_date)}` : '',
    `${settled ? 'Paid' : 'Amount due'}      ${money(settled ? (t.net_payable !== undefined ? t.net_payable : t.total_payable || 0) : due)}`,
    ``,
    attached ? `The full invoice, with every line and the tax breakdown, is in ${attached}.` : '',
    withheld ? `` : '',
    withheld ? doc.ait_note : '',
    ``,
    portalUrl ? `Your invoices, usage and account: ${portalUrl}` : '',
    ``,
    `Thank you,`,
    doc.seller.name,
  ].filter((l) => l !== '').join('\n');

  const meta = (k, v) =>
    `<tr><td style="padding:4px 0;color:#6b645b;font-size:13px;">${escapeHtml(k)}</td>` +
    `<td style="padding:4px 0;text-align:right;font-size:13px;font-weight:600;white-space:nowrap;">${escapeHtml(v)}</td></tr>`;

  const html = `
    <div style="font-family:'Manrope',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#16151a;">
      <p style="font-size:14.5px;">Hi ${escapeHtml(who)},</p>
      <p style="font-size:14.5px;">Your invoice from ${escapeHtml(doc.seller.name)} is attached.</p>

      <p style="font-size:21px;font-weight:700;margin:20px 0 4px;letter-spacing:-.02em;">${escapeHtml(headline)}</p>
      <p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#6b645b;margin:0 0 18px;">${escapeHtml(doc.invoice_number)}</p>

      <table style="width:100%;border-collapse:collapse;border-top:1px solid #e7e2da;border-bottom:1px solid #e7e2da;margin-bottom:18px;">
        ${meta('Issued', day(doc.issued_date))}
        ${doc.due_date ? meta('Due', day(doc.due_date)) : ''}
        ${meta(settled ? 'Paid' : 'Amount due', money(settled ? (t.net_payable !== undefined ? t.net_payable : t.total_payable || 0) : due))}
      </table>

      ${attached ? `<p style="font-size:13px;color:#6b645b;margin:0 0 18px;">
        Every line and the full tax breakdown are in the attached
        <strong style="color:#16151a;">${escapeHtml(attached)}</strong>.
      </p>` : ''}

      ${withheld ? `<p style="font-size:12px;color:#6b645b;border-left:2px solid #e7e2da;padding-left:12px;margin:0 0 18px;">${escapeHtml(doc.ait_note)}</p>` : ''}

      ${portalUrl ? `<p style="margin:20px 0;"><a href="${escapeHtml(portalUrl)}" style="background:#2f56d9;color:#fff;padding:11px 20px;border-radius:999px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block;">View your account</a></p>` : ''}

      <p style="color:#6b645b;font-size:13px;margin-top:20px;">Thank you,<br>${escapeHtml(doc.seller.name)}</p>
    </div>`;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

module.exports = { sendMail, otpEmail, resetEmail, invoiceEmail, mailConfigured, mailDiagnosis };
