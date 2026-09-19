const db = require('../db');
const { effectivePackage } = require('./pkg');

/**
 * Invoicing. Everything that creates an invoice goes through createInvoice()
 * so that the tax breakdown, the sequential number and the buyer's
 * registration details are stamped identically no matter what triggered it —
 * a drag in the CRM, an n8n call, or an admin's quota decision.
 *
 * `amount` keeps the meaning it always had: the value EXCLUDING tax.
 *
 * Two taxes, and they move in opposite directions:
 *
 *   GST (tax_rate / tax_amount)   is ADDED to the bill. We collect it from
 *                                 the client and owe it to FBR.
 *   AIT (ait_rate / ait_amount)   is WITHHELD FROM the bill under s.153. The
 *                                 client keeps it back, deposits it with FBR
 *                                 against our NTN, and hands us a challan. It
 *                                 is our money, but it arrives as a tax
 *                                 credit rather than as cash.
 *
 * So the invoice reads:  Subtotal → + GST → Total → less AIT withheld →
 * Net payable. `net_payable` is what the client actually transfers, and it
 * is what the receipts ledger settles against.
 *
 * Every derived figure is stored, not recomputed on read: an invoice is a
 * record of what was billed, and it must not change when a rate does.
 */

const ROUND = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Money, rounded to the precision its currency actually needs.
 *
 * PKR keeps two places, as it always has. USD keeps six, because the
 * internal account is priced in model tokens: gpt-4o-mini is $0.15 per
 * million input tokens, so a quiet month costs a fraction of a cent.
 * Rounded to cents that reads as zero, the invoice total is zero, and the
 * billing run discards it as "nothing to bill" — the cost disappears from
 * the books precisely because it was small.
 */
const USD_PLACES = 1e6;
const MONEY = (n, currency) => (currency === 'USD'
  ? Math.round(Number(n) * USD_PLACES) / USD_PLACES
  : ROUND(n));

/** The currency a client is billed in; the company default when unset. */
function resolveCurrency(client, settings) {
  const c = client && client.currency;
  return (c && String(c).trim()) || (settings && settings.currency) || 'PKR';
}

/**
 * What this invoice is worth in the currency the books are kept in, and the
 * rate it got there by — both stamped at issue, the same way a tax rate is.
 *
 * The financials add every invoice together, so a USD invoice has to carry a
 * PKR figure or it corrupts the total it lands in. The rate that matters is
 * the one on the day the cost was incurred, which is why it is recorded here
 * rather than looked up whenever a report is run: today's rate must not
 * restate a month that has already been reported and settled.
 *
 * No rate entered means no conversion. `base_amount` stays null and the
 * financials report the figure as unconverted — which is a visible gap
 * somebody can close, rather than an invented number nobody can audit.
 */
function baseValue(net, currency, settings) {
  const base = (settings && settings.currency) || 'PKR';
  if (currency === base) return { fx_rate: 1, base_amount: ROUND(net) };
  const rate = Number((settings && settings.usd_pkr_rate) || 0);
  if (!(currency === 'USD' && base === 'PKR' && rate > 0)) {
    return { fx_rate: null, base_amount: null };
  }
  return { fx_rate: rate, base_amount: ROUND(net * rate) };
}

async function getSettings() {
  const { rows } = await db.query(`select * from settings where id = 1`);
  return rows[0] || {};
}

/** True when a value was actually supplied — 0 counts, '' and null do not. */
const given = (v) => v !== null && v !== undefined && v !== '';

/**
 * The GST rate to apply to this client. A null tax_rate on the client means
 * "whatever the company default is"; 0 is a real rate meaning exempt, so the
 * two cases must not be collapsed with a falsy check.
 */
function resolveTaxRate(client, settings, jurisdiction) {
  if (client && given(client.tax_rate)) return Number(client.tax_rate);
  // The authority the client is billed under comes next. Punjab zero-rating
  // a service that ICT taxes is a real difference, not an exception, so the
  // jurisdiction's rate has to outrank the company-wide default.
  if (jurisdiction && given(jurisdiction.sales_tax_rate)) return Number(jurisdiction.sales_tax_rate);
  return Number((settings && settings.default_tax_rate) || 0);
}

/**
 * The tax authority a client is billed under, or null for the company
 * default. Looked up by code rather than joined so an invoice can be raised
 * against a jurisdiction that has since been deactivated.
 */
async function getJurisdiction(code) {
  if (!code) return null;
  const { rows } = await db.query(`select * from tax_jurisdictions where code = $1`, [code]);
  return rows[0] || null;
}

/**
 * The withholding rate this client will deduct. Holding an exemption
 * certificate is a different fact from a rate that happens to be zero today,
 * so it is its own flag and it wins outright.
 */
function resolveAitRate(client, settings) {
  if (client && client.ait_exempt) return 0;
  if (client && given(client.ait_rate)) return Number(client.ait_rate);
  return Number((settings && settings.default_ait_rate) || 0);
}

/**
 * Sequential invoice numbers, e.g. VAI-2026-000123. The sequence is allocated
 * by Postgres so two people issuing at once can never collide. Numbers are
 * strictly increasing; a rolled-back transaction consumes one, so treat the
 * series as sequential rather than gapless and keep every issued number.
 */
async function allocateInvoiceNumber(settings, issuedDate) {
  const { rows } = await db.query(`select nextval('invoice_number_seq') as n`);
  const prefix = (settings && settings.invoice_prefix) || 'VAI';
  const year = new Date(issuedDate || Date.now()).getFullYear();
  return `${prefix}-${year}-${String(rows[0].n).padStart(6, '0')}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

const LINE_LABEL = {
  setup_fee: 'One-time setup and onboarding',
  retainer: 'Monthly service retainer',
  overage: 'Conversations over included quota',
  addon: 'Add-on / change request',
};

/**
 * Turns whatever the caller supplied into the Description / Qty / Unit price /
 * Amount rows the invoice prints. A caller that passes no lines still gets
 * one, built from the invoice type — so every invoice has a body, and the
 * printed document never has to special-case the old single-figure shape.
 */
function normaliseLines(lines, { type, amount, period, overage_sessions, currency }) {
  // Lines round to their invoice's own precision. Rounding a USD token line to
  // cents here would zero it before createInvoice ever sums the body, and the
  // invoice would come out at 0.00 with its lines still reading correctly —
  // which is exactly the shape of a cost that quietly vanishes from the books.
  const M = (n) => MONEY(n, currency);
  const supplied = Array.isArray(lines) ? lines.filter((l) => l && (l.description || l.amount || l.unit_price)) : [];
  if (supplied.length) {
    return supplied.map((l, i) => {
      const qty = given(l.qty) ? Number(l.qty) : 1;
      const unit = given(l.unit_price) ? Number(l.unit_price) : (given(l.amount) ? Number(l.amount) / (qty || 1) : 0);
      return {
        position: i,
        description: String(l.description || LINE_LABEL[type] || type),
        detail: String(l.detail || ''),
        qty,
        // The unit price is a published rate, not money on this invoice —
        // $0.15 per million tokens has to survive verbatim, so it keeps the
        // full precision the rate card carries.
        unit_price: M(unit),
        amount: M(given(l.amount) ? Number(l.amount) : qty * unit),
      };
    });
  }
  // Overage is naturally a quantity × rate line; everything else is a single
  // unit, which is how the reference layout shows a subscription too.
  const net = M(amount || 0);
  if (type === 'overage' && Number(overage_sessions) > 0) {
    const qty = Number(overage_sessions);
    return [{
      position: 0,
      description: LINE_LABEL.overage,
      detail: period ? String(period) : '',
      qty,
      unit_price: M(net / qty),
      amount: net,
    }];
  }
  return [{
    position: 0,
    description: LINE_LABEL[type] || type,
    detail: period ? String(period) : '',
    qty: 1,
    unit_price: net,
    amount: net,
  }];
}

/**
 * Creates one invoice for one client, with both taxes computed and the
 * buyer's registration details snapshotted as they stand today.
 *
 * An internal client (VantriqAI billing itself for its own agents) is a
 * transfer, not a sale: no GST is charged, nothing is withheld, and the
 * invoice is settled the moment it is issued. The financials read it as
 * cost — see src/routes/accounting.js.
 *
 * @param {object} client  full clients row (not just the id — the NTN, STRN,
 *                         billing address and both tax rates are copied from it)
 */
async function createInvoice(client, {
  type, amount, period, status, issued_date, overage_sessions, notes,
  tax_rate, ait_rate, due_date, lines,
}) {
  const settings = await getSettings();
  const issued = issued_date || new Date().toISOString().slice(0, 10);
  const internal = !!client.is_internal;

  const currency = resolveCurrency(client, settings);
  const M = (n) => MONEY(n, currency);
  const jurisdiction = internal ? null : await getJurisdiction(client.tax_jurisdiction);
  const gstRate = internal ? 0
    : (given(tax_rate) ? Number(tax_rate) : resolveTaxRate(client, settings, jurisdiction));
  const aitRate = internal ? 0
    : (given(ait_rate) ? Number(ait_rate) : resolveAitRate(client, settings));

  const body = normaliseLines(lines, { type, amount, period, overage_sessions, currency });
  // Lines are the authority on the subtotal when they were supplied; a caller
  // passing only an amount still gets exactly that amount back.
  const net = M(body.reduce((s, l) => s + Number(l.amount), 0));
  const tax = M(net * gstRate / 100);
  const total = M(net + tax);
  // Withholding is computed on the value of the service, not on the
  // GST-inclusive figure — s.153 is a tax on the receipt, not on the tax.
  const ait = M(net * aitRate / 100);
  const netPayable = M(total - ait);
  const fx = baseValue(net, currency, settings);
  const number = await allocateInvoiceNumber(settings, issued);

  const { rows } = await db.query(
    `insert into invoices
       (client_id, type, amount, period, status, issued_date, overage_sessions, notes,
        invoice_number, tax_rate, tax_amount, total_amount,
        client_ntn, client_strn, billing_address, client_legal_name, due_date,
        ait_rate, ait_amount, net_payable, tax_jurisdiction, seller_reg_no, currency,
        fx_rate, base_amount)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     returning *`,
    [
      client.id, type, net, period || null,
      status || (internal ? 'paid' : 'pending'), issued,
      overage_sessions || 0, notes || '',
      number, gstRate, tax, total,
      client.ntn || '', client.strn || '', client.billing_address || '',
      // The registered name, stamped with the rest of the identity so a
      // later rename cannot reach back into an invoice already filed.
      client.company || '',
      due_date || addDays(issued, settings.payment_terms_days || 7),
      aitRate, ait, netPayable,
      // Stamped, not referenced. The authority's rate and our registration
      // with it both change over time; this invoice must keep saying what it
      // was actually issued under.
      jurisdiction ? jurisdiction.code : null,
      jurisdiction ? (jurisdiction.seller_reg_no || '') : (settings.seller_strn || ''),
      currency,
      fx.fx_rate, fx.base_amount,
    ]
  );
  const invoice = rows[0];

  for (const l of body) {
    await db.query(
      `insert into invoice_lines (invoice_id, position, description, detail, qty, unit_price, amount)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [invoice.id, l.position, l.description, l.detail, l.qty, l.unit_price, l.amount]
    );
  }
  invoice.lines = body;
  return invoice;
}

/**
 * Bills a client for going live: the one-off setup fee plus the first month's
 * retainer. Called server-side from the client routes, so a client activated
 * by n8n or by the API is billed exactly like one dragged across the CRM
 * board. Idempotent — a client who already has a setup-fee invoice is never
 * billed a second time.
 */
async function billOnActivation(client) {
  if (!client.product_id) return { invoices: [], skipped: 'no package assigned' };

  const { rows: already } = await db.query(
    `select 1 from invoices where client_id = $1 and type = 'setup_fee' limit 1`, [client.id]
  );
  if (already[0]) return { invoices: [], skipped: 'already billed' };

  const { rows: prod } = await db.query(`select * from products where id = $1`, [client.product_id]);
  const eff = effectivePackage(client, prod[0]);
  if (!eff) return { invoices: [], skipped: 'package not found' };

  const period = monthLabel(new Date());
  const out = [];
  if (eff.setup_fee > 0) {
    out.push(await createInvoice(client, { type: 'setup_fee', amount: eff.setup_fee, notes: `${eff.name} — setup` }));
  }
  out.push(await createInvoice(client, {
    type: 'retainer', amount: eff.retainer, period, notes: `${eff.name} — monthly retainer`,
  }));
  return { invoices: out, skipped: null };
}

/**
 * "Sep 2026" — the period label on retainer and overage invoices. Deliberately
 * the same format the CRM form pre-fills, so the duplicate-retainer check
 * compares like with like whether the invoice came from a person or from n8n.
 */
function monthLabel(date) {
  return new Date(date).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * What has been settled against one invoice, and what is still outstanding.
 * Every kind of ledger row reduces the balance — a write-off and a credit
 * note clear the debt without cash, which is exactly the point of recording
 * them here rather than editing the invoice.
 */
function settlementOf(invoice, payments) {
  const rows = payments || [];
  // The ledger is kept in the invoice's own currency, so a sub-cent USD
  // balance stays visible instead of rounding itself settled.
  const M = (n) => MONEY(n, invoice && invoice.currency);
  const sum = (k) => M(rows.filter((p) => p.kind === k).reduce((s, p) => s + Number(p.amount), 0));
  const received = sum('receipt');
  const ait_challans = sum('ait_challan');
  const written_off = sum('write_off');
  const credited = sum('credit_note');
  const due = M(Number(invoice.net_payable != null ? invoice.net_payable : invoice.total_amount || invoice.amount));
  const settled = M(received + written_off + credited);
  return {
    due,
    received,
    ait_challans,
    written_off,
    credited,
    settled,
    balance: M(due - settled),
  };
}

/**
 * The status an invoice's ledger says it has. Status stops being a field
 * someone types and becomes a fact: paid when nothing is outstanding,
 * partial when something has come in, overdue once the due date has passed
 * with a balance still on it.
 *
 * 'void' is the one status a ledger cannot argue with — an invoice cancelled
 * before payment stays cancelled.
 */
function derivedStatus(invoice, settlement, today) {
  if (invoice.status === 'void') return 'void';
  const now = today ? new Date(today) : new Date();
  // "Nothing left to pay" is half a minor unit, and the minor unit depends on
  // the currency: a cent for PKR, a millionth of a dollar for the token-priced
  // internal account.
  const eps = (invoice && invoice.currency === 'USD') ? 0.0000009 : 0.009;
  if (settlement.balance <= eps) return 'paid';
  if (invoice.due_date && new Date(invoice.due_date) < new Date(now.toISOString().slice(0, 10))) return 'overdue';
  if (settlement.settled > 0) return 'partial';
  return 'pending';
}

/**
 * The printable tax invoice. Both the CRM and the customer portal render this
 * same document, so what a customer prints is exactly what we issued.
 *
 * Buyer details come off the invoice row, not the client row: they are a
 * snapshot of who was billed on the day, so correcting a client's NTN later
 * cannot silently rewrite an invoice already issued.
 */
function buildTaxInvoice(inv, client, settings, lines, payments) {
  const net = Number(inv.amount);
  const tax = Number(inv.tax_amount || 0);
  const total = Number(inv.total_amount != null ? inv.total_amount : inv.amount);
  const ait = Number(inv.ait_amount || 0);
  const netPayable = Number(inv.net_payable != null ? inv.net_payable : total);
  const ledger = settlementOf(inv, payments);
  // An invoice stored as paid has nothing outstanding, whatever the payments
  // ledger holds. The internal account is the case that matters: it is
  // settled the moment it is issued and never has a receipt row, so reading
  // the balance off the ledger alone would print "due" across the top of an
  // invoice that is marked paid.
  const settlement = (inv.status === 'paid' && ledger.balance > 0)
    ? { ...ledger, settled: ledger.due, balance: 0 }
    : ledger;

  const body = (lines && lines.length ? lines : normaliseLines(null, inv)).map((l) => ({
    description: l.description,
    detail: l.detail || '',
    qty: Number(l.qty),
    unit_price: Number(l.unit_price),
    amount: Number(l.amount),
  }));

  return {
    document_title: tax > 0 ? 'Sales Tax Invoice' : 'Invoice',
    invoice_number: inv.invoice_number,
    issued_date: inv.issued_date,
    due_date: inv.due_date,
    status: inv.status,
    // The currency it was RAISED in, not whatever the company default is now.
    currency: inv.currency || settings.currency || 'PKR',
    // The figure the reference layout prints large at the top: what is left
    // to pay, and by when.
    amount_due: MONEY(settlement.balance > 0 ? settlement.balance : 0, inv.currency || settings.currency),
    seller: {
      name: settings.company_name,
      address: settings.seller_address || settings.address || settings.city,
      ntn: settings.seller_ntn || settings.ntn || '',
      // The registration under which THIS invoice was raised. Stamped at
      // issue, so it keeps showing the right authority even after the client
      // moves jurisdiction or a registration number changes. Falls back to
      // the company-wide number for invoices raised before v9.
      strn: inv.seller_reg_no || settings.seller_strn || settings.strn || '',
      email: settings.seller_email || '',
    },
    // Named on the document because five authorities means five returns, and
    // whoever files them needs to know which pile this invoice belongs to.
    tax_jurisdiction: inv.tax_jurisdiction || null,
    buyer: {
      // The registered name as STAMPED on the invoice, not as the client
      // record reads today. These four belong together: taking the name
      // live while the NTN comes off the invoice is how a renamed company's
      // old invoices came to print a new name against an old registration
      // number — two different entities on one tax document. Older rows
      // that predate the stamp fall back to the client record, which for
      // them is still the name they were raised under.
      company: inv.client_legal_name || client.company,
      contact_name: client.name,
      email: client.email,
      phone: client.phone,
      ntn: inv.client_ntn || '',
      strn: inv.client_strn || '',
      address: inv.billing_address || '',
    },
    lines: body,
    totals: {
      subtotal: net,
      tax_rate: Number(inv.tax_rate || 0),
      tax_amount: tax,
      total: total,
      ait_rate: Number(inv.ait_rate || 0),
      ait_amount: ait,
      net_payable: netPayable,
      // Kept under their old names so anything already reading this document
      // — the portal, the print sheet — does not break on the new shape.
      amount_excluding_tax: net,
      total_payable: netPayable,
    },
    settlement,
    ait_note: ait > 0
      ? `Advance income tax of ${Number(inv.ait_rate)}% (PKR ${ait.toLocaleString('en-PK')}) is to be withheld under section 153 of the Income Tax Ordinance 2001 and deposited against ${settings.company_name}'s NTN. Please send the CPR/challan once filed.`
      : '',
    notes: inv.notes || '',
  };
}

module.exports = {
  getJurisdiction,
  MONEY,
  resolveCurrency, baseValue,
  createInvoice, billOnActivation, buildTaxInvoice, resolveTaxRate, resolveAitRate,
  allocateInvoiceNumber, getSettings, monthLabel, settlementOf, derivedStatus,
  normaliseLines, LINE_LABEL, ROUND,
};
