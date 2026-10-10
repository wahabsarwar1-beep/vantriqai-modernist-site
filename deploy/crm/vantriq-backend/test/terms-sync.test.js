/**
 * The terms a client signs are the terms the website publishes (v9.33).
 *
 * The website renders lib/terms.json; every scope sign-off snapshots this
 * CRM's src/content/terms.json into what the client signs. The CRM deploys
 * on its own, so it carries a copy — and this fails if the copy drifts from
 * the website's, or if either is malformed.
 *
 * No database or server needed.
 *
 *   node test/terms-sync.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };

const crm = path.join(__dirname, '..', 'src', 'content', 'terms.json');
const site = path.join(__dirname, '..', '..', '..', '..', 'lib', 'terms.json');

const t = JSON.parse(fs.readFileSync(crm, 'utf8'));
ok(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/.test(t.version), 'the terms carry a dated version (with a revision number when one day has two)', t.version);
ok(Array.isArray(t.sections) && t.sections.length >= 10, 'and their sections', t.sections && t.sections.length);
ok(t.sections.every((s) => s.id && s.heading && ((s.paragraphs || []).length || (s.bullets || []).length)),
  'every section has an id, a heading and some text');
ok(new Set(t.sections.map((s) => s.id)).size === t.sections.length, 'section ids are unique');
const text = JSON.stringify(t);
for (const [re, what] of [
  [/partner|role-based|role/, 'how account access is given'],
  [/never VantriqAI's|owned by and registered in the name of your business/, 'who owns the accounts'],
  [/passwords, one-time verification codes/, 'that we never ask for passwords or codes'],
  [/overage rate/, 'overage'],
  [/withholding/, 'withholding tax'],
  [/suspend/, 'suspension for non-payment'],
  [/change request/, 'change requests'],
  [/Meta or WhatsApp Business Platform conversation/, 'Meta charges as the client\'s own'],
]) ok(re.test(text), `the terms cover ${what}`);

if (fs.existsSync(site)) {
  ok(fs.readFileSync(site, 'utf8') === fs.readFileSync(crm, 'utf8'),
    'the CRM\'s copy is byte-identical to the website\'s lib/terms.json',
    'copy lib/terms.json to deploy/crm/vantriq-backend/src/content/terms.json');
} else {
  console.log('  SKIP the website copy is not in this checkout');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
