const PDFDocument = require('pdfkit');
const { formatDay: day } = require('./formatDate');
const C = require('../content/proposal');

/**
 * A quotation that reads like a proposal.
 *
 * THE SHAPE, AND WHY. The old quotation was the invoice renderer with a
 * different word at the top: one page, a table of lines, a total. That is
 * the right document for a bill somebody already agreed to and the wrong
 * one for asking them to agree. A reader handed a bare total has no way to
 * judge whether it is a good total.
 *
 * So the money comes LAST, deliberately:
 *
 *   1  Cover letter      — who this is for, in the sender's own words
 *   2  The gap           — the problem, as a night that costs them money
 *   3  What we build     — channel and capability modules
 *   4  Where it plugs in — their existing tools, plus why us
 *   5  Packages          — the range, or the chosen few, one recommended
 *   6  How it runs       — onboarding, no promised dates
 *   7  Commercials       — the numbers, and a line to sign
 *
 * By the time a reader reaches page seven they know what the number buys.
 *
 * EVERY FIGURE IS LIVE. Package pricing is read from the products table
 * and the totals from the quote's own lines — the same rows the CRM will
 * invoice against. Nothing on the commercials page is typed into this
 * file, so a proposal cannot quote a price the system would not honour.
 *
 * pdfkit rather than a headless browser, for the same reason as the
 * invoice: rendering HTML would guarantee pixel parity but would also put
 * Chromium in the container — hundreds of megabytes and a browser process
 * per document, to lay out text and tables.
 */

const INK = '#16151a';
const COBALT = '#2f56d9';
const MUTED = '#6b645b';
const RULE = '#e7e2da';
const WASH = '#f4f2ec';          // the paper tint used behind quiet blocks
const COBALT_WASH = '#eef2fd';   // the same idea in brand colour

const PAGE = { size: 'A4', margin: 48 };
const LEFT = PAGE.margin;
const RIGHT = 595.28 - PAGE.margin;
const WIDTH = RIGHT - LEFT;
const BOTTOM = 792 - PAGE.margin;   // A4 height in points
const FOOT = BOTTOM - 18;           // footers live below the content floor

/**
 * The two table layouts, at module scope so a test can check the arithmetic.
 *
 * Both of these have now shipped once with a column measured as
 * `WIDTH - n + LEFT` instead of `RIGHT - (LEFT + n)`. The two differ by
 * exactly one margin, so the last column ended at 595.28 — the physical edge
 * of the paper — and right-aligned money printed against the trim. A PDF
 * renders perfectly happily either way, which is why it reached a customer
 * before anybody noticed. Exporting them lets the suite assert what the eye
 * has to catch otherwise.
 */
const PACKAGE_COLS = [
  { h: 'Package', x: LEFT, w: 116, align: 'left' },
  { h: 'Sessions/mo', x: LEFT + 120, w: 58, align: 'right' },
  { h: 'Setup', x: LEFT + 182, w: 74, align: 'right' },
  { h: 'Monthly', x: LEFT + 260, w: 74, align: 'right' },
  { h: 'Over-quota', x: LEFT + 338, w: 62, align: 'right' },
  { h: 'Channels', x: LEFT + 404, w: RIGHT - (LEFT + 404), align: 'left' },
];

const COMMERCIAL_COLS = [
  { h: 'Item', x: LEFT, w: 236, align: 'left' },
  { h: 'Qty', x: LEFT + 244, w: 42, align: 'right' },
  { h: 'Unit', x: LEFT + 292, w: 90, align: 'right' },
  { h: 'Amount', x: LEFT + 388, w: RIGHT - (LEFT + 388), align: 'right' },
];

/** Money, to the precision a rupee invoice needs. Mirrors invoicePdf. */
function makeMoney(currency) {
  const cur = currency || 'PKR';
  return (n) =>
    `${cur} ${Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    })}`;
}

/** A whole-rupee figure, for comparison tables where two decimal places on
 *  six packages is noise the reader has to look past. */
const round0 = (n, cur = 'PKR') =>
  `${cur} ${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

const int = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** The VantriqAI mark, drawn rather than embedded so it stays crisp at any
 *  zoom and adds no image bytes. Same path as the invoice. */
function drawMark(doc, x, y, size, inkColor = INK, accent = COBALT) {
  const s = size / 100;
  doc.save().translate(x, y).scale(s);
  doc.path('M10 10 H90 V90 H10 Z M28 28 V72 H72 V28 Z').fillColor(inkColor).fill('even-odd');
  doc.rect(10, 28, 28, 10).fillColor(accent).fill();
  doc.rect(28, 10, 10, 28).fillColor(accent).fill();
  doc.restore();
}

function rule(doc, y, color = RULE, weight = 0.7, x1 = LEFT, x2 = RIGHT) {
  doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(weight).strokeColor(color).stroke().restore();
}

/** A small uppercase label. Used for every section kicker so the document
 *  has one consistent way of saying "a new idea starts here". */
function kicker(doc, text, x, y, color = COBALT) {
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(color)
    .text(String(text).toUpperCase(), x, y, { characterSpacing: 1.1 });
  return y + 13;
}

/** A section heading with its kicker, returning the y to carry on from. */
function sectionHead(doc, kickerText, title, y, sub = '') {
  let cursor = kicker(doc, kickerText, LEFT, y);
  doc.font('Helvetica-Bold').fontSize(19).fillColor(INK)
    .text(title, LEFT, cursor, { width: WIDTH });
  cursor += doc.heightOfString(title, { width: WIDTH, fontSize: 19 }) + 2;
  if (sub) {
    doc.font('Helvetica').fontSize(9.5).fillColor(MUTED)
      .text(sub, LEFT, cursor, { width: WIDTH * 0.82, lineGap: 2 });
    cursor += doc.heightOfString(sub, { width: WIDTH * 0.82, lineGap: 2 }) + 6;
  }
  rule(doc, cursor + 4);
  return cursor + 18;
}

/** Height of a string at a given font and size, without disturbing the
 *  caller's current font. pdfkit measures using whatever font is active,
 *  which makes measuring before drawing quietly wrong unless you set it. */
function measure(doc, text, { font = 'Helvetica', size = 9, width = WIDTH, lineGap = 0 } = {}) {
  doc.font(font).fontSize(size);
  return doc.heightOfString(String(text || ''), { width, lineGap });
}

/**
 * A card: tinted panel, bold name, an availability pill, and body copy.
 * Returns the height it drew, so a grid can track its own rows.
 */
function card(doc, { title, tag, body }, x, y, w) {
  const padX = 12;
  const inner = w - padX * 2;
  const titleH = measure(doc, title, { font: 'Helvetica-Bold', size: 10, width: inner });
  const bodyH = measure(doc, body, { size: 8.5, width: inner, lineGap: 1.5 });
  const h = 12 + titleH + (tag ? 13 : 2) + bodyH + 12;

  doc.save().roundedRect(x, y, w, h, 5).fillColor(WASH).fill().restore();
  doc.save().roundedRect(x, y, 2.5, h, 1.2).fillColor(COBALT).fill().restore();

  let cy = y + 11;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(title, x + padX, cy, { width: inner });
  cy += titleH + 2;
  if (tag) {
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COBALT)
      .text(String(tag).toUpperCase(), x + padX, cy, { width: inner, characterSpacing: 0.7 });
    cy += 11;
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text(body, x + padX, cy, { width: inner, lineGap: 1.5 });
  return h;
}

/** Lay cards out in two columns, top-aligned per row so a short card next
 *  to a tall one does not leave the next row climbing into the gap. */
function cardGrid(doc, items, y, cols = 2, gap = 12) {
  const w = (WIDTH - gap * (cols - 1)) / cols;
  let cursor = y;
  for (let i = 0; i < items.length; i += cols) {
    const row = items.slice(i, i + cols);
    let tallest = 0;
    row.forEach((it, j) => {
      const h = card(doc, it, LEFT + j * (w + gap), cursor, w);
      if (h > tallest) tallest = h;
    });
    cursor += tallest + gap;
  }
  return cursor;
}

/**
 * The tax line, drawn wherever a price is.
 *
 * One helper rather than three copies of the sentence: a rate that is
 * exclusive of tax in one place and silent about it in another is exactly
 * how a customer ends up disputing an invoice they already agreed to.
 */
function taxNote(doc, y) {
  doc.save().rect(LEFT, y, WIDTH, 0.7).fillColor(RULE).fill().restore();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
    .text(C.TAX_NOTE, LEFT, y + 8, { width: WIDTH, lineGap: 1.5 });
  return y + 8 + measure(doc, C.TAX_NOTE, { font: 'Helvetica-Bold', size: 7.5, width: WIDTH, lineGap: 1.5 });
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

/**
 * PAGE 1 — the covering letter.
 *
 * The only page most recipients read closely, so it carries the whole
 * offer in one sentence and then gets out of the way. The reference block
 * sits under the letter rather than over it: a reader wants to know what
 * this is before they want to know its serial number.
 */
function coverPage(doc, d) {
  // A cobalt band gives the document a spine that the rest of the pages
  // echo in their kickers, without spending a full-bleed colour page.
  doc.save().rect(0, 0, 595.28, 6).fillColor(COBALT).fill().restore();

  drawMark(doc, LEFT, 58, 30);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(d.seller.name, LEFT + 40, 63);
  if (d.seller.address) {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(d.seller.address, LEFT + 40, 79, { width: WIDTH - 40 });
  }

  let y = 150;
  kicker(doc, 'Proposal', LEFT, y);
  y += 16;

  doc.font('Helvetica-Bold').fontSize(30).fillColor(INK)
    .text(d.buyer.company || 'Your business', LEFT, y, { width: WIDTH, lineGap: -2 });
  y += measure(doc, d.buyer.company || 'Your business', { font: 'Helvetica-Bold', size: 30, width: WIDTH, lineGap: -2 }) + 8;

  if (d.title) {
    doc.font('Helvetica').fontSize(12).fillColor(COBALT).text(d.title, LEFT, y, { width: WIDTH });
    y += measure(doc, d.title, { size: 12, width: WIDTH }) + 10;
  }

  rule(doc, y + 6, INK, 1.2, LEFT, LEFT + 54);
  y += 30;

  // The letter itself.
  doc.font('Helvetica').fontSize(10).fillColor(INK)
    .text(d.cover_letter, LEFT, y, { width: WIDTH * 0.88, lineGap: 4 });
  y += measure(doc, d.cover_letter, { size: 10, width: WIDTH * 0.88, lineGap: 4 }) + 26;

  // ---- signature
  //
  // The mark and the team, and nothing else. No individual and no mailbox:
  // quotes.created_by holds whichever account raised the quote, which is an
  // operational detail and on this account is a service address — it has no
  // business appearing over a signature on a document sent to a customer.
  // The reply-to is on the covering email; the contact details are in the
  // agreement.
  drawMark(doc, LEFT, y, 18);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK)
    .text(`${d.seller.name} Team`, LEFT + 25, y + 4);

  // Reference strip, pinned near the foot so it never collides with a
  // long letter above it.
  const stripY = Math.max(y + 46, 628);
  doc.save().rect(LEFT, stripY, WIDTH, 62).fillColor(WASH).fill().restore();
  const cells = [
    ['Reference', d.quote_number || '—'],
    ['Date', day(d.issued_date)],
    ['Valid until', d.valid_until ? day(d.valid_until) : 'On request'],
    ['Prepared for', d.buyer.contact_name || d.buyer.company || '—'],
  ];
  const cw = WIDTH / cells.length;
  cells.forEach(([label, value], i) => {
    const x = LEFT + i * cw + 14;
    doc.font('Helvetica').fontSize(7).fillColor(MUTED)
      .text(label.toUpperCase(), x, stripY + 14, { width: cw - 20, characterSpacing: 0.6 });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
      .text(String(value), x, stripY + 28, { width: cw - 20 });
  });
}

/**
 * PAGE 2 — the gap, as two timelines side by side.
 *
 * The most persuasive page in the document and the only one that is
 * genuinely a picture. A reader who recognises the left-hand column has
 * already agreed they have a problem, which is most of the sale.
 */
function gapPage(doc, d) {
  let y = sectionHead(doc, C.THE_GAP.kicker, C.THE_GAP.title, PAGE.margin + 6, C.THE_GAP.body);

  const gap = 16;
  const colW = (WIDTH - gap) / 2;
  const colTop = y + 4;
  const rowH = 46;
  const bodyH = 34 + C.THE_GAP.without.steps.length * rowH + 14;

  const column = (spec, x, accent, tint) => {
    doc.save().roundedRect(x, colTop, colW, bodyH, 6).fillColor(tint).fill().restore();
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent)
      .text(spec.label.toUpperCase(), x + 14, colTop + 14, { width: colW - 28, characterSpacing: 0.8 });

    let cy = colTop + 38;
    spec.steps.forEach(([time, text], i) => {
      // A connecting spine makes the column read as a sequence rather
      // than a list of unrelated facts.
      if (i < spec.steps.length - 1) {
        doc.save().moveTo(x + 22, cy + 12).lineTo(x + 22, cy + rowH - 2)
          .lineWidth(1).strokeColor(accent).opacity(0.25).stroke().restore();
      }
      doc.save().circle(x + 22, cy + 6, 3.2).fillColor(accent).fill().restore();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(accent).text(time, x + 32, cy);
      doc.font('Helvetica').fontSize(8.5).fillColor(INK)
        .text(text, x + 32, cy + 12, { width: colW - 46, lineGap: 1 });
      cy += rowH;
    });
  };

  column(C.THE_GAP.without, LEFT, MUTED, WASH);
  column(C.THE_GAP.with, LEFT + colW + gap, COBALT, COBALT_WASH);

  y = colTop + bodyH + 10;
  doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED)
    .text('Times illustrate a typical evening and are not drawn from a specific customer.',
      LEFT, y, { width: WIDTH });
  y += 26;

  // Benchmarks. Each figure prints with its source attached — the data
  // structure makes it awkward to do otherwise, on purpose.
  y = sectionHead(doc, 'For context', 'What the research says about answering first', y);
  const bw = (WIDTH - 12 * 3) / 4;
  C.BENCHMARKS.forEach((b, i) => {
    const x = LEFT + i * (bw + 12);
    doc.font('Helvetica-Bold').fontSize(17).fillColor(COBALT).text(b.figure, x, y, { width: bw });
    doc.font('Helvetica').fontSize(7.8).fillColor(INK)
      .text(b.body, x, y + 23, { width: bw, lineGap: 1 });
    const h = measure(doc, b.body, { size: 7.8, width: bw, lineGap: 1 });
    doc.font('Helvetica').fontSize(6.8).fillColor(MUTED).text(b.source, x, y + 27 + h, { width: bw });
  });
  y += 96;
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(MUTED)
    .text(C.BENCHMARK_DISCLAIMER, LEFT, y, { width: WIDTH });
}

/** PAGE 3 — the modules we would configure. */
function modulesPage(doc) {
  let y = sectionHead(
    doc, 'What we build', 'The agent, module by module',
    PAGE.margin + 6,
    'An agent is assembled from the pieces your business actually needs. Channels decide where '
    + 'it answers; capabilities decide what it can do once it does.'
  );

  y = kicker(doc, 'Channels — where it answers', LEFT, y, INK) + 2;
  y = cardGrid(doc, C.CHANNEL_MODULES.map((m) => ({ title: m.name, tag: m.availability, body: m.body })), y, 3);

  y += 8;
  y = kicker(doc, 'Capabilities — what it does', LEFT, y, INK) + 2;
  cardGrid(doc, C.CAPABILITY_MODULES.map((m) => ({ title: m.name, tag: m.availability, body: m.body })), y, 2);
}

/** PAGE 4 — where it plugs in, and why us. */
function integrationsPage(doc) {
  let y = sectionHead(
    doc, 'Where it plugs in', 'It works inside the systems you already run',
    PAGE.margin + 6,
    'The agent acts in your existing tools rather than keeping a second copy of the truth. '
    + 'Nothing here asks your team to learn a new dashboard.'
  );

  C.INTEGRATIONS.forEach(([label, list]) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(COBALT).text(label, LEFT, y, { width: 92 });
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(list, LEFT + 100, y, { width: WIDTH - 100, lineGap: 1.5 });
    y += Math.max(18, measure(doc, list, { size: 9, width: WIDTH - 100, lineGap: 1.5 })) + 10;
    rule(doc, y - 5);
  });

  y += 18;
  y = sectionHead(doc, 'Why VantriqAI', 'What you get that a template does not', y);
  cardGrid(doc, C.WHY_US.map(([t, b]) => ({ title: t, body: b })), y, 2);
}

/**
 * PAGE 5 — the packages.
 *
 * Two modes, chosen per proposal by the sender:
 *
 *   show_all_packages  the whole ladder as a comparison, so a buyer can
 *                      see where they sit and what the next rung costs.
 *   otherwise          only the packages selected, in more detail.
 *
 * Either way the recommended package is drawn highlighted, so a reader
 * who only skims still leaves knowing what we think they should take.
 */
function packagesPage(doc, d) {
  const packs = d.packages || [];
  if (!packs.length) return false;

  const comparing = d.show_all_packages && packs.length > 2;
  let y = sectionHead(
    doc,
    comparing ? 'The range' : 'Recommended for you',
    comparing ? 'Where you would sit, and what is next' : (packs.length > 1 ? 'The packages we propose' : 'The package we propose'),
    PAGE.margin + 6,
    comparing
      ? 'Every plan includes a monthly conversation allowance, monthly tuning and support. Tiers are a path, not a lock-in — most clients start where the volume is and move up as it grows.'
      : 'Selected for the volumes and channels you described. Every plan includes monthly tuning and support.'
  );

  if (comparing) {
    // ---- comparison table: one package per row, portrait-friendly.
    const COLS = PACKAGE_COLS;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(MUTED);
    COLS.forEach((c) => doc.text(c.h.toUpperCase(), c.x, y, { width: c.w, align: c.align, characterSpacing: 0.5 }));
    y += 13;
    rule(doc, y, INK, 1);
    y += 6;

    packs.forEach((p) => {
      const chans = String(p.channels || '').trim() || '—';
      // Every row's height is measured from what it actually contains, so a
      // long channel list or a two-line tier caption grows the row instead
      // of overprinting the one below it.
      const nameH = measure(doc, p.name, { font: 'Helvetica-Bold', size: 9.5, width: COLS[0].w });
      const tagH = p.recommended ? 10 : 0;
      const chanH = measure(doc, chans, { size: 7.5, width: COLS[5].w, lineGap: 1 });
      const rowH = Math.max(30, 6 + nameH + tagH + 8, chanH + 16);

      if (p.recommended) {
        doc.save().roundedRect(LEFT - 6, y - 5, WIDTH + 12, rowH, 4).fillColor(COBALT_WASH).fill().restore();
      }

      let ny = y;
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(p.recommended ? COBALT : INK)
        .text(p.name, COLS[0].x, ny, { width: COLS[0].w });
      ny += nameH + 1;
      if (p.recommended) {
        doc.font('Helvetica-Bold').fontSize(6).fillColor(COBALT)
          .text('RECOMMENDED', COLS[0].x, ny, { width: COLS[0].w, characterSpacing: 0.6 });
        ny += tagH;
      }
      // No expected-usage caption under the name. It sat next to the
      // INCLUDED allowance and quietly disagreed with it — 300–600 beside
      // 1,500 reads as a contradiction rather than as headroom, and a buyer
      // deciding on a package should not have to work out which number is
      // the one they are being sold.

      doc.font('Helvetica').fontSize(9).fillColor(INK);
      doc.text(int(p.quota), COLS[1].x, y, { width: COLS[1].w, align: 'right' });
      doc.text(round0(p.setup_fee, d.currency), COLS[2].x, y, { width: COLS[2].w, align: 'right' });
      doc.font('Helvetica-Bold').text(round0(p.retainer, d.currency), COLS[3].x, y, { width: COLS[3].w, align: 'right' });
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(`${round0(p.overage_rate, d.currency)}/session`, COLS[4].x, y, { width: COLS[4].w, align: 'right' });
      doc.fontSize(7.5).fillColor(MUTED).text(chans, COLS[5].x, y, { width: COLS[5].w, lineGap: 1 });

      y += rowH;
      rule(doc, y - 5);
    });

    y += 12;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Setup is a one-time fee. Monthly is the recurring retainer. Over-quota applies only to '
        + 'sessions beyond the included allowance, and is billed in arrears.',
        LEFT, y, { width: WIDTH, lineGap: 1.5 });
    y += 24;
    taxNote(doc, y);
  } else {
    // ---- detail cards for a small selection.
    packs.forEach((p) => {
      const lines = [
        ['Included sessions', `${int(p.quota)} per month`],
        ['Setup (one-time)', round0(p.setup_fee, d.currency)],
        ['Monthly retainer', round0(p.retainer, d.currency)],
        ['Beyond the allowance', `${round0(p.overage_rate, d.currency)} per session`],
        ['Channels', String(p.channels || '—')],
      ];
      const h = 34 + lines.length * 16 + 12;
      const tint = p.recommended ? COBALT_WASH : WASH;
      doc.save().roundedRect(LEFT, y, WIDTH, h, 6).fillColor(tint).fill().restore();
      doc.save().roundedRect(LEFT, y, 3, h, 1.5).fillColor(p.recommended ? COBALT : RULE).fill().restore();

      doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(p.name, LEFT + 16, y + 14);
      if (p.recommended) {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COBALT)
          .text('RECOMMENDED', RIGHT - 84, y + 18, { width: 70, align: 'right', characterSpacing: 0.7 });
      }
      let cy = y + 32;
      lines.forEach(([k, v]) => {
        doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(k, LEFT + 16, cy, { width: 150 });
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(v, LEFT + 172, cy, { width: WIDTH - 190 });
        cy += 16;
      });
      y += h + 14;
    });
    taxNote(doc, y + 2);
  }
  return true;
}

/** PAGE 6 — how the work runs. */
function onboardingPage(doc) {
  let y = sectionHead(
    doc, 'How it runs', 'From first call to answering live',
    PAGE.margin + 6,
    'Nothing is built before we understand how your customers actually message you.'
  );

  C.ONBOARDING.forEach((step, i) => {
    doc.save().circle(LEFT + 11, y + 10, 11).fillColor(COBALT_WASH).fill().restore();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COBALT)
      .text(String(i + 1), LEFT + 6, y + 6, { width: 10, align: 'center' });

    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(step.title, LEFT + 34, y + 1, { width: WIDTH - 40 });
    doc.font('Helvetica').fontSize(9).fillColor(MUTED)
      .text(step.body, LEFT + 34, y + 17, { width: WIDTH - 46, lineGap: 2 });
    y += 20 + measure(doc, step.body, { size: 9, width: WIDTH - 46, lineGap: 2 }) + 18;
  });
}

/**
 * TERMS — the conditions the quoted price is given under.
 *
 * Placed BEFORE the commercials rather than as an annex after them, because
 * the signature block is on the commercials page: terms that appear after
 * the line somebody signs are terms they signed without reading, which is
 * both unfair and, in a dispute, useless to us.
 */
function termsPage(doc) {
  let y = sectionHead(
    doc, 'Terms', 'The conditions this price is given under',
    PAGE.margin + 6,
    'The same terms published on the Packages page at vantriqai.com. Where a signed agreement '
    + 'follows, that agreement prevails over anything here.'
  );

  C.TERMS.forEach(([title, body]) => {
    const h = measure(doc, body, { size: 8, width: WIDTH, lineGap: 2 });
    if (y + h + 26 > FOOT - 20) { doc.addPage(); y = PAGE.margin + 6; }
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(title, LEFT, y);
    y += 13;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(body, LEFT, y, { width: WIDTH, lineGap: 2 });
    y += h + 14;
  });

  // Errors and omissions, set apart so it is not mistaken for another
  // clause limiting the customer's position — it protects them too.
  const eh = measure(doc, C.ERRORS_NOTE, { size: 8, width: WIDTH - 28, lineGap: 2 });
  if (y + eh + 40 > FOOT - 20) { doc.addPage(); y = PAGE.margin + 6; }
  y += 4;
  doc.save().roundedRect(LEFT, y, WIDTH, eh + 34, 5).fillColor(WASH).fill().restore();
  doc.save().roundedRect(LEFT, y, 2.5, eh + 34, 1.2).fillColor(COBALT).fill().restore();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK)
    .text('If something here is wrong', LEFT + 14, y + 11);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(C.ERRORS_NOTE, LEFT + 14, y + 24, { width: WIDTH - 28, lineGap: 2 });
}

/**
 * LAST PAGE — the commercials.
 *
 * Every number here comes from the quote's own lines and totals, which
 * are the rows the CRM will invoice against. The acceptance block turns
 * the document into something that can be signed and sent back, which is
 * the difference between a proposal and a brochure.
 */
function commercialsPage(doc, d) {
  const money = makeMoney(d.currency);
  let y = sectionHead(
    doc, 'Commercials', 'What it costs',
    PAGE.margin + 6,
    d.valid_until ? `These terms are held until ${day(d.valid_until)}.` : ''
  );

  const COLS = COMMERCIAL_COLS;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
  COLS.forEach((c) => doc.text(c.h.toUpperCase(), c.x, y, { width: c.w, align: c.align, characterSpacing: 0.5 }));
  y += 14;
  rule(doc, y, INK, 1);
  y += 8;

  (d.lines || []).forEach((l) => {
    const descH = measure(doc, l.description, { font: 'Helvetica-Bold', size: 9, width: COLS[0].w });
    const detailH = l.detail ? measure(doc, l.detail, { size: 8, width: COLS[0].w, lineGap: 1 }) : 0;
    const rowH = Math.max(20, descH + detailH + 10);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(l.description, COLS[0].x, y, { width: COLS[0].w });
    if (l.detail) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(l.detail, COLS[0].x, y + descH + 2, { width: COLS[0].w, lineGap: 1 });
    }
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    doc.text(int(l.qty), COLS[1].x, y, { width: COLS[1].w, align: 'right' });
    doc.text(money(l.unit_price), COLS[2].x, y, { width: COLS[2].w, align: 'right' });
    doc.font('Helvetica-Bold').text(money(l.amount), COLS[3].x, y, { width: COLS[3].w, align: 'right' });
    y += rowH;
    rule(doc, y - 4);
  });

  // ---- totals, right-aligned under the amount column
  y += 10;
  const tLabelX = LEFT + 292;
  const tValX = COLS[3].x;
  const totalRow = (label, value, bold = false, color = INK) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor(bold ? color : MUTED)
      .text(label, tLabelX, y, { width: 90, align: 'right' });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).fillColor(color)
      .text(value, tValX, y, { width: COLS[3].w, align: 'right' });
    y += bold ? 18 : 15;
  };
  totalRow('Subtotal', money(d.totals.subtotal));
  if (Number(d.totals.tax_rate) > 0 || Number(d.totals.tax_amount) > 0) {
    totalRow(`GST @ ${Number(d.totals.tax_rate)}%`, money(d.totals.tax_amount));
  }
  rule(doc, y + 2, INK, 1, tLabelX, RIGHT);
  y += 10;
  totalRow('Total', money(d.totals.total), true);

  // The headline, said once.
  y += 6;
  doc.save().rect(LEFT, y, WIDTH, 46).fillColor(COBALT_WASH).fill().restore();
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text('TOTAL PROPOSED', LEFT + 14, y + 12, { characterSpacing: 0.6 });
  doc.font('Helvetica-Bold').fontSize(17).fillColor(COBALT)
    .text(money(d.totals.total), LEFT + 14, y + 24, { width: WIDTH - 28, align: 'right' });
  // taxNote returns where it actually finished — the note wraps to two
  // lines at this width, and a guessed offset put "Notes and terms" on top
  // of its second line.
  y += 56;
  y = taxNote(doc, y) + 20;

  // ---- notes and terms
  if (d.notes) {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text('Notes and terms', LEFT, y);
    y += 13;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(d.notes, LEFT, y, { width: WIDTH, lineGap: 2 });
    y += measure(doc, d.notes, { size: 8, width: WIDTH, lineGap: 2 }) + 18;
  }

  // ---- acceptance
  //
  // Pinned to the foot of the page, always, so it reads as the end of the
  // document rather than as one more paragraph — and so the signature lines
  // land where a person expects to find them. If the notes run long enough
  // to reach it, the block moves to a fresh page rather than overlapping
  // them; the earlier version clamped it and would have printed the two on
  // top of each other.
  // Measured back from the footer's hairline rather than from the page
  // height: the footer is drawn afterwards, in a second pass, so anything
  // positioned against BOTTOM lands underneath it. Sizing from FOOT is the
  // only version that cannot collide with it.
  const acceptH = 90;               // heading, note, signature lines, labels
  const footRule = FOOT - 10;
  const floor = footRule - acceptH - 12;
  if (y + 20 > floor) { doc.addPage(); }
  const acceptY = floor;
  rule(doc, acceptY - 14);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Acceptance', LEFT, acceptY);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
    .text('Signing below accepts this proposal and authorises us to begin. We will raise the setup '
      + 'invoice against the details held on your account.',
      LEFT, acceptY + 15, { width: WIDTH * 0.74, lineGap: 1.5 });

  const sigY = acceptY + 62;
  const sigW = (WIDTH - 24) / 2;
  [['Signed for ' + (d.buyer.company || 'the client'), sigW, LEFT],
    ['Name and date', sigW, LEFT + sigW + 24]].forEach(([label, w, x]) => {
    rule(doc, sigY, INK, 0.8, x, x + w);
    doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label, x, sigY + 6, { width: w });
  });
}

/* ------------------------------------------------------------------ */

/**
 * Renders the proposal and resolves with a Buffer.
 *
 * @param {object} d  buildProposalDocument()'s output — see routes/quotes.js
 * @returns {Promise<Buffer>}
 */
function renderProposal(d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      ...PAGE,
      bufferPages: true,   // so footers can be numbered once the count is known
      info: {
        Title: `Proposal ${d.quote_number || ''} — ${d.buyer.company || ''}`.trim(),
        Author: d.seller.name || 'Vantriq AI',
        Subject: d.title || 'Proposal',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    coverPage(doc, d);
    doc.addPage(); gapPage(doc, d);
    doc.addPage(); modulesPage(doc);
    doc.addPage(); integrationsPage(doc);
    if ((d.packages || []).length) { doc.addPage(); packagesPage(doc, d); }
    doc.addPage(); onboardingPage(doc);
    doc.addPage(); termsPage(doc);
    doc.addPage(); commercialsPage(doc, d);

    // ---- footers. Page 1 is a cover and carries none.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      if (i === range.start) continue;
      rule(doc, FOOT - 10, RULE, 0.5);
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(`${d.seller.name} · Proposal ${d.quote_number || ''} · ${d.buyer.company || ''}`,
          LEFT, FOOT, { width: WIDTH * 0.7, lineBreak: false });
      // The cover is excluded from the total, so it must be excluded from
      // the counter too — numbering it from 1 while totalling from 2 printed
      // "7 of 6" on the last page.
      doc.font('Helvetica').fontSize(7).fillColor(MUTED)
        .text(`${i - range.start} of ${range.count - 1}`, LEFT, FOOT, { width: WIDTH, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}

/** A filename safe to drop straight into a Content-Disposition header. */
function proposalFilename(d) {
  const who = String(d.buyer.company || 'client')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const ref = String(d.quote_number || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `proposal-${who || 'client'}${ref ? '-' + ref : ''}.pdf`.toLowerCase();
}

module.exports = { renderProposal, proposalFilename };
// Exported for the layout assertions in test/proposal.test.js.
module.exports.LAYOUT = { RIGHT, packages: PACKAGE_COLS, commercials: COMMERCIAL_COLS };
