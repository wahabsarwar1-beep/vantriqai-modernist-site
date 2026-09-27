/**
 * Async route errors, caught — so one bad request cannot take the CRM down.
 *
 * Express 4 calls a handler inside a try/catch that only sees SYNCHRONOUS
 * throws. An `async` handler returns a promise instead, and when that promise
 * rejects nothing is listening: Node reports an unhandled rejection and, since
 * Node 15, exits the process. Over two hundred routes here are async with no
 * try/catch of their own, so any query error — a malformed id in a URL, a
 * unique clash, Postgres restarting — killed the whole server. Docker brought
 * it back a few seconds later, and in between Nginx Proxy Manager answered
 * every visitor with 502 Bad Gateway. Reproduced before this fix with a single
 * GET /api/subscriptions/not-a-uuid/phases.
 *
 * This hands a rejected promise from ANY handler or middleware to next(err),
 * so it reaches the error handler in index.js and becomes one failed request
 * instead of an outage. It works at the one place every handler passes
 * through — Layer, which wraps each function given to app.use, router.use and
 * router.get/post/... — so no route has to remember to opt in. It is what the
 * express-async-errors package does, without the dependency.
 *
 * Must be required before any router is built. Express 5 does this natively;
 * delete this file when the app moves to it.
 */
const Layer = require('express/lib/router/layer');

const WRAPPED = Symbol('vqAsyncWrapped');

function wrap(fn) {
  if (typeof fn !== 'function' || fn[WRAPPED]) return fn;
  const wrapped = function asyncSafe(...args) {
    const ret = fn.apply(this, args);
    if (ret && typeof ret.then === 'function' && typeof ret.catch === 'function') {
      // (err, req, res, next) for error middleware, (req, res, next) otherwise.
      const next = args.length === 4 ? args[3] : args[2];
      ret.catch((err) => {
        if (typeof next === 'function') next(err || new Error('Rejected without a reason'));
        else console.error('Async handler failed with no next() to report to', err);
      });
    }
    return ret;
  };
  // Express tells an error handler from ordinary middleware by its arity,
  // so the wrapper must report exactly the arity of what it wraps.
  Object.defineProperty(wrapped, 'length', { value: fn.length });
  Object.keys(fn).forEach((k) => { wrapped[k] = fn[k]; });
  wrapped[WRAPPED] = true;
  return wrapped;
}

if (!Object.getOwnPropertyDescriptor(Layer.prototype, 'handle')) {
  Object.defineProperty(Layer.prototype, 'handle', {
    enumerable: true,
    configurable: true,
    get() { return this.__vqHandle; },
    set(fn) { this.__vqHandle = wrap(fn); },
  });
}

/**
 * What a failed request should say. Postgres error codes that can only mean
 * the caller sent something unusable are the caller's fault (4xx), not ours —
 * the handful of routes that already mapped 22P02 to a 400 by hand are the
 * pattern, applied everywhere.
 */
const PG_STATUS = {
  '22P02': [400, 'One of the values sent is not in the right format (for example, an id that is not a valid id).'],
  '22003': [400, 'A number sent is out of range.'],
  '22001': [400, 'A value sent is too long.'],
  '22007': [400, 'A date sent is not a valid date.'],
  '22008': [400, 'A date sent is out of range.'],
  '23502': [400, 'A required value is missing.'],
  '23503': [409, 'This refers to a record that does not exist, or is still in use by another record.'],
  '23505': [409, 'A record with this value already exists.'],
  '23514': [400, 'A value sent is not allowed here.'],
};

function errorResponse(err) {
  // body-parser: malformed JSON, oversized body. It already knows the status.
  const status = Number(err && (err.status || err.statusCode));
  if (status >= 400 && status < 500) {
    if (err.type === 'entity.parse.failed') return [400, 'The request body is not valid JSON.'];
    if (err.type === 'entity.too.large') return [413, 'The request is too large.'];
    return [status, err.expose && err.message ? err.message : 'The request could not be processed.'];
  }
  if (err && typeof err.code === 'string' && PG_STATUS[err.code]) return PG_STATUS[err.code];
  return [500, 'Internal server error'];
}

/** The app's last-resort error handler. Four arguments: that is how Express recognises it. */
function errorHandler(err, req, res, next) {
  const [status, message] = errorResponse(err);
  if (status >= 500) console.error(`${req.method} ${req.originalUrl} failed:`, err);
  else console.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err && (err.code || err.type || err.message)}`);
  // A response already under way (a PDF half-streamed) cannot become a JSON
  // error: Express's own handler closes the connection so it does not hang.
  if (res.headersSent) return next(err);
  // A caller's mistake may say exactly which parts were wrong (a survey
  // answer per question, say); a server fault never says more than its status.
  const details = status < 500 && err && err.details ? { details: err.details } : {};
  res.status(status).json({ error: message, ...details });
}

/**
 * The backstop behind the backstop. Anything still escaping — a timer, an
 * event handler, a fire-and-forget query nobody awaited — is logged and the
 * server keeps serving. A rejected promise leaves no half-finished state
 * behind it, so staying up is safe; crashing turns one bug into an outage for
 * every signed-in user.
 */
let guardsInstalled = false;
function installProcessGuards() {
  if (guardsInstalled) return;
  guardsInstalled = true;
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled promise rejection (server kept running):', reason);
  });
}

module.exports = { wrap, errorHandler, errorResponse, installProcessGuards };
