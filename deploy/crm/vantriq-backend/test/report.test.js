/**
 * The Pulse & Echo Excel reports (v9.16) — the workbook behind "Download
 * report" on every Pulse view, replacing the one-table CSV.
 *
 * Builds one throwaway client with a known set of contacts — one who first
 * wrote 200 days ago and came back today, one new this month who came back,
 * one new today, one web visitor — plus satisfaction answers from a webhook
 * and from an Echo survey sent after a chat. Then downloads the report from
 * the CRM, the portal and the all-customers view, opens each workbook and
 * checks every tab against what was made, and against the dashboard's own
 * figures. Also: the portal report of a customer without Echo has no survey
 * tabs, the sales workbook opens, and nobody gets a report without signing in.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Deletes its
 * client at the end (everything it made goes with it).
 *
 *   node test/report.test.js
 */
const fs = require('fs');
const ExcelJS = require('exceljs');
const B = 'http://127.0.0.1:8099';
const AH = { 'Content-Type': 'application/json', 'x-api-key': fs.readFileSync('/tmp/adminkey', 'utf8').trim() };

let pass = 0, fail = 0;
const ok = (c, m, x = '') => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m + (c ? '' : '  <<< ' + x)); };
const call = (method, p, b, headers = AH) => fetch(B + p, { method, headers, body: b ? JSON.stringify(b) : undefined })
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const post = (p, b) => call('POST', p, b);

const stamp = Date.now();
const REF = `report-test-${stamp}`;
const AGENT_REF = `report-test-agent-${stamp}`;
const PHONE_A = `92310${String(stamp).slice(-7)}`; // first wrote 200 days ago, back today
const PHONE_B = `92311${String(stamp).slice(-7)}`; // new this month, came back
const PHONE_C = `92312${String(stamp).slice(-7)}`; // new today, once
const WEB = `web-${stamp.toString(36)}`;          // a web chat visitor
const at = (daysAgo, minutesAgo = 0) => new Date(Date.now() - daysAgo * 86400000 - minutesAgo * 60000);
const day = (d) => d.toISOString().slice(0, 10);

/** Downloads a report and opens it. */
async function workbook(path, headers = AH) {
  const res = await fetch(B + path, { headers });
  const out = { status: res.status, type: res.headers.get('content-type'), disposition: res.headers.get('content-disposition') };
  if (res.status !== 200) return { ...out, body: await res.json().catch(() => null) };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return { ...out, wb };
}

/** A tab's table as objects keyed by header: the header row is the first one after the title block. */
function rowsOf(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) return null;
  const headers = ws.getRow(4).values.slice(1);
  const out = [];
  for (let i = 5; i <= ws.rowCount; i++) {
    const v = ws.getRow(i).values.slice(1);
    if (!v.length || v[0] == null || v[0] === '') break;
    const o = {};
    headers.forEach((h, j) => { o[h] = v[j] && v[j].formula ? { formula: v[j].formula } : v[j]; });
    out.push(o);
  }
  return out;
}
const cellsOf = (wb, name) => {
  const ws = wb.getWorksheet(name);
  const all = [];
  ws.eachRow((row) => row.values.slice(1).forEach((v) => { if (v != null) all.push(v); }));
  return all;
};

(async () => {
  console.log('\n== a throwaway client, one agent, known contacts ==');
  const growth = (await call('GET', '/api/products')).body.find((p) => p.name === 'Growth');
  const client = (await post('/api/clients', {
    name: 'Report Test', company: `Report Test Co ${stamp}`, email: 'report-test@example.com', phone: '923004440000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: REF,
    ntn: '1234567-8', billing_address: 'Lahore',
  })).body;
  ok(client && client.id, 'client created', JSON.stringify(client).slice(0, 150));
  let lead = null;
  try {
    const agent = await post('/api/agents', { client_id: client.id, name: 'Report WhatsApp agent', kind: 'whatsapp', external_ref: AGENT_REF });
    ok(agent.status === 201, 'agent created');

    const usage = (session, when, messages, extra = {}) => post('/api/webhooks/usage', {
      agent_ref: AGENT_REF, session_id: session, channel: 'whatsapp', ai_model: 'test', messages_count: messages, occurred_at: when.toISOString(), ...extra,
    });
    const A_OLD = at(200), A_NOW = at(0, 30), B_1 = at(9), B_2 = at(2), C_1 = at(0, 20), W_1 = at(0, 10);
    const made = await Promise.all([
      usage(`${PHONE_A}-${day(A_OLD)}`, A_OLD, 4),
      usage(`${PHONE_A}-${day(A_NOW)}`, A_NOW, 2),
      usage(`${PHONE_A}-${day(A_NOW)}`, at(0, 25), 3),            // same session: one conversation, five messages
      usage(`${PHONE_B}-${day(B_1)}`, B_1, 1),
      usage(`${PHONE_B}-${day(B_2)}`, B_2, 6, { handoff: true }),
      usage(`${PHONE_C}-${day(C_1)}`, C_1, 2, { handoff: false }),
      usage(WEB, W_1, 1, { channel: 'web' }),
    ]);
    ok(made.every((r) => r.status === 201), 'seven usage events: six conversations over 200 days', JSON.stringify(made.map((r) => r.status)));

    const csat = await post('/api/webhooks/csat', { agent_ref: AGENT_REF, session_id: `${PHONE_A}-${day(A_NOW)}`, score: 5, nps: 10, resolved: true,
      comment: 'Sorted in a minute', external_id: `rep-${stamp}` });
    ok(csat.status === 201, 'a satisfaction answer from another tool, about A\'s chat today');

    await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: true });
    const survey = (await post('/api/surveys', { client_id: client.id, template: 'general', title: 'How did we do?' })).body;
    ok(survey && survey.status === 'live', 'Vantriq Echo on, with a live survey');
    const inv = await post('/api/webhooks/survey-invite', { external_ref: REF, session_id: `${PHONE_B}-${day(B_2)}`, channel: 'whatsapp', survey_slug: survey.slug });
    ok(inv.status === 201 && inv.body.token, 'an after-chat invite for B', JSON.stringify(inv.body).slice(0, 160));
    const answered = await call('POST', `/api/public/surveys/${survey.slug}/responses`,
      { answers: { csat: 2, nps: 3, contact: { name: 'Bilal Report', consent: true } }, invite: inv.body.token },
      { 'Content-Type': 'application/json', 'X-Real-IP': `10.88.${stamp % 250}.7` });
    ok(answered.status === 201 && answered.body.followup === true, 'B answers unhappily and leaves a name: a follow-up opens', JSON.stringify(answered.body));

    console.log('\n== the CRM report for this customer (week: the window is 12 weeks) ==');
    const dash = (await call('GET', `/api/analytics/clients/${client.id}?grain=week`)).body;
    const r = await workbook(`/api/analytics/clients/${client.id}/report.xlsx?grain=week`);
    ok(r.status === 200 && r.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'a real .xlsx comes back', JSON.stringify({ s: r.status, t: r.type, b: r.body }));
    ok(/attachment; filename="vantriq-pulse-echo-report-test-co-\d+-week-\d{4}-\d{2}-\d{2}\.xlsx"/.test(r.disposition), 'named after the customer and the period', r.disposition);
    const names = r.wb.worksheets.map((w) => w.name);
    const expected = ['Summary', 'Trend', 'Contacts', 'New contacts', 'Returning contacts', 'Conversations', 'Channels', 'Agents',
      'Busiest times', 'Echo summary', 'Echo responses', 'All answers', 'Follow-ups', 'Comments', 'Definitions'];
    ok(JSON.stringify(names) === JSON.stringify(expected), 'a tab for each subject, in order', names.join(' | '));

    const contacts = rowsOf(r.wb, 'Contacts');
    const byContact = Object.fromEntries(contacts.map((c) => [c.Contact, c]));
    ok(contacts.length === 4, 'Contacts: everyone active in the 12 weeks — A, B, C and the web visitor', contacts.map((c) => c.Contact).join(', '));
    const A = byContact[`+${PHONE_A}`], Bc = byContact[`+${PHONE_B}`], Cc = byContact[`+${PHONE_C}`];
    const W = contacts.find((c) => String(c.Contact).startsWith('Web visitor '));
    ok(A && Bc && Cc && W, 'WhatsApp contacts by their number, the web visitor by a short tag', JSON.stringify(contacts.map((c) => c.Contact)));
    ok(A.Status === 'Returning' && Bc.Status === 'New, came back' && Cc.Status === 'New' && W.Status === 'New',
      'A is returning, B new and came back, C and the visitor new', JSON.stringify(contacts.map((c) => [c.Contact, c.Status])));
    ok(A['Conversations, all time'] === 2 && A['Conversations (last 12 weeks)'] === 1 && A['Messages (last 12 weeks)'] === 5,
      'A: two conversations ever, one in the window, five messages in it', JSON.stringify(A));
    ok(A['First contact'] instanceof Date && Math.abs((Date.now() - A['First contact']) / 86400000 - 200) < 2, 'A\'s first contact is 200 days back', String(A['First contact']));
    ok(A['Satisfaction answers'] === 1 && A['Last score (1–5)'] === 5 && A['Last NPS (0–10)'] === 10, 'A\'s answer is on A\'s row', JSON.stringify(A));
    ok(Bc.Name === 'Bilal Report', 'B\'s name comes from the survey they answered after the chat', JSON.stringify(Bc));
    ok(Bc['Conversations (last 12 weeks)'] === 2 && Bc['Last score (1–5)'] === 2, 'B: two conversations, last score 2', JSON.stringify(Bc));
    ok(W.Channels === 'Web chat' && byContact[`+${PHONE_C}`].Channels === 'WhatsApp', 'channels in words');
    ok(A.Agent === 'Report WhatsApp agent', 'the agent that handled them', A.Agent);

    const fresh = rowsOf(r.wb, 'New contacts');
    ok(fresh.length === 3 && !fresh.some((c) => c.Contact === `+${PHONE_A}`), 'New contacts: B, C and the visitor — not A', fresh.map((c) => c.Contact).join(', '));
    ok(fresh.length === dash.window_totals.new_contacts, 'as many as the dashboard\'s new contacts over the window', `${fresh.length} vs ${dash.window_totals.new_contacts}`);
    ok(fresh.every((c) => /^Week of /.test(c['First seen in'])), 'each with the week they first wrote', JSON.stringify(fresh.map((c) => c['First seen in'])));

    const back = rowsOf(r.wb, 'Returning contacts');
    ok(back.length === 2 && back.every((c) => c['Times they came back'] === 1), 'Returning contacts: A and B, each came back once', JSON.stringify(back.map((c) => [c.Contact, c['Times they came back']])));
    const aBack = back.find((c) => c.Contact === `+${PHONE_A}`);
    ok(aBack && aBack['Days from first to last'] >= 199 && aBack['Average days between visits'] >= 199, 'with how long between visits', JSON.stringify(aBack));

    const convs = rowsOf(r.wb, 'Conversations');
    ok(convs.length === 5 && convs.length === dash.window_totals.conversations, 'Conversations: all five in the window, as the dashboard counts', `${convs.length} vs ${dash.window_totals.conversations}`);
    const aConv = convs.find((c) => c.Contact === `+${PHONE_A}`);
    ok(aConv && aConv['Their visit'] === 'Visit 2' && aConv.Messages === 5 && aConv['Replies sent'] === 2 && aConv.Minutes === 5,
      'A\'s conversation today is their second visit: five messages over two replies, five minutes', JSON.stringify(aConv));
    ok(convs.filter((c) => c['Their visit'] === 'First contact').length === 3, 'three first contacts');
    ok(convs.find((c) => c.Contact === `+${PHONE_B}` && c.Messages === 6)['Handed to a person'] === 'Yes'
      && convs.find((c) => c.Contact === `+${PHONE_C}`)['Handed to a person'] === 'No', 'hand-offs as reported');
    ok(convs[0].Started >= convs[convs.length - 1].Started, 'newest first');

    const trend = rowsOf(r.wb, 'Trend');
    ok(trend.length === 13 && trend[12].Period === 'Last 12 weeks', 'Trend: twelve weeks and a total row', trend.map((t) => t.Period).join(' | '));
    const sumConv = trend.slice(0, 12).reduce((a, t) => a + (t.Conversations || 0), 0);
    ok(sumConv === 5 && trend[12].Conversations.formula === 'SUM(B5:B16)', 'the weeks add up to five conversations, totalled by formula', `${sumConv} ${JSON.stringify(trend[12].Conversations)}`);
    ok(JSON.stringify(trend.slice(0, 12).map((t) => t.Conversations)) === JSON.stringify(dash.series.map((s) => s.conversations)),
      'week by week, exactly the dashboard\'s series');
    ok(trend[11]['Satisfaction answers'] === 2 || trend[10]['Satisfaction answers'] + trend[11]['Satisfaction answers'] === 2, 'both satisfaction answers in the latest weeks');

    const sum = r.wb.getWorksheet('Summary');
    const kpiRow = (label) => { let row = null; sum.eachRow((x) => { if (x.getCell(1).value === label && !row) row = x; }); return row; };
    ok(kpiRow('Conversations').getCell(2).value === dash.kpis.conversations.current, 'Summary: this week\'s conversations as on the dashboard', `${kpiRow('Conversations').getCell(2).value} vs ${dash.kpis.conversations.current}`);
    ok(kpiRow('New contacts (first time ever)').getCell(2).value === dash.kpis.new_contacts.current, 'new contacts too');
    ok(kpiRow('Returning contacts').getCell(2).value === dash.kpis.returning_contacts.current, 'and returning');
    ok(kpiRow('Net Promoter Score').getCell(2).value === dash.satisfaction.kpis.nps.current, 'NPS as on the dashboard', `${kpiRow('Net Promoter Score').getCell(2).value} vs ${dash.satisfaction.kpis.nps.current}`);
    ok(kpiRow('Once — never came back').getCell(2).value === 2 && kpiRow('Twice').getCell(2).value === 2, 'how often people come back: two once, two twice');
    ok(kpiRow('Follow-ups still open').getCell(2).value === 1, 'one follow-up open');
    ok(kpiRow(`+${PHONE_A}`) && kpiRow(`+${PHONE_B}`) && !kpiRow(`+${PHONE_C}`), 'who comes back most: A and B, not C');

    const echoRows = rowsOf(r.wb, 'Echo responses');
    ok(echoRows.length === 1 && echoRows[0].Name === 'Bilal Report' && echoRows[0].Phone === `+${PHONE_B}` && echoRows[0]['Follow-up'] === 'Open',
      'Echo responses: B\'s answer, with the number the invite went to', JSON.stringify(echoRows));
    ok(/Would you like us to get back to you\?: Bilal Report \(happy to be contacted\)/.test(echoRows[0].Answers), 'every question in words', echoRows[0].Answers);
    const echoSurveys = cellsOf(r.wb, 'Echo summary');
    ok(echoSurveys.includes('How did we do?') && echoSurveys.includes(`/s/${survey.slug}`), 'Echo summary lists the survey and its address');
    const allAnswers = rowsOf(r.wb, 'All answers');
    ok(allAnswers.length === 2 && allAnswers.some((a) => a.From === 'Echo survey: How did we do?') && allAnswers.some((a) => a.Contact === `+${PHONE_A}`),
      'All answers: the webhook\'s and Echo\'s, each with its contact', JSON.stringify(allAnswers.map((a) => [a.From, a.Contact])));
    const fu = rowsOf(r.wb, 'Follow-ups');
    ok(fu.length === 1 && fu[0].Status === 'Open' && fu[0].Contact.includes('Bilal Report'), 'Follow-ups: B, open', JSON.stringify(fu));
    ok(rowsOf(r.wb, 'Comments').some((c) => c.Comment === 'Sorted in a minute'), 'Comments: what people wrote');
    const channels = rowsOf(r.wb, 'Channels');
    ok(channels.find((c) => c.Channel === 'WhatsApp').Conversations === 4 && channels.find((c) => c.Channel === 'Web chat').Conversations === 1,
      'Channels: four WhatsApp, one web', JSON.stringify(channels));
    const heat = r.wb.getWorksheet('Busiest times');
    ok(heat.getRow(12).getCell(26).value === 5, 'Busiest times: five conversations on the grid', String(heat.getRow(12).getCell(26).value));

    console.log('\n== month: the 200-day-old conversation is inside the window, so A is new here ==');
    const m = await workbook(`/api/analytics/clients/${client.id}/report.xlsx?grain=month`);
    const mA = rowsOf(m.wb, 'Contacts').find((c) => c.Contact === `+${PHONE_A}`);
    ok(mA && mA.Status === 'New, came back' && mA['Conversations (last 12 months)'] === 2, 'A: new in the 12 months, and came back', JSON.stringify(mA));
    ok(rowsOf(m.wb, 'Conversations').length === 6, 'all six conversations');
    const bogus = await workbook(`/api/analytics/clients/${client.id}/report.xlsx?grain=fortnight`);
    ok(bogus.status === 200 && /-month-/.test(bogus.disposition), 'an unknown period falls back to month');
    ok((await workbook('/api/analytics/clients/00000000-0000-0000-0000-000000000000/report.xlsx')).status === 404, 'an unknown customer is a 404');
    ok((await workbook('/api/analytics/clients/nope/report.xlsx')).status === 404, 'so is a malformed id');

    console.log('\n== the customer downloads the same report from their portal ==');
    await post(`/api/clients/${client.id}/portal-credentials`, { username: `report-${stamp}`, password: 'ReportTestPass123' });
    const login = (await call('POST', '/api/portal/login', { username: `report-${stamp}`, password: 'ReportTestPass123' }, { 'Content-Type': 'application/json' })).body;
    const PH = { Authorization: `Bearer ${login.session}` };
    const p = await workbook('/api/portal/analytics/report.xlsx?grain=week', PH);
    ok(p.status === 200, 'GET /api/portal/analytics/report.xlsx works', JSON.stringify(p.body));
    ok(JSON.stringify(p.wb.worksheets.map((w) => w.name)) === JSON.stringify(expected), 'the same tabs as in the CRM');
    ok(JSON.stringify(rowsOf(p.wb, 'Contacts').map((c) => [c.Contact, c.Status])) === JSON.stringify(contacts.map((c) => [c.Contact, c.Status])),
      'the same contacts — their own customers, by number');
    ok(!cellsOf(p.wb, 'Contacts').some((v) => String(v).includes('Customer')), 'and no "Customer" column: it is all theirs');

    await call('PATCH', `/api/clients/${client.id}/surveys`, { enabled: false });
    const off = await workbook('/api/portal/analytics/report.xlsx?grain=week', PH);
    const offNames = off.wb.worksheets.map((w) => w.name);
    ok(!offNames.includes('Echo responses') && !offNames.includes('Follow-ups') && !offNames.includes('Echo summary') && offNames.includes('Satisfaction'),
      'with Echo switched off: no survey tabs, a plain Satisfaction tab', offNames.join(' | '));
    ok(rowsOf(off.wb, 'All answers').length === 2 && rowsOf(off.wb, 'All answers').every((a) => !String(a.From).startsWith('Echo survey:')),
      'answers still count, without naming the survey', JSON.stringify(rowsOf(off.wb, 'All answers').map((a) => a.From)));
    ok(!rowsOf(off.wb, 'Contacts').some((c) => c.Name === 'Bilal Report'), 'and no name taken from a survey');
    ok(cellsOf(off.wb, 'Summary').some((v) => /Vantriq Echo .* is not switched on for this account/.test(String(v))), 'the Summary says Echo is not on');
    const crmOff = await workbook(`/api/analytics/clients/${client.id}/report.xlsx?grain=week`);
    ok(crmOff.wb.worksheets.map((w) => w.name).includes('Echo responses'), 'staff still see the Echo tabs in the CRM');

    ok((await workbook('/api/portal/analytics/report.xlsx')).status === 401, 'no portal session: 401', '');
    ok((await workbook(`/api/analytics/clients/${client.id}/report.xlsx`, {})).status === 401, 'no CRM key: 401');

    console.log('\n== every customer together, and our own sales ==');
    const all = await workbook('/api/analytics/platform/report.xlsx?grain=week');
    ok(all.status === 200 && all.wb.getWorksheet('Customers'), 'the all-customers report has a Customers tab');
    const row = rowsOf(all.wb, 'Customers').find((c) => c.Customer === `Report Test Co ${stamp}`);
    ok(row && row.Conversations === 5 && row.People === 4 && row.New === 3 && row.Returning === 1, 'this customer on it: five conversations, four people, three new', JSON.stringify(row));
    ok(rowsOf(all.wb, 'Contacts').some((c) => c.Contact === `+${PHONE_A}` && c.Customer === `Report Test Co ${stamp}`), 'contacts say whose customer they are');
    // A prospect writing to our own sales agent: a lead filed as wa-<number>,
    // one conversation with a session id and one without (a day's messages).
    const PROSPECT = `92399${String(stamp).slice(-7)}`;
    lead = (await post('/api/clients', { name: 'Hamza Prospect', company: `Prospect Co ${stamp}`, email: 'prospect@example.com', phone: PROSPECT,
      stage: 'lead', est_value: 50000, source: 'WhatsApp', external_ref: `wa-${PROSPECT}`, product_id: growth.id, ntn: '1234567-8', billing_address: 'Lahore' })).body;
    ok(lead && lead.id, 'a lead from WhatsApp', JSON.stringify(lead).slice(0, 150));
    const said = await Promise.all([
      post('/api/webhooks/conversation', { external_ref: `wa-${PROSPECT}`, session_id: `${PROSPECT}-${day(at(0))}`, channel: 'whatsapp',
        messages: [{ role: 'customer', content: 'What does the Growth package cost?' }, { role: 'agent', content: 'PKR 25,000 a month.' }] }),
      post('/api/webhooks/conversation', { external_ref: `wa-${PROSPECT}`, channel: 'whatsapp',
        messages: [{ role: 'customer', content: 'Can it answer in Urdu?' }] }),
    ]);
    ok(said.every((x) => x.status === 201), 'two prospect conversations logged');
    const salesDash = (await call('GET', '/api/analytics/sales?grain=month')).body;
    const sales = await workbook('/api/analytics/sales/report.xlsx?grain=month');
    ok(sales.status === 200 && JSON.stringify(sales.wb.worksheets.map((w) => w.name)) === JSON.stringify(['Summary', 'Trend', 'Leads', 'Funnel & sources', 'What prospects ask', 'Prospect conversations', 'Definitions']),
      'the sales workbook', sales.wb && sales.wb.worksheets.map((w) => w.name).join(' | '));
    ok(rowsOf(sales.wb, 'Leads').some((l) => l.Company === `Report Test Co ${stamp}`) === false, 'a customer added straight in as active is not a lead');
    const leadRow = rowsOf(sales.wb, 'Leads').find((l) => l.Company === `Prospect Co ${stamp}`);
    ok(leadRow && leadRow.Contact === 'Hamza Prospect' && leadRow['Stage now'] === 'New lead' && leadRow.Source === 'WhatsApp' && leadRow['Estimated value'] === 50000,
      'the lead, with its stage, source and value', JSON.stringify(leadRow));
    const pcs = rowsOf(sales.wb, 'Prospect conversations');
    ok(pcs.length === salesDash.prospect_series.reduce((a, x) => a + x.conversations, 0), 'as many prospect conversations as the dashboard counts',
      `${pcs.length} vs ${salesDash.prospect_series.reduce((a, x) => a + x.conversations, 0)}`);
    const mine = pcs.filter((x) => x.Prospect === `+${PROSPECT}`);
    ok(mine.length === 2 && mine.every((x) => x['In the CRM as'] === `Prospect Co ${stamp} · New lead` && x.Name === 'Hamza Prospect'),
      'both of theirs, named from the lead', JSON.stringify(mine.map((x) => [x.Prospect, x.Name, x['In the CRM as']])));
    ok(mine.some((x) => x['First thing they asked'] === 'What does the Growth package cost?' && x['Their messages'] === 1 && x['Agent replies'] === 1),
      'with what they asked first', JSON.stringify(mine));
  } finally {
    const del = await call('DELETE', `/api/clients/${client.id}`);
    if (lead && lead.id) await call('DELETE', `/api/clients/${lead.id}`);
    console.log(`\n(cleanup: client deleted ${del.status})`);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
