const ExcelJS = require('exceljs');
const db = require('../db');
const { clientAnalytics, platformAnalytics, salesAnalytics, periodBounds, GRAINS, TZ, normaliseGrain } = require('./analytics');
const { answerText } = require('./surveys');

/**
 * The Excel reports behind "Download report" on Vantriq Pulse (analytics)
 * and Vantriq Echo (surveys) — one workbook, one tab per subject.
 *
 * The dashboards show counts; a report is where someone goes to act on them,
 * so it also carries the detail behind every count: each contact (new or
 * coming back, first and last visit, how often), each conversation, each
 * survey answer and follow-up. Every figure on the dashboard is here, worked
 * out by the same engine (utils/analytics.js), so the two never disagree.
 *
 * Three workbooks:
 *   clientReport(client)   one customer — the CRM's Customer view, the
 *                          customer's own portal, and their API
 *   clientReport(null)     every customer together (CRM → All customers)
 *   salesReport()          VantriqAI's own leads and sales (CRM → Sales)
 *
 * Contacts are shown by the number they wrote from. A customer's report
 * lists their own customers — the people who messaged their agent, which
 * the business needs in order to follow up — and never anyone else's. This
 * is the one place a customer gets numbers rather than counts; the
 * dashboards and the JSON API still carry counts only.
 *
 * A customer without Vantriq Echo gets the satisfaction answers other tools
 * post (they are part of Pulse), but no surveys, survey answers or
 * follow-ups — the same line the portal's Echo tab draws.
 */

const ROW_LIMIT = 20000;

const C = {
  brand: 'FF2F56D9', brandDark: 'FF1F3A95', pale: 'FFE8ECFD', ink: 'FF16151A', muted: 'FF6B645B',
  line: 'FFE7E2D8', zebra: 'FFFAF8F4', good: 'FF1F7A4D', bad: 'FFB3261E', white: 'FFFFFFFF',
};
const CHANNEL = { whatsapp: 'WhatsApp', web: 'Web chat', website: 'Website', instagram: 'Instagram', voice: 'Voice', facebook: 'Facebook', email: 'Email',
  qr: 'QR code', link: 'Survey link', kiosk: 'Kiosk', sms: 'SMS', embed: 'Website survey' };
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HOURS = Array.from({ length: 24 }, (_, h) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCORE_LABEL = { 1: 'Very unhappy', 2: 'Unhappy', 3: 'Neutral', 4: 'Happy', 5: 'Very happy' };
const STAGE = { lead: 'New lead', contacted: 'Contacted', proposal: 'Proposal sent', negotiation: 'Negotiation', active: 'Customer', lost: 'Lost', churned: 'Churned' };

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

/** A moment as the wall-clock time in the business's zone — Excel has no time zones. */
function local(t) {
  if (!t) return null;
  const d = t instanceof Date ? t : new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(d)) p[x.type] = Number(x.value);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second));
}

/** "2026-09-01" at a grain → how the dashboard labels that period. */
function periodLabel(bucket, grain) {
  const [y, m, d] = String(bucket).split('-').map(Number);
  if (grain === 'year') return String(y);
  if (grain === 'quarter') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (grain === 'month') return `${MONTHS[m - 1]} ${y}`;
  if (grain === 'week') return `Week of ${d} ${MONTHS[m - 1]} ${y}`;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The person behind a session id: a WhatsApp number, or a web visitor. */
const contactKey = (sessionId) => String(sessionId || '').replace(/-\d{4}-\d{2}-\d{2}$/, '');
function contactLabel(key) {
  const k = String(key || '');
  if (/^\d{8,15}$/.test(k)) return `+${k}`;
  if (!k) return 'Unknown';
  return `Web visitor ${k.slice(-6)}`;
}
const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const days = (a, b) => (a && b ? Math.round(((new Date(b) - new Date(a)) / 86400000) * 10) / 10 : null);
const safeName = (s) => String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'report';

/* ------------------------------------------------------------------ */
/* Presentation                                                         */
/* ------------------------------------------------------------------ */

function newBook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VantriqAI';
  wb.company = 'VantriqAI';
  wb.created = new Date();
  return wb;
}

function addSheet(wb, name, { tab = C.brand, freeze = 0, landscape = false } = {}) {
  return wb.addWorksheet(name.slice(0, 31), {
    properties: { tabColor: { argb: tab } },
    views: freeze ? [{ state: 'frozen', ySplit: freeze, showGridLines: false }] : [{ showGridLines: false }],
    pageSetup: { orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
}

/** A sheet's title block: title, one line of context. Returns the next free row. */
function titleBlock(ws, title, subtitle, width = 8) {
  ws.getCell(1, 1).value = title;
  ws.getCell(1, 1).font = { size: 16, bold: true, color: { argb: C.brand } };
  ws.getRow(1).height = 26;
  if (subtitle) {
    ws.getCell(2, 1).value = subtitle;
    ws.getCell(2, 1).font = { size: 10, italic: true, color: { argb: C.muted } };
    ws.mergeCells(2, 1, 2, Math.max(2, width));
    ws.getCell(2, 1).alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(2).height = subtitle.length > 140 ? 30 : 16;
  }
  return 4;
}

function sectionTitle(ws, row, text, width = 6) {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { size: 12.5, bold: true, color: { argb: C.ink } };
  c.border = { bottom: { style: 'medium', color: { argb: C.brand } } };
  for (let i = 2; i <= width; i++) ws.getCell(row, i).border = { bottom: { style: 'medium', color: { argb: C.brand } } };
  return row + 1;
}

/**
 * A table at `row`: a branded header, zebra rows, number formats per column,
 * optional totals and data bars. Returns the row after it.
 *   columns: [{ header, key, width, fmt: 'int'|'pct'|'dec'|'date'|'datetime'|'text'|'money', bar: true }]
 *   spanTo:  merge the last column across to this column, so long text there
 *            does not widen a column that other tables on the sheet share
 */
function table(ws, row, columns, rows, { totals = null, filter = false, emptyText = 'Nothing in this period.', spanTo = 0 } = {}) {
  const start = row;
  const span = (r) => { if (spanTo > columns.length) ws.mergeCells(r, columns.length, r, spanTo); };
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.width && (!col.width || col.width < c.width)) col.width = c.width;
    const cell = ws.getCell(row, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: C.white }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brand } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : (['text'].includes(c.fmt) ? 'left' : 'center'), wrapText: true };
    cell.border = { bottom: { style: 'thin', color: { argb: C.brandDark } } };
  });
  span(row);
  ws.getRow(row).height = 30;
  row += 1;
  if (!rows.length) {
    const cell = ws.getCell(row, 1);
    cell.value = emptyText;
    cell.font = { italic: true, color: { argb: C.muted } };
    return row + 2;
  }
  const first = row;
  rows.slice(0, ROW_LIMIT).forEach((r, idx) => {
    columns.forEach((c, i) => {
      const cell = ws.getCell(row, i + 1);
      let v = r[c.key];
      if (v === undefined || v === '') v = null;
      cell.value = v;
      format(cell, c.fmt);
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } };
      cell.border = { bottom: { style: 'hair', color: { argb: C.line } } };
      if (c.fmt === 'text' && c.wrap) cell.alignment = { wrapText: true, vertical: 'top' };
    });
    span(row);
    row += 1;
  });
  const last = row - 1;
  if (rows.length > ROW_LIMIT) {
    ws.getCell(row, 1).value = `Showing ${ROW_LIMIT.toLocaleString('en-US')} rows — there are more. Choose a shorter period to see them all.`;
    ws.getCell(row, 1).font = { italic: true, color: { argb: C.muted } };
    row += 1;
  }
  if (totals) {
    columns.forEach((c, i) => {
      const cell = ws.getCell(row, i + 1);
      const how = totals[c.key];
      if (i === 0) cell.value = totals.label || 'Total';
      // The result is stored with the formula, so a phone's previewer —
      // which shows stored values and never calculates — shows the total too.
      else if (how === 'sum') {
        cell.value = {
          formula: `SUM(${colLetter(i + 1)}${first}:${colLetter(i + 1)}${last})`,
          result: rows.slice(0, ROW_LIMIT).reduce((a, x) => a + (Number(x[c.key]) || 0), 0),
        };
      }
      else if (how !== undefined && how !== null && typeof how !== 'string') cell.value = how;
      cell.font = { bold: true };
      cell.border = { top: { style: 'thin', color: { argb: C.ink } } };
      format(cell, c.fmt);
    });
    row += 1;
  }
  columns.forEach((c, i) => {
    if (c.bar && last >= first) {
      ws.addConditionalFormatting({
        ref: `${colLetter(i + 1)}${first}:${colLetter(i + 1)}${last}`,
        rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF8FA6F0' } }],
      });
    }
  });
  if (filter) ws.autoFilter = { from: { row: start, column: 1 }, to: { row: last, column: columns.length } };
  return row + 1;
}

function format(cell, fmt) {
  if (fmt === 'int') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'pct') { cell.numFmt = '0.0"%"'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'dec') { cell.numFmt = '0.0#'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'signed') { cell.numFmt = '+0.0;-0.0;0'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'signedpct') { cell.numFmt = '+0.0"%";-0.0"%";0"%"'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'date') { cell.numFmt = 'dd mmm yyyy'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'datetime') { cell.numFmt = 'dd mmm yyyy, hh:mm'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'money') { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
  else if (fmt === 'center') { cell.alignment = { horizontal: 'center' }; }
}

function colLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Key figures as a Metric | this period | previous | change | … table. */
function kpiTable(ws, row, d, items) {
  const cols = [
    { header: 'Figure', key: 'label', width: 34, fmt: 'text' },
    { header: `${d.period.current_label} (${d.period.elapsed_pct}% through)`, key: 'cur', width: 20, fmt: 'num' },
    { header: `${cap(d.period.previous_label)}, same point`, key: 'prev', width: 20, fmt: 'num' },
    { header: 'Change', key: 'chg', width: 13, fmt: 'num' },
    { header: `All of ${d.period.previous_label}`, key: 'full', width: 18, fmt: 'num' },
    { header: 'On pace for', key: 'proj', width: 14, fmt: 'num' },
  ];
  row = table(ws, row, cols, items);
  // Per-row number formats: a count, a percentage, a score.
  let r = row - 1 - items.length - 1;
  for (const it of items) {
    r += 1;
    const f = it.fmt || 'int';
    for (const c of [2, 3, 5, 6]) format(ws.getCell(r, c), f);
    format(ws.getCell(r, 4), it.chgFmt || 'signedpct');
    const chg = ws.getCell(r, 4).value;
    if (typeof chg === 'number' && chg !== 0 && it.good !== null) {
      const good = it.good === false ? chg < 0 : chg > 0;
      ws.getCell(r, 4).font = { bold: true, color: { argb: good ? C.good : C.bad } };
    }
  }
  return row;
}
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

function notesList(ws, row, lines, width = 6) {
  for (const l of lines) {
    const cell = ws.getCell(row, 1);
    cell.value = l.text || l;
    cell.alignment = { wrapText: true, vertical: 'top' };
    const tone = l.tone;
    cell.font = { color: { argb: tone === 'warn' || tone === 'down' ? C.bad : tone === 'up' ? C.good : C.ink } };
    ws.mergeCells(row, 1, row, width);
    ws.getRow(row).height = Math.max(16, Math.ceil(String(cell.value).length / 110) * 15);
    row += 1;
  }
  return row + 1;
}

/* ------------------------------------------------------------------ */
/* The detail behind the counts                                         */
/* ------------------------------------------------------------------ */

/** Every contact active in the window, with their whole history. */
async function contactRows(clientId, b, { echo = true } = {}) {
  const { rows } = await db.query(
    `with ev as (
       select u.client_id, u.session_id, u.occurred_at, u.messages_count, u.channel, u.agent_id,
              regexp_replace(u.session_id, '-\\d{4}-\\d{2}-\\d{2}$', '') as contact
         from usage_events u where ($1::uuid is null or u.client_id = $1)
     ),
     sess as (
       select client_id, contact, session_id, min(occurred_at) as started, max(occurred_at) as ended,
              sum(messages_count)::int as msgs, mode() within group (order by channel) as channel,
              (array_agg(agent_id order by occurred_at) filter (where agent_id is not null))[1] as agent_id
         from ev group by client_id, contact, session_id
     )
     select s.client_id, s.contact, c.company, c.is_internal,
            min(s.started) as first_at, max(s.ended) as last_at,
            count(*)::int as conv_total, sum(s.msgs)::int as msgs_total,
            count(*) filter (where s.started >= $2)::int as conv_window,
            coalesce(sum(s.msgs) filter (where s.started >= $2), 0)::int as msgs_window,
            count(*) filter (where s.started >= $3)::int as conv_current,
            count(distinct (s.started at time zone $4)::date)::int as active_days,
            string_agg(distinct s.channel, ', ') as channels,
            string_agg(distinct a.name, ', ') as agents
       from sess s join clients c on c.id = s.client_id
       left join client_agents a on a.id = s.agent_id
      group by s.client_id, s.contact, c.company, c.is_internal
     having count(*) filter (where s.started >= $2) > 0
      order by max(s.ended) desc`,
    [clientId, b.window_start, b.cur_start, TZ]
  );
  if (!rows.length) return [];

  // What else is known about them: a lead record (our own WhatsApp agent
  // files every prospect as wa-<number>), and any satisfaction answers.
  const internal = rows.filter((r) => r.is_internal).map((r) => `wa-${r.contact}`);
  const leads = new Map();
  if (internal.length) {
    const { rows: l } = await db.query(
      `select external_ref, name, company, stage, email, source from clients where external_ref = any($1)`, [internal]);
    for (const x of l) leads.set(x.external_ref.slice(3), x);
  }
  const { rows: sat } = await db.query(
    `select client_id, regexp_replace(session_id, '-\\d{4}-\\d{2}-\\d{2}$', '') as contact, count(*)::int as n,
            (array_agg(score order by responded_at desc) filter (where score is not null))[1] as last_score,
            (array_agg(nps order by responded_at desc) filter (where nps is not null))[1] as last_nps,
            max(responded_at) as last_at
       from csat_responses where session_id <> '' and ($1::uuid is null or client_id = $1)
      group by 1, 2`,
    [clientId]
  );
  const satOf = new Map(sat.map((s) => [`${s.client_id}|${s.contact}`, s]));
  // A name or email a contact typed into an Echo survey they were sent after a chat.
  const named = !echo ? { rows: [] } : await db.query(
    `select r.client_id, regexp_replace(i.session_id, '-\\d{4}-\\d{2}-\\d{2}$', '') as contact,
            (array_agg(nullif(r.contact_name, '') order by r.submitted_at desc) filter (where r.contact_name <> ''))[1] as name,
            (array_agg(nullif(r.contact_email, '') order by r.submitted_at desc) filter (where r.contact_email <> ''))[1] as email
       from survey_invites i join survey_responses r on r.id = i.response_id
      where i.session_id <> '' and ($1::uuid is null or r.client_id = $1)
      group by 1, 2`,
    [clientId]
  );
  const nameOf = new Map(named.rows.map((s) => [`${s.client_id}|${s.contact}`, s]));

  const now = Date.now();
  return rows.map((r) => {
    const lead = r.is_internal ? leads.get(r.contact) : null;
    const s = satOf.get(`${r.client_id}|${r.contact}`);
    const nm = nameOf.get(`${r.client_id}|${r.contact}`);
    const isNewWindow = new Date(r.first_at) >= new Date(b.window_start);
    const isNewCurrent = new Date(r.first_at) >= new Date(b.cur_start);
    return {
      client_id: r.client_id,
      contact_key: r.contact,
      contact: contactLabel(r.contact),
      name: (lead && (lead.name && lead.name !== '—' ? lead.name : '')) || (nm && nm.name) || '',
      email: (lead && lead.email) || (nm && nm.email) || '',
      company: r.company,
      in_crm: lead ? `${STAGE[lead.stage] || lead.stage}${lead.source ? ` · ${lead.source}` : ''}` : '',
      // First seen before the window: a returning customer. First seen in
      // it: new — and "came back" once they have had a second conversation.
      status: !isNewWindow ? 'Returning' : (r.conv_total >= 2 ? 'New, came back' : 'New'),
      new_window: isNewWindow,
      new_current: isNewCurrent,
      returning: r.conv_total >= 2,
      first_at: local(r.first_at),
      last_at: local(r.last_at),
      first_raw: r.first_at,
      conv_window: r.conv_window,
      conv_current: r.conv_current,
      conv_total: r.conv_total,
      comebacks: Math.max(0, r.conv_total - 1),
      msgs_window: r.msgs_window,
      msgs_total: r.msgs_total,
      active_days: r.active_days,
      span_days: days(r.first_at, r.last_at),
      avg_gap: r.conv_total >= 2 ? Math.round((days(r.first_at, r.last_at) / (r.conv_total - 1)) * 10) / 10 : null,
      since_last: Math.max(0, Math.floor((now - new Date(r.last_at)) / 86400000)),
      channels: String(r.channels || '').split(', ').map((c) => CHANNEL[c] || c).join(', '),
      agents: r.agents || '',
      answers: s ? s.n : 0,
      last_score: s ? s.last_score : null,
      last_nps: s ? s.last_nps : null,
    };
  });
}

/** Every conversation that started in the window. */
async function conversationRows(clientId, b) {
  const { rows } = await db.query(
    `with ev as (
       select u.*, regexp_replace(u.session_id, '-\\d{4}-\\d{2}-\\d{2}$', '') as contact
         from usage_events u where ($1::uuid is null or u.client_id = $1)
     ),
     sess as (
       select client_id, contact, session_id, min(occurred_at) as started, max(occurred_at) as ended,
              sum(messages_count)::int as msgs, count(*)::int as replies,
              mode() within group (order by channel) as channel,
              (array_agg(agent_id order by occurred_at) filter (where agent_id is not null))[1] as agent_id,
              bool_or(handoff) as handoff, count(handoff) > 0 as handoff_reported,
              coalesce(sum(input_tokens), 0)::int + coalesce(sum(output_tokens), 0)::int as tokens
         from ev group by client_id, contact, session_id
     ),
     numbered as (
       select s.*, row_number() over (partition by s.client_id, s.contact order by s.started) as nth
         from sess s
     )
     select n.*, c.company, a.name as agent
       from numbered n join clients c on c.id = n.client_id
       left join client_agents a on a.id = n.agent_id
      where n.started >= $2
      order by n.started desc`,
    [clientId, b.window_start]
  );
  return rows.map((r) => ({
    started: local(r.started),
    ended: local(r.ended),
    minutes: Math.max(0, Math.round((new Date(r.ended) - new Date(r.started)) / 60000)),
    contact: contactLabel(r.contact),
    company: r.company,
    channel: CHANNEL[r.channel] || r.channel,
    agent: r.agent || 'Main agent',
    messages: r.msgs,
    replies: r.replies,
    nth: Number(r.nth),
    first_time: Number(r.nth) === 1 ? 'First contact' : `Visit ${r.nth}`,
    handoff: r.handoff_reported ? (r.handoff ? 'Yes' : 'No') : '',
    tokens: r.tokens,
  }));
}

/** The customers, one row each (the all-customers report). */
async function customerRows(b) {
  const { rows } = await db.query(
    `with ev as (
       select u.client_id, u.session_id, u.occurred_at, u.messages_count,
              regexp_replace(u.session_id, '-\\d{4}-\\d{2}-\\d{2}$', '') as contact
         from usage_events u
     ),
     first_seen as (select client_id, contact, min(occurred_at) as first_at from ev group by 1, 2),
     w as (select * from ev where occurred_at >= $1)
     select c.id, c.company, c.is_internal, c.stage, c.surveys_enabled,
            count(distinct w.session_id)::int as conversations,
            count(distinct w.session_id) filter (where w.occurred_at >= $2)::int as conversations_current,
            coalesce(sum(w.messages_count), 0)::int as messages,
            count(distinct w.contact)::int as contacts,
            count(distinct w.contact) filter (where f.first_at >= $1)::int as new_contacts,
            max(w.occurred_at) as last_at,
            (select count(*)::int from csat_responses r where r.client_id = c.id and r.responded_at >= $1) as answers,
            (select round(100.0 * count(*) filter (where r.score >= 4) / nullif(count(r.score), 0), 1)
               from csat_responses r where r.client_id = c.id and r.responded_at >= $1) as csat,
            (select round(100.0 * (count(*) filter (where r.nps >= 9) - count(*) filter (where r.nps <= 6)) / nullif(count(r.nps), 0))
               from csat_responses r where r.client_id = c.id and r.responded_at >= $1) as nps
       from clients c
       join w on w.client_id = c.id
       left join first_seen f on f.client_id = w.client_id and f.contact = w.contact
      group by c.id, c.company, c.is_internal, c.stage, c.surveys_enabled
      order by conversations desc`,
    [b.window_start, b.cur_start]
  );
  return rows.map((r) => ({
    company: r.company + (r.is_internal ? ' (VantriqAI)' : ''),
    stage: STAGE[r.stage] || r.stage,
    conversations: r.conversations,
    conversations_current: r.conversations_current,
    messages: r.messages,
    per_conv: r.conversations ? Math.round((r.messages / r.conversations) * 10) / 10 : null,
    contacts: r.contacts,
    new_contacts: r.new_contacts,
    returning: r.contacts - r.new_contacts,
    last_at: local(r.last_at),
    echo: r.surveys_enabled ? 'On' : 'Off',
    answers: r.answers,
    csat: r.csat == null ? null : Number(r.csat),
    nps: r.nps == null ? null : Number(r.nps),
  }));
}

/**
 * Everything Vantriq Echo holds for the scope: surveys, responses, answers
 * from anywhere, follow-ups. With echo off only the answers (which other
 * tools post too) are read.
 */
async function echoData(clientId, b, { echo = true } = {}) {
  const none = Promise.resolve({ rows: [] });
  const [surveys, responses, answers, followups] = await Promise.all([
    !echo ? none : db.query(
      `select s.id, s.slug, s.title, s.status, s.industry, s.created_at, c.company, c.surveys_enabled,
              count(r.id)::int as responses_all,
              count(r.id) filter (where r.submitted_at >= $2)::int as responses,
              count(r.score) filter (where r.submitted_at >= $2)::int as csat_n,
              count(r.score) filter (where r.submitted_at >= $2 and r.score >= 4)::int as csat_sat,
              avg(r.score) filter (where r.submitted_at >= $2) as csat_avg,
              count(r.nps) filter (where r.submitted_at >= $2)::int as nps_n,
              count(r.nps) filter (where r.submitted_at >= $2 and r.nps >= 9)::int as nps_pro,
              count(r.nps) filter (where r.submitted_at >= $2 and r.nps <= 6)::int as nps_det,
              count(r.resolved) filter (where r.submitted_at >= $2)::int as res_n,
              count(r.resolved) filter (where r.submitted_at >= $2 and r.resolved)::int as res_yes,
              count(r.id) filter (where r.followup_status in ('open','contacted'))::int as open_followups,
              max(r.submitted_at) as last_at,
              (select count(*)::int from survey_invites i where i.survey_id = s.id and i.created_at >= $2) as inv_sent,
              (select count(*)::int from survey_invites i where i.survey_id = s.id and i.created_at >= $2 and i.opened_at is not null) as inv_opened,
              (select count(*)::int from survey_invites i where i.survey_id = s.id and i.created_at >= $2 and i.response_id is not null) as inv_answered
         from surveys s join clients c on c.id = s.client_id
         left join survey_responses r on r.survey_id = s.id
        where ($1::uuid is null or s.client_id = $1)
        group by s.id, c.company, c.surveys_enabled
        order by responses desc, s.created_at desc`,
      [clientId, b.window_start]
    ),
    !echo ? none : db.query(
      `select r.*, s.title as survey_title, s.slug, s.questions, s.display_name, c.company, i.session_id as invite_session
         from survey_responses r join surveys s on s.id = r.survey_id join clients c on c.id = r.client_id
         left join survey_invites i on i.response_id = r.id
        where ($1::uuid is null or r.client_id = $1) and r.submitted_at >= $2
        order by r.submitted_at desc limit ${ROW_LIMIT + 1}`,
      [clientId, b.window_start]
    ),
    db.query(
      `select r.*, c.company, s.title as survey_title
         from csat_responses r join clients c on c.id = r.client_id
         left join survey_responses sr on sr.id = r.survey_response_id
         left join surveys s on s.id = sr.survey_id
        where ($1::uuid is null or r.client_id = $1) and r.responded_at >= $2
        order by r.responded_at desc limit ${ROW_LIMIT + 1}`,
      [clientId, b.window_start]
    ),
    !echo ? none : db.query(
      `select r.*, s.title as survey_title, c.company
         from survey_responses r join surveys s on s.id = r.survey_id join clients c on c.id = r.client_id
        where ($1::uuid is null or r.client_id = $1) and r.followup_status <> 'none'
        order by (r.followup_status = 'open') desc, (r.followup_status = 'contacted') desc, r.submitted_at desc
        limit ${ROW_LIMIT + 1}`,
      [clientId]
    ),
  ]);
  const yn = (v) => (v == null ? '' : v ? 'Yes' : 'No');
  // Every question answered, in words — the same wording as the survey's own export.
  const readable = (r) => (r.questions || [])
    .filter((q) => r.answers && r.answers[q.id] !== undefined && r.answers[q.id] !== null && r.answers[q.id] !== '')
    .map((q) => {
      const title = String((q.title && (q.title.en || Object.values(q.title)[0])) || q.id).replace(/\{business\}/g, r.display_name || r.company || '');
      return `${title}: ${answerText(q, r.answers[q.id])}`;
    })
    .join('  ·  ');
  return {
    surveys: surveys.rows.map((s) => ({
      title: s.title,
      company: s.company,
      status: s.surveys_enabled === false && s.status === 'live' ? 'Paused (Echo off)' : cap(s.status),
      template: s.industry,
      responses: s.responses,
      responses_all: s.responses_all,
      csat: pctOf(s.csat_sat, s.csat_n),
      csat_avg: s.csat_avg != null ? Math.round(Number(s.csat_avg) * 100) / 100 : null,
      nps: s.nps_n ? Math.round(((s.nps_pro - s.nps_det) / s.nps_n) * 100) : null,
      resolution: pctOf(s.res_yes, s.res_n),
      inv_sent: s.inv_sent,
      inv_opened: s.inv_opened,
      inv_answered: s.inv_answered,
      rate: pctOf(s.inv_answered, s.inv_sent),
      followups: s.open_followups,
      last_at: local(s.last_at),
      created: local(s.created_at),
      address: `/s/${s.slug}`,
    })),
    responses: responses.rows.map((r) => ({
      submitted: local(r.submitted_at),
      survey: r.survey_title,
      company: r.company,
      location: r.location_name || '',
      channel: CHANNEL[r.channel] || r.channel,
      language: r.language === 'ur' ? 'Urdu' : 'English',
      score: r.score, nps: r.nps, ces: r.ces, resolved: yn(r.resolved),
      comment: r.comment || '',
      contact_name: r.contact_name || '',
      contact_phone: r.contact_phone || (r.invite_session ? contactLabel(contactKey(r.invite_session)) : ''),
      contact_email: r.contact_email || '',
      consent: r.contact_name || r.contact_phone || r.contact_email ? yn(r.contact_consent) : '',
      followup: r.followup_status === 'none' ? '' : cap(r.followup_status),
      note: r.followup_note || '',
      seconds: r.duration_sec,
      answers: readable(r),
    })),
    answers: answers.rows.map((r) => ({
      answered: local(r.responded_at),
      source: r.survey_title ? (echo ? `Echo survey: ${r.survey_title}` : 'Vantriq Echo') : (r.source || 'Satisfaction webhook'),
      company: r.company,
      contact: r.session_id ? contactLabel(contactKey(r.session_id)) : '',
      channel: CHANNEL[r.channel] || r.channel,
      score: r.score, nps: r.nps, resolved: yn(r.resolved),
      comment: r.comment || '',
    })),
    followups: followups.rows.map((r) => ({
      submitted: local(r.submitted_at),
      status: cap(r.followup_status),
      survey: r.survey_title,
      company: r.company,
      score: r.score, nps: r.nps, resolved: yn(r.resolved),
      comment: r.comment || '',
      contact: [r.contact_name, r.contact_phone, r.contact_email].filter(Boolean).join(' · '),
      note: r.followup_note || '',
      by: r.followup_by || '',
      updated: local(r.followup_at),
      waiting: r.followup_status === 'resolved' ? null : Math.floor((Date.now() - new Date(r.submitted_at)) / 86400000),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* One customer, or every customer: Vantriq Pulse + Vantriq Echo        */
/* ------------------------------------------------------------------ */

/**
 * @param {object|null} client  { id, company } — null for every customer
 * @param {object} opts         { grain, quota, echo } — echo false leaves
 *                              out surveys, survey answers and follow-ups
 * @returns {Promise<{ buffer: Buffer, filename: string }>}
 */
async function clientReport(client, { grain, quota = null, echo: echoOn = true } = {}) {
  grain = normaliseGrain(grain);
  const all = !client;
  const d = all ? await platformAnalytics({ grain }) : await clientAnalytics(client.id, { grain, quota });
  const b = await periodBounds(grain);
  const [contacts, conversations, echo, customers] = await Promise.all([
    contactRows(all ? null : client.id, b, { echo: echoOn }),
    conversationRows(all ? null : client.id, b),
    echoData(all ? null : client.id, b, { echo: echoOn }),
    all ? customerRows(b) : Promise.resolve(null),
  ]);
  const g = GRAINS[grain];
  const who = all ? 'All customers' : client.company;
  const window = g.window.toLowerCase();
  const context = `${g.window} by ${grain} · ${d.period.current_label} is ${d.period.elapsed_pct}% through and is compared with ${d.period.previous_label} up to the same point · ${TZ.replace('Asia/', '')} time · generated ${new Date().toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })}`;
  const wb = newBook();
  wb.title = `Vantriq Pulse & Echo — ${who}`;
  const k = d.kpis;
  const s = d.satisfaction;
  const withCo = all ? [{ header: 'Customer', key: 'company', width: 26, fmt: 'text' }] : [];

  /* --- Summary --- */
  const sum = addSheet(wb, 'Summary', { landscape: true });
  let r = titleBlock(sum, `Vantriq Pulse & Echo — ${who}`, context, 6);
  r = sectionTitle(sum, r, 'Vantriq Pulse — conversations and contacts');
  const m = (label, x, fmt = 'int', extra = {}) => ({
    label, cur: x.current, prev: x.previous, chg: x.delta_pct ?? null, full: x.previous_full ?? null, proj: x.projected ?? null, fmt, ...extra,
  });
  const pulseItems = [
    m('Conversations', k.conversations),
    m('New contacts (first time ever)', k.new_contacts),
    m('Returning contacts', k.returning_contacts),
    m('People who messaged (contacts)', k.contacts),
    m('Messages handled', k.messages),
    { label: 'Messages per conversation', cur: k.messages_per_conversation.current, prev: k.messages_per_conversation.previous, chg: k.messages_per_conversation.delta_pct, fmt: 'dec', good: null },
  ];
  if (k.containment) pulseItems.push({ label: 'Handled fully by AI (%)', cur: k.containment.current, prev: k.containment.previous, chg: k.containment.delta_pct, fmt: 'pct', chgFmt: 'signed' });
  r = kpiTable(sum, r, d, pulseItems);

  r = sectionTitle(sum, r, `${g.window} in total`);
  const wt = d.window_totals;
  r = table(sum, r, [
    { header: 'Figure', key: 'label', width: 34, fmt: 'text' },
    { header: 'Total', key: 'v', width: 20, fmt: 'int' },
    { header: 'Notes', key: 'note', width: 20, fmt: 'text' },
  ], [
    { label: 'Conversations', v: wt.conversations, note: '' },
    { label: 'Messages handled', v: wt.messages, note: wt.conversations ? `${Math.round((wt.messages / wt.conversations) * 10) / 10} per conversation` : '' },
    { label: 'People who messaged', v: wt.contacts, note: '' },
    { label: 'New contacts', v: wt.new_contacts, note: wt.contacts ? `${pctOf(wt.new_contacts, wt.contacts)}% of people` : '' },
    { label: 'Contacts who came back', v: contacts.filter((c) => c.returning).length, note: 'more than one conversation' },
  ]);

  // How loyal the people in the window are: all-time conversations each.
  r = sectionTitle(sum, r, 'How often people come back');
  const bands = [
    ['Once — never came back', (n) => n === 1],
    ['Twice', (n) => n === 2],
    ['3 to 5 times', (n) => n >= 3 && n <= 5],
    ['6 to 10 times', (n) => n >= 6 && n <= 10],
    ['More than 10 times', (n) => n > 10],
  ];
  r = table(sum, r, [
    { header: `People active in the ${window}, by conversations ever`, key: 'label', width: 34, fmt: 'text' },
    { header: 'People', key: 'n', width: 20, fmt: 'int', bar: true },
    { header: 'Share %', key: 'share', width: 20, fmt: 'pct' },
  ], bands.map(([label, f]) => {
    const n = contacts.filter((c) => f(c.conv_total)).length;
    return { label, n, share: pctOf(n, contacts.length) };
  }), { totals: { label: 'Everyone', n: 'sum' } });

  r = sectionTitle(sum, r, 'Who comes back most');
  const loyal = contacts.filter((c) => c.returning)
    .sort((a, z) => z.conv_total - a.conv_total || new Date(z.last_at) - new Date(a.last_at)).slice(0, 10);
  r = table(sum, r, [
    { header: 'Contact', key: 'contact', width: 34, fmt: 'text' },
    all ? { header: 'Customer', key: 'company', width: 20, fmt: 'text' } : { header: 'Name', key: 'name', width: 20, fmt: 'text' },
    { header: 'Conversations, all time', key: 'conv_total', width: 20, fmt: 'int', bar: true },
    { header: 'Last contact', key: 'last_at', width: 19, fmt: 'datetime' },
  ], loyal, { emptyText: `Nobody active in the ${window} has come back for a second conversation yet.` });

  if (d.quota) {
    r = sectionTitle(sum, r, 'This month against the package');
    r = table(sum, r, [
      { header: 'Figure', key: 'label', width: 34, fmt: 'text' },
      { header: 'Value', key: 'v', width: 20, fmt: 'int' },
    ], [
      { label: 'Conversations included in the package', v: d.quota.quota },
      { label: 'Used so far this month', v: d.quota.used },
      { label: 'Used (%)', v: d.quota.used_pct },
      { label: 'On pace for by month end', v: d.quota.projected_month_end },
    ]);
  }

  r = sectionTitle(sum, r, 'Vantriq Echo — customer satisfaction');
  const sk = s.kpis;
  r = kpiTable(sum, r, d, [
    { label: 'Satisfied (4–5 of 5), %', cur: sk.csat.current, prev: sk.csat.previous, chg: sk.csat.delta_pts, fmt: 'pct', chgFmt: 'signed' },
    { label: 'Average satisfaction (of 5)', cur: sk.csat.average, prev: null, chg: null, fmt: 'dec', good: null },
    { label: 'Satisfaction answers', cur: sk.csat.responses, prev: null, chg: null, good: null },
    { label: 'Net Promoter Score', cur: sk.nps.current, prev: sk.nps.previous, chg: sk.nps.delta_pts, fmt: 'int', chgFmt: 'signed' },
    { label: 'Promoters (9–10)', cur: sk.nps.promoters, prev: null, chg: null, good: null },
    { label: 'Passives (7–8)', cur: sk.nps.passives, prev: null, chg: null, good: null },
    { label: 'Detractors (0–6)', cur: sk.nps.detractors, prev: null, chg: null, good: null },
    { label: 'Problem resolved, %', cur: sk.resolution.current, prev: sk.resolution.previous, chg: sk.resolution.delta_pts, fmt: 'pct', chgFmt: 'signed' },
  ]);
  const sw = s.window;
  r = table(sum, r, [
    { header: `${g.window}`, key: 'label', width: 34, fmt: 'text' },
    { header: 'Value', key: 'v', width: 20, fmt: 'dec' },
  ], [
    { label: 'Satisfied, % of answers', v: sw.csat },
    { label: 'Average satisfaction (of 5)', v: sw.csat_average },
    { label: 'Satisfaction answers', v: sw.csat_responses },
    { label: 'Net Promoter Score', v: sw.nps },
    { label: 'NPS answers', v: sw.nps_responses },
    { label: 'Problem resolved, %', v: sw.resolution },
    ...(echoOn ? [
      { label: 'Echo surveys', v: echo.surveys.length },
      { label: 'Follow-ups still open', v: echo.followups.filter((f) => f.status !== 'Resolved').length },
    ] : []),
  ]);
  if (!echoOn) {
    r = notesList(sum, r, [{ tone: 'info', text: 'Vantriq Echo — your own customer-satisfaction surveys by QR code, link or WhatsApp, with follow-ups for unhappy answers — is not switched on for this account. Ask VantriqAI to switch it on.' }]);
  }

  r = sectionTitle(sum, r, 'What stands out');
  r = notesList(sum, r, d.insights.length ? d.insights : ['Not enough activity yet to say anything with confidence.']);

  r = sectionTitle(sum, r, 'In this workbook');
  const tabs = [
    ['Trend', `Every figure for each ${grain} of the ${window}`],
    ...(all ? [['Customers', 'Each customer side by side']] : []),
    ['Contacts', 'Everyone who messaged in the period, with their whole history'],
    ['New contacts', 'People whose first ever conversation was in the period'],
    ['Returning contacts', 'People who came back — more than one conversation'],
    ['Conversations', 'Every conversation: when, who, which channel and agent, how long'],
    ['Channels', 'Where conversations came in'],
    ['Agents', 'Which agent handled them'],
    ['Busiest times', 'Conversations by day of the week and hour'],
    ...(echoOn ? [
      ['Echo summary', 'Satisfaction scores, NPS and every survey\'s results'],
      ['Echo responses', 'Every survey answer, question by question'],
    ] : [['Satisfaction', 'Satisfaction scores and NPS']]),
    ['All answers', 'Every satisfaction answer, from surveys and anything else that sends them'],
    ...(echoOn ? [['Follow-ups', 'Unhappy customers: who, what they said, and where each follow-up stands']] : []),
    ['Comments', 'Everything customers wrote'],
    ['Definitions', 'How each figure is worked out'],
  ];
  r = table(sum, r, [{ header: 'Tab', key: 't', width: 34, fmt: 'text' }, { header: 'What it holds', key: 'w', fmt: 'text' }],
    tabs.map(([t, w]) => ({ t, w })), { spanTo: 6 });
  sum.getColumn(1).width = 36;

  /* --- Trend --- */
  const tr = addSheet(wb, 'Trend', { freeze: 4, landscape: true });
  let tRow = titleBlock(tr, `Trend — ${who}`, `Each ${grain} of the ${window}. The last row is the ${grain} still under way.`, 13);
  const satSeries = s.series || [];
  tRow = table(tr, tRow, [
    { header: 'Period', key: 'p', width: 22, fmt: 'text' },
    { header: 'Conversations', key: 'conv', width: 14, fmt: 'int', bar: true },
    { header: 'Messages', key: 'msgs', width: 12, fmt: 'int' },
    { header: 'Messages per conversation', key: 'mpc', width: 14, fmt: 'dec' },
    { header: 'People who messaged', key: 'contacts', width: 14, fmt: 'int' },
    { header: 'New contacts', key: 'newc', width: 12, fmt: 'int', bar: true },
    { header: 'Returning contacts', key: 'ret', width: 12, fmt: 'int' },
    { header: 'New, % of people', key: 'newpct', width: 12, fmt: 'pct' },
    { header: 'Satisfaction answers', key: 'ans', width: 13, fmt: 'int' },
    { header: 'Satisfied %', key: 'csat', width: 11, fmt: 'pct' },
    { header: 'Average (of 5)', key: 'avg', width: 11, fmt: 'dec' },
    { header: 'NPS answers', key: 'npsn', width: 11, fmt: 'int' },
    { header: 'NPS', key: 'nps', width: 9, fmt: 'int' },
  ], d.series.map((x, i) => {
    const y = satSeries[i] || {};
    return {
      p: periodLabel(x.bucket, grain), conv: x.conversations, msgs: x.messages,
      mpc: x.conversations ? Math.round((x.messages / x.conversations) * 10) / 10 : null,
      contacts: x.contacts, newc: x.new_contacts, ret: x.returning_contacts,
      newpct: pctOf(x.new_contacts, x.contacts), ans: y.responses || 0, csat: y.csat, avg: y.csat_average,
      npsn: y.nps_responses || 0, nps: y.nps,
    };
  }), { totals: { label: `${g.window}`, conv: 'sum', msgs: 'sum', newc: 'sum', ans: 'sum', npsn: 'sum' } });

  /* --- Customers (every customer only) --- */
  if (customers) {
    const cu = addSheet(wb, 'Customers', { freeze: 4, landscape: true });
    let cRow = titleBlock(cu, 'Customers side by side', `Over the ${window}; "${d.period.current_label}" is the period under way.`, 14);
    table(cu, cRow, [
      { header: 'Customer', key: 'company', width: 30, fmt: 'text' },
      { header: 'Stage', key: 'stage', width: 12, fmt: 'center' },
      { header: 'Conversations', key: 'conversations', width: 14, fmt: 'int', bar: true },
      { header: d.period.current_label, key: 'conversations_current', width: 13, fmt: 'int' },
      { header: 'Messages', key: 'messages', width: 11, fmt: 'int' },
      { header: 'Per conversation', key: 'per_conv', width: 12, fmt: 'dec' },
      { header: 'People', key: 'contacts', width: 10, fmt: 'int' },
      { header: 'New', key: 'new_contacts', width: 9, fmt: 'int' },
      { header: 'Returning', key: 'returning', width: 10, fmt: 'int' },
      { header: 'Last activity', key: 'last_at', width: 19, fmt: 'datetime' },
      { header: 'Echo', key: 'echo', width: 8, fmt: 'center' },
      { header: 'Satisfaction answers', key: 'answers', width: 13, fmt: 'int' },
      { header: 'Satisfied %', key: 'csat', width: 11, fmt: 'pct' },
      { header: 'NPS', key: 'nps', width: 8, fmt: 'int' },
    ], customers, { filter: true, totals: { label: 'All customers', conversations: 'sum', conversations_current: 'sum', messages: 'sum', contacts: 'sum', new_contacts: 'sum', returning: 'sum', answers: 'sum' } });
  }

  /* --- Contacts, new, returning --- */
  const contactCols = (extra = []) => [
    { header: 'Contact', key: 'contact', width: 18, fmt: 'text' },
    { header: 'Name', key: 'name', width: 20, fmt: 'text' },
    ...withCo,
    { header: 'Status', key: 'status', width: 16, fmt: 'center' },
    { header: 'First contact', key: 'first_at', width: 19, fmt: 'datetime' },
    { header: 'Last contact', key: 'last_at', width: 19, fmt: 'datetime' },
    ...extra,
    { header: `Conversations (${window})`, key: 'conv_window', width: 14, fmt: 'int', bar: true },
    { header: `${d.period.current_label}`, key: 'conv_current', width: 11, fmt: 'int' },
    { header: 'Conversations, all time', key: 'conv_total', width: 13, fmt: 'int' },
    { header: `Messages (${window})`, key: 'msgs_window', width: 12, fmt: 'int' },
    { header: 'Days active', key: 'active_days', width: 9, fmt: 'int' },
    { header: 'Days since last contact', key: 'since_last', width: 12, fmt: 'int' },
    { header: 'Channels', key: 'channels', width: 14, fmt: 'text' },
    { header: 'Agent', key: 'agents', width: 24, fmt: 'text' },
    { header: 'Satisfaction answers', key: 'answers', width: 12, fmt: 'int' },
    { header: 'Last score (1–5)', key: 'last_score', width: 10, fmt: 'int' },
    { header: 'Last NPS (0–10)', key: 'last_nps', width: 10, fmt: 'int' },
    { header: 'Email', key: 'email', width: 22, fmt: 'text' },
    { header: 'In the CRM as', key: 'in_crm', width: 22, fmt: 'text' },
  ];
  const ct = addSheet(wb, 'Contacts', { freeze: 4, landscape: true });
  table(ct, titleBlock(ct, `Contacts — ${who}`, `Everyone who had a conversation in the ${window}: ${contacts.length} ${contacts.length === 1 ? 'person' : 'people'}, ${contacts.filter((c) => c.new_window).length} of them new and ${contacts.filter((c) => c.returning).length} who came back. Newest activity first. WhatsApp contacts are shown by the number they wrote from.`, 12),
    contactCols(), contacts, { filter: true, emptyText: `Nobody messaged in the ${window}.` });

  const fresh = contacts.filter((c) => c.new_window).sort((a, z) => new Date(z.first_raw) - new Date(a.first_raw));
  const nw = addSheet(wb, 'New contacts', { freeze: 4, landscape: true, tab: 'FF1F7A4D' });
  table(nw, titleBlock(nw, `New contacts — ${who}`, `${fresh.length} ${fresh.length === 1 ? 'person' : 'people'} got in touch for the first time ever in the ${window}; ${contacts.filter((c) => c.new_current).length} of them ${d.period.current_label.toLowerCase()}. First contact newest first.`, 12),
    contactCols([{ header: 'First seen in', key: 'first_period', width: 16, fmt: 'center' }]),
    fresh.map((c) => ({ ...c, first_period: periodLabel(bucketOf(c.first_at, grain), grain) })), { filter: true, emptyText: `No new contacts in the ${window}.` });

  const back = contacts.filter((c) => c.returning).sort((a, z) => z.conv_total - a.conv_total);
  const rt = addSheet(wb, 'Returning contacts', { freeze: 4, landscape: true, tab: 'FFB36B00' });
  table(rt, titleBlock(rt, `Returning contacts — ${who}`, `${back.length} ${back.length === 1 ? 'person' : 'people'} active in the ${window} came back for more than one conversation. Most frequent first.`, 12),
    contactCols([
      { header: 'Times they came back', key: 'comebacks', width: 12, fmt: 'int', bar: true },
      { header: 'Days from first to last', key: 'span_days', width: 12, fmt: 'dec' },
      { header: 'Average days between visits', key: 'avg_gap', width: 13, fmt: 'dec' },
    ]), back, { filter: true, emptyText: `Nobody came back for a second conversation in the ${window} yet.` });

  /* --- Conversations --- */
  const cv = addSheet(wb, 'Conversations', { freeze: 4, landscape: true });
  table(cv, titleBlock(cv, `Conversations — ${who}`, `Every conversation that started in the ${window}, newest first. A WhatsApp conversation is one customer's 24-hour window.`, 12), [
    { header: 'Started', key: 'started', width: 19, fmt: 'datetime' },
    { header: 'Last reply', key: 'ended', width: 19, fmt: 'datetime' },
    { header: 'Minutes', key: 'minutes', width: 9, fmt: 'int' },
    { header: 'Contact', key: 'contact', width: 18, fmt: 'text' },
    ...withCo,
    { header: 'Their visit', key: 'first_time', width: 14, fmt: 'center' },
    { header: 'Channel', key: 'channel', width: 12, fmt: 'center' },
    { header: 'Agent', key: 'agent', width: 24, fmt: 'text' },
    { header: 'Messages', key: 'messages', width: 10, fmt: 'int', bar: true },
    { header: 'Replies sent', key: 'replies', width: 10, fmt: 'int' },
    { header: 'Handed to a person', key: 'handoff', width: 11, fmt: 'center' },
  ], conversations, { filter: true, emptyText: `No conversations in the ${window}.` });

  /* --- Channels, agents --- */
  const chByContacts = new Map();
  for (const c of contacts) for (const ch of c.channels.split(', ')) chByContacts.set(ch, (chByContacts.get(ch) || 0) + 1);
  const ch = addSheet(wb, 'Channels');
  table(ch, titleBlock(ch, `Channels — ${who}`, `Where conversations came in over the ${window}.`, 6), [
    { header: 'Channel', key: 'name', width: 20, fmt: 'text' },
    { header: 'Conversations', key: 'conversations', width: 14, fmt: 'int', bar: true },
    { header: 'Share %', key: 'share', width: 10, fmt: 'pct' },
    { header: 'Messages', key: 'messages', width: 12, fmt: 'int' },
    { header: 'Per conversation', key: 'per', width: 12, fmt: 'dec' },
    { header: 'People', key: 'people', width: 10, fmt: 'int' },
  ], d.channels.map((x) => ({
    name: CHANNEL[x.channel] || x.channel, conversations: x.conversations, share: x.share_pct, messages: x.messages,
    per: x.conversations ? Math.round((x.messages / x.conversations) * 10) / 10 : null, people: chByContacts.get(CHANNEL[x.channel] || x.channel) || null,
  })), { totals: { label: 'All channels', conversations: 'sum', messages: 'sum' } });

  const ag = addSheet(wb, 'Agents');
  table(ag, titleBlock(ag, `Agents — ${who}`, `Which agent handled the conversations over the ${window}${all ? ' (the twelve busiest)' : ''}.`, 6), [
    { header: 'Agent', key: 'name', width: 36, fmt: 'text' },
    { header: 'Type', key: 'kind', width: 12, fmt: 'center' },
    { header: 'Conversations', key: 'conversations', width: 14, fmt: 'int', bar: true },
    { header: 'Share %', key: 'share', width: 10, fmt: 'pct' },
    { header: 'Messages', key: 'messages', width: 12, fmt: 'int' },
    { header: 'Per conversation', key: 'per', width: 12, fmt: 'dec' },
  ], d.agents.map((a) => ({
    name: a.name, kind: a.kind ? cap(a.kind) : '', conversations: a.conversations, share: a.share_pct, messages: a.messages,
    per: a.conversations ? Math.round((a.messages / a.conversations) * 10) / 10 : null,
  })));

  /* --- Busiest times --- */
  const hm = addSheet(wb, 'Busiest times', { landscape: true });
  let hRow = titleBlock(hm, `Busiest times — ${who}`, `Conversations started, by day of the week and hour (${TZ.replace('Asia/', '')} time), over the ${window}. Darker is busier.`, 26);
  const heat = d.heatmap;
  const hdr = hm.getRow(hRow);
  hdr.getCell(1).value = 'Day';
  HOURS.forEach((h, i) => { hdr.getCell(i + 2).value = h; });
  hdr.getCell(26).value = 'Total';
  hdr.eachCell((c) => { c.font = { bold: true, color: { argb: C.white }, size: 9 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brand } }; c.alignment = { horizontal: 'center' }; });
  const gridTop = hRow + 1;
  DAYS.forEach((day, di) => {
    const row = hm.getRow(gridTop + di);
    row.getCell(1).value = day;
    row.getCell(1).font = { bold: true };
    heat[di].forEach((v, h) => { row.getCell(h + 2).value = v; row.getCell(h + 2).alignment = { horizontal: 'center' }; });
    row.getCell(26).value = heat[di].reduce((a, v) => a + v, 0);
    row.getCell(26).font = { bold: true };
    row.getCell(26).alignment = { horizontal: 'center' };
  });
  const totRow = hm.getRow(gridTop + 7);
  totRow.getCell(1).value = 'Total';
  for (let h = 0; h < 24; h++) totRow.getCell(h + 2).value = heat.reduce((a, row) => a + row[h], 0);
  totRow.getCell(26).value = heat.reduce((a, row) => a + row.reduce((x, v) => x + v, 0), 0);
  totRow.eachCell((c) => { c.font = { bold: true }; c.alignment = { horizontal: 'center' }; c.border = { top: { style: 'thin' } }; });
  hm.getColumn(1).width = 13;
  for (let i = 2; i <= 25; i++) hm.getColumn(i).width = 5.2;
  hm.getColumn(26).width = 8;
  hm.addConditionalFormatting({
    ref: `B${gridTop}:Y${gridTop + 6}`,
    rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF2F56D9' }] }],
  });

  /* --- Echo --- */
  const es = addSheet(wb, echoOn ? 'Echo summary' : 'Satisfaction', { tab: 'FF7A3FB0', landscape: true });
  let eRow = titleBlock(es, echoOn ? `Vantriq Echo — ${who}` : `Customer satisfaction — ${who}`,
    `Customer satisfaction over the ${window}: how people scored${echoOn ? ', and every survey\'s results' : ''}.`, 16);
  eRow = sectionTitle(es, eRow, 'How people scored their experience (1–5)', 4);
  const distTotal = s.distribution.reduce((a, x) => a + x.n, 0);
  eRow = table(es, eRow, [
    { header: 'Score', key: 'label', width: 26, fmt: 'text' },
    { header: 'Answers', key: 'n', width: 12, fmt: 'int', bar: true },
    { header: 'Share %', key: 'share', width: 10, fmt: 'pct' },
  ], [5, 4, 3, 2, 1].map((sc) => {
    const x = s.distribution[sc - 1];
    return { label: `${sc} — ${SCORE_LABEL[sc]}`, n: x.n, share: pctOf(x.n, distTotal) };
  }), { totals: { label: 'All scores', n: 'sum' } });
  eRow = sectionTitle(es, eRow, 'Would they recommend you? (NPS)', 4);
  const npsTotal = sw.nps_responses || 0;
  eRow = table(es, eRow, [
    { header: 'Group', key: 'label', width: 26, fmt: 'text' },
    { header: 'Answers', key: 'n', width: 12, fmt: 'int', bar: true },
    { header: 'Share %', key: 'share', width: 10, fmt: 'pct' },
  ], [
    { label: 'Promoters (9–10)', n: sw.promoters || 0, share: pctOf(sw.promoters || 0, npsTotal) },
    { label: 'Passives (7–8)', n: sw.passives || 0, share: pctOf(sw.passives || 0, npsTotal) },
    { label: 'Detractors (0–6)', n: sw.detractors || 0, share: pctOf(sw.detractors || 0, npsTotal) },
    { label: 'Net Promoter Score', n: sw.nps, share: null },
  ]);
  if (echoOn) {
    eRow = sectionTitle(es, eRow, 'Every survey', 16);
    table(es, eRow, [
      { header: 'Survey', key: 'title', width: 30, fmt: 'text' },
      ...withCo,
      { header: 'Status', key: 'status', width: 14, fmt: 'center' },
      { header: `Answers (${window})`, key: 'responses', width: 12, fmt: 'int', bar: true },
      { header: 'Answers, all time', key: 'responses_all', width: 11, fmt: 'int' },
      { header: 'Satisfied %', key: 'csat', width: 10, fmt: 'pct' },
      { header: 'Average (of 5)', key: 'csat_avg', width: 10, fmt: 'dec' },
      { header: 'NPS', key: 'nps', width: 8, fmt: 'int' },
      { header: 'Resolved %', key: 'resolution', width: 10, fmt: 'pct' },
      { header: 'Invites sent', key: 'inv_sent', width: 10, fmt: 'int' },
      { header: 'Opened', key: 'inv_opened', width: 9, fmt: 'int' },
      { header: 'Answered', key: 'inv_answered', width: 10, fmt: 'int' },
      { header: 'Response rate %', key: 'rate', width: 11, fmt: 'pct' },
      { header: 'Open follow-ups', key: 'followups', width: 11, fmt: 'int' },
      { header: 'Last answer', key: 'last_at', width: 19, fmt: 'datetime' },
      { header: 'Address', key: 'address', width: 26, fmt: 'text' },
    ], echo.surveys, { emptyText: 'No Echo surveys yet.' });

    const er = addSheet(wb, 'Echo responses', { tab: 'FF7A3FB0', freeze: 4, landscape: true });
    table(er, titleBlock(er, `Echo responses — ${who}`, `Every survey answer in the ${window}, newest first. "Answers" spells out every question; contact details are only what the customer chose to give.`, 14), [
      { header: 'Submitted', key: 'submitted', width: 19, fmt: 'datetime' },
      { header: 'Survey', key: 'survey', width: 24, fmt: 'text' },
      ...withCo,
      { header: 'Location', key: 'location', width: 14, fmt: 'text' },
      { header: 'Channel', key: 'channel', width: 11, fmt: 'center' },
      { header: 'Language', key: 'language', width: 10, fmt: 'center' },
      { header: 'Satisfaction (1–5)', key: 'score', width: 11, fmt: 'int' },
      { header: 'NPS (0–10)', key: 'nps', width: 9, fmt: 'int' },
      { header: 'Effort (1–7)', key: 'ces', width: 9, fmt: 'int' },
      { header: 'Resolved', key: 'resolved', width: 9, fmt: 'center' },
      { header: 'Comment', key: 'comment', width: 40, fmt: 'text', wrap: true },
      { header: 'Name', key: 'contact_name', width: 18, fmt: 'text' },
      { header: 'Phone', key: 'contact_phone', width: 16, fmt: 'text' },
      { header: 'Email', key: 'contact_email', width: 22, fmt: 'text' },
      { header: 'Happy to be contacted', key: 'consent', width: 11, fmt: 'center' },
      { header: 'Follow-up', key: 'followup', width: 11, fmt: 'center' },
      { header: 'Follow-up note', key: 'note', width: 26, fmt: 'text', wrap: true },
      { header: 'Seconds to answer', key: 'seconds', width: 10, fmt: 'int' },
      { header: 'Answers', key: 'answers', width: 80, fmt: 'text', wrap: true },
    ], echo.responses, { filter: true, emptyText: `No survey answers in the ${window}.` });
  }

  const aa = addSheet(wb, 'All answers', { tab: 'FF7A3FB0', freeze: 4 });
  table(aa, titleBlock(aa, `Every satisfaction answer — ${who}`, `What the satisfaction figures are counted from: Echo surveys, and any other tool that posts answers to the CRM, in the ${window}.`, 9), [
    { header: 'Answered', key: 'answered', width: 19, fmt: 'datetime' },
    { header: 'From', key: 'source', width: 30, fmt: 'text' },
    ...withCo,
    { header: 'Contact', key: 'contact', width: 17, fmt: 'text' },
    { header: 'Channel', key: 'channel', width: 11, fmt: 'center' },
    { header: 'Satisfaction (1–5)', key: 'score', width: 11, fmt: 'int' },
    { header: 'NPS (0–10)', key: 'nps', width: 9, fmt: 'int' },
    { header: 'Resolved', key: 'resolved', width: 9, fmt: 'center' },
    { header: 'Comment', key: 'comment', width: 50, fmt: 'text', wrap: true },
  ], echo.answers, { filter: true, emptyText: `No satisfaction answers in the ${window}.` });

  if (echoOn) {
    const fu = addSheet(wb, 'Follow-ups', { tab: 'FFB3261E', freeze: 4, landscape: true });
    table(fu, titleBlock(fu, `Follow-ups — ${who}`, 'Every unhappy answer (satisfaction 1–2, NPS 0–6 or "not resolved"): open ones first, then contacted, then resolved.', 12), [
      { header: 'Submitted', key: 'submitted', width: 19, fmt: 'datetime' },
      { header: 'Status', key: 'status', width: 11, fmt: 'center' },
      { header: 'Days waiting', key: 'waiting', width: 9, fmt: 'int' },
      { header: 'Survey', key: 'survey', width: 22, fmt: 'text' },
      ...withCo,
      { header: 'Satisfaction', key: 'score', width: 10, fmt: 'int' },
      { header: 'NPS', key: 'nps', width: 7, fmt: 'int' },
      { header: 'Resolved', key: 'resolved', width: 9, fmt: 'center' },
      { header: 'What they said', key: 'comment', width: 40, fmt: 'text', wrap: true },
      { header: 'Contact', key: 'contact', width: 28, fmt: 'text' },
      { header: 'Note', key: 'note', width: 30, fmt: 'text', wrap: true },
      { header: 'By', key: 'by', width: 18, fmt: 'text' },
      { header: 'Updated', key: 'updated', width: 19, fmt: 'datetime' },
    ], echo.followups, { filter: true, emptyText: 'No unhappy answers — nothing to follow up.' });
  }

  const cm = addSheet(wb, 'Comments', { tab: 'FF7A3FB0', freeze: 4 });
  table(cm, titleBlock(cm, `What customers wrote — ${who}`, `Every comment left with a satisfaction answer in the ${window}, newest first.`, 7), [
    { header: 'When', key: 'answered', width: 19, fmt: 'datetime' },
    { header: 'Comment', key: 'comment', width: 70, fmt: 'text', wrap: true },
    { header: 'Satisfaction', key: 'score', width: 10, fmt: 'int' },
    { header: 'NPS', key: 'nps', width: 7, fmt: 'int' },
    { header: 'Resolved', key: 'resolved', width: 9, fmt: 'center' },
    ...withCo,
    { header: 'From', key: 'source', width: 28, fmt: 'text' },
  ], echo.answers.filter((a) => a.comment), { emptyText: `No comments in the ${window}.` });

  definitions(wb, grain);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `vantriq-pulse-echo-${all ? 'all-customers' : safeName(client.company)}-${grain}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

function bucketOf(localDate, grain) {
  if (!localDate) return '';
  const y = localDate.getUTCFullYear();
  const m = localDate.getUTCMonth();
  const d = localDate.getUTCDate();
  const pad = (n) => String(n).padStart(2, '0');
  if (grain === 'year') return `${y}-01-01`;
  if (grain === 'quarter') return `${y}-${pad(Math.floor(m / 3) * 3 + 1)}-01`;
  if (grain === 'month') return `${y}-${pad(m + 1)}-01`;
  if (grain === 'week') {
    const dt = new Date(Date.UTC(y, m, d));
    const back = (dt.getUTCDay() + 6) % 7;
    dt.setUTCDate(dt.getUTCDate() - back);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
  }
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function definitions(wb, grain) {
  const df = addSheet(wb, 'Definitions', { tab: 'FF6B645B' });
  const r = titleBlock(df, 'How the figures are worked out', 'The same rules as the Vantriq Pulse and Echo dashboards, so the workbook and the screen always agree.', 2);
  table(df, r, [
    { header: 'Figure', key: 'f', width: 32, fmt: 'text' },
    { header: 'Meaning', key: 'm', width: 100, fmt: 'text', wrap: true },
  ], [
    { f: 'Conversation', m: 'One customer\'s conversation with an agent. On WhatsApp it is that customer\'s 24-hour window, however many messages it holds.' },
    { f: 'Contact / person', m: 'Someone who messaged — on WhatsApp, the number they wrote from. The same number on another day is the same person.' },
    { f: 'New contact', m: 'Their very first conversation ever falls in the period. The dashboard\'s "New contacts (leads)".' },
    { f: 'Returning contact', m: 'On the dashboard and the Trend tab: active in a period, first seen before it. In the Contacts tabs, "Returning" is someone first seen before the whole window, and "New, came back" someone first seen in it who has since had another conversation; the Returning contacts tab lists both — everyone who came back.' },
    { f: 'Messages handled', m: 'Messages the agent answered, as each agent reports them.' },
    { f: `Period, "same point"`, m: `Figures are calendar ${grain}s in ${TZ.replace('Asia/', '')} time. The period under way is compared with the previous one only up to the same point, never a part period against a whole one.` },
    { f: 'On pace for', m: 'Where the period under way ends at its current pace — shown once a tenth of it has passed.' },
    { f: 'Handled fully by AI', m: 'Conversations the agent finished without passing to a person, for agents that report hand-offs.' },
    { f: 'Satisfied %', m: 'Share of satisfaction answers that were 4 or 5 out of 5 (the usual CSAT). The average score is alongside, since 4.1 and 4.6 both count as satisfied.' },
    { f: 'Net Promoter Score', m: 'Of people who answered "would you recommend us" (0–10): % promoters (9–10) minus % detractors (0–6). From −100 to +100.' },
    { f: 'Resolved %', m: 'Share of "was your problem sorted?" answers that were yes.' },
    { f: 'Response rate', m: 'Personal survey links answered ÷ links sent (after-chat WhatsApp invites and one-time links).' },
    { f: 'Follow-up', m: 'Opened automatically for an unhappy answer (satisfaction 1–2, NPS 0–6, or not resolved) and worked through to resolved.' },
  ]);
}

/* ------------------------------------------------------------------ */
/* VantriqAI's own sales (CRM → Pulse → Sales)                          */
/* ------------------------------------------------------------------ */

async function salesReport({ grain } = {}) {
  grain = normaliseGrain(grain);
  const d = await salesAnalytics({ grain });
  const b = await periodBounds(grain);
  const g = GRAINS[grain];
  const window = g.window.toLowerCase();
  const { rows: leads } = await db.query(
    `select c.*, r.name as rep_name,
            (select min(h.created_at) from client_stage_history h where h.client_id = c.id and h.to_stage = 'active' and h.from_stage is not null) as won_at,
            (select min(h.created_at) from client_stage_history h where h.client_id = c.id and h.to_stage = 'lost') as lost_at,
            (select h.to_stage from client_stage_history h where h.client_id = c.id and h.from_stage is null order by h.created_at limit 1) as created_as
       from clients c left join sales_reps r on r.id = c.owner_rep_id
      where c.is_internal = false
        and (c.created_at >= $1 or c.stage in ('lead','contacted','proposal','negotiation'))
      order by c.created_at desc`,
    [b.window_start]
  );
  // A conversation is what the dashboard counts: one session id, or one
  // prospect's messages on one (UTC) day when the agent sent none.
  const { rows: prospects } = await db.query(
    `with m as (
       select m.*, coalesce(nullif(m.session_id, ''), m.external_ref || ':' || to_char(m.created_at at time zone 'UTC', 'YYYY-MM-DD')) as sess
         from conversation_messages m where m.created_at >= $1
     ),
     g as (
       select sess, min(created_at) as started, max(created_at) as ended,
              min(external_ref) as external_ref, min(channel) as channel,
              (array_agg(client_id) filter (where client_id is not null))[1] as client_id,
              count(*) filter (where role = 'customer')::int as from_them,
              count(*) filter (where role = 'agent')::int as from_agent,
              (array_agg(content order by created_at) filter (where role = 'customer'))[1] as first_message
         from m group by sess
     )
     select g.*, c.company, c.name, c.stage
       from g left join clients c
         on c.id = g.client_id or (g.client_id is null and g.external_ref <> '' and c.external_ref = g.external_ref)
      order by g.started desc limit ${ROW_LIMIT}`,
    [b.window_start]
  );
  const wb = newBook();
  const k = d.kpis;
  const sum = addSheet(wb, 'Summary', { landscape: true });
  let r = titleBlock(sum, 'Vantriq Pulse — VantriqAI sales', `${g.window} by ${grain} · ${d.period.current_label} is ${d.period.elapsed_pct}% through, compared with ${d.period.previous_label} up to the same point · generated ${new Date().toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' })}`, 6);
  r = sectionTitle(sum, r, 'Key figures');
  r = kpiTable(sum, r, { period: { ...d.period, previous_label: d.period.previous_label } }, [
    { label: 'New leads', cur: k.new_leads.current, prev: k.new_leads.previous, chg: k.new_leads.delta_pct, full: k.new_leads.previous_full, proj: k.new_leads.projected },
    { label: 'Won', cur: k.won.current, prev: k.won.previous, chg: k.won.delta_pct, full: k.won.previous_full, proj: k.won.projected },
    { label: 'Lost', cur: k.lost.current, prev: k.lost.previous, chg: k.lost.delta_pct, full: k.lost.previous_full, good: false },
    { label: 'Prospect conversations (our sales agent)', cur: k.prospect_conversations.current, prev: k.prospect_conversations.previous, chg: k.prospect_conversations.delta_pct, full: k.prospect_conversations.previous_full, proj: k.prospect_conversations.projected },
  ]);
  r = table(sum, r, [{ header: g.window, key: 'l', width: 36, fmt: 'text' }, { header: 'Value', key: 'v', width: 20, fmt: 'dec' }], [
    { l: 'Win rate (won ÷ won + lost), %', v: k.win_rate },
    { l: 'Average days from lead to customer', v: k.avg_days_to_win },
    { l: 'Open deals now', v: k.open_deals },
    { l: 'Their estimated value', v: k.open_value },
  ]);
  r = sectionTitle(sum, r, 'What stands out');
  notesList(sum, r, d.insights.length ? d.insights : ['Not enough activity yet to say anything with confidence.']);
  sum.getColumn(1).width = 40;

  const tr = addSheet(wb, 'Trend', { freeze: 4 });
  table(tr, titleBlock(tr, 'Sales trend', `Each ${grain} of the ${window}; the last row is still under way.`, 5), [
    { header: 'Period', key: 'p', width: 22, fmt: 'text' },
    { header: 'New leads', key: 'new_leads', width: 12, fmt: 'int', bar: true },
    { header: 'Won', key: 'won', width: 10, fmt: 'int' },
    { header: 'Lost', key: 'lost', width: 10, fmt: 'int' },
    { header: 'Prospect conversations', key: 'pc', width: 14, fmt: 'int' },
  ], d.series.map((x, i) => ({ p: periodLabel(x.bucket, grain), new_leads: x.new_leads, won: x.won, lost: x.lost, pc: (d.prospect_series[i] || {}).conversations || 0 })),
  { totals: { label: g.window, new_leads: 'sum', won: 'sum', lost: 'sum', pc: 'sum' } });

  const ld = addSheet(wb, 'Leads', { freeze: 4, landscape: true });
  table(ld, titleBlock(ld, 'Leads', `Every lead that came in over the ${window}, and every deal still open. Newest first.`, 13), [
    { header: 'Company', key: 'company', width: 26, fmt: 'text' },
    { header: 'Contact', key: 'name', width: 20, fmt: 'text' },
    { header: 'Phone', key: 'phone', width: 16, fmt: 'text' },
    { header: 'Email', key: 'email', width: 24, fmt: 'text' },
    { header: 'Source', key: 'source', width: 14, fmt: 'text' },
    { header: 'Owner', key: 'owner', width: 14, fmt: 'text' },
    { header: 'Stage now', key: 'stage', width: 14, fmt: 'center' },
    { header: 'Came in', key: 'created', width: 19, fmt: 'datetime' },
    { header: 'Won on', key: 'won', width: 13, fmt: 'date' },
    { header: 'Lost on', key: 'lost', width: 13, fmt: 'date' },
    { header: 'Days to win', key: 'days', width: 10, fmt: 'dec' },
    { header: 'Days since it came in', key: 'age', width: 11, fmt: 'int' },
    { header: 'Estimated value', key: 'value', width: 14, fmt: 'money' },
  ], leads.filter((c) => c.created_as !== 'active').map((c) => ({
    company: c.company, name: c.name && c.name !== '—' ? c.name : '', phone: c.phone || '', email: c.email || '',
    source: c.source || '', owner: c.rep_name || 'House', stage: STAGE[c.stage] || c.stage, created: local(c.created_at),
    won: local(c.won_at), lost: local(c.lost_at), days: c.won_at ? days(c.created_at, c.won_at) : null,
    age: Math.floor((Date.now() - new Date(c.created_at)) / 86400000), value: Number(c.est_value || 0) || null,
  })), { filter: true });

  const fn = addSheet(wb, 'Funnel & sources');
  let fRow = titleBlock(fn, 'Funnel, sources and owners', `Leads that came in over the ${window}.`, 4);
  const top = d.funnel[0] ? d.funnel[0].n : 0;
  fRow = sectionTitle(fn, fRow, 'How far leads got', 3);
  fRow = table(fn, fRow, [
    { header: 'Stage reached', key: 'stage', width: 26, fmt: 'text' },
    { header: 'Leads', key: 'n', width: 10, fmt: 'int', bar: true },
    { header: '% of leads', key: 'share', width: 11, fmt: 'pct' },
  ], d.funnel.map((f) => ({ stage: STAGE[f.stage] || f.stage, n: f.n, share: pctOf(f.n, top) })));
  fRow = sectionTitle(fn, fRow, 'Where leads came from', 4);
  fRow = table(fn, fRow, [
    { header: 'Source', key: 'name', width: 26, fmt: 'text' },
    { header: 'Leads', key: 'n', width: 10, fmt: 'int', bar: true },
    { header: 'Became customers', key: 'won', width: 12, fmt: 'int' },
    { header: 'Conversion %', key: 'conv', width: 12, fmt: 'pct' },
  ], d.sources.map((s) => ({ ...s, conv: s.won != null ? pctOf(s.won, s.n) : null })));
  fRow = sectionTitle(fn, fRow, 'Leads by owner', 2);
  table(fn, fRow, [{ header: 'Owner', key: 'name', width: 26, fmt: 'text' }, { header: 'Leads', key: 'n', width: 10, fmt: 'int', bar: true }], d.reps);

  const tp = addSheet(wb, 'What prospects ask');
  table(tp, titleBlock(tp, 'What prospects ask our sales agent', 'Conversations mentioning each topic — keyword-matched in English and Roman Urdu.', 2), [
    { header: 'Topic', key: 'label', width: 30, fmt: 'text' },
    { header: 'Conversations', key: 'conversations', width: 14, fmt: 'int', bar: true },
  ], d.topics);

  const pc = addSheet(wb, 'Prospect conversations', { freeze: 4, landscape: true });
  table(pc, titleBlock(pc, 'Prospect conversations', `Our sales agent's conversations over the ${window}, newest first.`, 9), [
    { header: 'Started', key: 'started', width: 19, fmt: 'datetime' },
    { header: 'Last message', key: 'ended', width: 19, fmt: 'datetime' },
    { header: 'Prospect', key: 'who', width: 18, fmt: 'text' },
    { header: 'Name', key: 'name', width: 18, fmt: 'text' },
    { header: 'In the CRM as', key: 'crm', width: 22, fmt: 'text' },
    { header: 'Channel', key: 'channel', width: 11, fmt: 'center' },
    { header: 'Their messages', key: 'from_them', width: 11, fmt: 'int' },
    { header: 'Agent replies', key: 'from_agent', width: 11, fmt: 'int' },
    { header: 'First thing they asked', key: 'first', width: 70, fmt: 'text', wrap: true },
  ], prospects.map((p) => ({
    started: local(p.started), ended: local(p.ended),
    who: /^wa-\d+$/.test(p.external_ref || '') ? `+${p.external_ref.slice(3)}`
      : (p.sess && !String(p.sess).includes(':') ? contactLabel(contactKey(p.sess)) : (p.external_ref || 'Unknown')),
    name: p.name && p.name !== '—' ? p.name : '',
    crm: p.company ? `${p.company} · ${STAGE[p.stage] || p.stage}` : '',
    channel: CHANNEL[p.channel] || p.channel, from_them: p.from_them, from_agent: p.from_agent, first: String(p.first_message || '').slice(0, 500),
  })));

  definitions(wb, grain);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `vantriq-pulse-sales-${grain}-${new Date().toISOString().slice(0, 10)}.xlsx` };
}

/** Sends a built report as a download. */
function sendReport(res, { buffer, filename }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}

module.exports = { clientReport, salesReport, sendReport, periodLabel, contactLabel };
