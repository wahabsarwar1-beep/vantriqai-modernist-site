const db = require('./../db');
const { settlementOf, derivedStatus, ROUND } = require('./billing');

/**
 * Matching money that has arrived to the invoice it was meant for.
 *
 * Bank statements are not built for this. A credit line gives you a date, an
 * amount, whatever the payer typed in the reference field, and sometimes a
 * name. So the matching runs in order of how sure it can be, and stops at the
 * first rule that gives exactly one answer:
 *
 *   1. The invoice number appears in the reference. Unambiguous.
 *   2. The amount matches exactly one open invoice's outstanding balance.
 *   3. The payer's name identifies one client, and the amount matches one of
 *      that client's open invoices.
 *
 * Anything else is left alone for a person to decide. A wrong automatic match
 * is worse than no match: it tells a customer they have paid when they have
 * not, and hides a real debt.
 */

const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Every invoice with something still on it, with its balance worked out. */
async function openInvoices() {
  const { rows } = await db.query(
    `select i.*, c.company, c.is_internal from invoices i
       join clients c on c.id = i.client_id
      where i.status not in ('paid','void') and c.is_internal = false`
  );
  const ids = rows.map((r) => r.id);
  const pays = ids.length
    ? (await db.query(`select * from payments where invoice_id = any($1::uuid[])`, [ids])).rows
    : [];
  const by = new Map();
  for (const p of pays) {
    if (!by.has(p.invoice_id)) by.set(p.invoice_id, []);
    by.get(p.invoice_id).push(p);
  }
  return rows
    .map((r) => ({ ...r, settlement: settlementOf(r, by.get(r.id)) }))
    .filter((r) => r.settlement.balance > 0.009);
}

/** Decides what one credit line belongs to. Returns null when it cannot tell. */
function matchOne(credit, invoices, clients) {
  const ref = norm(credit.reference);
  const amount = ROUND(credit.amount);

  if (ref) {
    const byNumber = invoices.filter((i) => i.invoice_number && ref.includes(norm(i.invoice_number)));
    if (byNumber.length === 1) {
      return { invoice: byNumber[0], confidence: `Invoice number ${byNumber[0].invoice_number} found in the payment reference.` };
    }
  }

  const byAmount = invoices.filter((i) => Math.abs(i.settlement.balance - amount) < 0.01);
  if (byAmount.length === 1) {
    return { invoice: byAmount[0], confidence: `Exactly one open invoice is outstanding for this amount (${byAmount[0].invoice_number}).` };
  }

  const payer = norm(credit.payer);
  if (payer) {
    const client = clients.find((c) => payer.includes(norm(c.company)) || norm(c.company).includes(payer));
    if (client) {
      const theirs = byAmount.length ? byAmount : invoices.filter((i) => i.client_id === client.id);
      const hit = theirs.filter((i) => i.client_id === client.id && Math.abs(i.settlement.balance - amount) < 0.01);
      if (hit.length === 1) {
        return { invoice: hit[0], confidence: `Payer "${credit.payer}" matches ${client.company}, and the amount matches ${hit[0].invoice_number}.` };
      }
    }
  }
  return null;
}

/**
 * Imports statement lines and matches what it can.
 *
 * bank_ref is the bank's own id for the line; where it is given, importing
 * the same statement twice cannot credit anybody twice. Where it is not,
 * duplicates are the importer's problem — so the response says how many were
 * skipped as already seen.
 */
async function importCredits(rows, { autoPost = true, recordedBy = '' } = {}) {
  const invoices = await openInvoices();
  const { rows: clients } = await db.query(`select id, company from clients where is_internal = false`);

  const imported = [];
  let duplicates = 0;

  for (const raw of rows) {
    const credit = {
      received_date: raw.received_date ? DAY(raw.received_date) : DAY(new Date()),
      amount: ROUND(raw.amount),
      reference: String(raw.reference || '').slice(0, 300),
      payer: String(raw.payer || '').slice(0, 200),
      bank_ref: raw.bank_ref ? String(raw.bank_ref).slice(0, 200) : null,
    };
    if (!(credit.amount > 0)) continue;

    const { rows: ins } = await db.query(
      `insert into bank_credits (received_date, amount, reference, payer, bank_ref, raw)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (bank_ref) where bank_ref is not null do nothing
       returning *`,
      [credit.received_date, credit.amount, credit.reference, credit.payer, credit.bank_ref, JSON.stringify(raw)]
    );
    if (!ins[0]) { duplicates += 1; continue; }
    let row = ins[0];

    const hit = matchOne(credit, invoices, clients);
    if (hit && autoPost) {
      // Never post more than is outstanding: a customer who overpays gets a
      // part-posting and the remainder stays on the statement for a person.
      const post = Math.min(credit.amount, hit.invoice.settlement.balance);
      const { rows: payRows } = await db.query(
        `insert into payments (invoice_id, client_id, amount, kind, method, reference, received_date, notes, recorded_by)
         values ($1,$2,$3,'receipt','Bank transfer',$4,$5,$6,$7) returning *`,
        [
          hit.invoice.id, hit.invoice.client_id, ROUND(post), credit.reference,
          credit.received_date, `Auto-matched from the bank statement. ${hit.confidence}`,
          recordedBy || 'auto-reconciliation',
        ]
      );
      row = (await db.query(
        `update bank_credits set status='matched', matched_invoice_id=$2, matched_payment_id=$3, match_confidence=$4
          where id = $1 returning *`,
        [row.id, hit.invoice.id, payRows[0].id, hit.confidence]
      )).rows[0];

      // Restate the invoice, and take it out of the pool so the next credit
      // in the same import cannot be matched to it again.
      await restate(hit.invoice.id);
      hit.invoice.settlement.balance = ROUND(hit.invoice.settlement.balance - post);
      if (hit.invoice.settlement.balance <= 0.009) {
        const i = invoices.indexOf(hit.invoice);
        if (i > -1) invoices.splice(i, 1);
      }
      imported.push({ ...row, matched_to: hit.invoice.invoice_number, company: hit.invoice.company });
    } else {
      imported.push({ ...row, matched_to: null, suggestion: hit ? hit.invoice.invoice_number : null });
    }
  }

  return {
    imported: imported.length,
    matched: imported.filter((r) => r.status === 'matched').length,
    unmatched: imported.filter((r) => r.status !== 'matched').length,
    duplicates,
    credits: imported,
  };
}

/** Rewrites one invoice's status from its ledger. */
async function restate(invoiceId) {
  const [{ rows: inv }, { rows: pays }] = await Promise.all([
    db.query(`select * from invoices where id = $1`, [invoiceId]),
    db.query(`select * from payments where invoice_id = $1`, [invoiceId]),
  ]);
  if (!inv[0]) return null;
  const status = derivedStatus(inv[0], settlementOf(inv[0], pays));
  if (status !== inv[0].status) {
    await db.query(`update invoices set status = $2 where id = $1`, [invoiceId, status]);
  }
  return status;
}

module.exports = { importCredits, matchOne, openInvoices, restate };
