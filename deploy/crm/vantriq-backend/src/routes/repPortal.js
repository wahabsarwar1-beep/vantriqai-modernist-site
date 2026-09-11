const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const router = express.Router();

const SALES_STAGES = ['qualification', 'needs_assessment', 'proposal_submission', 'negotiation', 'closure'];
const STAGE_LABEL = {
  qualification: 'Qualification', needs_assessment: 'Needs Assessment',
  proposal_submission: 'Proposal Submission', negotiation: 'Negotiation', closure: 'Closure',
};
const LEAD_FIELDS = ['name', 'company', 'email', 'phone', 'product_id', 'est_value', 'source', 'notes'];

function shapeLead(row) {
  return {
    id: row.id, name: row.name, company: row.company, email: row.email, phone: row.phone,
    productId: row.product_id, productName: row.product_name || null,
    estValue: +row.est_value || 0, source: row.source, notes: row.notes,
    salesStage: row.sales_stage, closeOutcome: row.close_outcome,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

// Everything below is implicitly scoped to req.rep.id — a rep can never
// pass another rep's client id and see/change it, because every query
// filters on owner_rep_id = req.rep.id in the WHERE clause itself.

router.get('/leads', async (req, res) => {
  const { rows } = await db.query(
    `select c.*, p.name as product_name from clients c
     left join products p on p.id = c.product_id
     where c.owner_rep_id = $1
     order by c.created_at desc`,
    [req.rep.id]
  );
  res.json(rows.map(shapeLead));
});

// Read-only, trimmed product list for the "which package is this lead interested in"
// dropdown — name/tier only, no cost/margin/delivery-cost fields, which stay admin-only.
router.get('/products', async (req, res) => {
  const { rows } = await db.query(
    `select id, name, target_tier, setup_fee, retainer from products where archived = false order by sort_order asc`
  );
  res.json(rows);
});

router.post('/leads', async (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.company) return res.status(400).json({ error: 'name and company are required' });
  const cols = LEAD_FIELDS.filter((f) => body[f] !== undefined);
  const values = cols.map((c) => body[c]);
  const placeholders = cols.map((_, i) => `$${i + 3}`);
  const { rows } = await db.query(
    `insert into clients (owner_rep_id, sales_stage, stage, ${cols.join(',')})
     values ($1, $2, 'lead', ${placeholders.join(',')})
     returning *`,
    [req.rep.id, 'qualification', ...values]
  );
  const full = await db.query(`select c.*, p.name as product_name from clients c left join products p on p.id=c.product_id where c.id=$1`, [rows[0].id]);
  res.status(201).json(shapeLead(full.rows[0]));
});

router.put('/leads/:id', async (req, res) => {
  const body = req.body || {};
  const cols = LEAD_FIELDS.filter((f) => body[f] !== undefined);

  // Stage progression and close outcome are handled explicitly (with validation),
  // not folded into the generic field list, since moving to "closure" has side effects.
  if (body.salesStage !== undefined) {
    if (!SALES_STAGES.includes(body.salesStage)) return res.status(400).json({ error: 'Invalid sales stage' });
    cols.push('sales_stage');
    body.sales_stage = body.salesStage;
  }
  if (body.closeOutcome !== undefined) {
    if (!['won', 'lost', null].includes(body.closeOutcome)) return res.status(400).json({ error: 'closeOutcome must be won, lost, or null' });
    cols.push('close_outcome');
    body.close_outcome = body.closeOutcome;
  }

  if (cols.length === 0) return res.status(400).json({ error: 'No fields to update' });

  // Ownership check happens in the WHERE clause itself — a rep literally
  // cannot construct a query that touches a lead they don't own.
  const setClause = cols.map((c, i) => `${c} = $${i + 3}`).join(', ');
  const values = cols.map((c) => body[c]);
  const { rows } = await db.query(
    `update clients set ${setClause} where id = $1 and owner_rep_id = $2 returning *`,
    [req.params.id, req.rep.id, ...values]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Lead not found' });

  // Closure reached — reflect the outcome on the main pipeline stage so
  // admins see it without needing to know about sales_stage at all.
  if (rows[0].sales_stage === 'closure' && rows[0].close_outcome) {
    const newMainStage = rows[0].close_outcome === 'won'
      ? (rows[0].product_id ? 'active' : 'negotiation')
      : 'lost';
    await db.query(`update clients set stage = $2 where id = $1`, [rows[0].id, newMainStage]);
  }

  const full = await db.query(`select c.*, p.name as product_name from clients c left join products p on p.id=c.product_id where c.id=$1`, [req.params.id]);
  res.json(shapeLead(full.rows[0]));
});

router.get('/summary', async (req, res) => {
  const { rows: leads } = await db.query(`select * from clients where owner_rep_id = $1`, [req.rep.id]);
  const byStage = {};
  SALES_STAGES.forEach((s) => { byStage[s] = { count: 0, value: 0 }; });
  let wonCount = 0, wonValue = 0, lostCount = 0, openValue = 0;
  leads.forEach((l) => {
    const stage = l.sales_stage || 'qualification';
    if (byStage[stage]) { byStage[stage].count++; byStage[stage].value += Number(l.est_value || 0); }
    if (stage === 'closure' && l.close_outcome === 'won') { wonCount++; wonValue += Number(l.est_value || 0); }
    else if (stage === 'closure' && l.close_outcome === 'lost') { lostCount++; }
    else { openValue += Number(l.est_value || 0); }
  });
  const closedCount = wonCount + lostCount;
  res.json({
    rep: { name: req.rep.name, email: req.rep.email },
    total_leads: leads.length,
    open_pipeline_value: openValue,
    by_stage: SALES_STAGES.map((s) => ({ stage: s, label: STAGE_LABEL[s], ...byStage[s] })),
    won_count: wonCount, won_value: wonValue, lost_count: lostCount,
    win_rate: closedCount > 0 ? (wonCount / closedCount) * 100 : null,
  });
});

router.get('/export', async (req, res) => {
  const { rows } = await db.query(
    `select c.*, p.name as product_name from clients c left join products p on p.id=c.product_id
     where c.owner_rep_id = $1 order by c.created_at desc`,
    [req.rep.id]
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Vantriq Ops';
  wb.created = new Date();
  const sheet = wb.addWorksheet('My Pipeline');

  sheet.columns = [
    { header: 'Lead', key: 'name', width: 22 },
    { header: 'Company', key: 'company', width: 24 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Package interest', key: 'product', width: 16 },
    { header: 'Stage', key: 'stage', width: 20 },
    { header: 'Outcome', key: 'outcome', width: 10 },
    { header: 'Est. value (PKR/mo)', key: 'value', width: 18 },
    { header: 'Source', key: 'source', width: 18 },
    { header: 'Notes', key: 'notes', width: 40 },
    { header: 'Created', key: 'created', width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12897A' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

  rows.forEach((r) => {
    sheet.addRow({
      name: r.name, company: r.company, email: r.email, phone: r.phone,
      product: r.product_name || '—',
      stage: STAGE_LABEL[r.sales_stage] || r.sales_stage || 'Qualification',
      outcome: r.close_outcome || '—',
      value: Number(r.est_value || 0),
      source: r.source, notes: r.notes,
      created: r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '',
    });
  });
  sheet.getColumn('value').numFmt = '#,##0';
  sheet.autoFilter = { from: 'A1', to: 'K1' };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${req.rep.name.replace(/\s+/g, '-')}-pipeline-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

module.exports = router;
