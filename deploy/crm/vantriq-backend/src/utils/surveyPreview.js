const crypto = require('crypto');
// A configured key supports multiple replicas; the private process key makes
// single-instance deployments safe without requiring a new secret to boot.
const key = process.env.SURVEY_PREVIEW_SECRET || crypto.randomBytes(32);
function signature(slug, expires) {
  return crypto.createHmac('sha256', key).update(slug + ':' + expires).digest('hex');
}
function issuePreview(slug) {
  const expires = Math.floor(Date.now() / 1000) + 900;
  return expires + '.' + signature(slug, expires);
}
function validPreview(slug, token) {
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(String(token || ''));
  if (!match || Number(match[1]) <= Date.now() / 1000 || Number(match[1]) > Date.now() / 1000 + 901) return false;
  return crypto.timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(signature(slug, match[1]), 'hex'));
}
module.exports = { issuePreview, validPreview };
