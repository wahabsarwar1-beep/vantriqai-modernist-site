const crypto = require('crypto');
const db = require('../db');

function hashToken(plaintext) {
  return crypto.createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Resolves a customer-generated read-only token (x-client-api-key) to
 * exactly one client. Deliberately its own header and its own table,
 * never x-api-key/api_keys: those are VantriqAI's own credentials, scoped
 * across every client, and a customer's token must never be checkable
 * against that table or usable anywhere those are.
 */
async function requireClientApiToken(req, res, next) {
  const provided = req.header('x-client-api-key');
  if (!provided) return res.status(401).json({ error: 'Missing x-client-api-key header.' });

  const { rows } = await db.query(
    `select t.id as token_id, t.revoked, c.*
       from client_api_tokens t join clients c on c.id = t.client_id
      where t.token_hash = $1`,
    [hashToken(provided)]
  );
  const row = rows[0];
  if (!row || row.revoked) return res.status(401).json({ error: 'Invalid or revoked API token.' });
  // Checked on every call, not only at creation: an admin turning this off
  // for a client is a kill switch, not just a lock on issuing new ones —
  // any token already out there stops working the same instant.
  if (!row.api_access_enabled) {
    return res.status(403).json({ error: 'API access is not enabled on this account.' });
  }

  db.query(`update client_api_tokens set last_used_at = now() where id = $1`, [row.token_id]).catch(() => {});

  delete row.portal_password_hash;
  req.apiClient = row;
  req.clientApiTokenId = row.token_id;
  next();
}

module.exports = { requireClientApiToken, hashToken };
