const crypto = require('crypto');

/**
 * Portal passwords, hashed with scrypt from Node's own crypto — no extra
 * dependency to install on the server. Format: scrypt$<salt-hex>$<hash-hex>.
 */
const KEYLEN = 64;

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  let actual;
  try {
    actual = crypto.scryptSync(String(plain), salt, KEYLEN).toString('hex');
  } catch { return false; }
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Readable but unguessable — avoids look-alike characters (0/O, 1/l/I). */
function generatePassword(len = 14) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

module.exports = { hashPassword, verifyPassword, generatePassword };
