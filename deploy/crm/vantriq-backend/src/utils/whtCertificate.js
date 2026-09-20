const PDFDocument = require('pdfkit');
const { formatDay } = require('./formatDate');

/**
 * A statement of the tax withheld on our invoices, for the customer's records.
 *
 * WHAT THIS IS, AND IS NOT. Under s.153 of the Income Tax Ordinance the
 * CUSTOMER is the withholding agent: they deduct advance income tax from what
 * they pay us, deposit it against OUR NTN, and receive the CPR. The statutory
 * certificate is theirs to issue, not ours — so this document does not claim
 * to be one, and says so on its face.
 *
 * What it is, is the other side of the ledger: our record of what was withheld
 * on each invoice, so the customer can reconcile it against their own
 * withholding statement before they file, and so whoever does our books has a
 * figure to chase the CPR against. Both parties needing the same number and
 * neither being able to see the other's is exactly the gap this closes.
 *
 * Drawn with the same hand as the invoice — same mark, same rules, same
 * palette — because a document that looks like it came from somewhere else is
 * a document somebody queries.
 */

const INK = '#16151a';
const COBALT = '#2f56d9';
const MUTED = '#6b645b';
const RULE = '#e7e2da';

const PAGE = { size: 'A4', margin: 48 };
const LEFT = PAGE.margin;
const RIGHT = 595.28 - PAGE.margin;
const WIDTH = RIGHT - LEFT;

const money = (n, cur = 'PKR') =>
  `${cur} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function drawMark(doc, x, y, size) {
  const s = size / 100;
  doc.save().translate(x, y).scale(s);
  doc.path('M10 10 H90 V90 H10 Z M28 28 V72 H72 V28 Z').fillColor(INK).fill('even-odd');
  doc.rect(10, 28, 28, 10).fillColor(COBALT).fill();
  doc.rect(28, 10, 10, 28).fillColor(COBALT).fill();
  doc.restore();
}

function rule(doc, y, color = RULE, weight = 0.7) {
  doc.save().moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(weight).strokeColor(color).stroke().restore();
}

/**
 * @param {object} d
 *   seller   {name, ntn, strn, address, email}
 *   buyer    {company, ntn, strn, address}
 *   period   {from, to, label}
 *   rows     [{invoice_number, issued_date, amount, tax_amount, total_amount,
 *              ait_rate, ait_amount, net_payable, currency}]
 * @returns {Promise<Buffer>}
 */
function renderWhtStatement(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...PAGE,
      info: {
        Title: `Tax withheld statement ${d.period.label || ''}`.trim(),
        Author: d.seller.name || 'Vantriq AI',
        Subject: `Advance income tax withheld on invoices to ${d.buyer.company || ''}`.trim(),
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const cur = (d.rows[0] && d.rows[0].currency) || 'PKR';

    // ---- header
    drawMark(doc, LEFT, PAGE.margin, 26);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK)
      .text(d.seller.name || 'Vantriq AI', LEFT + 34, PAGE.margin + 4);
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text([d.seller.address, d.seller.ntn ? `NTN ${d.seller.ntn}` : '', d.seller.strn ? `STRN ${d.seller.strn}` : '']
        .filter(Boolean).join('  ·  '), LEFT + 34, PAGE.margin + 21, { width: WIDTH - 34 });

    doc.font('Helvetica-Bold').fontSize(18).fillColor(INK)
      .text('Statement of tax withheld', LEFT, PAGE.margin + 54);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text('Advance income tax deducted under section 153, Income Tax Ordinance 2001',
        LEFT, PAGE.margin + 76);

    let y = PAGE.margin + 100;
    rule(doc, y); y += 14;

    // ---- the two parties, side by side
    const colW = (WIDTH - 20) / 2;
    const party = (title, name, lines, x) => {
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
        .text(title.toUpperCase(), x, y, { width: colW, characterSpacing: 0.6 });
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
        .text(name || '—', x, y + 12, { width: colW });
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(lines.filter(Boolean).join('\n'), x, y + 27, { width: colW });
    };
    party('Withholding agent (deducted the tax)', d.buyer.company,
      [d.buyer.address, d.buyer.ntn ? `NTN ${d.buyer.ntn}` : '', d.buyer.strn ? `STRN ${d.buyer.strn}` : ''], LEFT);
    party('Payee (tax deposited against this NTN)', d.seller.name,
      [d.seller.address, d.seller.ntn ? `NTN ${d.seller.ntn}` : ''], LEFT + colW + 20);

    y += 78;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(`Period: ${d.period.label}`, LEFT, y);
    y += 20;
    rule(doc, y, INK, 1); y += 10;

    // ---- the table
    const COLS = [
      { h: 'Invoice', x: LEFT, w: 92, align: 'left' },
      { h: 'Issued', x: LEFT + 96, w: 66, align: 'left' },
      { h: 'Value ex-GST', x: LEFT + 166, w: 78, align: 'right' },
      { h: 'GST', x: LEFT + 248, w: 62, align: 'right' },
      { h: 'Gross', x: LEFT + 314, w: 70, align: 'right' },
      { h: 'Rate', x: LEFT + 388, w: 34, align: 'right' },
      { h: 'Tax withheld', x: LEFT + 426, w: 73, align: 'right' },
    ];
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    for (const c of COLS) doc.text(c.h.toUpperCase(), c.x, y, { width: c.w, align: c.align, characterSpacing: 0.5 });
    y += 14;
    rule(doc, y); y += 8;

    const total = { amount: 0, tax: 0, gross: 0, ait: 0 };
    for (const r of d.rows) {
      // A new page keeps its own header row rather than dropping the reader
      // into unlabelled columns.
      if (y > 720) {
        doc.addPage();
        y = PAGE.margin;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
        for (const c of COLS) doc.text(c.h.toUpperCase(), c.x, y, { width: c.w, align: c.align, characterSpacing: 0.5 });
        y += 14; rule(doc, y); y += 8;
      }
      const gross = Number(r.total_amount != null ? r.total_amount : (Number(r.amount || 0) + Number(r.tax_amount || 0)));
      total.amount += Number(r.amount || 0);
      total.tax += Number(r.tax_amount || 0);
      total.gross += gross;
      total.ait += Number(r.ait_amount || 0);

      doc.font('Helvetica').fontSize(8.5).fillColor(INK);
      const cells = [
        r.invoice_number || '—',
        formatDay(r.issued_date),
        money(r.amount, r.currency || cur),
        money(r.tax_amount, r.currency || cur),
        money(gross, r.currency || cur),
        `${Number(r.ait_rate || 0)}%`,
        money(r.ait_amount, r.currency || cur),
      ];
      COLS.forEach((c, i) => doc.text(cells[i], c.x, y, { width: c.w, align: c.align }));
      y += 16;
    }

    rule(doc, y); y += 9;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK);
    doc.text('Total', COLS[0].x, y, { width: COLS[0].w });
    doc.text(money(total.amount, cur), COLS[2].x, y, { width: COLS[2].w, align: 'right' });
    doc.text(money(total.tax, cur), COLS[3].x, y, { width: COLS[3].w, align: 'right' });
    doc.text(money(total.gross, cur), COLS[4].x, y, { width: COLS[4].w, align: 'right' });
    doc.text(money(total.ait, cur), COLS[6].x, y, { width: COLS[6].w, align: 'right' });
    y += 22;

    // ---- the headline figure, said once, plainly
    doc.save().rect(LEFT, y, WIDTH, 44).fillColor('#f4f2ec').fill().restore();
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text('TOTAL ADVANCE INCOME TAX WITHHELD', LEFT + 14, y + 11, { characterSpacing: 0.5 });
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK)
      .text(money(total.ait, cur), LEFT + 14, y + 23, { width: WIDTH - 28, align: 'right' });
    y += 60;

    // ---- what this document is, stated so nobody mistakes it for the CPR
    rule(doc, y); y += 12;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('What this document is', LEFT, y);
    y += 13;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `This is ${d.seller.name || 'our'} record of the advance income tax deducted from payments made to us `
      + `by ${d.buyer.company || 'you'} in the period above. It is provided so both sides are working from the `
      + `same figures.\n\n`
      + `It is not the statutory certificate and does not replace one. Under section 153 the withholding agent — `
      + `${d.buyer.company || 'the payer'} — deducts the tax, deposits it against the payee's NTN`
      + `${d.seller.ntn ? ` (${d.seller.ntn})` : ''}, and issues the certificate together with the CPR. `
      + `Please continue to issue that certificate; this statement is for reconciliation.`,
      LEFT, y, { width: WIDTH, lineGap: 2 }
    );

    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
      .text(`Generated ${formatDay(new Date())}${d.seller.email ? ` · ${d.seller.email}` : ''}`,
        LEFT, 780, { width: WIDTH, align: 'center' });

    doc.end();
  });
}

/** A filename safe to drop straight into a Content-Disposition header. */
function whtFilename(d) {
  const who = String(d.buyer.company || 'customer').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const when = String(d.period.label || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `tax-withheld-${who || 'customer'}${when ? '-' + when : ''}.pdf`.toLowerCase();
}

module.exports = { renderWhtStatement, whtFilename };
