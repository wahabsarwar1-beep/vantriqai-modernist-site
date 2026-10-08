const crypto = require('crypto');
const db = require('../db');
const { clientIp } = require('../utils/clientIp');

// Database-backed counters survive restarts and are shared by app replicas.
// Counters contain hashes, never credentials or raw request bodies.
async function takeLimit(namespace, identity, max, seconds) {
  const key = crypto.createHash('sha256').update(namespace + '\0' + String(identity).slice(0, 400)).digest('hex');
  const { rows } = await db.query(`insert into security_rate_limits(bucket, hits, expires_at)
    values($1,1,now()+$2*interval '1 second') on conflict(bucket) do update
    set hits=case when security_rate_limits.expires_at<=now() then 1 else security_rate_limits.hits+1 end,
        expires_at=case when security_rate_limits.expires_at<=now() then excluded.expires_at else security_rate_limits.expires_at end
    returning hits, greatest(1,ceil(extract(epoch from expires_at-now())))::int as retry_after`, [key, seconds]);
  return { allowed: rows[0].hits <= max, retryAfter: rows[0].retry_after };
}

function rateLimit(namespace, { max = 30, seconds = 60, identity = clientIp } = {}) {
  return async (req, res, next) => {
    try {
      const result = await takeLimit(namespace, identity(req), max, seconds);
      if (!result.allowed) return res.status(429).set('Retry-After', String(result.retryAfter)).json({ error: 'Too many attempts. Please wait before trying again.' });
      next();
    } catch (err) {
      console.error('[security rate limit]', err.message);
      res.status(503).json({ error: 'Sign-in protection is temporarily unavailable. Please try again shortly.' });
    }
  };
}

function requireAdmin(req, res, next) {
  const { isAdminRequest } = require('./auth');
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Only an administrator can perform this action.' });
  next();
}

function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    // Restrict framing and dangerous resource types while existing inline UI
    // handlers are migrated. This is deliberately not advertised as strict CSP.
    'Content-Security-Policy': "object-src 'none'; base-uri 'self'; frame-ancestors " + (req.path.startsWith('/s/') ? "'self' https:" : "'none'") + "; form-action 'self'",
  });
  if (req.path.startsWith('/s/')) res.removeHeader('X-Frame-Options');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') res.set('Strict-Transport-Security', 'max-age=86400');
  if (req.path.startsWith('/api/') || req.path === '/reset.html') res.set('Cache-Control', 'no-store');
  next();
}

module.exports = { takeLimit, rateLimit, requireAdmin, securityHeaders };
