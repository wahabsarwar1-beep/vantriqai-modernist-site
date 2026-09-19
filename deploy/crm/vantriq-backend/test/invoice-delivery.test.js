/**
 * The invoice goes out as a document, not as an email body.
 *
 * Two things went wrong in one message and both are covered here.
 *
 *   1. Every figure read USD 0.00. The email had its own money formatter
 *      fixed at two decimal places, so a token-priced invoice — the internal
 *      account is billed per million model tokens — printed as zero against a
 *      bill that was genuinely owed. The same bug had already been fixed in
 *      the invoice engine, the printed document and both frontends; the email
 *      was the one place left holding its own copy.
 *
 *   2. The invoice was the email body. A bill pasted into an email is not
 *      something a customer can file, print or hand to an accountant. The
 *      invoice is now a PDF attachment and the body is a covering note.
 *
 *   node test/invoice-delivery.test.js
 */
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

let pass = 0, fail = 0;
const ok = (c, m, extra = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + extra)); };

const { invoiceEmail, sendMail } = require(path.join(SRC, 'utils', 'mailer.js'));
const { renderInvoicePdf, invoiceFilename } = require(path.join(SRC, 'utils', 'invoicePdf.js'));

/** A quiet month on the internal account: 2,700 input and 360 output tokens. */
const USD_DOC = {
  document_title: 'Invoice',
  invoice_number: 'VAI-2026-000019',
  // A Date, not a string — this is how pg hands it back in-process, and the
  // reason the first PDF printed 'Fri Sep 18 2026 00:00:00 GMT+0000
  // (Coordinated Universal Time)' across the page.
  issued_date: new Date('2026-09-18T00:00:00Z'),
  due_date: new Date('2026-09-25T00:00:00Z'),
  status: 'pending',
  currency: 'USD',
  amount_due: 0.000621,
  seller: { name: 'Vantriq AI', address: 'Islamabad, Pakistan', ntn: '', strn: '', email: '' },
  buyer: { company: 'Vantriq AI', contact_name: 'Internal', email: 'ops@vantriqai.com', ntn: '', strn: '', address: 'Islamabad, Pakistan' },
  lines: [
    { description: 'Model input tokens (gpt-4o-mini)', detail: '2,700 used, 0 included', qty: 0.0027, unit_price: 0.15, amount: 0.000405 },
    { description: 'Model output tokens (gpt-4o-mini)', detail: '360 used, 0 included', qty: 0.00036, unit_price: 0.6, amount: 0.000216 },
  ],
  totals: { subtotal: 0.000621, tax_rate: 0, tax_amount: 0, total: 0.000621, ait_rate: 0, ait_amount: 0, net_payable: 0.000621 },
  settlement: { received: 0, balance: 0.000621 },
  ait_note: '',
  notes: 'Monthly billing run for Sep 2026',
};

const PKR_DOC = {
  document_title: 'Sales Tax Invoice',
  invoice_number: 'VAI-2026-000021',
  issued_date: '2026-09-18', due_date: '2026-09-25', status: 'pending',
  currency: 'PKR', amount_due: 22600,
  tax_jurisdiction: 'PRA',
  seller: { name: 'Vantriq AI', address: 'Islamabad, Pakistan', ntn: '1234567-8', strn: '32-77-8899-001-46', email: 'billing@vantriqai.com' },
  buyer: { company: 'Acme Ltd', contact_name: 'Wahab Sarwar', email: 'a@acme.test', ntn: '7654321-0', strn: '', address: '12 Mall Road, Lahore' },
  lines: [{ description: 'Monthly service retainer', detail: 'Sep 2026', qty: 1, unit_price: 20000, amount: 20000 }],
  totals: { subtotal: 20000, tax_rate: 16, tax_amount: 3200, total: 23200, ait_rate: 3, ait_amount: 600, net_payable: 22600 },
  settlement: { received: 0, balance: 22600 },
  ait_note: 'Advance income tax of 3% (PKR 600) is to be withheld under section 153.',
  notes: '',
};

(async () => {
  console.log('\n== the email quotes the real figure, not a rounded zero ==');

  let mail = invoiceEmail(USD_DOC, 'https://portal.vantriqai.com', { attachmentName: 'VAI-2026-000019.pdf' });
  ok(/USD 0\.000621/.test(mail.text), 'the plain-text body carries the six-place figure',
    mail.text.slice(0, 200));
  ok(/USD 0\.000621/.test(mail.html), 'and so does the HTML body');
  ok(!/USD 0\.00\b/.test(mail.html), 'nowhere does it read USD 0.00',
    (mail.html.match(/USD 0\.00\b/) || [''])[0]);
  ok(/USD 0\.000621/.test(mail.subject), 'the subject line too', mail.subject);

  console.log('\n== dates read as dates ==');
  // This went out to production once: the document carries Date objects when
  // it is built in-process, and the email printed
  // 'Fri Sep 18 2026 00:00:00 GMT+0000 (Coordinated Universal Time)'.
  ok(/Sep 18, 2026/.test(mail.text), 'the issue date is a date, not a Date.toString',
    (mail.text.match(/Issued.*/) || [''])[0]);
  ok(/Sep 25, 2026/.test(mail.text), 'and so is the due date',
    (mail.text.match(/Due.*/) || [''])[0]);
  ok(!/GMT|Coordinated Universal Time/.test(mail.text + mail.html + mail.subject),
    'nothing anywhere leaks a raw Date string');

  console.log('\n== the body points at the attachment; it is not the invoice ==');
  ok(/VAI-2026-000019\.pdf/.test(mail.text) && /VAI-2026-000019\.pdf/.test(mail.html),
    'the covering note names the attached file');
  ok(/attached/i.test(mail.text), 'and says the invoice is attached');
  // The old body reproduced every line; the covering note deliberately does not.
  ok(!/Model input tokens/.test(mail.html),
    'the line items are NOT reproduced in the email body');

  console.log('\n== rupees are unchanged, to two places ==');
  mail = invoiceEmail(PKR_DOC, 'https://portal.vantriqai.com', { attachmentName: 'x.pdf' });
  ok(/PKR 22,600\.00/.test(mail.text), 'the amount due reads in whole rupees and paisa', mail.text.slice(0, 200));
  ok(/section 153/.test(mail.text), 'the withholding note still travels with it');

  console.log('\n== a settled invoice does not ask to be paid ==');
  const paid = invoiceEmail(
    { ...USD_DOC, amount_due: 0, settlement: { received: 0.000621, balance: 0 } },
    null, { attachmentName: 'x.pdf' }
  );
  ok(/paid/i.test(paid.text) && !/due/i.test(paid.subject),
    'it reads as paid rather than due', paid.subject);

  console.log('\n== the attachment is a real PDF ==');
  const pdf = await renderInvoicePdf(USD_DOC);
  ok(Buffer.isBuffer(pdf), 'a Buffer comes back');
  ok(pdf.slice(0, 5).toString() === '%PDF-', 'with a PDF header', pdf.slice(0, 8).toString());
  ok(pdf.length > 1200, 'and real content in it', pdf.length + ' bytes');
  ok(invoiceFilename(USD_DOC) === 'VAI-2026-000019.pdf',
    'named after the invoice so it can be found later', invoiceFilename(USD_DOC));

  const pkrPdf = await renderInvoicePdf(PKR_DOC);
  ok(pkrPdf.slice(0, 5).toString() === '%PDF-', 'a rupee invoice renders too');

  // The filename lands verbatim in a mail header, so assert the properties
  // that matter rather than one exact string: no separators, no traversal,
  // bounded length, and it still ends in .pdf.
  const nasty = invoiceFilename({ invoice_number: '../../etc/passwd' });
  ok(!/[\\/]/.test(nasty), 'a filename carries no path separator', nasty);
  ok(!/\.\./.test(nasty), 'and no traversal', nasty);
  ok(/\.pdf$/.test(nasty), 'and is still a pdf', nasty);
  ok(invoiceFilename({ invoice_number: 'X'.repeat(500) }).length <= 84,
    'and cannot run unbounded', String(invoiceFilename({ invoice_number: 'X'.repeat(500) }).length));
  ok(invoiceFilename({}) === 'invoice.pdf', 'an invoice with no number still gets a name',
    invoiceFilename({}));

  console.log('\n== the attachment reaches the mail API base64-encoded ==');
  const sent = [];
  const realFetch = global.fetch;
  process.env.HOSTINGER_MAIL_TOKEN = 'test-token-long-enough-to-pass';
  process.env.HOSTINGER_MAILBOX_ID = 'AC0123456789abcdef';
  global.fetch = async (url, opts) => {
    sent.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, text: async () => '' };
  };
  try {
    await sendMail({
      to: 'someone@example.com', subject: 's', text: 't', html: '<p>h</p>',
      attachments: [{ filename: 'VAI-2026-000019.pdf', content: pdf, contentType: 'application/pdf' }],
    });
    const body = sent[0].body;
    ok(Array.isArray(body.attachments) && body.attachments.length === 1,
      'one attachment is on the request', JSON.stringify(Object.keys(body)));
    const a = body.attachments[0];
    ok(a.filename === 'VAI-2026-000019.pdf', 'with its filename', a.filename);
    ok(a.contentType === 'application/pdf', 'and its content type', a.contentType);
    ok(a.encoding === 'base64', 'declared base64', a.encoding);
    ok(Buffer.from(a.content, 'base64').equals(pdf),
      'and the bytes survive the round trip intact');

    // Every other caller sends no attachment; the key must not appear at all.
    sent.length = 0;
    await sendMail({ to: 'someone@example.com', subject: 's', text: 't' });
    ok(!('attachments' in sent[0].body),
      'a mail with no attachment does not send an empty attachments key',
      JSON.stringify(Object.keys(sent[0].body)));
  } finally {
    global.fetch = realFetch;
  }

  console.log(`\n==== ${pass} passed, ${fail} failed ====\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
