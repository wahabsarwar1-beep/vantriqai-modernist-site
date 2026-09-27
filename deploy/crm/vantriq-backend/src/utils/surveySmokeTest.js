/**
 * A live, self-cleaning check that surveys work end to end on this install.
 *
 *   npm run survey-smoke
 *
 * Run by upgrade-v9.sh inside the container after every deploy. It makes a
 * temporary survey on VantriqAI's own internal account, opens its page and
 * sends one answer through the real public endpoint — the same path a
 * customer's phone takes — then checks the answer reached the survey's
 * results AND the Analytics dashboards, and deletes everything it made
 * (the survey, the response and the dashboard row go together). Nothing is
 * emailed: the survey has no alert list, and the answer is a happy one.
 * Then the after-chat rules the WhatsApp flow depends on are run against a
 * made-up conversation inside a transaction that is rolled back.
 *
 * Prints PASS/FAIL lines and exits non-zero on any failure.
 */
require('dotenv').config();
const db = require('../db');
const S = require('./surveys');
const { clientAnalytics } = require('./analytics');

const BASE = `http://127.0.0.1:${process.env.PORT || 8080}`;
let failed = 0;
const check = (cond, msg, extra = '') => {
  if (!cond) failed += 1;
  console.log(`  ${cond ? 'PASS' : 'FAIL'} ${msg}${cond || !extra ? '' : `  <<< ${extra}`}`);
};

async function run() {
  const { rows } = await db.query(`select id, company, email from clients where is_internal order by created_at limit 1`);
  const client = rows[0];
  if (!client) {
    console.log('  SKIP no internal account on this install (npm run seed-internal creates it)');
    return;
  }

  let survey = null;
  try {
    survey = await S.createSurvey({
      client,
      template: 'support_chat',
      input: { title: 'Deploy check — deleted automatically', alert_emails: '', status: 'live' },
      createdBy: 'survey-smoke',
    });
    check(!!survey && survey.status === 'live', `a temporary survey is created (${survey && survey.slug})`);

    const before = (await clientAnalytics(client.id, { grain: 'month' })).satisfaction.kpis.csat.responses;

    const page = await fetch(`${BASE}/s/${survey.slug}`);
    const html = await page.text();
    check(page.status === 200 && html.includes(`"slug":"${survey.slug}"`), 'its page is served with the survey inside');

    const qr = await fetch(`${BASE}/s/${survey.slug}/qr.svg`);
    check(qr.status === 200 && (await qr.text()).startsWith('<svg'), 'its QR code is drawn');

    const res = await fetch(`${BASE}/api/public/surveys/${survey.slug}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: { csat: 5, resolved: true, comment: 'Deploy check' },
        submission_id: `smoke-${Date.now()}`,
        channel: 'link',
      }),
    });
    const body = await res.json().catch(() => ({}));
    check(res.status === 201 && body.ok, 'an answer is accepted through the public endpoint', `${res.status} ${JSON.stringify(body)}`);

    const results = await S.surveyAnalytics(survey, { grain: 'month' });
    check(results.kpis.responses.current === 1 && results.kpis.csat.current === 100, 'it shows in the survey\'s own results');

    const after = (await clientAnalytics(client.id, { grain: 'month' })).satisfaction.kpis.csat.responses;
    check(after === before + 1, 'and in the Analytics dashboards (CRM and portal)', `${before} -> ${after}`);

    // The after-chat rules the WhatsApp flow in n8n relies on, against this
    // database: a made-up conversation, inside a transaction that is rolled
    // back, so no usage (which is billed) is ever left behind.
    const conn = await db.pool.connect();
    try {
      await conn.query('begin');
      const sid = `000${Date.now()}-${new Date().toISOString().slice(0, 10)}`;
      await conn.query(
        `insert into usage_events (client_id, session_id, channel, messages_count, occurred_at)
         values ($1, $2, 'whatsapp', 1, now() - interval '70 minutes'), ($1, $2, 'whatsapp', 1, now() - interval '65 minutes')`,
        [client.id, sid]
      );
      const verdict = (body) => S.chatVerdict(conn, { clientId: client.id, sessionId: sid, rules: S.chatRules(body), now: new Date() });
      const due = await verdict({ quiet_minutes: 55, min_messages: 2 });
      check(due.due === true && due.messages === 2, 'after-chat: a conversation quiet for an hour is due its survey', JSON.stringify(due));
      const talking = await verdict({ quiet_minutes: 90 });
      check(talking.code === 'still_talking', 'after-chat: one still going is not', JSON.stringify(talking));
      const short = await verdict({ quiet_minutes: 55, min_messages: 3 });
      check(short.code === 'too_short', 'after-chat: nor one too short to ask about', JSON.stringify(short));
      const none = await S.chatVerdict(conn, { clientId: client.id, sessionId: `111${Date.now()}`, rules: S.chatRules({ quiet_minutes: 55 }), now: new Date() });
      check(none.code === 'no_conversation', 'after-chat: nor a customer with no conversation', JSON.stringify(none));
    } finally {
      await conn.query('rollback').catch(() => {});
      conn.release();
    }
  } finally {
    if (survey) {
      await S.deleteSurvey(survey);
      const { rows: left } = await db.query(
        `select (select count(*) from surveys where id = $1)::int as s,
                (select count(*) from survey_responses where survey_id = $1)::int as r`,
        [survey.id]
      );
      check(left[0].s === 0 && left[0].r === 0, 'and everything it made is deleted again');
    }
  }
}

run()
  .catch((err) => { failed += 1; console.log(`  FAIL ${err.message}`); })
  .finally(async () => {
    await db.pool.end().catch(() => {});
    process.exit(failed ? 1 : 0);
  });
