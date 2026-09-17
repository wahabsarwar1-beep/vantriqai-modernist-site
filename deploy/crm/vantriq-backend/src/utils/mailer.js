/**
 * Outbound mail through the Hostinger Email API. Node 20 has fetch built in,
 * so this needs no dependency — only two environment variables:
 *
 *   HOSTINGER_MAIL_TOKEN   API token from hPanel (Emails -> API tokens)
 *   HOSTINGER_MAILBOX_ID   the sending mailbox's resource id
 *
 * MAIL_FROM defaults to the support mailbox. If the token is missing the
 * send throws, and the caller decides what the user sees — we never silently
 * swallow a failure to deliver a login code.
 */
const API_BASE = process.env.HOSTINGER_MAIL_API || 'https://api.mail.hostinger.com';

function mailConfigured() {
  return !!(process.env.HOSTINGER_MAIL_TOKEN && process.env.HOSTINGER_MAILBOX_ID);
}

async function sendMail({ to, subject, text, html }) {
  if (!mailConfigured()) {
    throw new Error('Email is not configured on the server (HOSTINGER_MAIL_TOKEN / HOSTINGER_MAILBOX_ID).');
  }
  const from = process.env.MAIL_FROM || 'support@vantriqai.com';
  const url = `${API_BASE}/api/v1/mailboxes/${encodeURIComponent(process.env.HOSTINGER_MAILBOX_ID)}/send`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HOSTINGER_MAIL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Mail send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return true;
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
function invoiceEmail(doc, portalUrl) {
  const cur = doc.currency || 'PKR';
  const money = (n) => `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const t = doc.totals || {};
  const who = doc.buyer.contact_name || doc.buyer.company || 'there';
  const withheld = Number(t.ait_amount || 0) > 0;

  const subject = `${doc.seller.name} — invoice ${doc.invoice_number} for ${money(doc.amount_due)}`;

  const lines = (doc.lines || [])
    .map((l) => `  ${l.description}${l.detail ? ` (${l.detail})` : ''}  ${money(l.amount)}`)
    .join('\n');

  const text = [
    `Hi ${who},`,
    ``,
    `Here is your invoice from ${doc.seller.name}.`,
    ``,
    `Invoice     ${doc.invoice_number}`,
    `Issued      ${doc.issued_date}`,
    doc.due_date ? `Due         ${doc.due_date}` : '',
    ``,
    lines,
    ``,
    `Subtotal    ${money(t.subtotal)}`,
    Number(t.tax_amount || 0) > 0 ? `Sales tax   ${money(t.tax_amount)}${t.tax_rate ? ` (${t.tax_rate}%)` : ''}` : '',
    `Total       ${money(t.total)}`,
    withheld ? `Less AIT    -${money(t.ait_amount)}${t.ait_rate ? ` (${t.ait_rate}% withheld)` : ''}` : '',
    `Net payable ${money(t.net_payable)}`,
    ``,
    withheld ? doc.ait_note : '',
    withheld ? '' : '',
    portalUrl ? `You can see this invoice, your usage and your account here: ${portalUrl}` : '',
    ``,
    `Thank you,`,
    doc.seller.name,
  ].filter((l) => l !== '').join('\n');

  const row = (k, v, strong) =>
    `<tr><td style="padding:5px 0;color:#555;">${escapeHtml(k)}</td>` +
    `<td style="padding:5px 0;text-align:right;white-space:nowrap;${strong ? 'font-weight:700;' : ''}">${escapeHtml(v)}</td></tr>`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#1A1A18;">
      <p>Hi ${escapeHtml(who)},</p>
      <p>Here is your invoice from ${escapeHtml(doc.seller.name)}.</p>
      <p style="font-size:20px;font-weight:700;margin:18px 0 6px;">
        ${escapeHtml(money(doc.amount_due))}${doc.due_date ? ` <span style="font-size:13px;font-weight:400;color:#555;">due ${escapeHtml(doc.due_date)}</span>` : ''}
      </p>
      <p style="font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#555;margin:0 0 16px;">${escapeHtml(doc.invoice_number)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;border-top:1px solid #E3E0D8;">
        ${(doc.lines || []).map((l) => `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #F1EFE8;">${escapeHtml(l.description)}
            ${l.detail ? `<div style="color:#6B6B66;font-size:11.5px;">${escapeHtml(l.detail)}</div>` : ''}</td>
          <td style="padding:8px 0;border-bottom:1px solid #F1EFE8;text-align:right;white-space:nowrap;">${escapeHtml(money(l.amount))}</td>
        </tr>`).join('')}
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;">
        ${row('Subtotal', money(t.subtotal))}
        ${Number(t.tax_amount || 0) > 0 ? row(`Sales tax${t.tax_rate ? ` (${t.tax_rate}%)` : ''}`, money(t.tax_amount)) : ''}
        ${row('Total', money(t.total), true)}
        ${withheld ? row(`Less advance income tax${t.ait_rate ? ` (${t.ait_rate}%)` : ''}`, `-${money(t.ait_amount)}`) : ''}
        ${row('Net payable', money(t.net_payable), true)}
      </table>
      ${withheld ? `<p style="font-size:12px;color:#6B6B66;border-left:2px solid #E3E0D8;padding-left:10px;margin-top:18px;">${escapeHtml(doc.ait_note)}</p>` : ''}
      ${portalUrl ? `<p style="margin-top:20px;"><a href="${escapeHtml(portalUrl)}" style="background:#12897A;color:#fff;padding:10px 16px;border-radius:7px;text-decoration:none;font-weight:600;font-size:13px;">View your account</a></p>` : ''}
      <p style="color:#555;font-size:13px;margin-top:20px;">Thank you,<br>${escapeHtml(doc.seller.name)}</p>
    </div>`;

  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

module.exports = { sendMail, otpEmail, resetEmail, invoiceEmail, mailConfigured };
