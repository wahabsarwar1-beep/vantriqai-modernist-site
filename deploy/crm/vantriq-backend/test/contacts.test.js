/**
 * Customers (v9.17): the directory of a business's own customers, in the CRM
 * and in the business's portal, and what feeds it.
 *
 * Two throwaway clients, each with an agent. Conversations arrive as n8n
 * sends them (usage with the WhatsApp profile name, transcript lines, an
 * agent saving what the customer said about themselves); answers arrive
 * through an Echo survey with the "about you" questions. Then: which source
 * wins (a person's edit always, automatic ones only fill blanks), segments,
 * search, one customer's page, edits, the portal seeing only its own, the
 * directory workbook, and Echo's gender / city / age breakdowns.
 *
 * Needs the API on 8099 and an admin key in /tmp/adminkey. Deletes what it made.
 *
 *   node test/contacts.test.js
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
const at = (daysAgo, min = 0) => new Date(Date.now() - daysAgo * 86400000 - min * 60000);
const day = (d) => d.toISOString().slice(0, 10);
const tail = String(stamp).slice(-7);
const P = { ayesha: `92321${tail}`, bilal: `92322${tail}`, sara: `92323${tail}`, omar: `92324${tail}`, dubai: `97150${tail}` };

async function workbook(path, headers = AH) {
  const res = await fetch(B + path, { headers });
  if (res.status !== 200) return { status: res.status };
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  return { status: 200, wb, disposition: res.headers.get('content-disposition') };
}

async function makeClient(tag) {
  const growth = (await call('GET', '/api/products')).body.find((p) => p.name === 'Growth');
  const c = (await post('/api/clients', {
    name: 'Contacts Test', company: `Contacts ${tag} ${stamp}`, email: 'contacts@example.com', phone: '923004440000',
    product_id: growth.id, stage: 'active', est_value: 0, source: 'Referral', external_ref: `contacts-${tag}-${stamp}`,
    ntn: '1234567-8', billing_address: 'Lahore',
  })).body;
  await post('/api/agents', { client_id: c.id, name: `${tag} WhatsApp`, kind: 'whatsapp', external_ref: `contacts-agent-${tag}-${stamp}` });
  return c;
}

(async () => {
  const c1 = await makeClient('one');
  const c2 = await makeClient('two');
  ok(c1 && c1.id && c2 && c2.id, 'two throwaway clients, one agent each');
  const AG = `contacts-agent-one-${stamp}`;
  try {
    const usage = (phone, when, extra = {}) => post('/api/webhooks/usage', {
      agent_ref: AG, session_id: `${phone}-${day(when)}`, channel: 'whatsapp', messages_count: 2, occurred_at: when.toISOString(), ...extra,
    });

    console.log('\n== what the agents send ==');
    const u1 = await usage(P.ayesha, at(0, 30), { contact_name: 'Ayesha Khan' });
    ok(u1.status === 201, 'a usage event with the WhatsApp profile name');
    await usage(P.ayesha, at(0, 20), { contact_name: 'Ayesha K. (new profile name)' });
    // Bilal: five conversations over three months — a regular.
    for (const d of [90, 60, 30, 10, 1]) await usage(P.bilal, at(d), { contact_name: 'Bilal' });
    // Sara: came back once, long ago, then went quiet — at risk.
    await usage(P.sara, at(120)); await usage(P.sara, at(80));
    // Omar: once, today, no name. Dubai: a number from the UAE.
    await usage(P.omar, at(0, 5), { contact_name: 'there' });
    await usage(P.dubai, at(2), { contact: { name: 'Khalid', city: 'Dubai' } });
    // Client two has a customer with Ayesha's number too — a different person, as far as client one knows.
    await post('/api/webhooks/usage', { agent_ref: `contacts-agent-two-${stamp}`, session_id: `${P.ayesha}-${day(at(0))}`, contact_name: 'Other business\'s Ayesha' });

    const t = await post('/api/webhooks/conversation', { external_ref: AG, session_id: `${P.ayesha}-${day(at(0, 30))}`, channel: 'whatsapp',
      messages: [{ role: 'customer', content: 'Do you deliver to DHA?' }, { role: 'agent', content: 'Yes, within 45 minutes.' }] });
    ok(t.status === 201 && t.body.client_id === c1.id && t.body.agent_id, 'transcript lines logged against the agent\'s number land with its client', JSON.stringify(t.body));

    const k1 = await post('/api/webhooks/contact', { agent_ref: AG, session_id: `${P.ayesha}-${day(at(0))}`, city: 'lhr', email: 'Ayesha@Example.com', name: 'Not Ayesha' });
    ok(k1.status === 201 && k1.body.profile.city === 'Lahore' && k1.body.profile.email === 'ayesha@example.com' && k1.body.profile.name === 'Ayesha Khan',
      'what the agent learned fills the blanks ("lhr" → Lahore, email lower-cased) and never overwrites the name', JSON.stringify(k1.body.profile));
    ok((await post('/api/webhooks/contact', { agent_ref: 'no-such-agent', phone: P.ayesha, city: 'Lahore' })).status === 404, 'an unknown agent is a 404');
    ok((await post('/api/webhooks/contact', { agent_ref: AG, city: 'Lahore' })).status === 400, 'no session or phone: 400 — nobody to save it to');
    ok((await post('/api/webhooks/contact', { agent_ref: AG, phone: P.omar })).status === 400, 'nothing to save: 400');
    const k2 = await post('/api/webhooks/contact', { external_ref: AG, phone: `0${P.bilal.slice(2)}`, city: 'Karachi', gender: 'm' });
    ok(k2.status === 201 && k2.body.contact_key === P.bilal && k2.body.profile.gender === 'Male', 'a local number (03…) finds the same customer; "m" → Male', JSON.stringify(k2.body));

    console.log('\n== an Echo survey with the "about you" questions ==');
    await call('PATCH', `/api/clients/${c1.id}/surveys`, { enabled: true });
    const survey = (await post('/api/surveys', { client_id: c1.id, template: 'general', title: 'How was it?' })).body;
    const profQ = survey.questions.filter((q) => q.profile).map((q) => q.profile).sort().join(',');
    ok(profQ === 'age,city,gender', 'the General template asks gender, city and age group', profQ);
    const badQ = await call('PATCH', `/api/surveys/${survey.id}`, { questions: [...survey.questions, { type: 'yesno', profile: 'gender', title: { en: 'x' } }] });
    ok(badQ.status === 200 && !badQ.body.questions.some((q) => q.type === 'yesno' && q.profile), 'a yes/no question cannot be a profile question', JSON.stringify(badQ.body).slice(0, 120));
    await call('PATCH', `/api/surveys/${survey.id}`, { questions: survey.questions });
    const inv = await post('/api/webhooks/survey-invite', { external_ref: AG, session_id: `${P.omar}-${day(at(0))}`, channel: 'whatsapp', survey_slug: survey.slug });
    const ans = (answers, extra = {}) => call('POST', `/api/public/surveys/${survey.slug}/responses`, { answers, ...extra },
      { 'Content-Type': 'application/json', 'X-Real-IP': `10.91.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
    const a1 = await ans({ csat: 2, nps: 4, gender: { choice: 'male' }, city: { choice: '__other', other: 'sialkot' }, age: { choice: '35_44' },
      contact: { name: 'Omar Farooq', consent: true } }, { invite: inv.body.token });
    ok(a1.status === 201, 'Omar answers the after-chat survey', JSON.stringify(a1.body));
    await ans({ csat: 5, nps: 10, gender: { choice: 'female' }, city: { choice: 'lahore' }, age: { choice: '25_34' } });
    await ans({ csat: 4, nps: 9, gender: { choice: 'female' }, city: { choice: 'karachi' } });
    await ans({ csat: 1, nps: 2, city: { choice: 'multan' }, contact: { name: 'Zara Walk-in', phone: '0333 7654321', consent: true } });

    console.log('\n== the CRM directory for client one ==');
    const L = (await call('GET', `/api/contacts?client_id=${c1.id}`)).body;
    const byKey = (list) => Object.fromEntries(list.contacts.map((c) => [c.key, c]));
    const K = byKey(L);
    ok(L.total === 6, 'six customers: five who wrote, one who only answered a survey', `${L.total} ${L.contacts.map((c) => c.label + ':' + c.name).join(', ')}`);
    ok(K[P.ayesha].name === 'Ayesha Khan' && K[P.ayesha].name_source === 'whatsapp', 'the first WhatsApp name sticks — a later profile name does not overwrite it', JSON.stringify(K[P.ayesha]));
    ok(K[P.omar].name === 'Omar Farooq' && K[P.omar].gender === 'Male' && K[P.omar].city === 'Sialkot' && K[P.omar].age_band === '35–44',
      '"there" is no name; the survey then fills Omar\'s name, gender, city (typed "sialkot" → Sialkot) and age', JSON.stringify(K[P.omar]));
    const zara = L.contacts.find((c) => c.name === 'Zara Walk-in');
    ok(zara && zara.key === '923337654321' && zara.city === 'Multan' && zara.status === 'From a survey' && zara.segments.includes('survey_only'),
      'someone known only from a survey is a customer too, keyed by the number they typed', JSON.stringify(zara));
    ok(K[P.dubai].country === 'United Arab Emirates' && K[P.dubai].city === 'Dubai' && K[P.ayesha].country === 'Pakistan', 'countries from the dialling code');
    ok(K[P.bilal].conversations === 5 && K[P.bilal].segments.includes('vip') && K[P.bilal].segments.includes('returning'), 'Bilal: five conversations — a regular');
    ok(K[P.sara].segments.includes('at_risk') && !K[P.sara].segments.includes('new'), 'Sara: came back before, quiet since — at risk');
    ok(K[P.ayesha].segments.includes('new') && K[P.omar].segments.includes('unhappy'), 'Ayesha new; Omar unhappy (scored 2)');
    ok(L.counts.vip === 1 && L.counts.at_risk === 1 && L.counts.unhappy >= 1 && L.counts.all === 6, 'segment counts', JSON.stringify(L.counts));
    ok(L.cities.some((c) => c.name === 'Lahore') && L.coverage.with_name === 5, 'city list and what is known', JSON.stringify({ cities: L.cities, cov: L.coverage }));
    ok(L.contacts[0].key === P.omar, 'latest contact first', L.contacts[0].label);
    const most = (await call('GET', `/api/contacts?client_id=${c1.id}&sort=most&limit=2`)).body;
    ok(most.contacts.length === 2 && most.matching === 6 && most.contacts[0].key === P.bilal, 'sorted by most conversations, paged', JSON.stringify(most.contacts.map((c) => c.label)));
    const q1 = (await call('GET', `/api/contacts?client_id=${c1.id}&q=ayesha`)).body;
    ok(q1.matching === 1 && q1.contacts[0].key === P.ayesha, 'search by name');
    const q2 = (await call('GET', `/api/contacts?client_id=${c1.id}&q=${P.bilal.slice(0, 6)}`)).body;
    ok(q2.matching === 1 && q2.contacts[0].key === P.bilal, 'search by part of the number');
    const q3 = (await call('GET', `/api/contacts?client_id=${c1.id}&city=Lahore`)).body;
    ok(q3.matching === 1 && q3.contacts[0].key === P.ayesha, 'filter by city');
    const q4 = (await call('GET', `/api/contacts?client_id=${c1.id}&segment=vip`)).body;
    ok(q4.matching === 1 && q4.contacts[0].key === P.bilal, 'filter by segment');

    console.log('\n== one customer ==');
    const d = (await call('GET', `/api/contacts/${c1.id}/${P.ayesha}`)).body;
    ok(d.conversations_list.length === 1 && d.conversations_list[0].transcript.length === 2 && d.conversations_list[0].transcript[1].content === 'Yes, within 45 minutes.',
      'Ayesha\'s conversation, with what was said', JSON.stringify(d.conversations_list));
    ok(d.messages === 4 && d.has_transcripts, 'four messages; a transcript exists');
    const dom = (await call('GET', `/api/contacts/${c1.id}/${P.omar}`)).body;
    ok(dom.survey_responses.length === 1 && dom.survey_responses[0].score === 2 && dom.survey_responses[0].readable.some((x) => /Sialkot|sialkot/.test(x.answer)),
      'Omar\'s survey answer, question by question', JSON.stringify(dom.survey_responses));
    ok((await call('GET', `/api/contacts/${c1.id}/923000000000`)).status === 404, 'nobody by that number: 404');

    console.log('\n== edits: a person always wins ==');
    const e1 = await call('PATCH', `/api/contacts/${c1.id}/${P.ayesha}`, { city: 'islamabad', tags: ['VIP', ' wholesale ', 'vip'], notes: 'Prefers calls after 6pm', gender: 'female' });
    ok(e1.status === 200 && e1.body.city === 'Islamabad' && e1.body.tags.join(',') === 'vip,wholesale' && e1.body.edited_by && e1.body.gender === 'Female',
      'staff set city, tags (tidied, no duplicates), notes and gender — and who did it is kept', JSON.stringify(e1.body).slice(0, 300));
    await post('/api/webhooks/contact', { agent_ref: AG, phone: P.ayesha, city: 'Karachi' });
    ok((await call('GET', `/api/contacts/${c1.id}/${P.ayesha}`)).body.city === 'Islamabad', 'an agent saying Karachi later does not undo the edit');
    ok((await call('PATCH', `/api/contacts/${c1.id}/${P.ayesha}`, { email: 'not-an-email' })).status === 400, 'a bad email is refused (400)');
    ok((await call('PATCH', `/api/contacts/${c1.id}/${P.ayesha}`, { tags: 'vip' })).status === 400, 'tags must be a list (400)');
    ok((await call('PATCH', `/api/contacts/${c1.id}/${P.ayesha}`, {})).status === 400, 'nothing to change (400)');
    const dnc = await call('PATCH', `/api/contacts/${c1.id}/${P.sara}`, { do_not_contact: true, name: 'Sara' });
    ok(dnc.status === 200 && dnc.body.do_not_contact === true && dnc.body.name === 'Sara' && dnc.body.name_source === 'edited', 'do-not-contact, and a name typed by a person');

    console.log('\n== every client, and the directory workbook ==');
    const all = (await call('GET', '/api/contacts')).body;
    ok(all.contacts.some((c) => c.client_id === c2.id && c.key === P.ayesha && c.name === 'Other business\'s Ayesha')
      && all.contacts.some((c) => c.client_id === c1.id && c.key === P.ayesha && c.name === 'Ayesha Khan'),
    'across every client, the same number is two customers of two businesses', '');
    const x = await workbook(`/api/contacts/export.xlsx?client_id=${c1.id}`);
    ok(x.status === 200 && /vantriq-customers-contacts-one/.test(x.disposition), 'the directory workbook', x.disposition);
    ok(JSON.stringify(x.wb.worksheets.map((w) => w.name)) === JSON.stringify(['Customers', 'Segments', 'Conversations', 'Transcripts']), 'its tabs', x.wb.worksheets.map((w) => w.name).join(' | '));
    const ws = x.wb.getWorksheet('Customers');
    const headers = ws.getRow(4).values.slice(1);
    const rows = [];
    for (let i = 5; i <= ws.rowCount; i++) { const v = ws.getRow(i).values.slice(1); if (v[0]) rows.push(Object.fromEntries(headers.map((h, j) => [h, v[j]]))); }
    const ay = rows.find((r) => r.Contact === `+${P.ayesha}`);
    ok(rows.length === 6 && ay && ay.Name === 'Ayesha Khan' && ay.Email === 'ayesha@example.com' && ay.City === 'Islamabad' && ay.Tags === 'vip, wholesale' && ay.Notes === 'Prefers calls after 6pm',
      'every customer with every detail', JSON.stringify(ay));
    ok(!rows.some((r) => r.Name === 'Other business\'s Ayesha'), 'and only this client\'s');

    console.log('\n== the business\'s own portal ==');
    await post(`/api/clients/${c1.id}/portal-credentials`, { username: `contacts-${stamp}`, password: 'ContactsTestPass1' });
    const login = (await call('POST', '/api/portal/login', { username: `contacts-${stamp}`, password: 'ContactsTestPass1' }, { 'Content-Type': 'application/json' })).body;
    const PH = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.session}` };
    const pl = (await call('GET', '/api/portal/contacts', null, PH)).body;
    ok(pl.total === 6 && !pl.contacts.some((c) => c.name === 'Other business\'s Ayesha'), 'the portal lists their six customers, nobody else\'s');
    const pd = await call('GET', `/api/portal/contacts/${P.ayesha}`, null, PH);
    ok(pd.status === 200 && pd.body.name === 'Ayesha Khan' && pd.body.conversations_list[0].transcript.length === 2, 'one customer, with the transcript');
    const pe = await call('PATCH', `/api/portal/contacts/${P.bilal}`, { notes: 'Orders every month', email: 'bilal@example.com' }, PH);
    ok(pe.status === 200 && pe.body.notes === 'Orders every month' && /\(portal\)$/.test(pe.body.edited_by), 'the business edits a profile; the edit says it came from the portal', JSON.stringify(pe.body.edited_by));
    await post(`/api/clients/${c2.id}/portal-credentials`, { username: `contacts2-${stamp}`, password: 'ContactsTestPass2' });
    const login2 = (await call('POST', '/api/portal/login', { username: `contacts2-${stamp}`, password: 'ContactsTestPass2' }, { 'Content-Type': 'application/json' })).body;
    const PH2 = { 'Content-Type': 'application/json', Authorization: `Bearer ${login2.session}` };
    ok((await call('GET', `/api/portal/contacts/${P.bilal}`, null, PH2)).status === 404, 'another business cannot see Bilal (404)');
    ok((await call('PATCH', `/api/portal/contacts/${P.bilal}`, { notes: 'x' }, PH2)).status === 404, 'nor edit him (404)');
    const their = (await call('GET', `/api/portal/contacts/${P.ayesha}`, null, PH2)).body;
    ok(their.name === 'Other business\'s Ayesha' && !their.notes, 'their Ayesha is their own');
    const px = await workbook('/api/portal/contacts/export.xlsx', { Authorization: `Bearer ${login.session}` });
    ok(px.status === 200 && px.wb.getWorksheet('Customers'), 'the portal downloads its own directory');
    ok((await call('GET', '/api/portal/contacts', null, {})).status === 401, 'no session: 401');
    ok((await call('GET', '/api/contacts', null, {})).status === 401, 'no CRM key: 401');

    console.log('\n== Echo: who answered ==');
    const sa = (await call('GET', `/api/surveys/${survey.id}/analytics?grain=month`)).body;
    const g = Object.fromEntries(sa.demographics.gender.map((x) => [x.name, x]));
    ok(g.Female && g.Female.responses === 2 && g.Female.csat === 100 && g.Male.responses === 1 && g.Male.csat === 0 && g['Not given'].responses === 1,
      'by gender: two women, both satisfied; one man, not; one not given', JSON.stringify(sa.demographics.gender));
    ok(sa.demographics.city.map((x) => x.name).slice(0, 4).sort().join(',') === 'Karachi,Lahore,Multan,Sialkot', 'by city', JSON.stringify(sa.demographics.city));
    ok(sa.demographics.age[0].name === '25–34' && sa.demographics.age[1].name === '35–44', 'age groups in age order', JSON.stringify(sa.demographics.age));
    const ov = (await call('GET', `/api/surveys/overview?client_id=${c1.id}`)).body;
    ok(ov.demographics_90d && ov.demographics_90d.gender.length === 3, 'and across every survey on the Echo home page');
    const pulse = (await call('GET', `/api/analytics/clients/${c1.id}?grain=month`)).body;
    ok(pulse.cities.some((c) => c.name === 'Islamabad') && pulse.countries.some((c) => c.name === 'United Arab Emirates') && pulse.profile_coverage.contacts === 5,
      'Pulse: where the people who wrote are', JSON.stringify({ c: pulse.cities, k: pulse.countries, p: pulse.profile_coverage }));
    const raw = JSON.stringify(pulse);
    ok(![P.ayesha, P.bilal].some((ph) => raw.includes(ph)), 'the Pulse dashboard itself still carries no numbers');

    console.log('\n== v9.20.2: transcripts with real times, and replies that never arrived ==');
    // Noor wrote while WhatsApp was refusing the agent's replies: no usage was
    // metered, only the transcript — her words, and the reply she never got.
    const noor = `92325${tail}`;
    const said = Math.floor(Date.now() / 1000) - 600;
    const nr = await post('/api/webhooks/conversation', { external_ref: AG, session_id: `${noor}-${day(new Date(said * 1000))}`, channel: 'whatsapp',
      contact_name: 'Noor', delivered: false, error: 'Cannot call API for app 1775 on behalf of user 1221',
      messages: [{ role: 'customer', content: 'Is anyone there?', at: said, id: `wamid.noor.${stamp}` },
        { role: 'agent', content: 'Assalam o alaikum Noor! Yes — how can I help?', at: said + 5, id: `wamid.noor.${stamp}-reply` }] });
    ok(nr.status === 201 && nr.body.stored === 2 && nr.body.undelivered === 1, 'a refused reply is stored, marked not delivered', JSON.stringify(nr.body));
    const again = await post('/api/webhooks/conversation', { external_ref: AG, session_id: `${noor}-${day(new Date(said * 1000))}`,
      messages: [{ role: 'customer', content: 'Is anyone there?', at: said, id: `wamid.noor.${stamp}` }] });
    ok(again.status === 200 && again.body.stored === 0 && again.body.duplicates === 1, 'the same WhatsApp message sent again is stored once', JSON.stringify(again.body));
    const NL = byKey((await call('GET', `/api/contacts?client_id=${c1.id}`)).body)[noor];
    ok(NL && NL.conversations === 1 && NL.messages === 1 && NL.name === 'Noor' && NL.status === 'New' && !NL.segments.includes('survey_only') && NL.agent === 'one WhatsApp',
      'known only from her transcript, she is in the directory with her conversation — not "from a survey"', JSON.stringify(NL));
    const nd = (await call('GET', `/api/contacts/${c1.id}/${noor}`)).body;
    const nc = nd.conversations_list[0] || {};
    ok(nd.conversations_list.length === 1 && nc.transcript.length === 2 && nc.undelivered === 1 && nd.undelivered === 1 && nc.agent === 'one WhatsApp',
      'her page shows the conversation, one reply not delivered', JSON.stringify(nd.conversations_list));
    ok(nc.transcript[0].delivered === undefined && nc.transcript[1].delivered === false && /Cannot call API/.test(nc.transcript[1].error),
      'the unsent reply says why; her own line carries no delivery flag', JSON.stringify(nc.transcript));
    ok(new Date(nc.transcript[0].at).getTime() === said * 1000, 'lines keep the time they were said, not the time they reached the CRM', nc.transcript[0].at);
    ok(nd.transcripts_from && new Date(nd.transcripts_from) <= new Date(said * 1000), 'the page knows since when transcripts are kept', nd.transcripts_from);
    // An exchange that arrives late but happened earlier sorts where it happened.
    await post('/api/webhooks/conversation', { external_ref: AG, session_id: `${noor}-${day(new Date(said * 1000))}`,
      messages: [{ role: 'customer', content: 'Salam', at: said - 60, id: `wamid.noor0.${stamp}` }] });
    const nd2 = (await call('GET', `/api/contacts/${c1.id}/${noor}`)).body;
    ok(nd2.conversations_list[0].transcript.map((l) => l.content).join(' | ') === 'Salam | Is anyone there? | Assalam o alaikum Noor! Yes — how can I help?',
      'a line backfilled later still reads in the order it was said', nd2.conversations_list[0].transcript.map((l) => l.content).join(' | '));
    const bd = (await call('GET', `/api/contacts/${c1.id}/${P.bilal}`)).body;
    ok(!bd.has_transcripts && bd.transcripts_from, 'Bilal has no transcript, but the page can say since when they are kept', JSON.stringify({ h: bd.has_transcripts, f: bd.transcripts_from }));
  } finally {
    for (const c of [c1, c2]) if (c && c.id) await call('DELETE', `/api/clients/${c.id}`);
    console.log('\n(cleanup: clients deleted)');
  }
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
