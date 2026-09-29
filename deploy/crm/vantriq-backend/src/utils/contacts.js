const db = require('../db');

/**
 * Customers — the people who talk to a business's agents and answer its
 * surveys. One directory, three audiences: VantriqAI staff (any client, or
 * all of them), the business in its own portal (only its own customers), and
 * the Excel dump behind both.
 *
 * Activity is never stored twice: conversations, messages, first and last
 * contact are worked out from usage_events every time, by the same contact
 * key analytics uses (a WhatsApp session id without its date = the number).
 * What activity cannot tell — name, email, city, gender, age group, tags,
 * notes — is kept in the contacts table (db/schema.sql, v9.17).
 *
 * Automatic sources (the WhatsApp profile name, a survey answer) only ever
 * fill a blank. A person's edit always wins, and says who made it.
 */

const CONTACT_OF = (col) => `regexp_replace(${col}, '-\\d{4}-\\d{2}-\\d{2}$', '')`;
const keyOf = (sessionId) => String(sessionId || '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class ContactError extends Error {
  constructor(status, message) { super(message); this.status = status; this.expose = true; }
}

/* ------------------------------------------------------------------ */
/* Words in, tidy values out                                            */
/* ------------------------------------------------------------------ */

/** A phone number as the digits a WhatsApp session id uses: 0300 1234567 → 923001234567. */
function phoneDigits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^03\d{9}$/.test(d)) d = `92${d.slice(1)}`;
  return /^\d{10,15}$/.test(d) ? d : '';
}

const CITY_ALIASES = {
  isb: 'Islamabad', islamabad: 'Islamabad', 'اسلام آباد': 'Islamabad',
  khi: 'Karachi', karachi: 'Karachi', 'کراچی': 'Karachi',
  lhr: 'Lahore', lahore: 'Lahore', 'لاہور': 'Lahore',
  rwp: 'Rawalpindi', pindi: 'Rawalpindi', rawalpindi: 'Rawalpindi', 'راولپنڈی': 'Rawalpindi',
  fsd: 'Faisalabad', faisalabad: 'Faisalabad', 'فیصل آباد': 'Faisalabad',
  multan: 'Multan', 'ملتان': 'Multan', peshawar: 'Peshawar', 'پشاور': 'Peshawar',
  quetta: 'Quetta', 'کوئٹہ': 'Quetta', hyderabad: 'Hyderabad', 'حیدرآباد': 'Hyderabad',
  sialkot: 'Sialkot', 'سیالکوٹ': 'Sialkot', gujranwala: 'Gujranwala', 'گوجرانوالہ': 'Gujranwala',
};
/** "  lahore " → "Lahore"; "isb" → "Islamabad". Anything else is title-cased. */
function normCity(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!s) return '';
  const alias = CITY_ALIASES[s.toLowerCase()];
  if (alias) return alias;
  return s.replace(/\S+/g, (w) => (/^[a-z]/i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w));
}

const GENDER_ALIASES = {
  male: 'Male', m: 'Male', man: 'Male', 'مرد': 'Male', mard: 'Male',
  female: 'Female', f: 'Female', woman: 'Female', 'خاتون': 'Female', 'عورت': 'Female', khatoon: 'Female',
  other: 'Other', 'prefer not to say': 'Prefer not to say', 'rather not say': 'Prefer not to say',
  'بتانا نہیں چاہتے': 'Prefer not to say',
};
function normGender(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!s) return '';
  return GENDER_ALIASES[s.toLowerCase()] || (s.charAt(0).toUpperCase() + s.slice(1));
}
const AGE_BANDS = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
function normAge(v) {
  const s = String(v || '').trim().replace(/-/g, '–').slice(0, 20);
  return s;
}

// Longest prefix wins: 971 before 97, 1 only for a full North American number.
const DIAL = {
  92: 'Pakistan', 971: 'United Arab Emirates', 966: 'Saudi Arabia', 974: 'Qatar', 968: 'Oman', 973: 'Bahrain',
  965: 'Kuwait', 44: 'United Kingdom', 1: 'United States / Canada', 91: 'India', 880: 'Bangladesh', 93: 'Afghanistan',
  98: 'Iran', 90: 'Türkiye', 86: 'China', 60: 'Malaysia', 65: 'Singapore', 61: 'Australia', 64: 'New Zealand',
  49: 'Germany', 33: 'France', 39: 'Italy', 34: 'Spain', 31: 'Netherlands', 46: 'Sweden', 47: 'Norway', 353: 'Ireland',
  27: 'South Africa', 20: 'Egypt', 81: 'Japan', 82: 'South Korea', 62: 'Indonesia', 63: 'Philippines', 55: 'Brazil',
  94: 'Sri Lanka', 977: 'Nepal', 962: 'Jordan', 961: 'Lebanon', 964: 'Iraq', 7: 'Russia / Kazakhstan',
};
/** The country a WhatsApp number dials from, or '' for a web visitor or an unknown code. */
function countryOf(key) {
  const k = String(key || '');
  if (!/^\d{10,15}$/.test(k)) return '';
  for (const len of [3, 2, 1]) {
    const c = DIAL[k.slice(0, len)];
    if (c && (len > 1 || k.length === 11)) return c;
  }
  return '';
}

function labelOf(key) {
  const k = String(key || '');
  if (/^\d{8,15}$/.test(k)) return `+${k}`;
  if (!k) return 'Unknown';
  return `Web visitor ${k.slice(-6)}`;
}

const CHANNEL = { whatsapp: 'WhatsApp', web: 'Web chat', website: 'Website', instagram: 'Instagram', voice: 'Voice', facebook: 'Facebook', email: 'Email' };

/* ------------------------------------------------------------------ */
/* Writing what is known                                                */
/* ------------------------------------------------------------------ */

const AUTO_FIELDS = ['name', 'phone', 'email', 'city', 'gender', 'age_band', 'company'];

/** Cleans what an automatic source says about someone. Unknown or empty values are dropped. */
function cleanAuto(fields = {}) {
  const out = {};
  const name = String(fields.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  // n8n's placeholder for "WhatsApp sent no name", and the CRM's own dash.
  if (name && !['there', '—', '-'].includes(name.toLowerCase())) out.name = name;
  const phone = String(fields.phone || '').trim().slice(0, 40);
  if (phone) out.phone = phone;
  const email = String(fields.email || '').trim().toLowerCase().slice(0, 200);
  if (email && EMAIL_RE.test(email)) out.email = email;
  if (fields.city) out.city = normCity(fields.city);
  if (fields.gender) out.gender = normGender(fields.gender);
  if (fields.age_band) out.age_band = normAge(fields.age_band);
  const company = String(fields.company || '').trim().slice(0, 160);
  if (company) out.company = company;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/**
 * Fills whatever is blank on someone's profile from an automatic source.
 * Never overwrites: a name somebody typed in stays, however the WhatsApp
 * profile name changes. Returns true when a profile was touched.
 */
async function fillProfile(clientId, key, fields, { source = '' } = {}, q = db) {
  const k = String(key || '').trim().slice(0, 200);
  if (!clientId || !k) return false;
  const f = cleanAuto(fields);
  if (!Object.keys(f).length) return false;
  const v = AUTO_FIELDS.map((x) => f[x] || '');
  await q.query(
    `insert into contacts (client_id, contact_key, name, phone, email, city, gender, age_band, company, name_source)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (client_id, contact_key) do update set
       name = case when contacts.name = '' then excluded.name else contacts.name end,
       name_source = case when contacts.name = '' and excluded.name <> '' then excluded.name_source else contacts.name_source end,
       phone = case when contacts.phone = '' then excluded.phone else contacts.phone end,
       email = case when contacts.email = '' then excluded.email else contacts.email end,
       city = case when contacts.city = '' then excluded.city else contacts.city end,
       gender = case when contacts.gender = '' then excluded.gender else contacts.gender end,
       age_band = case when contacts.age_band = '' then excluded.age_band else contacts.age_band end,
       company = case when contacts.company = '' then excluded.company else contacts.company end
     where contacts.name = '' and excluded.name <> '' or contacts.phone = '' and excluded.phone <> ''
        or contacts.email = '' and excluded.email <> '' or contacts.city = '' and excluded.city <> ''
        or contacts.gender = '' and excluded.gender <> '' or contacts.age_band = '' and excluded.age_band <> ''
        or contacts.company = '' and excluded.company <> ''`,
    [clientId, k, ...v, f.name ? String(source).slice(0, 40) : '']
  );
  return true;
}

const EDITABLE = ['name', 'phone', 'email', 'city', 'gender', 'age_band', 'company', 'tags', 'notes', 'do_not_contact'];

/** A person's edit — staff in the CRM or the business in its portal. Blanks clear a field. */
async function editProfile(clientId, key, patch = {}, by = '') {
  const k = String(key || '').trim();
  if (!k || k.length > 200) throw new ContactError(400, 'That is not a customer.');
  const set = {};
  for (const f of EDITABLE) {
    if (!(f in patch)) continue;
    const v = patch[f];
    if (f === 'tags') {
      if (!Array.isArray(v)) throw new ContactError(400, 'Tags must be a list.');
      const tags = [...new Set(v.map((t) => String(t || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 30)).filter(Boolean))];
      if (tags.length > 20) throw new ContactError(400, 'Up to 20 tags.');
      set.tags = tags;
    } else if (f === 'do_not_contact') {
      set.do_not_contact = v === true;
    } else if (f === 'notes') {
      set.notes = String(v == null ? '' : v).slice(0, 4000);
    } else if (f === 'email') {
      const e = String(v || '').trim().toLowerCase();
      if (e && !EMAIL_RE.test(e)) throw new ContactError(400, 'That email address does not look right.');
      set.email = e;
    } else if (f === 'city') set.city = normCity(v);
    else if (f === 'gender') set.gender = normGender(v);
    else if (f === 'age_band') set.age_band = normAge(v);
    else set[f] = String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, f === 'company' ? 160 : 120);
  }
  if (!Object.keys(set).length) throw new ContactError(400, 'Nothing to change.');
  const cols = [...Object.keys(set), 'edited_by'];
  const params = [clientId, k, ...Object.keys(set).map((c) => set[c]), String(by || '').slice(0, 120)];
  if ('name' in set) { cols.push('name_source'); params.push('edited'); }
  const { rows } = await db.query(
    `insert into contacts (client_id, contact_key, ${cols.join(', ')}, edited_at)
     values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')}, now())
     on conflict (client_id, contact_key) do update set
       ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, edited_at = now()
     returning *`,
    params
  );
  return rows[0];
}

/* ------------------------------------------------------------------ */
/* The directory                                                        */
/* ------------------------------------------------------------------ */

/**
 * Everyone a client (or every client, clientId null) has: anyone who has
 * talked to an agent, and anyone known only from a survey or an edit.
 * One row each, with their whole history rolled up.
 */
async function allContacts(clientId = null) {
  const { rows } = await db.query(
    `with act as (
       select u.client_id, ${CONTACT_OF('u.session_id')} as key,
              min(u.occurred_at) as first_at, max(u.occurred_at) as last_at,
              count(distinct u.session_id)::int as conversations,
              count(distinct u.session_id) filter (where u.occurred_at >= now() - interval '30 days')::int as conv_30d,
              coalesce(sum(u.messages_count), 0)::int as messages,
              string_agg(distinct u.channel, ',') as channels,
              (array_agg(a.name order by u.occurred_at desc) filter (where a.name is not null))[1] as agent,
              count(distinct u.session_id) filter (where u.handoff)::int as handoffs
         from usage_events u left join client_agents a on a.id = u.agent_id
        where ($1::uuid is null or u.client_id = $1)
        group by 1, 2
     ),
     sat as (
       select client_id, ${CONTACT_OF('session_id')} as key, count(*)::int as answers,
              (array_agg(score order by responded_at desc) filter (where score is not null))[1] as last_score,
              (array_agg(nps order by responded_at desc) filter (where nps is not null))[1] as last_nps,
              avg(score) as avg_score, max(responded_at) as last_answer_at
         from csat_responses where session_id <> '' and ($1::uuid is null or client_id = $1)
        group by 1, 2
     ),
     base as (
       select client_id, key from act
       union
       select client_id, contact_key from contacts where ($1::uuid is null or client_id = $1)
     )
     select b.client_id, b.key, c.company as client_company, c.is_internal,
            p.name, p.phone, p.email, p.city, p.gender, p.age_band, p.company, p.tags, p.notes, p.do_not_contact,
            p.name_source, p.edited_by, p.edited_at,
            act.first_at, act.last_at, act.conversations, act.conv_30d, act.messages, act.channels, act.agent, act.handoffs,
            sat.answers, sat.last_score, sat.last_nps, sat.avg_score, sat.last_answer_at,
            l.name as lead_name, l.email as lead_email, l.company as lead_company, l.stage as lead_stage, l.source as lead_source
       from base b
       join clients c on c.id = b.client_id
       left join act on act.client_id = b.client_id and act.key = b.key
       left join contacts p on p.client_id = b.client_id and p.contact_key = b.key
       left join sat on sat.client_id = b.client_id and sat.key = b.key
       left join clients l on c.is_internal and l.external_ref = 'wa-' || b.key
      order by act.last_at desc nulls last, p.updated_at desc nulls last`,
    [clientId]
  );
  return rows.map(shape);
}

const STAGE = { lead: 'New lead', contacted: 'Contacted', proposal: 'Proposal sent', negotiation: 'Negotiation', active: 'Customer', lost: 'Lost', churned: 'Churned' };
const DAY = 86400000;

function shape(r) {
  const now = Date.now();
  const convs = r.conversations || 0;
  const leadName = r.lead_name && r.lead_name !== '—' ? r.lead_name : '';
  const segments = [];
  if (r.first_at && now - new Date(r.first_at) <= 30 * DAY) segments.push('new');
  if (convs >= 2) segments.push('returning');
  if (convs >= 5) segments.push('vip');
  if (convs >= 2 && r.last_at && now - new Date(r.last_at) > 60 * DAY) segments.push('at_risk');
  if ((r.last_score != null && r.last_score <= 2) || (r.last_nps != null && r.last_nps <= 6)) segments.push('unhappy');
  if (!convs) segments.push('survey_only');
  const name = r.name || leadName;
  return {
    client_id: r.client_id,
    client_company: r.client_company,
    key: r.key,
    label: labelOf(r.key),
    name,
    phone: r.phone || (/^\d{8,15}$/.test(r.key) ? `+${r.key}` : ''),
    email: r.email || r.lead_email || '',
    city: r.city || '',
    gender: r.gender || '',
    age_band: r.age_band || '',
    company: r.company || r.lead_company || '',
    country: countryOf(r.key),
    tags: r.tags || [],
    notes: r.notes || '',
    do_not_contact: !!r.do_not_contact,
    name_source: r.name ? r.name_source : (leadName ? 'lead' : ''),
    edited_by: r.edited_by || '', edited_at: r.edited_at || null,
    first_at: r.first_at, last_at: r.last_at,
    conversations: convs, conversations_30d: r.conv_30d || 0, messages: r.messages || 0,
    handoffs: r.handoffs || 0,
    channels: String(r.channels || '').split(',').filter(Boolean).map((c) => CHANNEL[c] || c),
    agent: r.agent || (convs ? 'Main agent' : ''),
    days_since: r.last_at ? Math.floor((now - new Date(r.last_at)) / DAY) : null,
    answers: r.answers || 0,
    last_score: r.last_score, last_nps: r.last_nps,
    avg_score: r.avg_score != null ? Math.round(Number(r.avg_score) * 100) / 100 : null,
    in_crm: r.lead_stage ? `${STAGE[r.lead_stage] || r.lead_stage}${r.lead_source ? ` · ${r.lead_source}` : ''}` : '',
    status: !convs ? 'From a survey' : convs >= 2 ? 'Returning' : 'New',
    segments,
  };
}

const SEGMENTS = {
  all: () => true,
  new: (c) => c.segments.includes('new'),
  returning: (c) => c.segments.includes('returning'),
  vip: (c) => c.segments.includes('vip'),
  at_risk: (c) => c.segments.includes('at_risk'),
  unhappy: (c) => c.segments.includes('unhappy'),
  no_name: (c) => !c.name,
  with_email: (c) => !!c.email,
};
const SORTS = {
  recent: (a, b) => (new Date(b.last_at || 0) - new Date(a.last_at || 0)),
  oldest: (a, b) => (new Date(a.first_at || 8.64e15) - new Date(b.first_at || 8.64e15)),
  most: (a, b) => b.conversations - a.conversations || (new Date(b.last_at || 0) - new Date(a.last_at || 0)),
  name: (a, b) => (a.name || '~').localeCompare(b.name || '~') || a.label.localeCompare(b.label),
};

/** Filtered, sorted and paged, with counts for the chips and the city filter. */
async function listContacts(clientId, { q = '', segment = 'all', city = '', sort = 'recent', limit = 50, offset = 0 } = {}) {
  const all = await allContacts(clientId);
  const counts = Object.fromEntries(Object.keys(SEGMENTS).map((s) => [s, all.filter(SEGMENTS[s]).length]));
  const cities = tally(all.map((c) => c.city || ''));
  const needle = String(q || '').trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  let list = all.filter(SEGMENTS[segment] || SEGMENTS.all);
  if (city) list = list.filter((c) => (city === '—' ? !c.city : c.city === city));
  if (needle) {
    list = list.filter((c) => [c.name, c.email, c.city, c.company, c.label, c.client_company, c.notes, ...(c.tags || [])]
      .some((v) => String(v || '').toLowerCase().includes(needle)) || (digits.length >= 3 && c.key.includes(digits)));
  }
  list.sort(SORTS[sort] || SORTS.recent);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);
  return {
    total: all.length,
    matching: list.length,
    counts,
    cities,
    coverage: coverage(all),
    contacts: list.slice(off, off + lim),
  };
}

function tally(values) {
  const m = new Map();
  for (const v of values) m.set(v, (m.get(v) || 0) + 1);
  return [...m.entries()].map(([name, n]) => ({ name: name || '—', n })).sort((a, b) => (a.name === '—') - (b.name === '—') || b.n - a.n);
}
function coverage(all) {
  return {
    contacts: all.length,
    with_name: all.filter((c) => c.name).length,
    with_email: all.filter((c) => c.email).length,
    with_city: all.filter((c) => c.city).length,
    with_gender: all.filter((c) => c.gender).length,
  };
}

/* ------------------------------------------------------------------ */
/* One customer                                                          */
/* ------------------------------------------------------------------ */

async function contactDetail(clientId, key) {
  const k = String(key || '');
  const all = await allContacts(clientId);
  const c = all.find((x) => x.key === k);
  if (!c) throw new ContactError(404, 'Customer not found');
  const { rows: cl } = await db.query(`select is_internal from clients where id = $1`, [clientId]);
  const internal = !!(cl[0] && cl[0].is_internal);

  const [sessions, messages, surveys, answers] = await Promise.all([
    db.query(
      `select u.session_id, min(u.occurred_at) as started, max(u.occurred_at) as ended,
              coalesce(sum(u.messages_count), 0)::int as messages, count(*)::int as replies,
              mode() within group (order by u.channel) as channel,
              (array_agg(a.name order by u.occurred_at) filter (where a.name is not null))[1] as agent,
              bool_or(u.handoff) as handoff, count(u.handoff) > 0 as handoff_reported
         from usage_events u left join client_agents a on a.id = u.agent_id
        where u.client_id = $1 and ${CONTACT_OF('u.session_id')} = $2
        group by u.session_id order by started desc limit 500`,
      [clientId, k]
    ),
    db.query(
      `select m.session_id, m.role, m.content, m.channel, m.created_at
         from conversation_messages m
        where (${CONTACT_OF('m.session_id')} = $2
               and (m.client_id = $1 or m.agent_id in (select id from client_agents where client_id = $1)))
           or ($3 and m.external_ref = 'wa-' || $2)
        order by m.created_at desc limit 2000`,
      [clientId, k, internal]
    ),
    db.query(
      `select r.*, s.title as survey_title, s.questions, s.display_name, s.slug
         from survey_responses r join surveys s on s.id = r.survey_id
        where r.client_id = $1
          and (exists (select 1 from survey_invites i where i.response_id = r.id and ${CONTACT_OF('i.session_id')} = $2)
               or ($3 <> '' and regexp_replace(r.contact_phone, '\\D', '', 'g') in ($3, '0' || substr($3, 3))))
        order by r.submitted_at desc limit 200`,
      [clientId, k, /^92\d{10}$/.test(k) ? k : (/^\d{10,15}$/.test(k) ? k : '')]
    ),
    db.query(
      `select score, nps, resolved, comment, channel, source, responded_at
         from csat_responses where client_id = $1 and survey_response_id is null and ${CONTACT_OF('session_id')} = $2
        order by responded_at desc limit 200`,
      [clientId, k]
    ),
  ]);

  // Transcript lines grouped under the conversation they belong to.
  const bySession = new Map();
  for (const m of messages.rows.slice().reverse()) {
    const sid = m.session_id || `${k}-${new Date(m.created_at).toISOString().slice(0, 10)}`;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push({ role: m.role, content: m.content, at: m.created_at });
  }
  const convs = sessions.rows.map((s, i) => ({
    session_id: s.session_id,
    started: s.started, ended: s.ended,
    minutes: Math.max(0, Math.round((new Date(s.ended) - new Date(s.started)) / 60000)),
    messages: s.messages, replies: s.replies,
    channel: CHANNEL[s.channel] || s.channel,
    agent: s.agent || 'Main agent',
    handoff: s.handoff_reported ? !!s.handoff : null,
    visit: sessions.rows.length - i,
    transcript: bySession.get(s.session_id) || [],
  }));
  // Lines logged under a session usage never saw (a lead's chat before the agent metered it).
  const known = new Set(sessions.rows.map((s) => s.session_id));
  const orphan = [...bySession.entries()].filter(([sid]) => !known.has(sid))
    .map(([sid, lines]) => ({ session_id: sid, started: lines[0].at, ended: lines[lines.length - 1].at, transcript: lines, channel: CHANNEL[messages.rows[0].channel] || '', messages: lines.length, visit: null }));

  const { readableAnswers } = require('./surveys');
  const lastScoreRow = [...surveys.rows.map((r) => ({ at: r.submitted_at, score: r.score })), ...answers.rows.map((r) => ({ at: r.responded_at, score: r.score }))]
    .filter((x) => x.score != null).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
  return {
    ...c,
    last_score: c.last_score != null ? c.last_score : (lastScoreRow ? lastScoreRow.score : null),
    avg_minutes: convs.length ? Math.round(convs.reduce((a, x) => a + x.minutes, 0) / convs.length) : null,
    avg_gap_days: convs.length >= 2 ? Math.round(((new Date(c.last_at) - new Date(c.first_at)) / DAY / (convs.length - 1)) * 10) / 10 : null,
    conversations_list: [...convs, ...orphan].sort((a, b) => new Date(b.started) - new Date(a.started)),
    has_transcripts: messages.rows.length > 0,
    survey_responses: surveys.rows.map((r) => ({
      id: r.id, survey_id: r.survey_id, survey: r.survey_title, submitted_at: r.submitted_at,
      score: r.score, nps: r.nps, ces: r.ces, resolved: r.resolved, comment: r.comment,
      channel: r.channel, followup: r.followup_status, followup_note: r.followup_note,
      readable: readableAnswers({ questions: r.questions, display_name: r.display_name }, r.answers),
    })),
    other_answers: answers.rows,
  };
}

module.exports = {
  ContactError, CONTACT_OF, keyOf, phoneDigits, normCity, normGender, normAge, AGE_BANDS, countryOf, labelOf,
  cleanAuto, fillProfile, editProfile, allContacts, listContacts, contactDetail, SEGMENTS,
};
