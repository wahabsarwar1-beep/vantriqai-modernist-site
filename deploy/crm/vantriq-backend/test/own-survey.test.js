/**
 * VantriqAI's own survey (ensureOwnSurvey): made once, live, and never
 * brought back once it has been deleted.
 *
 * Talks to the database in .env directly. Works on a throwaway client rather
 * than the real internal account, and puts settings.own_survey_at back the
 * way it found it.
 *
 *   node test/own-survey.test.js
 */
require('dotenv').config();
const db = require('../src/db');
const S = require('../src/utils/surveys');

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const flag = async () => (await db.query(`select own_survey_at from settings where id = 1`)).rows[0].own_survey_at;
const setFlag = (v) => db.query(`update settings set own_survey_at = $1 where id = 1`, [v]);
const count = async (clientId) => (await db.query(`select count(*)::int as n from surveys where client_id = $1`, [clientId])).rows[0].n;

(async () => {
  const saved = await flag();
  const stamp = Date.now();
  const { rows } = await db.query(
    `insert into clients (name, company, email, external_ref, stage, source)
     values ('Own survey test', $1, 'placeholder@example.com', $2, 'active', 'Internal') returning *`,
    [`Own Survey Co ${stamp}`, `own-survey-${stamp}`]
  );
  const client = rows[0];
  try {
    const mailbox = (await db.query(`select internal_invoice_email from settings where id = 1`)).rows[0].internal_invoice_email;
    const slugTaken = !!(await S.getSurveyBySlug(S.OWN_SURVEY_SLUG));

    console.log('\n== the first run makes it ==');
    await setFlag(null);
    const first = await S.ensureOwnSurvey(client);
    const s = first.survey || {};
    ok(first.created === true, 'a survey is made');
    ok(slugTaken ? s.slug !== S.OWN_SURVEY_SLUG && /-[0-9a-f]{5}$/.test(s.slug) : s.slug === S.OWN_SURVEY_SLUG,
      slugTaken ? 'the address is taken here, so it gets a made-up one' : `at the memorable address /s/${S.OWN_SURVEY_SLUG}`, s.slug);
    ok(s.status === 'live', 'live at once', s.status);
    ok(s.industry === 'professional' && s.questions.length >= 5, 'from the professional-services template', `${s.industry} ${s.questions && s.questions.length}`);
    ok(s.display_name === client.company, 'in the account\'s own name', s.display_name);
    ok(s.languages.join() === 'en,ur', 'in English and Urdu', s.languages.join());
    ok(s.alert_emails === mailbox, `unhappy answers go to ${mailbox}, not the account's placeholder address`, s.alert_emails);
    ok(/^https:\/\/.+\/brand\/mark\.svg$/.test(s.logo_url), 'with the VantriqAI mark as its logo', s.logo_url);
    ok(first.url.endsWith(`/s/${s.slug}`) && first.url.startsWith('https://'), 'and its public address is reported', first.url);
    ok(!!(await flag()), 'the flag records that it was made');

    console.log('\n== later runs leave it alone ==');
    const second = await S.ensureOwnSurvey(client);
    ok(second.created === false && (await count(client.id)) === 1, 'a second run makes nothing', JSON.stringify(second));

    await S.deleteSurvey(s);
    const third = await S.ensureOwnSurvey(client);
    ok(third.created === false && (await count(client.id)) === 0, 'deleted is final: it is not brought back', JSON.stringify(third));

    console.log('\n== an account already using surveys gets none ==');
    await setFlag(null);
    const theirs = await S.createSurvey({ client, template: 'general', input: { status: 'draft' } });
    const fourth = await S.ensureOwnSurvey(client);
    ok(fourth.created === false && (await count(client.id)) === 1, 'nothing is added', JSON.stringify(fourth));
    ok(!!(await flag()), 'and it is not asked again');
    await S.deleteSurvey(theirs);

    console.log('\n== a failure is tried again next time ==');
    await setFlag(null);
    let threw = null;
    try {
      await S.ensureOwnSurvey({ ...client, id: '00000000-0000-0000-0000-000000000000' });
    } catch (err) { threw = err; }
    ok(!!threw, 'making it fails (no such account)', 'did not throw');
    ok((await flag()) === null, 'so the claim is undone and the next run tries again');
  } finally {
    await db.query(`delete from clients where id = $1`, [client.id]);
    await setFlag(saved);
    await db.pool.end().catch(() => {});
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
