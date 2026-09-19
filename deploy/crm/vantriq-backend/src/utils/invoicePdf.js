const PDFDocument = require('pdfkit');

/**
 * The invoice as a PDF, for attaching to the email that sends it.
 *
 * A customer should receive a document they can file, print and hand to an
 * accountant — not a bill pasted into the body of an email. So the email
 * carries a short covering note and this, attached, is the invoice.
 *
 * It renders the SAME object the on-screen and printed invoices render:
 * buildTaxInvoice()'s document. That matters more than it looks. The figures,
 * the tax breakdown and both parties' registration details are computed once,
 * in one place, and three renderers draw them — so what a customer reads in
 * the PDF cannot disagree with what the CRM shows or what the portal prints.
 * Only the drawing is duplicated here; never the arithmetic.
 *
 * Deliberately pdfkit rather than a headless browser. Rendering the existing
 * HTML would guarantee pixel parity, but it would also put Chromium in the
 * container — a few hundred megabytes and a browser process per invoice, to
 * lay out a page of text and a table.
 */

const INK = '#16151a';
const COBALT = '#2f56d9';
const MUTED = '#6b645b';
const RULE = '#e7e2da';

const PAGE = { size: 'A4', margin: 48 };
const LEFT = PAGE.margin;
const RIGHT = 595.28 - PAGE.margin;
const WIDTH = RIGHT - LEFT;

/**
 * 'Sep 16, 2026' — unambiguous wherever the invoice is opened, which a
 * numeric date is not.
 *
 * Takes a Date as readily as a string. The HTML renderer only ever sees ISO
 * strings, because its document arrives over HTTP as JSON; this one is called
 * in-process, where pg hands back Date objects. Slicing ten characters off a
 * Date's toString gives 'Fri Sep 18', which parses to Invalid Date and printed
 * the whole 'GMT+0000 (Coordinated Universal Time)' across the invoice.
 */
function day(value) {
  if (!value) return '';
  const d = (value instanceof Date)
    ? value
    : new Date(String(value).slice(0, 10) + 'T00:00:00Z');
  if (isNaN(d)) return String(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Money, at the precision its currency actually needs.
 *
 * Two places is right for a rupee invoice and wrong for the internal one:
 * it is priced per million model tokens, so a real month costs a fraction of
 * a cent and printing it to the cent prints USD 0.00 against a bill that is
 * genuinely owed. That exact email went out once already.
 */
function makeMoney(currency) {
  const cur = currency || 'PKR';
  return (n) => {
    const v = Number(n || 0);
    const max = (cur === 'USD' && v !== 0 && Math.abs(v) < 1) ? 6 : 2;
    return `${cur} ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: max })}`;
  };
}

/** Quantities have the same problem from the other end: 2,700 tokens priced
 *  per million is a quantity of 0.0027, and "0 x 0.15" is not a line anybody
 *  can check. */
const qty = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 6 });

/** The VantriqAI mark, drawn rather than embedded so it stays crisp at any
 *  zoom and adds no image bytes. The path is the one in public/brand/. */
function drawMark(doc, x, y, size) {
  const s = size / 100;
  doc.save().translate(x, y).scale(s);
  doc.path('M10 10 H90 V90 H10 Z M28 28 V72 H72 V28 Z').fillColor(INK).fill('even-odd');
  doc.rect(10, 28, 28, 10).fillColor(COBALT).fill();
  doc.rect(28, 10, 10, 28).fillColor(COBALT).fill();
  doc.restore();
}

/** A hairline the full width of the text block. */
function rule(doc, y, color = RULE, weight = 0.7) {
  doc.save().moveTo(LEFT, y).lineTo(RIGHT, y)
    .lineWidth(weight).strokeColor(color).stroke().restore();
}

/**
 * Renders the document and resolves with a Buffer.
 *
 * @param {object} d  buildTaxInvoice()'s output
 * @returns {Promise<Buffer>}
 */
function renderInvoicePdf(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...PAGE,
      info: {
        Title: `${d.document_title || 'Invoice'} ${d.invoice_number || ''}`.trim(),
        Author: d.seller.name || 'Vantriq AI',
        Subject: `Invoice ${d.invoice_number || ''} for ${d.buyer.company || ''}`.trim(),
      },
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = makeMoney(d.currency);
    const t = d.totals || {};
    // Half a minor unit of whatever this invoice is in.
    const eps = d.currency === 'USD' ? 0.0000009 : 0.009;
    const outstanding = (d.amount_due !== undefined && d.amount_due !== null)
      ? Number(d.amount_due)
      : Number(t.net_payable !== undefined ? t.net_payable : (t.total_payable || 0));
    const settled = outstanding <= eps;

    // ---------------------------------------------------------------- header
    drawMark(doc, LEFT, PAGE.margin, 26);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(INK)
      .text(d.seller.name || '', LEFT + 36, PAGE.margin + 6);
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(d.seller.address || '', LEFT, PAGE.margin + 34, { width: WIDTH });

    doc.moveDown(1.6);
    doc.font('Helvetica-Bold').fontSize(20).fillColor(INK)
      .text(d.document_title || 'Invoice', LEFT, doc.y);

    // ------------------------------------------------------------------ meta
    doc.moveDown(0.7);
    const metaTop = doc.y;
    const meta = [
      ['Invoice number', d.invoice_number || '—'],
      ['Date of issue', day(d.issued_date)],
    ];
    if (d.due_date) meta.push(['Date due', day(d.due_date)]);
    if (d.tax_jurisdiction) meta.push(['Tax jurisdiction', d.tax_jurisdiction]);

    let my = metaTop;
    for (const [k, v] of meta) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(k, LEFT, my, { width: 110 });
      const kb = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK).text(v, LEFT + 115, my, { width: 260 });
      // Whichever column ran taller decides where the next row starts; a fixed
      // step overlaps the moment a value wraps.
      my = Math.max(kb, doc.y) + 3;
    }

    // -------------------------------------------------------------- headline
    doc.y = my + 12;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(
      settled
        ? `${money(t.net_payable !== undefined ? t.net_payable : (t.total_payable || 0))} paid`
        : `${money(outstanding)} due ${day(d.due_date) || 'on receipt'}`,
      LEFT, doc.y
    );

    // --------------------------------------------------------------- parties
    doc.y += 16;
    const partyTop = doc.y;
    const colW = (WIDTH - 32) / 2;

    const party = (title, lines, x) => {
      let y = partyTop;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(title, x, y, { width: colW });
      y = doc.y + 3;
      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
      for (const line of lines.filter(Boolean)) {
        doc.text(line, x, y, { width: colW });
        y = doc.y + 1;
      }
      return y;
    };

    const sellerBottom = party(d.seller.name || 'From', [
      d.seller.address,
      d.seller.ntn ? `NTN ${d.seller.ntn}` : '',
      d.seller.strn ? `STRN ${d.seller.strn}` : '',
      d.seller.email,
    ], LEFT);

    const buyerBottom = party('Bill to', [
      d.buyer.company,
      d.buyer.contact_name,
      d.buyer.address,
      d.buyer.ntn ? `NTN ${d.buyer.ntn}` : '',
      d.buyer.strn ? `STRN ${d.buyer.strn}` : '',
      d.buyer.email,
    ], LEFT + colW + 32);

    // ----------------------------------------------------------------- lines
    doc.y = Math.max(sellerBottom, buyerBottom) + 22;

    // Right-aligned money columns, laid out from the right edge inward.
    const cAmount = { x: RIGHT - 95, w: 95 };
    const cUnit = { x: cAmount.x - 90, w: 90 };
    const cQty = { x: cUnit.x - 65, w: 65 };
    const cDesc = { x: LEFT, w: cQty.x - LEFT - 10 };

    const headY = doc.y;
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
    doc.text('Description', cDesc.x, headY, { width: cDesc.w });
    doc.text('Qty', cQty.x, headY, { width: cQty.w, align: 'right' });
    doc.text('Unit price', cUnit.x, headY, { width: cUnit.w, align: 'right' });
    doc.text('Amount', cAmount.x, headY, { width: cAmount.w, align: 'right' });
    doc.y = headY + 13;
    rule(doc, doc.y, INK, 0.9);
    doc.y += 8;

    for (const l of (d.lines || [])) {
      // Start a fresh page rather than running a line off the bottom.
      if (doc.y > 690) {
        doc.addPage();
        doc.y = PAGE.margin;
      }
      const rowY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
        .text(String(l.description || ''), cDesc.x, rowY, { width: cDesc.w });
      const afterDesc = doc.y;
      if (l.detail) {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
          .text(String(l.detail), cDesc.x, afterDesc + 1, { width: cDesc.w });
      }
      const rowBottom = doc.y;

      doc.font('Helvetica').fontSize(9.5).fillColor(INK);
      doc.text(qty(l.qty !== undefined ? l.qty : 1), cQty.x, rowY, { width: cQty.w, align: 'right' });
      doc.text(money(l.unit_price !== undefined ? l.unit_price : l.amount), cUnit.x, rowY, { width: cUnit.w, align: 'right' });
      doc.text(money(l.amount), cAmount.x, rowY, { width: cAmount.w, align: 'right' });

      doc.y = Math.max(rowBottom, rowY + 12) + 8;
      rule(doc, doc.y);
      doc.y += 8;
    }

    // ---------------------------------------------------------------- totals
    // The value column is fixed at the right edge; the label takes what is
    // left of it. A withholding label runs long ("Less advance income tax @
    // 4% (withheld)"), so it needs room and it needs to be allowed to wrap.
    const valueW = 110;
    const valueX = RIGHT - valueW;
    const totalsX = LEFT + WIDTH * 0.42;
    const labelW = valueX - totalsX - 12;

    const totalRow = (label, value, opts = {}) => {
      if (doc.y > 700) { doc.addPage(); doc.y = PAGE.margin; }
      const y = doc.y;
      const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
      const size = opts.big ? 11.5 : 9.5;
      const colour = opts.muted ? MUTED : INK;

      doc.font(font).fontSize(size).fillColor(colour).text(label, totalsX, y, { width: labelW });
      const labelBottom = doc.y;
      doc.font(font).fontSize(size).fillColor(colour)
        .text(value, valueX, y, { width: valueW, align: 'right' });

      // Advance past whichever column ran taller. A fixed step puts the next
      // row on top of this one the moment a label wraps — which the
      // withholding line does at every width worth using.
      doc.y = Math.max(labelBottom, doc.y, y + (opts.big ? 16 : 13)) + (opts.big ? 5 : 3);
      if (opts.ruleAfter) {
        rule(doc, doc.y - 4, opts.ruleAfter === 'strong' ? INK : RULE, opts.ruleAfter === 'strong' ? 0.9 : 0.7);
        doc.y += 4;
      }
    };

    doc.y += 4;
    totalRow('Subtotal', money(t.subtotal !== undefined ? t.subtotal : t.amount_excluding_tax));
    totalRow(
      `Sales tax (GST)${t.tax_rate ? ` — ${t.tax_rate}%` : ''}`,
      money(t.tax_amount)
    );
    totalRow('Total', money(t.total !== undefined ? t.total : (Number(t.amount_excluding_tax || 0) + Number(t.tax_amount || 0))), { bold: true, ruleAfter: 'strong' });

    if (Number(t.ait_amount || 0) > 0) {
      totalRow(
        `Less advance income tax${t.ait_rate ? ` @ ${t.ait_rate}%` : ''} (withheld)`,
        `-${money(t.ait_amount)}`
      );
    }
    totalRow('Net payable', money(t.net_payable !== undefined ? t.net_payable : t.total_payable), { bold: true, ruleAfter: 'strong' });

    if (d.settlement && Number(d.settlement.received || 0) > 0) {
      totalRow('Received', `-${money(d.settlement.received)}`, { muted: true });
    }
    if (settled) {
      totalRow('Paid in full', money(t.net_payable !== undefined ? t.net_payable : t.total_payable), { bold: true, big: true });
    } else {
      totalRow('Amount due', money(outstanding), { bold: true, big: true });
    }

    // ----------------------------------------------------------------- notes
    doc.x = LEFT;
    doc.y += 14;
    const note = (txt) => {
      if (!txt) return;
      if (doc.y > 720) { doc.addPage(); doc.y = PAGE.margin; }
      const y = doc.y;
      doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
        .text(String(txt), LEFT + 10, y, { width: WIDTH - 10 });
      doc.save().moveTo(LEFT, y).lineTo(LEFT, doc.y)
        .lineWidth(1.6).strokeColor(RULE).stroke().restore();
      doc.y += 10;
    };
    note(d.ait_note);
    note(d.notes);

    // ---------------------------------------------------------------- footer
    doc.y = Math.max(doc.y + 8, 760);
    rule(doc, doc.y);
    doc.y += 8;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(
      `This is a computer-generated ${String(d.document_title || 'invoice').toLowerCase()} and is valid without a signature.`,
      LEFT, doc.y, { width: WIDTH }
    );

    doc.end();
  });
}

/**
 * A filename a person can find later: VAI-2026-000012.pdf
 *
 * The invoice number is generated by us, so this is belt and braces — but the
 * value ends up verbatim in a mail header, and a filename there should carry
 * no path separators, no run of dots and no unbounded length whatever the
 * number turns out to be.
 */
function invoiceFilename(d) {
  const n = String(d.invoice_number || 'invoice')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '')
    .slice(0, 80) || 'invoice';
  return `${n}.pdf`;
}

module.exports = { renderInvoicePdf, invoiceFilename };
