const assert = require('node:assert/strict');
const { checkOwnerAccess } = require('../src/utils/ownerAccess');
require.cache[require.resolve('../src/db')] = { exports: {} };
const { PRICING_EMAIL, isPricingOwner, requireCeo } = require('../src/middleware/auth');
const oldOwner = process.env.OWNER_EMAIL, oldPricing = process.env.PRICING_EMAIL;
(async () => {
  delete process.env.PRICING_EMAIL;
  process.env.OWNER_EMAIL = ' Owner@vantriqai.com ';
  assert.equal(PRICING_EMAIL(), 'owner@vantriqai.com');
  assert.equal(isPricingOwner({ is_owner: true, email: 'owner@vantriqai.com' }), true);
  assert.equal(isPricingOwner({ is_owner: false, email: 'owner@vantriqai.com' }), false);
  let allowed = false;
  requireCeo({ authKind: 'session', user: { is_owner: true, email: 'owner@vantriqai.com' } }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
  let status;
  requireCeo({ authKind: 'apikey', user: { is_owner: true, email: 'owner@vantriqai.com' } }, { status: n => { status = n; return { json: () => {} }; } }, () => assert.fail('API key must not obtain owner areas'));
  assert.equal(status, 403);
  process.env.PRICING_EMAIL = 'pricing@vantriqai.com';
  assert.equal(PRICING_EMAIL(), 'pricing@vantriqai.com');
  assert.equal(isPricingOwner({ is_owner: true, email: 'owner@vantriqai.com' }), false);
  const owner = { email: 'owner@vantriqai.com', role: 'admin', active: true, must_change_password: false, must_setup_totp: false, totp_enabled: true };
  const options = { ownerEmail: owner.email, pricingEmail: owner.email, mailConfigured: true };
  const check = rows => checkOwnerAccess({ query: async sql => {
    assert.match(sql, /^select /); assert.doesNotMatch(sql, /password_hash|totp_secret|token/i); return { rows };
  } }, options);
  const good = await check([owner]); assert.equal(good.ready, true);
  assert.equal(good.recovery.email_delivery_verified, false);
  assert.equal(good.recovery.lost_authenticator_recovery_verified, false);
  for (const rows of [[], [owner, owner], [{ ...owner, active: false }], [{ ...owner, role: 'staff' }], [{ ...owner, email: 'other@example.com' }], [{ ...owner, must_setup_totp: true }], [{ ...owner, totp_enabled: false }], [{ ...owner, must_change_password: true }]]) assert.equal((await check(rows)).ready, false);
  console.log('Owner access checks passed: custom owner configuration, explicit Pricing policy, owner-only session access, read-only diagnostics and honest recovery status.');
})().catch(err => { console.error(err); process.exitCode = 1; }).finally(() => {
  if (oldOwner === undefined) delete process.env.OWNER_EMAIL; else process.env.OWNER_EMAIL = oldOwner;
  if (oldPricing === undefined) delete process.env.PRICING_EMAIL; else process.env.PRICING_EMAIL = oldPricing;
});
