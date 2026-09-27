/**
 * After-chat surveys (v9.14.1): POST /api/webhooks/survey-invite with the
 * "only if the conversation is over" rules the WhatsApp flow in n8n sends.
 *
 * Conversations are made the way n8n makes them — usage posts through
 * /api/webhooks/usage, one per answered message, dated in the past — so the
 * rules are checked against the same records production has. Covers every
 * "not now" answer, the one "yes", that yes coming exactly once even when
 * several waits end at the same moment, a conversation that runs past
 * midnight, sending hours, languages, dry runs, and that the old call
 * without rules still works.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Deletes its
 * client at the end (everything it made goes with it).
 *
 *   node test/after-chat.test.js
 */
const fs = require('fs');
const B = 'http://127.0.0.1:8099';
const AH = { 'Content-Type': 'application/json', 'x-api-key': fs.readFileSync('/tmp/adminkey', 'utf8').trim() };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, b) => fetch(B + p, { method, headers: AH, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (p, b) => call('POST', p, b);

const stamp = Date.now();
const REF = `afterchat-${stamp}`;
const day = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
let n = 0;
const phone = () => `9230${String(stamp).slice(-5)}${String(++n).padStart(2, '0')}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60000).toISOString();
const say = (sessionId, ...ago) => Promise.all(ago.map((m) => post('/api/webhooks/usage', {
  external_ref: REF, session_id: sessionId, channel: 'whatsapp', ai_model: 'test', messages_count: 1, occurred_at: minutesAgo(m),
})));
const RULES = { quiet_minutes: 55, min_messages: 2, within_hours: 23, once_per_days: 14 };
const ask = (sessionId, extra = {}) => post('/api/webhooks/survey-invite', {
  external_ref: REF, session_id: sessionId, channel: 'whatsapp', ...RULES, ...extra,
});
const pktHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));

(async () => {
  const growth = (await call('GET', '/api/products')).body.find((p) => p.name === 'Growth');
  const client = (await post('/api/clients', {
    name: 'After chat', company: `After Chat Test ${stamp}`, email: 'afterchat@example.com', phone: '923001234000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: REF,
    ntn: '1234567-8', billing_address: 'Lahore',
  })).body;
  ok(client && client.id, 'a throwaway client');
  try {
    const survey = (await post('/api/surveys', { client_id: client.id, template: 'support_chat', title: 'After a WhatsApp chat' })).body;
    ok(survey && survey.status === 'live', 'with a live after-chat survey');

    console.log('\n== what it refuses ==');
    ok((await post('/api/webhooks/survey-invite', { external_ref: REF, quiet_minutes: 55 })).status === 400,
      'rules without a session id (400)');
    ok((await ask(`${phone()}-${day()}`, { timezone: 'Mars/Olympus' })).status === 400, 'a time zone that is not one (400)');
    ok((await ask(`${phone()}-${day()}`, { send_from: 9 })).status === 400, 'sending hours with no end (400)');
    ok((await ask(`${phone()}-${day()}`, { quiet_minutes: 0 })).status === 400, 'quiet_minutes of 0 (400)');

    console.log('\n== every "not now" ==');
    const none = await ask(`${phone()}-${day()}`);
    ok(none.status === 200 && none.body.due === false && none.body.code === 'no_conversation',
      'no conversation on record: not now', JSON.stringify(none.body));

    const talking = `${phone()}-${day()}`;
    await say(talking, 30, 10);
    const t = await ask(talking);
    ok(t.status === 200 && t.body.code === 'still_talking' && t.body.messages === 2, 'last message 10 minutes ago: still talking', JSON.stringify(t.body));

    const short = `${phone()}-${day()}`;
    await say(short, 70);
    const s = await ask(short);
    ok(s.status === 200 && s.body.code === 'too_short', 'one message, an hour ago: too short to ask about', JSON.stringify(s.body));

    const old = `${phone()}-${day(-1)}`;
    await say(old, 26 * 60, 25 * 60);
    const w = await ask(old);
    ok(w.status === 200 && w.body.code === 'window_closed', 'last message 25 hours ago: outside WhatsApp\'s window', JSON.stringify(w.body));

    console.log('\n== the one yes ==');
    const cust = phone();
    const conv = `${cust}-${day()}`;
    await say(conv, 80, 70, 65);
    const dry = await ask(conv, { dry_run: true });
    ok(dry.status === 200 && dry.body.due === true && dry.body.dry_run === true && !dry.body.url,
      'a dry run says it is due, and makes nothing', JSON.stringify(dry.body));
    const yes = await ask(conv, { language: 'ur' });
    ok(yes.status === 201 && yes.body.due === true && yes.body.code === 'due', 'quiet for an hour after three messages: due (201)', JSON.stringify(yes.body));
    ok(/\/s\/[a-z0-9-]+\?i=[A-Za-z0-9_-]{16}&lang=ur$/.test(yes.body.url), 'a personal link that opens in Urdu', yes.body.url);
    ok(yes.body.language === 'ur' && yes.body.text === yes.body.message.ur && /[؀-ۿ]/.test(yes.body.text) && yes.body.text.includes(yes.body.url),
      'text is the Urdu message, with the link in it', yes.body.text);
    ok(yes.body.message.en.startsWith('Thanks for chatting with '), 'worded for after a chat, not after a purchase', yes.body.message.en);
    ok(yes.body.survey.slug === survey.slug, 'from the client\'s after-chat survey');
    const local = `${B}/s/${survey.slug}?i=${yes.body.token}&lang=ur`;
    const opened = async () => (await call('GET', `/api/surveys/${survey.id}/analytics`)).body.invites.opened;
    await fetch(local, { headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' } });
    await fetch(local, { headers: { 'User-Agent': 'WhatsApp/2.2335.8 A' } });
    ok((await opened()) === 0, 'WhatsApp drawing the link preview does not count as the customer opening it');
    await fetch(local, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36' } });
    await new Promise((r) => setTimeout(r, 150));
    ok((await opened()) === 1, 'the customer opening it on their phone does');
    const again = await ask(conv, { language: 'ur' });
    ok(again.status === 200 && again.body.code === 'already_asked', 'asked again about the same conversation: already asked', JSON.stringify(again.body));
    const later = `${cust}-${day(1)}`;
    await say(later, 75, 70);
    const recent = await ask(later);
    ok(recent.status === 200 && recent.body.code === 'asked_recently', 'the same customer, another conversation: asked recently', JSON.stringify(recent.body));
    const recent0 = await ask(later, { once_per_days: 0 });
    ok(recent0.body.code === 'asked_recently', '…and never twice within a day, even with once_per_days 0', JSON.stringify(recent0.body));

    console.log('\n== a conversation that runs past midnight ==');
    const night = phone();
    await say(`${night}-${day(-1)}`, 90, 80);
    await say(`${night}-${day()}`, 15);
    const split = await ask(`${night}-${day(-1)}`);
    ok(split.body.code === 'still_talking', 'yesterday\'s session is not over while today\'s is going', JSON.stringify(split.body));

    console.log('\n== waits ending at the same moment ==');
    const race = `${phone()}-${day()}`;
    await say(race, 72, 66, 61);
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => ask(race)));
    const created = all.filter((r) => r.status === 201).length;
    ok(created === 1 && all.filter((r) => r.body.code === 'already_asked').length === 4,
      'five asks at once: exactly one yes', all.map((r) => `${r.status}:${r.body.code}`).join(' '));

    console.log('\n== sending hours ==');
    const h = pktHour();
    const sleepy = `${phone()}-${day()}`;
    await say(sleepy, 70, 65);
    const off = await ask(sleepy, { send_from: (h + 2) % 24, send_until: (h + 3) % 24, timezone: 'Asia/Karachi' });
    const retry = off.body.retry_at ? new Date(off.body.retry_at) : null;
    ok(off.status === 200 && off.body.code === 'night' && retry && retry > new Date() && retry - new Date() <= 3 * 3600000,
      'outside sending hours: "night", with the time to ask again', JSON.stringify(off.body));
    ok(retry && new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(retry) === `${String((h + 2) % 24).padStart(2, '0')}:00`,
      'retry_at is exactly when sending hours begin, local time', off.body.retry_at);
    const on = await ask(sleepy, { send_from: h, send_until: (h + 2) % 24, timezone: 'Asia/Karachi' });
    ok(on.status === 201, 'inside sending hours: due', JSON.stringify(on.body));

    console.log('\n== languages ==');
    const fr = `${phone()}-${day()}`;
    await say(fr, 70, 65);
    const f = await ask(fr, { language: 'fr' });
    ok(f.status === 201 && f.body.language === 'en' && !f.body.url.includes('&lang=') && f.body.text === f.body.message.en,
      'a language the survey does not have: its default, and no lang in the link', JSON.stringify(f.body));

    console.log('\n== without rules, as before ==');
    const plain = await post('/api/webhooks/survey-invite', { external_ref: REF, session_id: `${phone()}-${day()}`, channel: 'whatsapp' });
    ok(plain.status === 201 && plain.body.due === true && plain.body.message.en.startsWith('Thanks for chatting with '),
      'a link at once, no conversation needed', JSON.stringify(plain.body));
    const noSession = await post('/api/webhooks/survey-invite', { external_ref: REF });
    ok(noSession.status === 201 && noSession.body.message.en.startsWith('Thank you for choosing '),
      'and with no conversation named, the general wording', noSession.body.message && noSession.body.message.en);

    console.log('\n== and the survey counts them ==');
    const an = (await call('GET', `/api/surveys/${survey.id}/analytics`)).body;
    ok(an.invites.sent === 6, 'every invite made (and none from the refusals or the dry run) is counted as sent', JSON.stringify(an.invites));
  } finally {
    await call('DELETE', `/api/clients/${client.id}`);
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
