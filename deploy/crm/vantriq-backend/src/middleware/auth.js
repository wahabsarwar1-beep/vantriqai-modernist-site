const crypto = require('crypto');
const db = require('../db');

function hashKey(plaintextKey) {
  return crypto.createHash('sha256').update(plaintextKey).digest('hex');
}

/**
 * Authorisation for everything under /api (except the customer portal and the
 * rep portal, which have their own identities).
 *
 * Two ways in:
 *
 *  1. An internal employee's session — `Authorization: Bearer <staff token>`,
 *     issued by /api/auth/verify after a password AND an emailed OTP. This is
 *     how people sign in. Their role decides what they can reach.
 *
 *  2. An API key in `x-api-key`. The webhook-scoped key is how n8n posts usage
 *     and must keep working. The admin key still opens everything and is kept
 *     deliberately as a break-glass route for when email delivery fails or the
 *     last admin loses their second factor. Set ALLOW_API_KEY_LOGIN=false to
 *     switch that off.
 *
 * Scopes, least to most: webhook < staff < admin.
 */
const ROLE_RANK = { webhook: 0, staff: 1, admin: 2 };

function requireScope(minScope) {
  return async function (req, res, next) {
    try {
      // --- 1. staff session
      const header = req.header('authorization') || '';
      const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
      if (bearer) {
        const { rows } = await db.query(
          `select s.expires_at, u.id, u.email, u.name, u.role, u.active, u.must_change_password
             from staff_sessions s join internal_users u on u.id = s.user_id
            where s.token = $1`,
          [bearer]
        );
        const row = rows[0];
        if (!row) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
        if (!row.active) return res.status(403).json({ error: 'This account has been deactivated.' });
        if (new Date(row.expires_at) < new Date()) {
          await db.query(`delete from staff_sessions where token = $1`, [bearer]);
          return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
        }
        if (minScope === 'webhook') {
          return res.status(403).json({ error: 'Usage ingestion uses a webhook key, not a staff session.' });
        }
        if (ROLE_RANK[row.role] < ROLE_RANK[minScope]) {
          return res.status(403).json({ error: 'Your account does not have access to this area.' });
        }
        db.query(`update staff_sessions set last_seen_at = now() where token = $1`, [bearer]).catch(() => {});
        req.user = { id: row.id, email: row.email, name: row.name, role: row.role };
        req.authKind = 'session';
        return next();
      }

      // --- 2. API key
      const provided = req.header('x-api-key');
      if (!provided) {
        return res.status(401).json({ error: 'Please sign in.' });
      }
      const { rows } = await db.query(
        `select id, scope, revoked from api_keys where key_hash = $1 limit 1`,
        [hashKey(provided)]
      );
      const key = rows[0];
      if (!key || key.revoked) return res.status(401).json({ error: 'Invalid or revoked API key' });

      // The admin key is break-glass only; the webhook key is machine traffic
      // and is unaffected by that switch.
      if (key.scope === 'admin' && String(process.env.ALLOW_API_KEY_LOGIN || 'true').toLowerCase() === 'false') {
        return res.status(403).json({ error: 'API key sign-in is disabled. Use your Vantriq Ops account.' });
      }
      if (ROLE_RANK[key.scope] < ROLE_RANK[minScope]) {
        return res.status(403).json({ error: `This endpoint requires ${minScope} access` });
      }

      db.query(`update api_keys set last_used_at = now() where id = $1`, [key.id]).catch(() => {});
      req.apiKeyScope = key.scope;
      req.authKind = 'apikey';
      next();
    } catch (err) {
      console.error('Auth error', err);
      res.status(500).json({ error: 'Auth check failed' });
    }
  };
}

module.exports = { requireScope, hashKey };
