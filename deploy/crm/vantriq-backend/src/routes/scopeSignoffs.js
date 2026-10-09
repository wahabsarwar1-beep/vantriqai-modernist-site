const express = require('express');
const db = require('../db');
const { blockAutomation } = require('../middleware/auth');
const S = require('../utils/scopeSignoff');
const router = express.Router();

/**
 * Scope sign-offs, the CRM side (v9.33). Staff prepare one from a client's
 * package and quote, edit it while it is a draft, and send it to the client
 * portal, where the client signs it (routes/portal.js).
 *
 * A sent or signed sign-off is never edited. Changing one is a revision: a
 * new draft with the same number and the next version. An unsigned earlier
 * version is superseded when the revision is sent; a signed one stays the
 * signed scope until the revision is itself signed.
 */

class ScopeError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}
const actor = (req) => (req.user && req.user.email) || req.authKind || '';

async function load(id) {
  const { rows } = await db.query(`select * from scope_signoffs where id = $1`, [id]);
  if (!rows[0]) throw new ScopeError(404, 'Scope sign-off not found');
  return rows[0];
}

router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.client_id) { params.push(req.query.client_id); where = 'where s.client_id = $1'; }
  const { rows } = await db.query(
    `select s.id, s.client_id, s.quote_id, s.number, s.version, s.title, s.status, s.created_at, s.sent_at,
            s.signed_at, s.signer_name, s.signer_title, s.client_feedback, s.feedback_at, s.supersedes_id,
            c.company
       from scope_signoffs s join clients c on c.id = s.client_id ${where}
      order by s.created_at desc`, params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  res.json(await load(req.params.id));
});

/** A new draft, prefilled from the client's package, quote and agents. */
router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.client_id) throw new ScopeError(400, 'client_id is required');
  const draft = await S.buildDraft(b.client_id, b.quote_id || null);
  if (!draft) throw new ScopeError(404, 'Client not found');
  if (draft.error) throw new ScopeError(400, draft.error);
  const number = await S.allocateNumber();
  const { rows } = await db.query(
    `insert into scope_signoffs (client_id, quote_id, number, version, title, status, content, created_by)
     values ($1, $2, $3, 1, $4, 'draft', $5::jsonb, $6) returning *`,
    [b.client_id, draft.quote ? draft.quote.id : null, number, String(b.title || draft.title).slice(0, 200),
      JSON.stringify(draft.content), actor(req)]
  );
  res.status(201).json(rows[0]);
});

/** Edit a draft. Anything already sent is frozen: revise it instead. */
router.patch('/:id', async (req, res) => {
  const s = await load(req.params.id);
  if (s.status !== 'draft') throw new ScopeError(409, 'Only a draft can be edited. Revise it to change a sent or signed scope.');
  const b = req.body || {};
  const content = b.content !== undefined ? S.cleanContent(b.content, s.content) : s.content;
  const title = b.title !== undefined ? String(b.title || '').trim().slice(0, 200) : s.title;
  if (!title) throw new ScopeError(400, 'Give the scope a title.');
  const { rows } = await db.query(
    `update scope_signoffs set title = $2, content = $3::jsonb where id = $1 returning *`,
    [s.id, title, JSON.stringify(content)]
  );
  res.json(rows[0]);
});

/**
 * Send it to the client portal. Freezes it: the client's identity and the
 * terms in force are snapshotted beside the content, and all of it is
 * hashed. What the client signs is that hash.
 */
router.post('/:id/send', async (req, res) => {
  const s = await load(req.params.id);
  if (s.status !== 'draft') throw new ScopeError(409, 'Only a draft can be sent.');
  const c = s.content || {};
  if (!(c.deliverables || []).length) throw new ScopeError(400, 'List at least one deliverable before sending.');
  if (!(c.acceptance_criteria || []).length) throw new ScopeError(400, 'Say how the work will be accepted before sending.');
  const { rows: cr } = await db.query(`select * from clients where id = $1`, [s.client_id]);
  if (!cr[0].portal_username) throw new ScopeError(409, 'This client has no portal access yet. Give them a portal sign-in so they can read and sign it.');
  const terms = S.TERMS();
  const frozen = { ...s, client_snapshot: S.clientSnapshot(cr[0]), terms, terms_version: terms.version };
  const hash = S.hashOf(frozen);
  const client = await db.pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `update scope_signoffs set status = 'sent', client_snapshot = $2::jsonb, terms = $3::jsonb, terms_version = $4,
              content_hash = $5, sent_at = now(), sent_by = $6
        where id = $1 and status = 'draft' returning *`,
      [s.id, JSON.stringify(frozen.client_snapshot), JSON.stringify(terms), terms.version, hash, actor(req)]
    );
    if (!rows[0]) throw new ScopeError(409, 'It changed while you were sending it. Reload and try again.');
    // An earlier version that was never signed is replaced outright; a signed
    // one stays the scope in force until this one is signed.
    await client.query(
      `update scope_signoffs set status = 'superseded'
        where number = $1 and version < $2 and status in ('sent','changes_requested')`,
      [s.number, s.version]
    );
    await client.query('commit');
    res.json(rows[0]);
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});

/** A new version to change a sent, queried or signed scope. */
router.post('/:id/revise', async (req, res) => {
  const s = await load(req.params.id);
  if (!['sent', 'changes_requested', 'signed'].includes(s.status)) {
    throw new ScopeError(409, 'Only a sent or signed scope can be revised. Edit a draft directly.');
  }
  const { rows: open } = await db.query(
    `select id from scope_signoffs where number = $1 and status = 'draft'`, [s.number]);
  if (open[0]) throw new ScopeError(409, 'A revision of this scope is already in draft. Edit that one.');
  const { rows: v } = await db.query(`select max(version) as v from scope_signoffs where number = $1`, [s.number]);
  const notes = s.client_feedback
    ? `${s.content.notes ? `${s.content.notes}\n\n` : ''}Changes requested by the client: ${s.client_feedback}`
    : s.content.notes;
  const { rows } = await db.query(
    `insert into scope_signoffs (client_id, quote_id, number, version, supersedes_id, title, status, content, created_by)
     values ($1, $2, $3, $4, $5, $6, 'draft', $7::jsonb, $8) returning *`,
    [s.client_id, s.quote_id, s.number, Number(v[0].v) + 1, s.id, s.title,
      JSON.stringify({ ...s.content, notes: notes || '' }), actor(req)]
  );
  res.status(201).json(rows[0]);
});

router.post('/:id/withdraw', async (req, res) => {
  const s = await load(req.params.id);
  if (!['sent', 'changes_requested'].includes(s.status)) {
    throw new ScopeError(409, s.status === 'signed'
      ? 'A signed scope cannot be withdrawn. Revise it, or end the service under the terms.'
      : 'Only a sent scope can be withdrawn. Delete a draft instead.');
  }
  const { rows } = await db.query(
    `update scope_signoffs set status = 'withdrawn', withdrawn_at = now(), withdraw_reason = $2 where id = $1 returning *`,
    [s.id, String((req.body || {}).reason || '').slice(0, 500)]
  );
  res.json(rows[0]);
});

router.get('/:id/pdf', async (req, res) => {
  const s = await load(req.params.id);
  const pdf = await S.renderPdf(s);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${S.pdfFilename(s)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(pdf);
});

router.delete('/:id', blockAutomation, async (req, res) => {
  const s = await load(req.params.id);
  if (s.status !== 'draft') throw new ScopeError(409, 'Only a draft can be deleted. A sent or signed scope is part of the record.');
  await db.query(`delete from scope_signoffs where id = $1`, [s.id]);
  res.status(204).end();
});

module.exports = router;
