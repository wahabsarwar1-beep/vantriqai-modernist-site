/**
 * Voice notes metered and billed (v9.33).
 *
 * A WhatsApp voice note is transcribed by a speech-to-text model billed per
 * minute of audio. The usage webhook records how long it was, the monthly
 * rollup sums the minutes, a voice-minute rate bills the ones past the
 * allowance, and the service-status check tells an agent whether the client
 * has bought voice at all.
 *
 * Needs Postgres (DATABASE_URL in .env) and the API on 8099.
 *
 *   node test/voice-metering.test.js
 */
require('dotenv').config();
const crypto = require('crypto');
const db = require('../src/db');
const { hashKey } = require('../src/middleware/auth');
const { meteredCharges, buildMonthlyBill } = require('../src/utils/subscriptions');

const B = 'http://127.0.0.1:8099';
let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };

(async () => {
  const plain = 'vq_' + crypto.randomBytes(24).toString('hex');
  const { rows: key } = await db.query(
    `insert into api_keys (name, key_hash, scope) values ('voice test', $1, 'webhook') returning id`, [hashKey(plain)]);
  const H = { 'Content-Type': 'application/json', 'x-api-key': plain };
  const ref = 'voice-test-' + crypto.randomBytes(3).toString('hex');
  const { rows: cl } = await db.query(
    `insert into clients (name, company, external_ref) values ('Voice Test', 'Voice Test Co', $1) returning *`, [ref]);
  const client = cl[0];
  const post = (body) => fetch(B + '/api/webhooks/usage', { method: 'POST', headers: H, body: JSON.stringify(body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const status = () => fetch(`${B}/api/webhooks/service-status?external_ref=${ref}`, { headers: H }).then((r) => r.json());

  try {
    console.log('\n== the webhook records voice-note length ==');
    const session = '923000000000-2026-10-09';
    let r = await post({ external_ref: ref, session_id: session, channel: 'whatsapp', ai_model: 'gpt-5-mini',
      input_tokens: 4800, output_tokens: 210, voice_seconds: 45, stt_model: 'whisper-1', estimated: false });
    ok(r.status === 201, 'a turn with a 45-second voice note is accepted', r.status);
    r = await post({ external_ref: ref, session_id: session, input_tokens: 4900, output_tokens: 190, voice_seconds: 75, stt_model: 'whisper-1' });
    ok(r.status === 201, 'and a second, 75 seconds', r.status);
    r = await post({ external_ref: ref, session_id: session, input_tokens: 5000, output_tokens: 150, estimated: true });
    ok(r.status === 201, 'a text turn sends no voice at all', r.status);
    r = await post({ external_ref: ref, session_id: session, voice_seconds: -3 });
    ok(r.status === 400 && /voice_seconds/.test(r.body.error), 'a negative length is refused', r.status);
    r = await post({ external_ref: ref, session_id: session, voice_seconds: 'abc' });
    ok(r.status === 400, 'so is one that is not a number', r.status);
    r = await post({ external_ref: ref, session_id: session, voice_seconds: 99999 });
    ok(r.status === 400, 'and one longer than an hour', r.status);

    const { rows: ev } = await db.query(
      `select voice_seconds, stt_model, tokens_estimated from usage_events where client_id = $1 order by created_at`, [client.id]);
    ok(ev.length === 3 && Number(ev[0].voice_seconds) === 45 && ev[0].stt_model === 'whisper-1' && ev[0].tokens_estimated === false,
      'the event keeps the seconds, the model and that the tokens were real', JSON.stringify(ev[0]));
    ok(Number(ev[2].voice_seconds) === 0 && ev[2].stt_model === '' && ev[2].tokens_estimated === true,
      'a text turn stores no voice and no speech-to-text model', JSON.stringify(ev[2]));
    ok(ev[1].tokens_estimated === null, 'a flow that does not say leaves "estimated" unknown', JSON.stringify(ev[1]));

    const { rows: mu } = await db.query(
      `select voice_minutes from v_monthly_usage where client_id = $1`, [client.id]);
    ok(Number(mu[0].voice_minutes) === 2, 'the month rolls up to 2 voice minutes', mu[0] && mu[0].voice_minutes);

    console.log('\n== voice is an add-on ==');
    let s = await status();
    ok(s.allow === true && s.voice === false, 'a client without a voice-minute rate is told voice is off', JSON.stringify(s));

    const month = new Date().toISOString().slice(0, 7);
    let lines = await meteredCharges(client, month);
    ok(!lines.some((l) => l.metric === 'voice_minute'), 'and nothing is billed for voice', JSON.stringify(lines));

    await db.query(
      `insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label)
       values ($1, 'voice_minute', 5, 1, 1, 'Voice-note minutes')`, [client.id]);
    s = await status();
    ok(s.voice === true, 'once they have a voice-minute rate, voice is on', JSON.stringify(s));
    lines = await meteredCharges(client, month);
    const v = lines.find((l) => l.metric === 'voice_minute');
    ok(v && v.qty === 1 && v.amount === 5 && /2 used, 1 included/.test(v.detail),
      'minutes past the allowance are billed: 2 used, 1 included, 1 × PKR 5', JSON.stringify(v));

    await db.query(`delete from usage_rates where client_id = $1`, [client.id]);
    const { rows: prod } = await db.query(`select id from products order by sort_order limit 1`);
    await db.query(`update clients set product_id = $2 where id = $1`, [client.id, prod[0].id]);
    await db.query(
      `insert into usage_rates (product_id, metric, unit_rate, included_units, unit_size, label)
       values ($1, 'voice_minute', 5, 0, 1, 'Voice test package rate')`, [prod[0].id]);
    s = await status();
    ok(s.voice === true, 'a voice rate on their package switches it on too', JSON.stringify(s));
    // Over both allowances: a voice-note rate card and the conversation
    // quota (Enterprise+, the tier whose quota can be set per client). Both
    // must be billed.
    await post({ external_ref: ref, session_id: `${session}-second`, input_tokens: 500, output_tokens: 80 });
    const { rows: ep } = await db.query(`select id from products where name = 'Enterprise+'`);
    await db.query(`update clients set product_id = $2, custom_quota = 1, custom_overage_rate = 7 where id = $1`, [client.id, ep[0].id]);
    await db.query(
      `insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label)
       values ($1, 'voice_minute', 5, 1, 1, 'Voice test client rate')`, [client.id]);
    const { rows: fresh } = await db.query(`select * from clients where id = $1`, [client.id]);
    const bill = await buildMonthlyBill(fresh[0], month);
    const kinds = bill ? bill.lines.map((l) => l.metric || l.kind) : [];
    ok(kinds.includes('voice_minute') && kinds.includes('overage'),
      'voice-note overage is billed beside conversation overage, not instead of it', JSON.stringify(kinds));
    await db.query(`delete from usage_rates where client_id = $1 and label = 'Voice test client rate'`, [client.id]);
    await db.query(`update clients set product_id = $2 where id = $1`, [client.id, prod[0].id]);
    await db.query(`update clients set custom_quota = null, custom_overage_rate = null where id = $1`, [client.id]);
    await db.query(`delete from usage_rates where product_id = $1 and label = 'Voice test package rate'`, [prod[0].id]);

    console.log('\n== the Voice Agent bills phone-call minutes ==');
    let c = await post({ external_ref: ref, session_id: `${session}-call`, channel: 'voice', input_tokens: 900, output_tokens: 120, call_seconds: 95 });
    ok(c.status === 201, 'a phone call reports its connected length', c.status);
    c = await post({ external_ref: ref, session_id: `${session}-call`, call_seconds: 99999 });
    ok(c.status === 400 && /call_seconds/.test(c.body.error), 'a call longer than four hours is refused', c.status);
    const { rows: cm } = await db.query(`select call_minutes from v_monthly_usage where client_id = $1`, [client.id]);
    ok(Math.abs(Number(cm[0].call_minutes) - 1.58) < 0.01, 'the month rolls up 95 seconds as 1.58 call minutes', cm[0] && cm[0].call_minutes);
    const { rows: ses } = await db.query(`select sessions from v_monthly_usage where client_id = $1`, [client.id]);
    ok(Number(ses[0].sessions) === 2, 'a phone call is not counted as a package conversation (2 chats, 1 call)', ses[0] && ses[0].sessions);
    await db.query(
      `insert into usage_rates (client_id, metric, unit_rate, included_units, unit_size, label)
       values ($1, 'call_minute', 85, 1, 1, 'Phone-call minutes')`, [client.id]);
    lines = await meteredCharges(client, month);
    const call = lines.find((l) => l.metric === 'call_minute');
    ok(call && Math.abs(call.amount - 85 * (95 / 60 - 1)) < 1, 'call minutes past the allowance are billed at the add-on rate', JSON.stringify(call));
    await db.query(`delete from usage_rates where client_id = $1 and metric = 'call_minute'`, [client.id]);
    const { rows: va } = await db.query(`select meter, included_units, overage_rate from catalog_addons where key = 'voice-call-agent'`);
    ok(va[0] && va[0].meter === 'call_minute' && Number(va[0].included_units) === 0 && Number(va[0].overage_rate) === 40,
      'the Voice Agent add-on bills every call minute at PKR 40 (v9.34)', JSON.stringify(va[0]));

    const { rows: own } = await db.query(`select external_ref from clients where is_internal limit 1`);
    if (own[0] && own[0].external_ref) {
      const o = await fetch(`${B}/api/webhooks/service-status?external_ref=${encodeURIComponent(own[0].external_ref)}`, { headers: H }).then((x) => x.json());
      ok(o.voice === true, 'our own account always has voice', JSON.stringify(o));
    }
    const unknown = await fetch(`${B}/api/webhooks/service-status?external_ref=nobody-${ref}`, { headers: H }).then((x) => x.json());
    ok(unknown.allow === true && unknown.voice === true, 'an unknown sender is served, voice included (it fails open)', JSON.stringify(unknown));
  } finally {
    await db.query(`delete from clients where id = $1`, [client.id]);
    await db.query(`delete from api_keys where id = $1`, [key[0].id]);
  }

  await db.pool.end();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error(e); try { await db.pool.end(); } catch (x) { /* already closed */ } process.exit(1); });
