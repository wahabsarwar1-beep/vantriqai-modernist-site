/**
 * The visitor's address, for rate limiting and de-duplicating survey opens.
 * Never stored.
 *
 * Behind Nginx Proxy Manager the TCP peer is the proxy, on the private Docker
 * network, and NPM sets X-Real-IP to the real client — overwriting anything
 * the client sent. So X-Real-IP is believed only when the request actually
 * arrived from a private address: a request that reaches the app directly
 * cannot claim to be somebody else.
 *
 * Deliberately not app.set('trust proxy'): that would also change how
 * req.hostname reads, which is what tells the portal host from the CRM's.
 */
const PRIVATE = /^(::ffff:)?(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function clientIp(req) {
  const peer = String((req.socket && req.socket.remoteAddress) || '');
  const viaProxy = PRIVATE.test(peer) || peer === '::1' || /^f[cd]/i.test(peer);
  if (viaProxy) {
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real) return real.slice(0, 64);
    const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1].slice(0, 64);
  }
  return peer;
}

module.exports = { clientIp };
