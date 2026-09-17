const express = require('express');
const db = require('../db');
const { createInvoice, getSettings, resolveTaxRate, ROUND } = require('../utils/billing');
const { effectivePackage } = require('../utils/pkg');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Quotes — an estimate a customer sees before anything is billed.
 *
 * A quote is deliberately NOT an invoice. It consumes no invoice number, it
 * appears nowhere in the accounts, and it changes nothing about what a client
 * is on. Accepting it is the moment all of that happens: the invoice is
 * raised then, from the quote's own lines, and where the quote names a
 * package or a bundle, those are applied too.
 *
 * Which means a quote can be edited freely right up to the point it is
 * accepted, and after that it is frozen — the customer agreed to a document,
 * and the document has to stay what they agreed to.
 */

async function allocateQuoteNumber(settings) {
  const { rows } = await db.query(`select nextval('quote_number_seq') as n`);
  const prefix = (settings && settings.invoice_prefix) || 'VAI';
  return `${prefix}-Q-${new Date().getFullYear()}-${String(rows[0].n).padStart(4, '0')}`;
}

function normaliseLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .filter((l) => l && (l.description || l.amount || l.unit_price))
    .map((l, i) => {
      const qty = l.qty === undefined || l.qty === '' ? 1 : Number(l.qty);
      const unit = l.unit_price === undefined || l.unit_price === ''
        ? (l.amount ? Number(l.amount) / (qty || 1) : 0)
        : Number(l.unit_price);
      return {
        position: i,
        description: String(l.description || 'Item'),
        detail: String(l.detail || ''),
        qty,
        unit_price: ROUND(unit),
        amount: ROUND(l.amount !== undefined && l.amount !== '' ? Number(l.amount) : qty * unit),
      };
    });
}

async function writeLines(quoteId, lines) {
  await db.query(`delete from quote_lines where quote_id = $1`, [quoteId]);
  for (const l of lines) {
    await db.query(
      `insert into quote_lines (quote_id, position, description, detail, qty, unit_price, amount)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [quoteId, l.position, l.description, l.detail, l.qty, l.unit_price, l.amount]
    );
  }
}

async function totalsFor(lines, taxRate) {
  const subtotal = ROUND(lines.reduce((s, l) => s + Number(l.amount), 0));
  const tax = ROUND(subtotal * Number(taxRate || 0) / 100);
  return { subtotal, tax_amount: tax, total: ROUND(subtotal + tax) };
}

/** A quote with its body, or a list of them. */
router.get('/', async (req, res) => {
  const { client_id, status } = req.query;
  const clauses = [];
  const params = [];
  if (client_id) { params.push(client_id); clauses.push(`q.client_id = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`q.status = $${params.length}`); }
  const { rows } = await db.query(
    `select q.*, c.company, c.name, p.name as product_name
       from quotes q join clients c on c.id = q.client_id
       left join products p on p.id = q.product_id
       ${clauses.length ? `where ${clauses.join(' and ')}` : ''}
      order by q.created_at desc`,
    params
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `select q.*, c.company, c.name, c.email, c.ntn, c.billing_address,
            p.name as product_name, bp.name as bundle_product_name
       from quotes q join clients c on c.id = q.client_id
       left join products p on p.id = q.product_id
       left join products bp on bp.id = q.bundle_product_id
      where q.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
  const { rows: lines } = await db.query(
    `select * from quote_lines where quote_id = $1 order by position`, [req.params.id]
  );
  res.json({ ...rows[0], lines });
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.client_id) return res.status(400).json({ error: 'client_id is required' });
  const { rows: cRows } = await db.query(`select * from clients where id = $1`, [b.client_id]);
  const client = cRows[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const settings = await getSettings();
  let lines = normaliseLines(b.lines);

  // A quote that names a package gets that package's figures as its body,
  // so the common case — "here is what moving to Scale would cost" — is one
  // field rather than three typed lines.
  if (!lines.length && b.product_id) {
    const { rows: p } = await db.query(`select * from products where id = $1`, [b.product_id]);
    if (!p[0]) return res.status(404).json({ error: 'That package does not exist.' });
    const eff = effectivePackage(client, p[0]);
    lines = normaliseLines([
      ...(eff.setup_fee > 0 ? [{ description: `${eff.name} — setup and onboarding`, detail: 'One-off', qty: 1, unit_price: eff.setup_fee }] : []),
      { description: `${eff.name} — monthly retainer`, detail: `${Number(eff.quota).toLocaleString('en-US')} conversations included`, qty: 1, unit_price: eff.retainer },
    ]);
  }
  if (!lines.length) return res.status(400).json({ error: 'A quote needs at least one line, or a package to price.' });

  const taxRate = b.tax_rate !== undefined && b.tax_rate !== null && b.tax_rate !== ''
    ? Number(b.tax_rate) : resolveTaxRate(client, settings);
  const t = await totalsFor(lines, taxRate);
  const number = await allocateQuoteNumber(settings);

  const { rows } = await db.query(
    `insert into quotes
       (client_id, quote_number, title, status, valid_until, subtotal, tax_rate, tax_amount, total,
        product_id, bundle_product_id, notes, terms, created_by)
     values ($1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
    [
      client.id, number, b.title || '', b.valid_until || null,
      t.subtotal, taxRate, t.tax_amount, t.total,
      b.product_id || null, b.bundle_product_id || null,
      b.notes || '', b.terms || '', (req.user && req.user.email) || req.authKind || '',
    ]
  );
  await writeLines(rows[0].id, lines);
  res.status(201).json({ ...rows[0], lines });
});

router.patch('/:id', async (req, res) => {
  const b = req.body || {};
  const { rows: existing } = await db.query(`select * from quotes where id = $1`, [req.params.id]);
  const quote = existing[0];
  if (!quote) return res.status(404).json({ error: 'Quote not found' });
  // An accepted quote is a record of what the customer agreed to.
  if (quote.status === 'accepted') {
    return res.status(409).json({ error: 'This quote has been accepted, so it cannot be changed. Raise a new one.' });
  }

  const sets = [];
  const params = [req.params.id];
  for (const f of ['title', 'valid_until', 'notes', 'terms', 'product_id', 'bundle_product_id', 'status']) {
    if (b[f] === undefined) continue;
    if (f === 'status' && !['draft', 'sent', 'declined', 'expired', 'cancelled'].includes(b[f])) {
      return res.status(400).json({ error: 'Accept a quote through /accept, not by setting its status.' });
    }
    params.push(b[f] === '' ? null : b[f]);
    sets.push(`${f} = $${params.length}`);
  }

  if (b.lines !== undefined || b.tax_rate !== undefined) {
    const lines = b.lines !== undefined
      ? normaliseLines(b.lines)
      : (await db.query(`select * from quote_lines where quote_id = $1 order by position`, [req.params.id])).rows;
    const rate = b.tax_rate !== undefined ? Number(b.tax_rate) : Number(quote.tax_rate);
    const t = await totalsFor(lines, rate);
    if (b.lines !== undefined) await writeLines(quote.id, lines);
    params.push(rate); sets.push(`tax_rate = $${params.length}`);
    params.push(t.subtotal); sets.push(`subtotal = $${params.length}`);
    params.push(t.tax_amount); sets.push(`tax_amount = $${params.length}`);
    params.push(t.total); sets.push(`total = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

  const { rows } = await db.query(`update quotes set ${sets.join(', ')} where id = $1 returning *`, params);
  res.json(rows[0]);
});

/** Marks it sent. The customer sees it in their portal from this point. */
router.post('/:id/send', async (req, res) => {
  const { rows } = await db.query(
    `update quotes set status = 'sent', sent_at = now()
      where id = $1 and status in ('draft','sent') returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: 'Only a draft quote can be sent.' });
  res.json(rows[0]);
});

/**
 * Accepting a quote. This is the moment it becomes real: the invoice is
 * raised from the quote's own lines, the package change is applied if one
 * was proposed, and the bundle is attached if one was.
 *
 * Shared with the customer portal, which is how a customer accepts their own.
 */
async function acceptQuote(quoteId, { acceptedBy } = {}) {
  const { rows: qRows } = await db.query(`select * from quotes where id = $1`, [quoteId]);
  const quote = qRows[0];
  if (!quote) return { error: 'Quote not found', status: 404 };
  if (quote.status === 'accepted') return { error: 'This quote has already been accepted.', status: 409 };
  if (!['draft', 'sent'].includes(quote.status)) {
    return { error: `A ${quote.status} quote cannot be accepted.`, status: 409 };
  }
  if (quote.valid_until && new Date(quote.valid_until) < new Date(new Date().toISOString().slice(0, 10))) {
    await db.query(`update quotes set status = 'expired' where id = $1`, [quote.id]);
    return { error: `This quote expired on ${quote.valid_until}. Ask us for a fresh one.`, status: 409 };
  }

  const { rows: cRows } = await db.query(`select * from clients where id = $1`, [quote.client_id]);
  const client = cRows[0];
  const { rows: lines } = await db.query(
    `select * from quote_lines where quote_id = $1 order by position`, [quote.id]
  );

  const invoice = await createInvoice(client, {
    type: 'addon',
    amount: Number(quote.subtotal),
    tax_rate: Number(quote.tax_rate),
    notes: `Accepted quote ${quote.quote_number}${quote.title ? ` — ${quote.title}` : ''}`,
    lines: lines.map((l) => ({
      description: l.description, detail: l.detail, qty: l.qty, unit_price: l.unit_price, amount: l.amount,
    })),
  });

  const applied = [];
  if (quote.product_id && quote.product_id !== client.product_id) {
    await db.query(`update clients set product_id = $2 where id = $1`, [client.id, quote.product_id]);
    const { rows: p } = await db.query(`select name from products where id = $1`, [quote.product_id]);
    applied.push(`moved to ${p[0] ? p[0].name : 'a new package'}`);
  }
  if (quote.bundle_product_id) {
    const { rows: p } = await db.query(`select * from products where id = $1`, [quote.bundle_product_id]);
    if (p[0]) {
      const eff = effectivePackage(client, p[0]);
      await db.query(
        `insert into client_bundles
           (client_id, product_id, name, qty, unit_setup_fee, unit_retainer, unit_quota, overage_rate,
            added_by, note, setup_billed)
         values ($1,$2,$3,1,$4,$5,$6,$7,'admin',$8,true)`,
        [client.id, p[0].id, `${eff.name} bundle`, eff.setup_fee, eff.retainer, eff.quota, eff.overage_rate,
          `From accepted quote ${quote.quote_number}.`]
      );
      applied.push(`added the ${eff.name} bundle`);
    }
  }

  const { rows: updated } = await db.query(
    `update quotes set status='accepted', decided_at=now(), invoice_id=$2 where id = $1 returning *`,
    [quote.id, invoice.id]
  );
  await db.query(
    `insert into client_stage_history (client_id, from_stage, to_stage, comment)
     values ($1, $2, $2, $3)`,
    [client.id, client.stage, `Quote ${quote.quote_number} accepted by ${acceptedBy || 'us'}${applied.length ? ` — ${applied.join(', ')}` : ''}. Invoice ${invoice.invoice_number} raised.`]
  );

  return { quote: updated[0], invoice, applied };
}

router.post('/:id/accept', async (req, res) => {
  const result = await acceptQuote(req.params.id, {
    acceptedBy: (req.user && req.user.email) || 'the team',
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.post('/:id/decline', async (req, res) => {
  const { rows } = await db.query(
    `update quotes set status='declined', decided_at=now()
      where id = $1 and status in ('draft','sent') returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: 'Only an open quote can be declined.' });
  res.json(rows[0]);
});

/**
 * The printable quote, in exactly the shape the invoice document uses — so
 * public/invoice-print.js renders a quotation with no special case, and what
 * a customer is quoted looks like what they will later be invoiced.
 */
async function buildQuoteDocument(quoteId) {
  const [{ rows }, settings] = await Promise.all([
    db.query(
      `select q.*, c.company, c.name, c.email, c.phone, c.ntn, c.strn, c.billing_address
         from quotes q join clients c on c.id = q.client_id where q.id = $1`,
      [quoteId]
    ),
    getSettings(),
  ]);
  const q = rows[0];
  if (!q) return null;
  const { rows: lines } = await db.query(
    `select * from quote_lines where quote_id = $1 order by position`, [q.id]
  );
  return {
    document_title: 'Quotation',
    invoice_number: q.quote_number,
    issued_date: String(q.created_at).slice(0, 10),
    due_date: q.valid_until,
    status: q.status,
    currency: settings.currency || 'PKR',
    amount_due: Number(q.total),
    seller: {
      name: settings.company_name,
      address: settings.seller_address || settings.address || settings.city,
      ntn: settings.seller_ntn || settings.ntn || '',
      strn: settings.seller_strn || settings.strn || '',
      email: settings.seller_email || '',
    },
    buyer: {
      company: q.company, contact_name: q.name, email: q.email, phone: q.phone,
      ntn: q.ntn || '', strn: q.strn || '', address: q.billing_address || '',
    },
    lines: lines.map((l) => ({
      description: l.description, detail: l.detail,
      qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount),
    })),
    totals: {
      subtotal: Number(q.subtotal),
      tax_rate: Number(q.tax_rate), tax_amount: Number(q.tax_amount),
      total: Number(q.total),
      ait_rate: 0, ait_amount: 0,
      net_payable: Number(q.total),
      amount_excluding_tax: Number(q.subtotal), total_payable: Number(q.total),
    },
    ait_note: '',
    notes: [q.notes, q.terms, q.valid_until ? `This quotation is valid until ${q.valid_until}.` : '']
      .filter(Boolean).join('\n\n'),
  };
}

router.get('/:id/document', async (req, res) => {
  const doc = await buildQuoteDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Quote not found' });
  res.json(doc);
});

router.delete('/:id', blockAutomation, async (req, res) => {
  const { rows } = await db.query(`select status from quotes where id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Quote not found' });
  if (rows[0].status === 'accepted') {
    return res.status(409).json({ error: 'An accepted quote is part of the record and cannot be deleted.' });
  }
  await db.query(`delete from quotes where id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
module.exports.acceptQuote = acceptQuote;
module.exports.buildQuoteDocument = buildQuoteDocument;
