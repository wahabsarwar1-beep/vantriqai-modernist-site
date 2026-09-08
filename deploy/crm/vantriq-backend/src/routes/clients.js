const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, generatePassword } = require('../utils/password');
const { billOnActivation } = require('../utils/billing');
const { quotaStatus } = require('../utils/quota');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router();

const FIELDS = [
  'name','company','email','phone','external_ref','product_id','stage',
  'est_value','source','notes','join_date',
  // v4 — group structure and the tax details an FBR invoice has to carry.
  'parent_client_id','ntn','strn','tax_rate','billing_address'
];

// Per-client package overrides. Only accepted when the client's package is
// the non-standard tier (Enterprise+); rejected otherwise.
const CUSTOM_FIELDS = [
  'custom_setup_fee','custom_retainer','custom_quota','custom_overage_rate',
  'custom_msgs_per_session','custom_automation','custom_data_layer',
  'custom_ai_model','custom_channels'
];

// Everything except notes must be filled in. Kept in one place so the API and
// the CRM form can't drift apart.
const REQUIRED_FIELDS = [
  ['name', 'Contact name'], ['company', 'Company'], ['email', 'Email'],
  ['phone', 'Phone'], ['product_id', 'Package'], ['stage', 'Stage'],
  ['est_value', 'Estimated deal value'], ['source', 'Source'],
  ['external_ref', 'WhatsApp number / external ref'],
];

// The client lifecycle, in order. A deal may only ever advance one step.
const FORWARD = ['lead', 'contacted', 'proposal', 'negotiation', 'active'];

// Billing details only become mandatory when a client actually starts being
// billed. Chasing an NTN off a cold lead would be pointless; issuing a tax
// invoice without one is not allowed.
const BILLING_REQUIRED = [['ntn', 'NTN (or CNIC for an unregistered buyer)'], ['billing_address', 'Billing address']];

function missingBilling(row) {
  return BILLING_REQUIRED.filter(([f]) => String(row[f] || '').trim() === '').map(([, label]) => label);
}

/**
 * A sub-client is a client in its own right — its own package, its own quota,
 * its own invoices. The parent link groups them for reporting only, so it is
 * kept one level deep: no chains, no cycles.
 */
async function validateParent(parentId, selfId) {
  if (parentId === undefined || parentId === null || parentId === '') return null;
  if (selfId && parentId === selfId) return 'A client cannot be its own parent.';
  const { rows } = await db.query(`select id, parent_client_id from clients where id = $1`, [parentId]);
  if (!rows[0]) return 'That parent account does not exist.';
  if (rows[0].parent_client_id) return 'Sub-accounts are one level deep — pick the top-level account as the parent.';
  if (selfId) {
    const { rows: kids } = await db.query(`select 1 from clients where parent_client_id = $1 limit 1`, [selfId]);
    if (kids[0]) return 'This account already has sub-accounts of its own, so it cannot become a sub-account.';
  }
  return null;
}

function missingRequired(body) {
  return REQUIRED_FIELDS
    .filter(([f]) => {
      const v = body[f];
      if (v === undefined || v === null) return true;
      // 0 is a legitimate estimated value; only blank strings are missing.
      return String(v).trim() === '';
    })
    .map(([, label]) => label);
}

/**
 * Which stages may follow `from`. Forward one step only — a deal never rolls
 * back. A deal can be lost at any point before it goes active, and an active
 * client can churn. lost and churned are terminal.
 */
function allowedNextStages(from) {
  if (from === 'lost' || from === 'churned') return [];
  if (from === 'active') return ['churned'];
  const i = FORWARD.indexOf(from);
  if (i === -1) return [];
  const next = [];
  if (i + 1 < FORWARD.length) next.push(FORWARD[i + 1]);
  next.push('lost');
  return next;
}

router.get('/', async (req, res) => {
  const { stage } = req.query;
  const params = [];
  let where = '';
  if (stage) { params.push(stage); where = `where stage = $1`; }
  const { rows } = await db.query(`select * from clients ${where} order by created_at desc`, params);
  res.json(rows.map(strip));
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(`select * from clients where id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
  res.json(strip(rows[0]));
});

// Never leak the password hash to the CRM frontend.
function strip(row) {
  const out = { ...row };
  delete out.portal_password_hash;
  out.portal_enabled = !!row.portal_username;
  return out;
}

/** Rejects custom_* values unless the target package is the customisable tier. */
async function assertCustomAllowed(body, productId) {
  const sent = CUSTOM_FIELDS.filter((f) => body[f] !== undefined && body[f] !== null && body[f] !== '');
  if (sent.length === 0) return null;
  if (!productId) return 'Custom package terms need a package selected first.';
  const { rows } = await db.query(`select name, is_standard from products where id = $1`, [productId]);
  if (!rows[0]) return 'Unknown package.';
  if (rows[0].is_standard !== false) {
    return `${rows[0].name} is a standard package with fixed terms. Custom pricing and resources are only available on Enterprise+.`;
  }
  return null;
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const missing = missingRequired(body);
  if (missing.length) {
    return res.status(400).json({ error: `Required: ${missing.join(', ')}` });
  }
  if (body.stage && body.stage !== 'lead' && !FORWARD.includes(body.stage) && !['lost','churned'].includes(body.stage)) {
    return res.status(400).json({ error: 'Unknown stage' });
  }
  const customErr = await assertCustomAllowed(body, body.product_id);
  if (customErr) return res.status(400).json({ error: customErr });

  if (body.parent_client_id) {
    const parentErr = await validateParent(body.parent_client_id, null);
    if (parentErr) return res.status(400).json({ error: parentErr });
  }
  if (body.stage === 'active') {
    const need = missingBilling(body);
    if (need.length) return res.status(400).json({ error: `A client cannot go live without: ${need.join(', ')}.` });
  }

  const cols = [...FIELDS, ...CUSTOM_FIELDS].filter((f) => body[f] !== undefined);
  const values = cols.map((c) => body[c]);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  try {
    const { rows } = await db.query(
      `insert into clients (${cols.join(',')}) values (${placeholders.join(',')}) returning *`,
      values
    );
    await db.query(
      `insert into client_stage_history (client_id, from_stage, to_stage, comment) values ($1,null,$2,$3)`,
      [rows[0].id, rows[0].stage, String(body.stage_comment || 'Client created').slice(0, 1000)]
    );
    // A client created straight into 'active' — which is how n8n onboards one
    // — is billed here, exactly as one dragged across the CRM board is.
    let billed = null;
    if (rows[0].stage === 'active') billed = await billOnActivation(rows[0]);
    res.status(201).json({ ...strip(rows[0]), invoices_created: billed ? billed.invoices : [] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'external_ref already in use by another client' });
    throw err;
  }
});

router.put('/:id', async (req, res) => {
  const body = req.body || {};
  const { rows: existingRows } = await db.query(`select * from clients where id = $1`, [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Client not found' });

  // --- Stage transition rules: forward one step only, always with a comment.
  const changingStage = body.stage !== undefined && body.stage !== existing.stage;
  if (changingStage) {
    const allowed = allowedNextStages(existing.stage);
    if (!allowed.includes(body.stage)) {
      return res.status(409).json({
        error: allowed.length
          ? `A deal can only move forward. From "${existing.stage}" the allowed next stages are: ${allowed.join(', ')}.`
          : `"${existing.stage}" is a final stage — this deal cannot be moved again.`,
        allowed_next: allowed,
      });
    }
    if (!String(body.stage_comment || '').trim()) {
      return res.status(400).json({ error: 'A comment is required to move a deal to the next stage.' });
    }
  }

  // Full record must be complete whenever fields are being edited.
  const merged = { ...existing, ...body };
  const missing = missingRequired(merged);
  if (missing.length) return res.status(400).json({ error: `Required: ${missing.join(', ')}` });

  const targetProduct = body.product_id !== undefined ? body.product_id : existing.product_id;
  const customErr = await assertCustomAllowed(body, targetProduct);
  if (customErr) return res.status(400).json({ error: customErr });

  if (body.parent_client_id !== undefined && body.parent_client_id !== existing.parent_client_id) {
    const parentErr = await validateParent(body.parent_client_id, req.params.id);
    if (parentErr) return res.status(400).json({ error: parentErr });
  }

  // Going live is the moment billing starts, so the tax details have to be
  // there — the first invoice is raised in this same request.
  if (body.stage === 'active' && existing.stage !== 'active') {
    const need = missingBilling(merged);
    if (need.length) return res.status(400).json({ error: `A client cannot go live without: ${need.join(', ')}.` });
  }

  const cols = [...FIELDS, ...CUSTOM_FIELDS].filter((f) => body[f] !== undefined);
  if (cols.length === 0) return res.status(400).json({ error: 'No fields to update' });

  // Stamp join_date the first time a client goes active.
  if (body.stage === 'active' && body.join_date === undefined && !existing.join_date) {
    cols.push('join_date');
    body.join_date = new Date().toISOString().slice(0, 10);
  }

  const setClause = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => body[c]);
  try {
    const { rows } = await db.query(
      `update clients set ${setClause} where id = $1 returning *`,
      [req.params.id, ...values]
    );
    if (changingStage) {
      await db.query(
        `insert into client_stage_history (client_id, from_stage, to_stage, comment) values ($1,$2,$3,$4)`,
        [req.params.id, existing.stage, body.stage, String(body.stage_comment).trim().slice(0, 1000)]
      );
    }
    // Setup fee + first retainer are raised here rather than by the browser,
    // so the same thing happens however the client was activated. Idempotent.
    let billed = null;
    if (body.stage === 'active' && existing.stage !== 'active') billed = await billOnActivation(rows[0]);
    res.json({ ...strip(rows[0]), invoices_created: billed ? billed.invoices : [] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'external_ref already in use by another client' });
    throw err;
  }
});

router.delete('/:id', blockAutomation, async (req, res) => {
  await db.query(`delete from clients where id = $1`, [req.params.id]);
  res.status(204).end();
});

/* ---------------------------- Stage history ---------------------------- */
router.get('/:id/stage-history', async (req, res) => {
  const { rows } = await db.query(
    `select from_stage, to_stage, comment, created_at
       from client_stage_history where client_id = $1 order by created_at desc`,
    [req.params.id]
  );
  res.json(rows);
});

/* ---------------------------- Usage ---------------------------- */
router.get('/:id/usage', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7) + '-01';
  const { rows } = await db.query(
    `select * from v_monthly_usage where client_id = $1 and period_month = $2::date`,
    [req.params.id, month]
  );
  res.json(rows[0] || { client_id: req.params.id, period_month: month, sessions: 0, messages: 0, input_tokens: 0, output_tokens: 0 });
});

/* ---------------------------- Sub-accounts ---------------------------- */
/**
 * The accounts grouped under this one. Each bills and consumes its own quota;
 * this is a reporting view of the group, not a shared pool.
 */
router.get('/:id/sub-clients', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7) + '-01';
  const { rows } = await db.query(
    `select c.*, p.name as package_name, p.quota as package_quota,
            coalesce(u.sessions, 0)::int as sessions_this_month
       from clients c
       left join products p on p.id = c.product_id
       left join v_monthly_usage u on u.client_id = c.id and u.period_month = $2::date
      where c.parent_client_id = $1
      order by c.company asc`,
    [req.params.id, month]
  );
  const subs = rows.map(strip);
  res.json({
    period_month: month,
    count: subs.length,
    // Quotas are per sub-account and deliberately not pooled; the totals are
    // for the group's own reporting only.
    group_totals: {
      sessions: subs.reduce((s, c) => s + Number(c.sessions_this_month || 0), 0),
      quota: subs.reduce((s, c) => s + Number(c.custom_quota || c.package_quota || 0), 0),
    },
    sub_clients: subs,
  });
});

/* ---------------------------- Quota position ---------------------------- */
router.get('/:id/quota', async (req, res) => {
  const status = await quotaStatus(req.params.id, req.query.month);
  if (!status) return res.status(404).json({ error: 'Client not found' });
  res.json(status);
});

/* ---------------------------- Suspend / resume ---------------------------- */
/**
 * Stopping and restarting service for one client. This is the collections
 * lever — a deliberate decision about a specific account, separate from the
 * automatic over-quota policy in Settings. It always wins over that policy.
 *
 * Suspending does not touch their portal login: a suspended customer can still
 * sign in, see exactly why, and see what they owe. Locking them out of the
 * explanation would only generate a phone call.
 */
router.post('/:id/suspend', blockAutomation, async (req, res) => {
  const reason = String((req.body || {}).reason || '').trim().slice(0, 500);
  if (!reason) {
    return res.status(400).json({ error: 'Give a reason — the customer is shown it, and it is what you will read when deciding to restore them.' });
  }
  const by = (req.user && req.user.email) || 'api key';
  const { rows } = await db.query(
    `update clients set service_status = 'suspended', suspended_at = now(),
            suspended_by = $2, suspension_reason = $3
      where id = $1 returning *`,
    [req.params.id, by, reason]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
  res.json(strip(rows[0]));
});

router.post('/:id/resume', blockAutomation, async (req, res) => {
  const { rows } = await db.query(
    `update clients set service_status = 'active', suspended_at = null,
            suspended_by = null, suspension_reason = ''
      where id = $1 returning *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
  res.json(strip(rows[0]));
});

/* ---------------------------- Portal credentials ---------------------------- */
// Creates or resets the customer's portal login. An admin may type the
// password (send `password`), or leave it out and have one generated. Either
// way it is hashed on arrival and returned exactly once — nothing can read it
// back afterwards, including this API.
const MIN_PORTAL_PASSWORD = 10;

router.post('/:id/portal-credentials', blockAutomation, async (req, res) => {
  const { rows: found } = await db.query(`select * from clients where id = $1`, [req.params.id]);
  const client = found[0];
  if (!client) return res.status(404).json({ error: 'Client not found' });

  let username = String((req.body || {}).username || client.portal_username || '').trim().toLowerCase();
  if (!username) {
    const base = (client.email && client.email.includes('@'))
      ? client.email.split('@')[0]
      : String(client.company || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '');
    username = `${base || 'client'}${crypto.randomBytes(2).toString('hex')}`;
  }
  if (!/^[a-z0-9._-]{3,64}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–64 characters: lowercase letters, digits, dot, underscore or hyphen.' });
  }

  const typed = String((req.body || {}).password || '');
  if (typed && typed.length < MIN_PORTAL_PASSWORD) {
    return res.status(400).json({ error: `Choose a password of at least ${MIN_PORTAL_PASSWORD} characters.` });
  }
  const password = typed || generatePassword();
  try {
    await db.query(
      `update clients set portal_username = $2, portal_password_hash = $3,
              portal_password_set_at = now(), portal_password_set_by = 'admin'
        where id = $1`,
      [req.params.id, username, hashPassword(password)]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That portal username is already taken.' });
    throw err;
  }
  // A reset invalidates any session opened with the old password.
  await db.query(`delete from portal_sessions where client_id = $1`, [req.params.id]);

  res.json({
    username,
    // Echoing back a password the admin just typed tells them nothing they
    // don't already have, so it is only returned when we generated it.
    password: typed ? null : password,
    was_typed: !!typed,
    login_url: '/portal.html',
    notice: typed
      ? 'Saved. Give it to the customer over a channel you trust — it is hashed here and cannot be read back.'
      : 'Copy this password now — it is hashed immediately and cannot be shown again.',
  });
});

// Revoke portal access entirely.
router.delete('/:id/portal-credentials', blockAutomation, async (req, res) => {
  await db.query(
    `update clients set portal_username = null, portal_password_hash = null,
            portal_password_set_at = null, portal_password_set_by = null
      where id = $1`,
    [req.params.id]
  );
  await db.query(`delete from portal_sessions where client_id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
