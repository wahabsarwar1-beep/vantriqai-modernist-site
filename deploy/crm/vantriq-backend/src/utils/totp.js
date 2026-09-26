const crypto = require('crypto');

/**
 * TOTP (RFC 6238) over HMAC-SHA1 (RFC 4226), written by hand rather than
 * pulling in a package for it. The algorithm is ~30 lines of Node's own
 * crypto module and every authenticator app (Google Authenticator, Authy,
 * 1Password, ...) already assumes these exact defaults — 30-second step,
 * 6 digits, SHA-1 — so there is nothing a dependency would buy here except
 * one more package with write access to a login path.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function randomSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function base32Encode(buf) {
  let bits = '';
  for (const byte of buf) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  const rem = bits.length % 5;
  if (rem) out += BASE32_ALPHABET[parseInt(bits.slice(-rem).padEnd(5, '0'), 2)];
  return out;
}

function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of clean) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The 6-digit code for one 30-second step, counted from the Unix epoch. */
function codeForCounter(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(truncated % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Checks a code against the current step and one step either side, so a
 * code typed just as the clock rolls over — or a phone a few seconds out
 * of sync — still verifies. Any wider than that starts trading security
 * for convenience the other way.
 */
function verifyTotp(secretBase32, code, { window = 1, at = Date.now() } = {}) {
  const cleaned = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  for (let drift = -window; drift <= window; drift += 1) {
    if (codeForCounter(secretBase32, counter + drift) === cleaned) return true;
  }
  return false;
}

/** The code a real authenticator app would be showing right now for this
 *  secret. Exported for tests, which stand in for "someone reading their
 *  phone" — there is no other way to drive the confirm/verify routes
 *  without one. */
function currentCode(secretBase32, at = Date.now()) {
  return codeForCounter(secretBase32, Math.floor(at / 1000 / STEP_SECONDS));
}

/** otpauth:// URI an authenticator app scans or accepts as manual entry. */
function otpauthUri(secretBase32, { issuer = 'VantriqAI CRM', account }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

module.exports = { randomSecret, verifyTotp, otpauthUri, currentCode };
