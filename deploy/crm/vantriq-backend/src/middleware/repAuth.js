const db = require('../db');
const { hashKey } = require('./auth');

/**
 * Sales reps are a distinct identity from api_keys (admin/webhook). A rep's
 * key resolves to exactly one row in sales_reps, and every route behind
 * this middleware must filter by req.rep.id — never trust a rep-supplied
 * id in the URL/body for anything that touches another rep's data.
 */
async function requireRep(req, res, next) {
  const provided = req.header('x-api-key');
  if (!provided) return res.status(401).json({ error: 'Missing x-api-key header' });
  const hash = hashKey(provided);
  const { rows } = await db.query(
    `select id, name, email, active from sales_reps where key_hash = $1 limit 1`,
    [hash]
  );
  const rep = rows[0];
  if (!rep || !rep.active) {
    return res.status(401).json({ error: 'Invalid or deactivated rep login' });
  }
  db.query(`update sales_reps set last_used_at = now() where id = $1`, [rep.id]).catch(() => {});
  req.rep = rep;
  next();
}

module.exports = { requireRep };
