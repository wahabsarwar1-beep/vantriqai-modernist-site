const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const router = express.Router();

/**
 * The CEO's business documents (v9.21) — the business model, the client pitch
 * deck, the product portfolio — under Products & Pricing.
 *
 * Mounted behind requireScope('admin') + requireCeo (src/index.js): only the
 * CEO's own signed-in account reaches any of this. Not another admin, not the
 * break-glass key. The files live in the database, never in the repository.
 *
 *   GET    /api/pricing/documents            every file, newest first, without
 *                                            its bytes; `current` marks the
 *                                            newest of each kind and format
 *   POST   /api/pricing/documents            { filename, data (base64),
 *                                              content_type?, kind?, title?, note? }
 *   GET    /api/pricing/documents/:id/file   the file itself
 *   DELETE /api/pricing/documents/:id        one version, for good
 */

const MAX_BYTES = 25 * 1024 * 1024;
const KINDS = ['business_model', 'pitch_deck', 'portfolio', 'other'];
const TITLES = { business_model: 'Business Model', pitch_deck: 'Client Pitch Deck', portfolio: 'Product Portfolio' };
const TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', ppt: 'application/vnd.ms-powerpoint', xls: 'application/vnd.ms-excel',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
};

class DocError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

const extOf = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';

/** Which document a file is, from its name: "VantriqAI_Business_Model_4.docx" is the business model. */
function kindOf(filename) {
  const n = String(filename || '').toLowerCase().replace(/[_\-.]+/g, ' ');
  if (/business\s*model|commercial\s*plan/.test(n)) return 'business_model';
  if (/pitch|deck/.test(n)) return 'pitch_deck';
  if (/portfolio|catalogu?e/.test(n)) return 'portfolio';
  return 'other';
}

const SELECT = `id, kind, title, filename, content_type, size_bytes, sha256, note, uploaded_by,
                uploaded_at, opened_count, last_opened_at`;

async function list() {
  const { rows } = await db.query(`select ${SELECT} from owner_documents order by uploaded_at desc, id`);
  // Current = the newest of each kind and format (a PDF and a Word file of the
  // business model are both current); for "other" files, of each title too.
  const seen = new Set();
  return rows.map((r) => {
    const slot = `${r.kind}|${extOf(r.filename)}|${r.kind === 'other' ? r.title : ''}`;
    const current = !seen.has(slot);
    seen.add(slot);
    return { ...r, current };
  });
}

/** Every business document, newest first, without its bytes; `current` marks the newest of each kind and format. */
router.get('/documents', async (req, res) => {
  res.json({ documents: await list() });
});

/** Upload one: { filename, data (base64), content_type?, kind?, title?, note? }. Up to 25 MB; the same file twice is one version. */
router.post('/documents', async (req, res) => {
  const b = req.body || {};
  const filename = String(b.filename || '').trim().replace(/[\\/\r\n"]/g, '_').slice(0, 180);
  const ext = extOf(filename);
  if (!filename || !TYPES[ext]) {
    throw new DocError(400, `Upload a PDF, Word, PowerPoint, Excel, image or text file (${Object.keys(TYPES).join(', ')}).`);
  }
  const base64 = String(b.data || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new DocError(400, 'The file did not arrive (data must be base64).');
  const content = Buffer.from(base64, 'base64');
  if (!content.length) throw new DocError(400, 'That file is empty.');
  if (content.length > MAX_BYTES) throw new DocError(413, 'Files up to 25 MB.');

  const kind = KINDS.includes(b.kind) ? b.kind : kindOf(filename);
  const title = String(b.title || TITLES[kind] || filename.replace(/\.[a-z0-9]+$/i, '')).trim().slice(0, 160);
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');

  // The same file twice is one version, not two.
  const { rows: same } = await db.query(
    `select ${SELECT} from owner_documents where sha256 = $1 and kind = $2 and filename = $3 limit 1`,
    [sha256, kind, filename]
  );
  if (same[0]) return res.json({ ...same[0], duplicate: true });

  const { rows } = await db.query(
    `insert into owner_documents (kind, title, filename, content_type, size_bytes, sha256, content, note, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning ${SELECT}`,
    [kind, title, filename, TYPES[ext], content.length, sha256, content,
      String(b.note || '').slice(0, 500), (req.user && req.user.email) || '']
  );
  res.status(201).json(rows[0]);
});

/** The file itself, as an attachment that is never cached. Each opening is counted. */
router.get('/documents/:id/file', async (req, res) => {
  const { rows } = await db.query(
    `update owner_documents set opened_count = opened_count + 1, last_opened_at = now()
      where id::text = $1 returning filename, content_type, content`,
    [String(req.params.id)]
  );
  if (!rows[0]) throw new DocError(404, 'Document not found');
  const d = rows[0];
  // Never cached anywhere between here and the CEO's screen.
  res.set({
    'Content-Type': d.content_type,
    'Content-Length': d.content.length,
    'Content-Disposition': `attachment; filename="${d.filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(d.filename)}`,
    'Cache-Control': 'no-store, private',
    'X-Content-Type-Options': 'nosniff',
  });
  res.send(d.content);
});

/** Delete one version for good. */
router.delete('/documents/:id', async (req, res) => {
  const { rowCount } = await db.query(`delete from owner_documents where id::text = $1`, [String(req.params.id)]);
  if (!rowCount) throw new DocError(404, 'Document not found');
  res.json({ ok: true });
});

router.kindOf = kindOf;
module.exports = router;
