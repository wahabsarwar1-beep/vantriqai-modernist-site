/**
 * VantriqAI's own surveys (ensureOwnSurveys): "Customer feedback" and "After
 * a WhatsApp chat" — each made once, live, and never brought back once it
 * has been deleted.
 *
 * Talks to the database in .env directly. Works on a throwaway client rather
 * than the real internal account, and puts both settings flags back the way
 * it found them.
 *
 *   node test/own-survey.test.js
 */
require('dotenv').config();
const db = require('../src/db');
const S = require('../src/utils/surveys');

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const flags = async () => (await db.query(`select own_survey_at, own_chat_survey_at from settings where id = 1`)).rows[0];
const setFlags = (a, b) => db.query(`update settings set own_survey_at = $1, own_chat_survey_at = $2 where id = 1`, [a, b]);
const surveysOf = async (clientId) => (await db.query(
  `select id, slug, industry from surveys where client_id = $1 order by created_at`, [clientId])).rows;

(async () => {
  const saved = await flags();
  const stamp = Date.now();
  const { rows } = await db.query(
    `insert into clients (name, company, email, external_ref, stage, source)
     values ('Own survey test', $1, 'placeholder@example.com', $2, 'active', 'Internal') returning *`,
    [`Own Survey Co ${stamp}`, `own-survey-${stamp}`]
  );
  const client = rows[0];
  try {
    const mailbox = (await db.query(`select internal_invoice_email from settings where id = 1`)).rows[0].internal_invoice_email;
    const taken = {
      feedback: !!(await S.getSurveyBySlug(S.OWN_SURVEY_SLUG)),
      chat: !!(await S.getSurveyBySlug(S.OWN_CHAT_SURVEY_SLUG)),
    };

    console.log('\n== the first run makes both ==');
    await setFlags(null, null);
    const first = await S.ensureOwnSurveys(client);
    const [fb, chat] = first;
    ok(first.length === 2 && fb.created && chat.created, 'two surveys are made', JSON.stringify(first.map((x) => x.reason || x.error || x.slug)));
    const f = fb.survey || {}, c = chat.survey || {};
    const addr = (s, slug, isTaken) => (isTaken ? s.slug !== slug && /-[0-9a-f]{5}$/.test(s.slug) : s.slug === slug);
    ok(addr(f, S.OWN_SURVEY_SLUG, taken.feedback), taken.feedback ? 'feedback: its address is taken here, so a made-up one' : `feedback at /s/${S.OWN_SURVEY_SLUG}`, f.slug);
    ok(addr(c, S.OWN_CHAT_SURVEY_SLUG, taken.chat), taken.chat ? 'after-chat: its address is taken here, so a made-up one' : `after-chat at /s/${S.OWN_CHAT_SURVEY_SLUG}`, c.slug);
    ok(f.industry === 'professional' && f.questions.length >= 5, 'feedback: the professional-services template', f.industry);
    ok(c.industry === 'support_chat' && c.questions.length === 3, 'after-chat: the three-tap chat template', `${c.industry} ${c.questions && c.questions.length}`);
    for (const [label, s] of [['feedback', f], ['after-chat', c]]) {
      ok(s.status === 'live' && s.display_name === client.company && s.languages.join() === 'en,ur',
        `${label}: live, in the account's name, English and Urdu`, `${s.status} ${s.display_name} ${s.languages}`);
      ok(s.alert_emails === mailbox, `${label}: unhappy answers go to ${mailbox}`, s.alert_emails);
      ok(/^https:\/\/.+\/brand\/mark\.svg$/.test(s.logo_url), `${label}: the VantriqAI mark as its logo`, s.logo_url);
    }
    ok(first.every((x) => x.url && x.url.startsWith('https://') && x.url.endsWith(`/s/${x.survey.slug}`)), 'their public addresses are reported');
    const fl = await flags();
    ok(!!fl.own_survey_at && !!fl.own_chat_survey_at, 'both flags record that they were made');
    const def = await S.defaultSurveyFor(client.id);
    ok(def && def.id === c.id, 'the after-chat one is what a WhatsApp invite sends');

    console.log('\n== later runs leave them alone ==');
    const second = await S.ensureOwnSurveys(client);
    ok(second.every((x) => !x.created) && (await surveysOf(client.id)).length === 2, 'a second run makes nothing', JSON.stringify(second));
    await S.deleteSurvey(f);
    await S.deleteSurvey(c);
    const third = await S.ensureOwnSurveys(client);
    ok(third.every((x) => !x.created) && (await surveysOf(client.id)).length === 0, 'deleted is final: neither comes back', JSON.stringify(third));

    console.log('\n== an account already using surveys ==');
    await setFlags(null, null);
    const theirs = await S.createSurvey({ client, template: 'general', input: { status: 'draft' } });
    const fourth = await S.ensureOwnSurveys(client);
    ok(!fourth[0].created && fourth[0].reason === 'the account already has surveys', 'gets no feedback survey', JSON.stringify(fourth[0]));
    ok(fourth[1].created && fourth[1].survey.industry === 'support_chat', 'but does get the after-chat one it lacks', JSON.stringify(fourth[1].reason || fourth[1].error));
    await setFlags(null, null);
    const fifth = await S.ensureOwnSurveys(client);
    ok(fifth.every((x) => !x.created) && (await surveysOf(client.id)).length === 2, 'one that has both kinds gets neither', JSON.stringify(fifth));
    const fl2 = await flags();
    ok(!!fl2.own_survey_at && !!fl2.own_chat_survey_at, 'and is not asked again');
    await S.deleteSurvey(theirs);
    await S.deleteSurvey(fourth[1].survey);

    console.log('\n== a failure is tried again next time ==');
    await setFlags(null, null);
    const broken = await S.ensureOwnSurveys({ ...client, id: '00000000-0000-0000-0000-000000000000' });
    ok(broken.every((x) => !x.created && x.error), 'making them fails (no such account), and says why', JSON.stringify(broken));
    const fl3 = await flags();
    ok(fl3.own_survey_at === null && fl3.own_chat_survey_at === null, 'so both claims are undone and the next run tries again');
  } finally {
    await db.query(`delete from clients where id = $1`, [client.id]);
    await setFlags(saved.own_survey_at, saved.own_chat_survey_at);
    await db.pool.end().catch(() => {});
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
