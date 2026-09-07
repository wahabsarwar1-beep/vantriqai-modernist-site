const db = require('../db');
const { effectivePackage } = require('./pkg');

/**
 * Invoicing. Everything that creates an invoice goes through createInvoice()
 * so that the tax breakdown, the sequential number and the buyer's
 * registration details are stamped identically no matter what triggered it —
 * a drag in the CRM, an n8n call, or an admin's quota decision.
 *
 * `amount` keeps the meaning it always had: the value EXCLUDING tax.
 * tax_amount and total_amount are derived and stored, because an invoice is a
 * record of what was billed — it must not change when the tax rate does.
 */

const ROUND = (n) => Math.round(Number(n) * 100) / 100;

async function getSettings() {
  const { rows } = await db.query(`select * from settings where id = 1`);
  return rows[0] || {};
}

/**
 * The rate to apply to this client. A null tax_rate on the client means
 * "whatever the company default is"; 0 is a real rate meaning exempt, so the
 * two cases must not be collapsed with a falsy check.
 */
function resolveTaxRate(client, settings) {
  if (client && client.tax_rate !== null && client.tax_rate !== undefined && client.tax_rate !== '') {
    return Number(client.tax_rate);
  }
  return Number((settings && settings.default_tax_rate) || 0);
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

/**
 * Creates one invoice for one client, with tax computed and the buyer's
 * registration details snapshotted as they stand today.
 *
 * @param {object} client  full clients row (not just the id — the NTN, STRN,
 *                         billing address and tax rate are copied from it)
 */
async function createInvoice(client, {
  type, amount, period, status, issued_date, overage_sessions, notes, tax_rate, due_date,
}) {
  const settings = await getSettings();
  const issued = issued_date || new Date().toISOString().slice(0, 10);
  const rate = tax_rate !== undefined && tax_rate !== null && tax_rate !== ''
    ? Number(tax_rate)
    : resolveTaxRate(client, settings);

  const net = ROUND(amount || 0);
  const tax = ROUND(net * rate / 100);
  const total = ROUND(net + tax);
  const number = await allocateInvoiceNumber(settings, issued);

  const { rows } = await db.query(
    `insert into invoices
       (client_id, type, amount, period, status, issued_date, overage_sessions, notes,
        invoice_number, tax_rate, tax_amount, total_amount,
        client_ntn, client_strn, billing_address, due_date)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     returning *`,
    [
      client.id, type, net, period || null, status || 'pending', issued,
      overage_sessions || 0, notes || '',
      number, rate, tax, total,
      client.ntn || '', client.strn || '', client.billing_address || '',
      due_date || addDays(issued, settings.payment_terms_days || 7),
    ]
  );
  return rows[0];
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
 * The printable tax invoice. Both the CRM and the customer portal render this
 * same document, so what a customer prints is exactly what we issued.
 *
 * Buyer details come off the invoice row, not the client row: they are a
 * snapshot of who was billed on the day, so correcting a client's NTN later
 * cannot silently rewrite an invoice already issued.
 */
const LINE_LABEL = {
  setup_fee: 'One-time setup and onboarding',
  retainer: 'Monthly service retainer',
  overage: 'Conversations over included quota',
  addon: 'Add-on / change request',
};

function buildTaxInvoice(inv, client, settings) {
  const net = Number(inv.amount);
  const total = Number(inv.total_amount != null ? inv.total_amount : inv.amount);
  const description = `${LINE_LABEL[inv.type] || inv.type}${inv.period ? ` — ${inv.period}` : ''}` +
    (inv.overage_sessions ? ` (includes ${inv.overage_sessions} conversation${inv.overage_sessions === 1 ? '' : 's'} over quota)` : '');

  return {
    document_title: Number(inv.tax_rate) > 0 ? 'Sales Tax Invoice' : 'Invoice',
    invoice_number: inv.invoice_number,
    issued_date: inv.issued_date,
    due_date: inv.due_date,
    status: inv.status,
    currency: settings.currency || 'PKR',
    seller: {
      name: settings.company_name,
      address: settings.address || settings.city,
      ntn: settings.ntn || '',
      strn: settings.strn || '',
    },
    buyer: {
      company: client.company,
      contact_name: client.name,
      email: client.email,
      phone: client.phone,
      ntn: inv.client_ntn || '',
      strn: inv.client_strn || '',
      address: inv.billing_address || '',
    },
    lines: [{
      description,
      amount_excluding_tax: net,
      tax_rate: Number(inv.tax_rate),
      tax_amount: Number(inv.tax_amount),
      total,
    }],
    totals: {
      amount_excluding_tax: net,
      tax_rate: Number(inv.tax_rate),
      tax_amount: Number(inv.tax_amount),
      total_payable: total,
    },
    notes: inv.notes || '',
  };
}

module.exports = { createInvoice, billOnActivation, buildTaxInvoice, resolveTaxRate, allocateInvoiceNumber, getSettings, monthLabel, ROUND };
