const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, generatePassword } = require('../utils/password');
const router = express.Router();

const FIELDS = [
  'name','company','email','phone','external_ref','product_id','stage',
  'est_value','source','notes','join_date'
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
    res.status(201).json(strip(rows[0]));
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
    res.json(strip(rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'external_ref already in use by another client' });
    throw err;
  }
});

router.delete('/:id', async (req, res) => {
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

/* ---------------------------- Portal credentials ---------------------------- */
// Creates or resets the customer's portal login. The password is generated
// here, hashed immediately, and returned exactly once — it cannot be read back.
router.post('/:id/portal-credentials', async (req, res) => {
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

  const password = generatePassword();
  try {
    await db.query(
      `update clients set portal_username = $2, portal_password_hash = $3, portal_password_set_at = now() where id = $1`,
      [req.params.id, username, hashPassword(password)]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That portal username is already taken.' });
    throw err;
  }
  // A reset invalidates any session opened with the old password.
  await db.query(`delete from portal_sessions where client_id = $1`, [req.params.id]);

  res.json({
    username, password,
    login_url: '/portal.html',
    notice: 'Copy this password now — it is hashed immediately and cannot be shown again.',
  });
});

// Revoke portal access entirely.
router.delete('/:id/portal-credentials', async (req, res) => {
  await db.query(
    `update clients set portal_username = null, portal_password_hash = null, portal_password_set_at = null where id = $1`,
    [req.params.id]
  );
  await db.query(`delete from portal_sessions where client_id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
