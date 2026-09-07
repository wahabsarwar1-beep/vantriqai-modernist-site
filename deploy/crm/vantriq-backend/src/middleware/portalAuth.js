const db = require('../db');

/**
 * Resolves a portal session token (Authorization: Bearer <token>, or the
 * x-portal-session header) to exactly one client. Replaces the old
 * "token in the URL is the credential" scheme: a customer must now log in
 * with the username and password an admin generated for them.
 */
async function requirePortalSession(req, res, next) {
  const header = req.header('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const token = bearer || req.header('x-portal-session') || '';
  if (!token) return res.status(401).json({ error: 'Please sign in to view your account.' });

  const { rows } = await db.query(
    `select s.token, s.expires_at, c.*
       from portal_sessions s
       join clients c on c.id = s.client_id
      where s.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row) return res.status(401).json({ error: 'Your session has ended. Please sign in again.' });
  if (new Date(row.expires_at) < new Date()) {
    await db.query(`delete from portal_sessions where token = $1`, [token]);
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  // Fire-and-forget activity stamp; never block the request on it.
  db.query(`update portal_sessions set last_seen_at = now() where token = $1`, [token]).catch(() => {});

  delete row.portal_password_hash;
  req.portalClient = row;
  req.portalSessionToken = token;
  next();
}

module.exports = { requirePortalSession };
