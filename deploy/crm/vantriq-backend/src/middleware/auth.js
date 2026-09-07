const crypto = require('crypto');
const db = require('../db');

function hashKey(plaintextKey) {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex');
}

/**
 * requireScope('admin') -> only accepts an active api_keys row with scope='admin'
 * requireScope('webhook') -> accepts 'admin' OR 'webhook' keys (admin can do anything a webhook can)
 * Reads the key from the `x-api-key` header.
 */
function requireScope(minScope) {
  return async function (req, res, next) {
    try {
      const provided = req.header('x-api-key');
      if (!provided) {
        return res.status(401).json({ error: 'Missing x-api-key header' });
      }
      const hash = hashKey(provided);
      const { rows } = await db.query(
        `select id, scope, revoked from api_keys where key_hash = $1 limit 1`,
        [hash]
      );
      const key = rows[0];
      if (!key || key.revoked) {
        return res.status(401).json({ error: 'Invalid or revoked API key' });
      }
      if (minScope === 'admin' && key.scope !== 'admin') {
        return res.status(403).json({ error: 'This endpoint requires an admin key' });
      }
      // fire-and-forget last_used_at touch
      db.query(`update api_keys set last_used_at = now() where id = $1`, [key.id]).catch(() => {});
      req.apiKeyScope = key.scope;
      next();
    } catch (err) {
      console.error('Auth error', err);
      res.status(500).json({ error: 'Auth check failed' });
    }
  };
}

module.exports = { requireScope, hashKey };
