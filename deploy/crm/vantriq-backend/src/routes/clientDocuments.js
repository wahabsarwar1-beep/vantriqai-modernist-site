const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { blockAutomation } = require('../middleware/auth');
const router = express.Router({ mergeParams: true });

/**
 * The paperwork behind an account — the service agreement form, the NTN
 * certificate, the CNIC, whatever else has to be on file.
 *
 * Stored as BYTES IN THE DATABASE rather than on disk. The app container is
 * rebuilt from scratch on every deploy, so anything written to its filesystem
 * is gone the next time we ship; the database has a volume and is in the
 * verified backup the deploy takes before it touches anything. A path into a
 * container that no longer exists is a broken link waiting to happen.
 *
 * Uploads arrive base64-encoded in JSON rather than as multipart, which keeps
 * this to zero new dependencies. Base64 costs a third in transfer, which at
 * these sizes is nothing worth adding a parser for.
 */

const DOC_TYPES = {
  saf: 'Service agreement form',
  ntn: 'NTN certificate',
  strn: 'Sales tax registration',
  cnic: 'CNIC',
  contract: 'Signed contract',
  po: 'Purchase order',
  bank: 'Bank details',
  other: 'Other',
};

// 10 MB of actual file. A scan of a certificate is well under this; a video
// is not a document. The cap is checked on the decoded bytes, not the base64,
// so the number means what a person would expect it to mean.
const MAX_BYTES = 10 * 1024 * 1024;

// What a document is allowed to be. An open upload field that accepts
// anything and hands it back with the uploader's own content type is a
// stored-XSS hole: upload .html, send someone the download link, and it runs
// on our origin with their session. Everything here is inert, and downloads
// are forced as attachments besides.
const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/tiff': 'tiff',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Everything but the bytes. Listing a client's documents must not pull
 *  megabytes out of the database to render a row of filenames. */
const META = `id, client_id, doc_type, title, filename, content_type,
              byte_size, sha256, notes, uploaded_by, created_at, updated_at`;

/**
 * A filename safe to put in a Content-Disposition header.
 *
 * Strips directories, quotes and control characters — all three of which let
 * a crafted upload name rewrite the header rather than sit inside it.
 */
function safeName(name, fallback = 'document') {
  const base = String(name || '').split(/[\\/]/).pop() || fallback;
  const clean = base.replace(/[\u0000-\u001f"\\]/g, '').replace(/\.{2,}/g, '.').trim();
  return (clean || fallback).slice(0, 120);
}

const shape = (r) => ({ ...r, doc_type_label: DOC_TYPES[r.doc_type] || r.doc_type });

/** GET /api/clients/:id/documents */
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `select ${META} from client_documents where client_id = $1 order by created_at desc`,
    [req.params.id]
  );
  res.json(rows.map(shape));
});

/** POST /api/clients/:id/documents  { doc_type, title, filename, content_type, data } */
router.post('/', async (req, res) => {
  const b = req.body || {};
  const { rows: cr } = await db.query(`select id from clients where id = $1`, [req.params.id]);
  if (!cr[0]) return res.status(404).json({ error: 'Client not found' });

  if (!b.data) return res.status(400).json({ error: 'No file was attached.' });
  const docType = b.doc_type || 'other';
  if (!DOC_TYPES[docType]) {
    return res.status(400).json({ error: `Document type must be one of: ${Object.keys(DOC_TYPES).join(', ')}.` });
  }
  const contentType = String(b.content_type || 'application/octet-stream');
  if (!ALLOWED[contentType]) {
    return res.status(400).json({
      error: `That file type cannot be stored here. Accepted: PDF, JPG, PNG, WebP, HEIC, TIFF, Word and Excel.`,
    });
  }

  // Strip a data: URL prefix if the browser sent one.
  const b64 = String(b.data).replace(/^data:[^;]+;base64,/, '');
  let buf;
  try { buf = Buffer.from(b64, 'base64'); }
  catch { return res.status(400).json({ error: 'The file could not be read.' }); }
  if (!buf.length) return res.status(400).json({ error: 'The file is empty.' });
  if (buf.length > MAX_BYTES) {
    return res.status(413).json({
      error: `That file is ${(buf.length / 1048576).toFixed(1)} MB. The limit is ${MAX_BYTES / 1048576} MB.`,
    });
  }

  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const filename = safeName(b.filename, `${docType}.${ALLOWED[contentType]}`);

  // The same bytes uploaded twice under two names is almost always a mistake,
  // and two copies of a certificate is how the wrong one gets sent.
  const { rows: dupe } = await db.query(
    `select id, filename from client_documents where client_id = $1 and sha256 = $2 limit 1`,
    [req.params.id, sha]
  );
  if (dupe[0] && !b.allow_duplicate) {
    return res.status(409).json({
      error: `This exact file is already on the account as "${dupe[0].filename}".`,
      existing_id: dupe[0].id,
    });
  }

  const { rows } = await db.query(
    `insert into client_documents
       (client_id, doc_type, title, filename, content_type, byte_size, content, sha256, notes, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning ${META}`,
    [
      req.params.id, docType, String(b.title || '').trim() || DOC_TYPES[docType],
      filename, contentType, buf.length, buf, sha, String(b.notes || ''),
      (req.user && req.user.email) || '',
    ]
  );
  res.status(201).json(shape(rows[0]));
});

/** GET /api/clients/:id/documents/:docId/download */
router.get('/:docId/download', async (req, res) => {
  const { rows } = await db.query(
    `select filename, content_type, content from client_documents where id = $1 and client_id = $2`,
    [req.params.docId, req.params.id]
  );
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  res.setHeader('Content-Type', doc.content_type);
  // attachment, never inline: the browser saves it rather than rendering it
  // on our origin. Belt and braces alongside the upload allow-list.
  res.setHeader('Content-Disposition', `attachment; filename="${safeName(doc.filename)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(doc.content);
});

/** PATCH /api/clients/:id/documents/:docId — retitle or reclassify. */
router.patch('/:docId', async (req, res) => {
  const b = req.body || {};
  if (b.doc_type !== undefined && !DOC_TYPES[b.doc_type]) {
    return res.status(400).json({ error: 'Unknown document type.' });
  }
  const sets = [], params = [];
  for (const f of ['doc_type', 'title', 'notes']) {
    if (b[f] === undefined) continue;
    params.push(b[f]); sets.push(`${f} = $${params.length}`);
  }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.docId, req.params.id);
  const { rows } = await db.query(
    `update client_documents set ${sets.join(', ')}
      where id = $${params.length - 1} and client_id = $${params.length} returning ${META}`,
    params
  );
  if (!rows[0]) return res.status(404).json({ error: 'Document not found' });
  res.json(shape(rows[0]));
});

/** DELETE /api/clients/:id/documents/:docId */
router.delete('/:docId', blockAutomation, async (req, res) => {
  const { rowCount } = await db.query(
    `delete from client_documents where id = $1 and client_id = $2`,
    [req.params.docId, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Document not found' });
  res.json({ ok: true });
});

module.exports = router;
module.exports.DOC_TYPES = DOC_TYPES;
module.exports.MAX_BYTES = MAX_BYTES;
module.exports.ALLOWED = ALLOWED;
