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

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

module.exports = { sendMail, otpEmail, mailConfigured };
