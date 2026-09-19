const express = require('express');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const db = require('../db');
const { settlementOf } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Taking old invoices out of the working set.
 *
 * The CRM keeps a rolling window live — twelve months by default — and
 * everything older can be downloaded as one workbook and then removed, so
 * the database it queries on every page load stops growing forever.
 *
 * Deleting financial rows is the most destructive thing here, so two things
 * are true by construction rather than by care:
 *
 *   YOU CANNOT PURGE WHAT YOU HAVE NOT DOWNLOADED. Preparing the archive
 *   records the SHA-256 of the exact bytes sent to the browser. A purge must
 *   quote that hash back. No download means no hash to quote.
 *
 *   THE BOOKS DO NOT MOVE. Every statement is derived from invoice and
 *   payment rows, so deleting them would restate the balance sheet, the P&L
 *   and the FBR position. The purge writes each affected month's totals into
 *   archived_month_totals in the SAME TRANSACTION that deletes the rows, and
 *   the accounting reads them back. The figures survive; the detail moves
 *   into the file you keep.
 *
 * This is not a licence to destroy records — they still have to be retained
 * for the statutory period. It moves them out of the database into a file.
 */

const MONEY = '#,##0.00';
const DATE = 'yyyy-mm-dd';
const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Twelve months back from today, to the first of that month. */
function defaultCutoff(months = 12) {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - Number(months));
  return `${d.toISOString().slice(0, 7)}-01`;
}

function resolveCutoff(q) {
  if (q.before) {
    const c = DAY(q.before);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c)) return null;
    return c;
  }
  const months = q.months === undefined ? 12 : Number(q.months);
  // Zero months would mean "archive everything including this month", which
  // is never what anybody means and empties the live set in one click.
  if (!Number.isFinite(months) || months < 1 || months > 240) return null;
  return defaultCutoff(months);
}

/** Everything in scope for one cutoff, loaded once and reused. */
async function scope(cutoff) {
  const { rows: invoices } = await db.query(
    `select i.*, c.company, c.name as contact_name, c.is_internal
       from invoices i join clients c on c.id = i.client_id
      where i.issued_date < $1::date
      order by i.issued_date, i.invoice_number`,
    [cutoff]
  );
  const ids = invoices.map((i) => i.id);
  const [{ rows: lines }, { rows: payments }] = await Promise.all([
    ids.length ? db.query(
      `select l.*, i.invoice_number from invoice_lines l join invoices i on i.id = l.invoice_id
        where l.invoice_id = any($1::uuid[]) order by i.invoice_number, l.position`, [ids]
    ) : Promise.resolve({ rows: [] }),
    ids.length ? db.query(
      `select p.*, i.invoice_number, c.company from payments p
         left join invoices i on i.id = p.invoice_id
         left join clients c on c.id = p.client_id
        where p.invoice_id = any($1::uuid[]) order by p.received_date`, [ids]
    ) : Promise.resolve({ rows: [] }),
  ]);
  return { invoices, lines, payments };
}

/**
 * The month-by-month totals the books will need once the rows are gone.
 *
 * These mirror exactly what computeBalanceSheet and computePnl derive from
 * invoice and payment rows. Void invoices are excluded here for the same
 * reason the statements exclude them — they never counted.
 */
function monthTotals({ invoices, payments }) {
  const months = new Map();
  const at = (d) => {
    const m = `${DAY(d).slice(0, 7)}-01`;
    if (!months.has(m)) {
      months.set(m, { month: m, invoice_count: 0, revenue: 0, billed_net: 0, gst_charged: 0,
        ait_withheld: 0, receipts: 0, written_off: 0, credited: 0, internal_cost: 0 });
    }
    return months.get(m);
  };
  const byId = new Map(invoices.map((i) => [i.id, i]));

  for (const i of invoices) {
    if (i.status === 'void') continue;
    const t = at(i.issued_date);
    t.invoice_count += 1;
    if (i.is_internal) {
      // Our own account is cost in the books' currency, never revenue. An
      // invoice with no stamped rate contributes nothing rather than a guess,
      // exactly as the live figures treat it.
      t.internal_cost += i.base_amount != null ? Number(i.base_amount) : 0;
      continue;
    }
    t.revenue += Number(i.amount || 0);
    t.billed_net += Number(i.net_payable != null ? i.net_payable : (i.total_amount || i.amount || 0));
    t.gst_charged += Number(i.tax_amount || 0);
    t.ait_withheld += Number(i.ait_amount || 0);
  }

  // A receipt belongs to the month it was RECEIVED, which is not always the
  // month the invoice was issued. The balance sheet nets receipts against
  // billings cumulatively, so putting them in the wrong month would still
  // balance — but the P&L for a single month would not.
  for (const p of payments) {
    const inv = byId.get(p.invoice_id);
    if (inv && inv.is_internal) continue;
    const t = at(p.received_date || (inv && inv.issued_date));
    if (p.kind === 'receipt') t.receipts += Number(p.amount || 0);
    else if (p.kind === 'write_off') t.written_off += Number(p.amount || 0);
    else if (p.kind === 'credit_note') t.credited += Number(p.amount || 0);
  }

  const R = (n) => Math.round(Number(n || 0) * 100) / 100;
  return [...months.values()]
    .map((t) => ({ ...t, revenue: R(t.revenue), billed_net: R(t.billed_net), gst_charged: R(t.gst_charged),
      ait_withheld: R(t.ait_withheld), receipts: R(t.receipts), written_off: R(t.written_off),
      credited: R(t.credited), internal_cost: R(t.internal_cost) }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

function summarise(cutoff, s) {
  const dates = s.invoices.map((i) => DAY(i.issued_date)).sort();
  return {
    cutoff_date: cutoff,
    invoice_count: s.invoices.length,
    line_count: s.lines.length,
    payment_count: s.payments.length,
    earliest_issued: dates[0] || null,
    latest_issued: dates[dates.length - 1] || null,
    months: monthTotals(s),
  };
}

/** GET /api/archive — what is live, what has been archived, and past runs. */
router.get('/', async (req, res) => {
  const [{ rows: runs }, { rows: live }, { rows: archived }] = await Promise.all([
    db.query(`select * from archive_runs order by prepared_at desc limit 20`),
    db.query(`select count(*)::int as n, min(issued_date) as earliest, max(issued_date) as latest from invoices`),
    db.query(`select count(*)::int as n, min(month) as earliest, max(month) as latest,
                     coalesce(sum(invoice_count),0)::int as invoices from archived_month_totals`),
  ]);
  const cutoff = defaultCutoff(12);
  const { rows: older } = await db.query(
    `select count(*)::int as n from invoices where issued_date < $1::date`, [cutoff]
  );
  res.json({
    retention_months: 12,
    cutoff_if_run_today: cutoff,
    live: live[0],
    older_than_window: older[0].n,
    archived: archived[0],
    runs,
  });
});

/** GET /api/archive/preview?months=12 — what a run would take, and nothing else. */
router.get('/preview', async (req, res) => {
  const cutoff = resolveCutoff(req.query);
  if (!cutoff) return res.status(400).json({ error: 'Give either ?before=YYYY-MM-DD or ?months= between 1 and 240.' });
  const s = await scope(cutoff);
  res.json(summarise(cutoff, s));
});

/**
 * GET /api/archive/download?months=12
 *
 * The workbook, and the run that a purge will have to name. The hash is of
 * the exact bytes sent, so the file on disk can be checked against it later.
 */
router.get('/download', async (req, res) => {
  const cutoff = resolveCutoff(req.query);
  if (!cutoff) return res.status(400).json({ error: 'Give either ?before=YYYY-MM-DD or ?months= between 1 and 240.' });
  const s = await scope(cutoff);
  if (!s.invoices.length) {
    return res.status(404).json({ error: `Nothing was issued before ${cutoff}. There is nothing to archive.` });
  }
  const sum = summarise(cutoff, s);
  const { rows: settingsRows } = await db.query(`select * from settings where id = 1`);
  const settings = settingsRows[0] || {};

  const ledger = new Map();
  for (const p of s.payments) {
    if (!ledger.has(p.invoice_id)) ledger.set(p.invoice_id, []);
    ledger.get(p.invoice_id).push(p);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = settings.company_name || 'Vantriq AI';
  wb.created = new Date();

  const sheet = (name, cols, rows) => {
    const ws = wb.addWorksheet(name);
    ws.columns = cols.map((c) => ({ header: c.h, key: c.k, width: c.w || 16,
      style: c.money ? { numFmt: MONEY } : c.date ? { numFmt: DATE } : undefined }));
    for (const r of rows) {
      const o = {};
      for (const c of cols) {
        const v = c.v ? c.v(r) : r[c.k];
        o[c.k] = v === null || v === undefined ? '' : (v === true ? 'Yes' : v === false ? 'No' : v);
      }
      ws.addRow(o);
    }
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111111' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  };

  // Read me first: what this file is and what it replaces.
  sheet('About this archive', [{ h: 'Field', k: 'f', w: 34 }, { h: 'Value', k: 'v', w: 60 }], [
    { f: 'Archive of', v: settings.company_name || 'Vantriq AI' },
    { f: 'Everything issued before', v: cutoff },
    { f: 'Oldest invoice', v: sum.earliest_issued || '—' },
    { f: 'Newest invoice', v: sum.latest_issued || '—' },
    { f: 'Invoices', v: sum.invoice_count },
    { f: 'Invoice lines', v: sum.line_count },
    { f: 'Ledger entries', v: sum.payment_count },
    { f: 'Prepared', v: new Date().toISOString() },
    { f: '', v: '' },
    { f: 'What happens when this is purged',
      v: 'These rows leave the CRM. The monthly totals on the next sheet stay in it, so the balance sheet, the P&L and the FBR position do not change — only the line-by-line detail moves here.' },
    { f: 'Keep this file',
      v: 'Tax records must be retained for the statutory period. This is the record; the CRM will no longer hold it.' },
  ]);

  // The figures the CRM keeps. Anyone reconciling starts here.
  sheet('Monthly totals kept in CRM', [
    { h: 'Month', k: 'month', w: 12 }, { h: 'Invoices', k: 'invoice_count', w: 10 },
    { h: 'Revenue (ex-GST)', k: 'revenue', money: true, w: 18 },
    { h: 'Net billed', k: 'billed_net', money: true, w: 16 },
    { h: 'GST charged', k: 'gst_charged', money: true, w: 14 },
    { h: 'AIT withheld', k: 'ait_withheld', money: true, w: 14 },
    { h: 'Received', k: 'receipts', money: true, w: 14 },
    { h: 'Written off', k: 'written_off', money: true, w: 14 },
    { h: 'Credit notes', k: 'credited', money: true, w: 14 },
    { h: 'Our own AI cost', k: 'internal_cost', money: true, w: 16 },
  ], sum.months);

  sheet('Invoices', [
    { h: 'Invoice #', k: 'invoice_number', w: 20 },
    { h: 'Company (as billed)', k: 'client_legal_name', w: 28, v: (i) => i.client_legal_name || i.company },
    { h: 'Account now', k: 'company', w: 26 },
    { h: 'Internal', k: 'is_internal', w: 10 },
    { h: 'Type', k: 'type', w: 12 }, { h: 'Period', k: 'period', w: 14 },
    { h: 'Status', k: 'status', w: 11 },
    { h: 'Issued', k: 'issued_date', date: true }, { h: 'Due', k: 'due_date', date: true },
    { h: 'Currency', k: 'currency', w: 10 },
    { h: 'Subtotal', k: 'amount', money: true }, { h: 'GST %', k: 'tax_rate', w: 9 },
    { h: 'GST', k: 'tax_amount', money: true }, { h: 'Total', k: 'total_amount', money: true },
    { h: 'AIT %', k: 'ait_rate', w: 9 }, { h: 'AIT', k: 'ait_amount', money: true },
    { h: 'Net payable', k: 'net_payable', money: true },
    { h: 'Received', k: 'received', money: true, v: (i) => settlementOf(i, ledger.get(i.id)).received },
    { h: 'Outstanding', k: 'balance', money: true, v: (i) => settlementOf(i, ledger.get(i.id)).balance },
    { h: 'FX rate', k: 'fx_rate', w: 10 }, { h: 'Value in books', k: 'base_amount', money: true },
    { h: 'Jurisdiction', k: 'tax_jurisdiction', w: 12 },
    { h: 'Our reg. no', k: 'seller_reg_no', w: 20 },
    { h: 'Buyer NTN', k: 'client_ntn', w: 16 }, { h: 'Buyer STRN', k: 'client_strn', w: 20 },
    { h: 'Billing address', k: 'billing_address', w: 30 },
    { h: 'Notes', k: 'notes', w: 30 },
  ], s.invoices);

  sheet('Invoice lines', [
    { h: 'Invoice #', k: 'invoice_number', w: 20 }, { h: '#', k: 'position', w: 6 },
    { h: 'Description', k: 'description', w: 40 }, { h: 'Detail', k: 'detail', w: 30 },
    { h: 'Qty', k: 'qty', w: 12 }, { h: 'Unit price', k: 'unit_price', money: true },
    { h: 'Amount', k: 'amount', money: true },
  ], s.lines);

  sheet('Ledger', [
    { h: 'Invoice #', k: 'invoice_number', w: 20 }, { h: 'Company', k: 'company', w: 26 },
    { h: 'Kind', k: 'kind', w: 14 }, { h: 'Amount', k: 'amount', money: true },
    { h: 'Received', k: 'received_date', date: true },
    { h: 'Method', k: 'method', w: 16 }, { h: 'Reference', k: 'reference', w: 24 },
    { h: 'Note', k: 'note', w: 30 },
  ], s.payments);

  // Buffered, not streamed: the hash has to be of the exact bytes that leave
  // here, and a purge later checks the file against it.
  const buf = await wb.xlsx.writeBuffer();
  const body = Buffer.from(buf);
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const filename = `${(settings.company_name || 'vantriq').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-archive-before-${cutoff}.xlsx`;

  await db.query(
    `insert into archive_runs
       (cutoff_date, status, archive_sha256, archive_filename, archive_bytes,
        invoice_count, line_count, payment_count, earliest_issued, latest_issued, prepared_by)
     values ($1,'prepared',$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [cutoff, sha, filename, body.length, sum.invoice_count, sum.line_count, sum.payment_count,
     sum.earliest_issued, sum.latest_issued, (req.user && req.user.email) || '']
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  // So the caller can check what it received against what a purge will demand.
  res.setHeader('X-Archive-Sha256', sha);
  res.setHeader('X-Archive-Cutoff', cutoff);
  res.send(body);
});

/**
 * POST /api/archive/purge  { sha256, confirm: 'PURGE' }
 *
 * Deletes exactly what the matching archive run covered, after writing its
 * monthly totals into the books. One transaction: either the rows are gone
 * and the totals are recorded, or neither happened.
 */
router.post('/purge', blockAutomation, async (req, res) => {
  const b = req.body || {};
  const sha = String(b.sha256 || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha)) {
    return res.status(400).json({
      error: 'A purge needs the SHA-256 of the archive you downloaded. Download the archive first — the CRM will not delete anything you do not already hold a copy of.',
    });
  }
  if (b.confirm !== 'PURGE') {
    return res.status(400).json({ error: 'Send confirm: "PURGE" to go ahead.' });
  }

  const { rows: runs } = await db.query(
    `select * from archive_runs where archive_sha256 = $1 and status = 'prepared'
      order by prepared_at desc limit 1`, [sha]
  );
  const run = runs[0];
  if (!run) {
    return res.status(404).json({
      error: 'No archive waiting to be purged matches that hash. Download the archive again and use the hash it returns.',
    });
  }

  const cutoff = DAY(run.cutoff_date);

  // One transaction. Recording the totals and deleting the rows must both
  // happen or neither: totals without a delete double-counts every figure,
  // and a delete without totals silently restates the balance sheet.
  const conn = await db.pool.connect();
  try {
    await conn.query('begin');
    // Re-read inside the transaction. The preview could be minutes old, and
    // an invoice raised or back-dated since must be counted, not missed.
    const { rows: invoices } = await conn.query(
      `select i.*, c.is_internal from invoices i join clients c on c.id = i.client_id
        where i.issued_date < $1::date for update`, [cutoff]
    );
    const ids = invoices.map((i) => i.id);
    if (!ids.length) {
      await conn.query('rollback');
      return res.status(409).json({ error: 'There is nothing left in that range — it may already have been purged.' });
    }
    const { rows: payments } = await conn.query(
      `select * from payments where invoice_id = any($1::uuid[])`, [ids]
    );

    const totals = monthTotals({ invoices, payments });
    for (const t of totals) {
      await conn.query(
        `insert into archived_month_totals
           (archive_run_id, month, invoice_count, revenue, billed_net, gst_charged,
            ait_withheld, receipts, written_off, credited, internal_cost)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [run.id, t.month, t.invoice_count, t.revenue, t.billed_net, t.gst_charged,
         t.ait_withheld, t.receipts, t.written_off, t.credited, t.internal_cost]
      );
    }

    // invoice_lines and payments cascade from invoices, but deleting them
    // explicitly keeps this readable and independent of the schema's ON
    // DELETE clauses staying as they are.
    const { rowCount: delPay } = await conn.query(`delete from payments where invoice_id = any($1::uuid[])`, [ids]);
    const { rowCount: delLines } = await conn.query(`delete from invoice_lines where invoice_id = any($1::uuid[])`, [ids]);
    await conn.query(`delete from invoice_reminders where invoice_id = any($1::uuid[])`, [ids]).catch(() => {});
    await conn.query(`update bank_credits set matched_invoice_id = null where matched_invoice_id = any($1::uuid[])`, [ids]).catch(() => {});
    await conn.query(`update quotes set invoice_id = null where invoice_id = any($1::uuid[])`, [ids]).catch(() => {});
    const { rowCount: delInv } = await conn.query(`delete from invoices where id = any($1::uuid[])`, [ids]);

    await conn.query(
      `update archive_runs set status = 'purged', purged_at = now(), purged_by = $2 where id = $1`,
      [run.id, (req.user && req.user.email) || '']
    );
    await conn.query('commit');

    res.json({
      ok: true,
      cutoff_date: cutoff,
      invoices_removed: delInv,
      lines_removed: delLines,
      ledger_entries_removed: delPay,
      months_carried_forward: totals.length,
      note: 'The monthly totals stay in the books, so the balance sheet and the P&L are unchanged. The line detail is in the workbook you downloaded.',
    });
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    res.status(500).json({ error: `Nothing was deleted: ${err.message}` });
  } finally {
    conn.release();
  }
});

module.exports = router;
module.exports.monthTotals = monthTotals;
module.exports.defaultCutoff = defaultCutoff;
module.exports.resolveCutoff = resolveCutoff;
