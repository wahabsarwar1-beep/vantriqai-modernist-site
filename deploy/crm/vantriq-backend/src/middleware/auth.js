const crypto = require('crypto');
const db = require('../db');
const { alertOwner } = require('../utils/securityAlerts');
const { clientIp } = require('../utils/clientIp');

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
 *     and must keep working. The admin key is break-glass only, and since
 *     v9.22 it no longer opens anything on its own: on the CRM's sign-in page
 *     ("Emergency access") it asks for a one-time code that is emailed to the
 *     CEO, and the code — read out by the CEO, if they agree — opens a
 *     two-hour emergency session (Bearer bg_…, below). Sent bare from anywhere
 *     but the server itself, the admin key is refused with signed_out, which
 *     is what signs out a browser still holding it. Set
 *     ALLOW_API_KEY_LOGIN=false to switch emergency access off altogether.
 *
 *  3. An 'automation' scoped API key. n8n needs to onboard a client and raise
 *     an invoice, which the webhook scope cannot do and which is no reason to
 *     hand out the admin key. It sits between the two: clients, invoices and
 *     the package catalogue, never financials, procurement, settings, the
 *     team or the API keys themselves.
 *
 * Scopes, least to most: webhook < automation < staff < admin.
 */
const ROLE_RANK = { webhook: 0, automation: 1, staff: 2, admin: 3 };

/** Emergency sessions (v9.22) are told apart from staff sessions by this. */
const BREAKGLASS_PREFIX = 'bg_';

const apiKeyLoginAllowed = () =>
  String(process.env.ALLOW_API_KEY_LOGIN || 'true').toLowerCase() !== 'false';

/**
 * True for a request made on the server itself — from inside the container,
 * not through Nginx Proxy Manager. The proxy connects from its own address on
 * the Docker network and always adds X-Real-IP and X-Forwarded-For, so a
 * loopback peer with neither is somebody with a shell on the box, who holds
 * the database anyway. Only there does the admin key still work on its own.
 */
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
function isOnServer(req) {
  const peer = String((req.socket && req.socket.remoteAddress) || '');
  if (!LOOPBACK.test(peer)) return false;
  const h = req.headers || {};
  return !(h['x-forwarded-for'] || h['x-real-ip'] || h['forwarded']);
}

const ADMIN_KEY_ALONE = 'The admin key no longer opens the CRM on its own. Use it under "Emergency access" on the sign-in page: a one-time code goes to the CEO.';

/**
 * Somebody presented the admin key on its own from outside — a browser still
 * signed in the old way, or someone who has the key. Either way the CEO hears
 * about it, once an hour per key, with where it came from.
 */
const refusedAlertAt = new Map();
function alertRefusedKey(key, req) {
  const last = refusedAlertAt.get(key.id) || 0;
  if (Date.now() - last < 60 * 60 * 1000) return;
  refusedAlertAt.set(key.id, Date.now());
  alertOwner('The admin API key was used on its own and refused', [
    `Key: ${key.name}`,
    `Path: ${req.method} ${req.originalUrl}`,
    `From: ${clientIp(req)}`,
    `Browser: ${String(req.header('user-agent') || 'unknown').slice(0, 160)}`,
    `Time: ${new Date().toISOString()}`,
    '',
    'Nothing was opened. A browser still signed in with the key alone has been signed out; to get back in, it must ask you for a code.',
    'If nobody you know should have this key, rotate it.',
  ]);
}

/**
 * An emergency session: opened with the admin key AND a code emailed to the
 * CEO (routes/auth.js, /breakglass/*). Admin everywhere an admin goes, except
 * the CEO's own areas, and it ends after a couple of hours, when signed out,
 * when the CEO ends it, or when its key is revoked.
 */
async function breakglassSession(token, minScope, req, res, next) {
  const { rows } = await db.query(
    `select s.id, s.expires_at, s.ended_at, s.key_id, k.name as key_name, k.scope, k.revoked
       from breakglass_sessions s join api_keys k on k.id = s.key_id
      where s.token_hash = $1`,
    [hashKey(token)]
  );
  const s = rows[0];
  const out = (error) => res.status(401).json({ error, signed_out: true });
  if (!s || s.ended_at) return out('Emergency access has ended. Sign in again.');
  if (new Date(s.expires_at) < new Date()) return out('Emergency access has expired. Sign in again.');
  if (s.revoked || s.scope !== 'admin' || !apiKeyLoginAllowed()) {
    await db.query(
      `update breakglass_sessions set ended_at = now(), ended_by = $2 where id = $1 and ended_at is null`,
      [s.id, s.revoked ? 'key revoked' : 'emergency access switched off']
    );
    return out('Emergency access has ended: its key no longer works.');
  }
  if (minScope === 'webhook') {
    return res.status(403).json({ error: 'Usage ingestion uses a webhook key, not a staff session.' });
  }
  db.query(`update breakglass_sessions set last_seen_at = now() where id = $1`, [s.id]).catch(() => {});
  req.breakglass = { id: s.id, key_id: s.key_id, key_name: s.key_name, expires_at: s.expires_at };
  req.apiKeyScope = 'admin';
  req.authKind = 'breakglass';
  return next();
}

function requireScope(minScope) {
  return async function (req, res, next) {
    try {
      // --- 1. staff session
      const header = req.header('authorization') || '';
      const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
      if (bearer) {
        if (bearer.startsWith(BREAKGLASS_PREFIX)) return await breakglassSession(bearer, minScope, req, res, next);
        const { rows } = await db.query(
          `select s.expires_at, u.id, u.email, u.name, u.role, u.active, u.must_change_password, u.must_setup_totp, u.totp_enabled, u.is_owner
             from staff_sessions s join internal_users u on u.id = s.user_id
            where s.token = $1`,
          [bearer]
        );
        const row = rows[0];
        if (!row) return res.status(401).json({ error: 'Your session has ended. Please sign in again.', signed_out: true });
        if (!row.active) return res.status(403).json({ error: 'This account has been deactivated.' });
        if (new Date(row.expires_at) < new Date()) {
          await db.query(`delete from staff_sessions where token = $1`, [bearer]);
          return res.status(401).json({ error: 'Your session has expired. Please sign in again.', signed_out: true });
        }
        if (row.must_change_password || row.must_setup_totp || (row.is_owner && !row.totp_enabled)) {
          return res.status(403).json({ error: 'Complete your password and authenticator setup before accessing the workspace.', security_setup_required: true });
        }
        if (minScope === 'webhook') {
          return res.status(403).json({ error: 'Usage ingestion uses a webhook key, not a staff session.' });
        }
        if (ROLE_RANK[row.role] < ROLE_RANK[minScope]) {
          return res.status(403).json({ error: 'Your account does not have access to this area.' });
        }
        db.query(`update staff_sessions set last_seen_at = now() where token = $1`, [bearer]).catch(() => {});
        req.user = { id: row.id, email: row.email, name: row.name, role: row.role, is_owner: !!row.is_owner };
        req.authKind = 'session';
        return next();
      }

      // --- 2. API key
      const provided = req.header('x-api-key');
      if (!provided) {
        return res.status(401).json({ error: 'Please sign in.' });
      }
      const { rows } = await db.query(
        `select id, name, scope, revoked, last_used_at from api_keys where key_hash = $1 limit 1`,
        [hashKey(provided)]
      );
      const key = rows[0];
      if (!key || key.revoked) return res.status(401).json({ error: 'Invalid or revoked API key' });

      // The admin key is break-glass only; the webhook key is machine traffic
      // and is unaffected by that switch.
      if (key.scope === 'admin' && !apiKeyLoginAllowed()) {
        return res.status(403).json({ error: 'API key sign-in is disabled. Use your Vantriq Ops account.' });
      }
      // And on its own it opens nothing from outside the server (v9.22): it is
      // the first half of emergency access, the CEO's code the second.
      if (key.scope === 'admin' && !isOnServer(req)) {
        alertRefusedKey(key, req);
        return res.status(401).json({ error: ADMIN_KEY_ALONE, signed_out: true, breakglass: true });
      }
      if (ROLE_RANK[key.scope] < ROLE_RANK[minScope]) {
        return res.status(403).json({ error: `This endpoint requires ${minScope} access` });
      }

      // On the server itself the admin key still opens everything with no
      // attribution, and every use of it is still emailed to the owner: a
      // legitimate emergency and a leaked key both need to be seen the
      // moment they happen, not discovered later in last_used_at. Throttled
      // to once an hour per key so a burst of automated calls through it
      // sends one email, not one per request.
      if (key.scope === 'admin') {
        const staleMs = 60 * 60 * 1000;
        if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > staleMs) {
          alertOwner(
            'The break-glass admin API key was just used',
            [
              `Key: ${key.name}`,
              `Path: ${req.method} ${req.originalUrl}`,
              `Time: ${new Date().toISOString()}`,
              '',
              'If this was not you or an emergency you arranged, rotate this key now and check what it was used for.',
            ]
          );
        }
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

/**
 * True only for a real administrator — an admin's own session, an emergency
 * session, or the admin key on the server itself. Used to gate cost and
 * margin figures, which staff, automation keys and webhooks must never
 * receive.
 */
function isAdminRequest(req) {
  if (req.authKind === 'breakglass') return true;
  if (req.authKind === 'apikey' && req.apiKeyScope === 'admin') return true;
  return !!(req.user && req.user.role === 'admin');
}

/**
 * Pricing is the CEO's alone: the price book, what each package and add-on
 * costs us to serve, every margin, and the business documents behind them.
 * Not another admin, not the admin key, not an emergency session, not an
 * automation key — only the CEO, signed in as themselves (password and
 * authenticator code) on the protected owner account (db/schema.sql v9.11),
 * whose address is PRICING_EMAIL (ceo@vantriqai.com unless the server says
 * otherwise).
 */
const PRICING_EMAIL = () => String(process.env.PRICING_EMAIL || process.env.OWNER_EMAIL || 'ceo@vantriqai.com').trim().toLowerCase();

function isPricingOwner(user) {
  return !!(user && user.is_owner && String(user.email || '').toLowerCase() === PRICING_EMAIL());
}

function isCeoRequest(req) {
  return req.authKind === 'session' && isPricingOwner(req.user);
}

function requireCeo(req, res, next) {
  if (isCeoRequest(req)) return next();
  return res.status(403).json({ error: 'Pricing is open to the CEO only.' });
}

/**
 * Route guard for the things an automation key must not do even on routes it
 * is otherwise allowed to reach: deleting records, and handing out portal
 * credentials. n8n creates and updates; a person deletes.
 */
function blockAutomation(req, res, next) {
  if (req.authKind === 'apikey' && req.apiKeyScope === 'automation') {
    return res.status(403).json({ error: 'An automation key cannot do this. Sign in to the CRM.' });
  }
  next();
}

module.exports = {
  requireScope, hashKey, isAdminRequest, blockAutomation, isCeoRequest, isPricingOwner, requireCeo, PRICING_EMAIL,
  BREAKGLASS_PREFIX, apiKeyLoginAllowed, isOnServer,
};
