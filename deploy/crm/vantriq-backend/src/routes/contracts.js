const express = require('express');
const db = require('../db');
const { getSettings } = require('../utils/billing');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

/**
 * Contracts — the signed agreement behind an account.
 *
 * One table, two doors. The Contracts tab lists every contract across all
 * clients; a client's own panel lists theirs. Both are this same endpoint
 * with and without ?client_id=, returning the same shape, so the two views
 * cannot drift apart — which is the point of holding contracts in the system
 * rather than in a folder somebody has to remember to update twice.
 *
 * The counterparty's legal identity is SNAPSHOT onto the contract when it is
 * created, exactly as invoices snapshot theirs. A contract records what was
 * agreed with whom on the day it was signed. If a client re-registers under a
 * new NTN next year, last year's contract must still show the number it was
 * actually signed under — so editing the client record never rewrites it.
 */

const KINDS = ['service', 'msa', 'sow', 'nda', 'amendment', 'renewal', 'other'];
const STATUSES = ['draft', 'sent', 'signed', 'active', 'expired', 'terminated', 'superseded'];
const FREQUENCIES = ['one_off', 'monthly', 'quarterly', 'annual'];

const DAY = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : (d ? String(d).slice(0, 10) : null));

/** Whole days from today until `date`; negative once it is in the past. */
function daysUntil(date) {
  if (!date) return null;
  const end = new Date(`${DAY(date)}T00:00:00Z`).getTime();
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((end - today) / 86400000);
}

/**
 * The status a contract has in fact, as opposed to the one stored on it.
 *
 * A term that ended yesterday is expired whether or not anybody opened the
 * CRM to say so. Deliberate end states are left alone: a contract someone
 * terminated, or one superseded by its replacement, stays that way even
 * though its dates have also passed.
 */
function derivedStatus(c) {
  if (['terminated', 'superseded', 'draft', 'sent'].includes(c.status)) return c.status;
  const left = daysUntil(c.end_date);
  if (c.end_date && left < 0) return 'expired';
  if (c.status === 'signed' && c.start_date && daysUntil(c.start_date) <= 0) return 'active';
  return c.status;
}

/** What the list and the panel both show for one contract. */
function shape(c, clientById) {
  const client = clientById.get(c.client_id) || {};
  const left = daysUntil(c.end_date);
  const status = derivedStatus(c);
  return {
    ...c,
    status,
    stored_status: c.status,
    company: client.company || '',
    contact_name: client.name || '',
    email: client.email || '',
    is_internal: !!client.is_internal,
    // The identity as signed, falling back to the client record only where
    // the contract carries nothing — an older row, or one entered in haste.
    ntn: c.client_ntn || client.ntn || '',
    strn: c.client_strn || client.strn || '',
    legal_name: c.client_legal_name || client.company || '',
    days_remaining: left,
    // "Expiring soon" is the contract's own notice period where it has one,
    // so a 90-day-notice agreement warns three months out rather than when
    // it is already too late to give notice.
    expiring_soon: status === 'active' && left != null && left >= 0
      && left <= Math.max(30, Number(c.notice_days || 0)),
  };
}

async function clientIndex() {
  const { rows } = await db.query(`select id, company, name, email, ntn, strn, billing_address, is_internal from clients`);
  return new Map(rows.map((r) => [r.id, r]));
}

async function allocateNumber(settings, startDate) {
  const { rows } = await db.query(`select nextval('contract_number_seq') as n`);
  const prefix = (settings && settings.invoice_prefix) || 'VAI';
  const year = new Date(startDate || Date.now()).getFullYear();
  return `${prefix}-C-${year}-${String(rows[0].n).padStart(4, '0')}`;
}

/** Everything the body may set. Anything else a caller sends is ignored. */
const FIELDS = [
  'title', 'kind', 'status', 'start_date', 'end_date', 'auto_renew', 'notice_days',
  'value', 'currency', 'billing_frequency', 'signed_date', 'signed_by_client',
  'signed_by_us', 'client_legal_name', 'client_ntn', 'client_strn', 'client_address',
  'document_url', 'scope', 'notes',
];

function validate(body, { partial = false } = {}) {
  if (body.kind !== undefined && !KINDS.includes(body.kind)) {
    return `Contract type must be one of: ${KINDS.join(', ')}.`;
  }
  if (body.status !== undefined && !STATUSES.includes(body.status)) {
    return `Status must be one of: ${STATUSES.join(', ')}.`;
  }
  if (body.billing_frequency !== undefined && !FREQUENCIES.includes(body.billing_frequency)) {
    return `Billing frequency must be one of: ${FREQUENCIES.join(', ')}.`;
  }
  if (body.value !== undefined && body.value !== null && body.value !== ''
      && !(Number.isFinite(Number(body.value)) && Number(body.value) >= 0)) {
    return 'Contract value must be zero or more.';
  }
  if (body.notice_days !== undefined && body.notice_days !== null && body.notice_days !== ''
      && !(Number.isInteger(Number(body.notice_days)) && Number(body.notice_days) >= 0)) {
    return 'Notice period must be a whole number of days.';
  }
  // A term that ends before it starts is a typo, and it would make the whole
  // expiry derivation nonsense.
  const s = DAY(body.start_date), e = DAY(body.end_date);
  if (s && e && e < s) return 'The end date cannot fall before the start date.';
  if (!partial && !String(body.title || '').trim()) return 'Give the contract a title.';
  return null;
}

/** GET /api/contracts[?client_id=&status=&expiring=true] */
router.get('/', async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.client_id) { params.push(req.query.client_id); where.push(`client_id = $${params.length}`); }
  const { rows } = await db.query(
    `select * from contracts ${where.length ? `where ${where.join(' and ')}` : ''}
      order by coalesce(start_date, created_at::date) desc, created_at desc`,
    params
  );
  const byId = await clientIndex();
  let out = rows.map((c) => shape(c, byId));
  if (req.query.status) out = out.filter((c) => c.status === req.query.status);
  if (String(req.query.expiring) === 'true') out = out.filter((c) => c.expiring_soon);
  res.json(out);
});

/** GET /api/contracts/:id */
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(`select * from contracts where id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Contract not found' });
  res.json(shape(rows[0], await clientIndex()));
});

/** POST /api/contracts */
router.post('/', async (req, res) => {
  const body = req.body || {};
  if (!body.client_id) return res.status(400).json({ error: 'client_id is required' });
  const bad = validate(body);
  if (bad) return res.status(400).json({ error: bad });

  const { rows: cr } = await db.query(`select * from clients where id = $1`, [body.client_id]);
  const client = cr[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const settings = await getSettings();
  const number = body.contract_number || await allocateNumber(settings, body.start_date);

  // The identity is taken from the client record at creation and then frozen.
  // A caller may override any of it — the signing entity is not always the
  // account name — but silence means "whatever they are registered as today".
  const pick = (given, fallback) => (given !== undefined && given !== null && given !== '' ? given : (fallback || ''));

  const { rows } = await db.query(
    `insert into contracts
       (client_id, contract_number, title, kind, status, start_date, end_date,
        auto_renew, notice_days, value, currency, billing_frequency,
        signed_date, signed_by_client, signed_by_us,
        client_legal_name, client_ntn, client_strn, client_address,
        document_url, scope, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     returning *`,
    [
      client.id, number, String(body.title || '').trim(),
      body.kind || 'service', body.status || 'draft',
      DAY(body.start_date), DAY(body.end_date),
      !!body.auto_renew, Number(body.notice_days || 0),
      Number(body.value || 0),
      body.currency || (client.is_internal ? 'USD' : (settings.currency || 'PKR')),
      body.billing_frequency || 'monthly',
      DAY(body.signed_date), body.signed_by_client || '', body.signed_by_us || '',
      pick(body.client_legal_name, client.company),
      pick(body.client_ntn, client.ntn),
      pick(body.client_strn, client.strn),
      pick(body.client_address, client.billing_address),
      body.document_url || '', body.scope || '', body.notes || '',
      (req.user && req.user.email) || (req.user && req.user.name) || '',
    ]
  );
  res.status(201).json(shape(rows[0], await clientIndex()));
});

/** PATCH /api/contracts/:id */
router.patch('/:id', async (req, res) => {
  const body = req.body || {};
  const bad = validate(body, { partial: true });
  if (bad) return res.status(400).json({ error: bad });

  const { rows: existing } = await db.query(`select * from contracts where id = $1`, [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Contract not found' });

  // Validate the term against what the row will hold after the patch, not
  // just what this request carries — moving only the start date past a stored
  // end date is the same typo, arriving one field at a time.
  const after = { ...existing[0], ...body };
  if (DAY(after.start_date) && DAY(after.end_date) && DAY(after.end_date) < DAY(after.start_date)) {
    return res.status(400).json({ error: 'The end date cannot fall before the start date.' });
  }

  const sets = [];
  const params = [];
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    params.push(['start_date', 'end_date', 'signed_date'].includes(f) ? DAY(body[f])
      : f === 'auto_renew' ? !!body[f]
      : ['value', 'notice_days'].includes(f) ? Number(body[f] || 0)
      : body[f]);
    sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id);
  const { rows } = await db.query(
    `update contracts set ${sets.join(', ')} where id = $${params.length} returning *`, params
  );
  res.json(shape(rows[0], await clientIndex()));
});

/**
 * POST /api/contracts/:id/supersede — a renewal that replaces this one.
 *
 * Copies the terms forward, points the old contract at the new one and marks
 * it superseded. Done as one step because doing it by hand means three edits
 * and a chance to forget the third, leaving two contracts both reading active.
 */
router.post('/:id/supersede', async (req, res) => {
  const body = req.body || {};
  const { rows: old } = await db.query(`select * from contracts where id = $1`, [req.params.id]);
  const prev = old[0];
  if (!prev) return res.status(404).json({ error: 'Contract not found' });
  if (prev.superseded_by) return res.status(409).json({ error: 'This contract has already been replaced.' });

  const settings = await getSettings();
  const start = DAY(body.start_date) || DAY(prev.end_date) || new Date().toISOString().slice(0, 10);
  const number = await allocateNumber(settings, start);

  const { rows } = await db.query(
    `insert into contracts
       (client_id, contract_number, title, kind, status, start_date, end_date,
        auto_renew, notice_days, value, currency, billing_frequency,
        client_legal_name, client_ntn, client_strn, client_address, scope, notes, created_by)
     select client_id, $2, coalesce($3, title), 'renewal', 'draft', $4, $5,
            auto_renew, notice_days, coalesce($6, value), currency, billing_frequency,
            client_legal_name, client_ntn, client_strn, client_address, scope, notes, $7
       from contracts where id = $1 returning *`,
    [
      prev.id, number, body.title || null, start, DAY(body.end_date),
      body.value !== undefined ? Number(body.value) : null,
      (req.user && req.user.email) || '',
    ]
  );
  await db.query(`update contracts set status = 'superseded', superseded_by = $2 where id = $1`,
    [prev.id, rows[0].id]);
  res.status(201).json(shape(rows[0], await clientIndex()));
});

/** DELETE /api/contracts/:id */
router.delete('/:id', blockAutomation, async (req, res) => {
  const { rowCount } = await db.query(`delete from contracts where id = $1`, [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Contract not found' });
  res.json({ ok: true });
});

module.exports = router;
module.exports.KINDS = KINDS;
module.exports.STATUSES = STATUSES;
module.exports.FREQUENCIES = FREQUENCIES;
