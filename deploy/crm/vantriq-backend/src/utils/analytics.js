const db = require('../db');
const { countryOf } = require('./contacts');
const { pulseAdvanced } = require('./pulseAdvanced');

/**
 * Conversation, contact and satisfaction analytics.
 *
 * One engine, three audiences: a customer looking at their own portal, the
 * same customer's systems pulling /api/external/analytics, and VantriqAI
 * staff looking at any one customer (or all of them) from the CRM. They all
 * get the same numbers because they all come from here.
 *
 * Periods are calendar periods in the business's time zone, not rolling
 * windows — "this month" means since the 1st in Karachi, which is what a
 * customer comparing against their invoice expects. Every "vs previous"
 * figure compares like with like: this month so far against last month up to
 * the same point, never a part-month against a whole one, which would make
 * every month look like a collapse until the last week.
 *
 * What never leaves this module: session_id, or anything derived from it
 * that identifies a person. Contacts are counted from it, server-side, and
 * only the counts come out. The one place people are named is the Excel
 * report (utils/analyticsReport.js): a customer's own contacts, for that
 * customer, and everyone's for staff.
 */

const TZ = process.env.ANALYTICS_TZ || 'Asia/Karachi';

const GRAINS = {
  day:     { step: '1 day',    buckets: 30, current: 'Today',        previous: 'yesterday',    window: 'Last 30 days' },
  week:    { step: '1 week',   buckets: 12, current: 'This week',    previous: 'last week',    window: 'Last 12 weeks' },
  month:   { step: '1 month',  buckets: 12, current: 'This month',   previous: 'last month',   window: 'Last 12 months' },
  quarter: { step: '3 months', buckets: 8,  current: 'This quarter', previous: 'last quarter', window: 'Last 8 quarters' },
  year:    { step: '1 year',   buckets: 5,  current: 'This year',    previous: 'last year',    window: 'Last 5 years' },
};

function normaliseGrain(g) {
  return Object.prototype.hasOwnProperty.call(GRAINS, g) ? g : 'month';
}

// A WhatsApp session id is "<customer phone>-<YYYY-MM-DD>": one per 24-hour
// window. Stripping the date gives the person, so a contact who comes back
// next week is one returning contact, not two new ones. Ids in any other
// shape are counted as their own contact, which errs towards "new".
const CONTACT_OF = (col) => `regexp_replace(${col}, '-\\d{4}-\\d{2}-\\d{2}$', '')`;

/** Calendar bounds for a grain, as instants and as local wall-clock times. */
async function periodBounds(grain) {
  const g = GRAINS[grain];
  const { rows } = await db.query(
    `with b as (
       select date_trunc($1, now() at time zone $2) as cur_local,
              now() at time zone $2 as now_local
     )
     select
       (cur_local at time zone $2)                                        as cur_start,
       ((cur_local - $3::interval * $4) at time zone $2)                  as window_start,
       ((cur_local - $3::interval) at time zone $2)                       as prev_start,
       (least(cur_local - $3::interval + (now_local - cur_local), cur_local) at time zone $2) as prev_point,
       ((cur_local + $3::interval) at time zone $2)                       as cur_end,
       to_char(cur_local, 'YYYY-MM-DD HH24:MI:SS')                         as cur_local,
       to_char(cur_local - $3::interval * $4, 'YYYY-MM-DD HH24:MI:SS')     as window_local,
       extract(epoch from (now_local - cur_local))
         / extract(epoch from ((cur_local + $3::interval) - cur_local))   as elapsed_frac
     from b`,
    [grain, TZ, g.step, g.buckets - 1]
  );
  const r = rows[0];
  return { ...r, elapsed_frac: Math.min(1, Math.max(0, Number(r.elapsed_frac))) };
}

const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : (cur > 0 ? null : 0));
const num = (v) => Number(v || 0);
const round1 = (v) => Math.round(v * 10) / 10;

/** A current-vs-previous figure with a like-for-like delta and a projection. */
function metric(cur, prev, prevFull, frac, { project = true } = {}) {
  const out = { current: cur, previous: prev, previous_full: prevFull, delta_pct: pct(cur, prev) };
  // Projecting from the first few percent of a period is noise, not a forecast.
  if (project && frac >= 0.1 && frac < 1) out.projected = Math.round(cur / frac);
  return out;
}

/**
 * The scope a query runs over: one client, or every client. `p` is the next
 * free placeholder number; the returned params go on the end of the query's.
 */
function scopeOf(clientId, alias, p) {
  return clientId
    ? { sql: `${alias}.client_id = $${p}`, params: [clientId] }
    : { sql: 'true', params: [] };
}

/* ------------------------------------------------------------------ */
/* Conversations and contacts                                          */
/* ------------------------------------------------------------------ */

async function conversationAnalytics(clientId, grain, b) {
  const g = GRAINS[grain];
  // $1 window start · $2 tz · $3 grain · then scope.
  const scopeEv = scopeOf(clientId, 'u', 4);
  const base = [b.window_start, TZ, grain, ...scopeEv.params];

  const CTE = `
    with s as (
      select u.client_id, u.session_id,
             min(u.occurred_at) as started,
             sum(u.messages_count)::int as msgs,
             mode() within group (order by u.channel) as channel,
             (array_agg(u.agent_id order by u.occurred_at) filter (where u.agent_id is not null))[1] as agent_id,
             bool_or(u.handoff) as handoff,
             count(u.handoff) > 0 as handoff_reported,
             u.client_id::text || ':' || ${CONTACT_OF('u.session_id')} as contact
        from usage_events u
       where ${scopeEv.sql} and u.occurred_at >= $1
       group by u.client_id, u.session_id
    ),
    fs as (
      select u.client_id::text || ':' || ${CONTACT_OF('u.session_id')} as contact,
             min(u.occurred_at) as first_at
        from usage_events u
       where ${scopeEv.sql}
       group by 1
    ),
    sx as (
      select s.*, fs.first_at from s left join fs on fs.contact = s.contact
    )`;

  // $2 and $3 are referenced by some queries and not others; Postgres needs
  // every numbered parameter to have a type it can infer, so each query
  // names them at least once through this no-op.
  const TOUCH = `and $2::text is not null and $3::text is not null`;

  const n = base.length;
  const seriesQ = db.query(
    `${CTE}
     select to_char(bk, 'YYYY-MM-DD') as bucket,
            count(sx.session_id)::int as conversations,
            coalesce(sum(sx.msgs), 0)::int as messages,
            count(distinct sx.contact)::int as contacts,
            count(distinct sx.contact) filter (
              where date_trunc($3, sx.first_at at time zone $2) = bk)::int as new_contacts
       from generate_series($${n + 1}::timestamp, $${n + 2}::timestamp, $${n + 3}::interval) bk
       left join sx on date_trunc($3, sx.started at time zone $2) = bk
      group by bk order by bk`,
    [...base, b.window_local, b.cur_local, g.step]
  );

  const kpiQ = db.query(
    `${CTE}
     select
       count(*) filter (where started >= $${n + 1})::int                                   as conv_cur,
       count(*) filter (where started >= $${n + 2} and started < $${n + 3})::int           as conv_prev,
       count(*) filter (where started >= $${n + 2} and started < $${n + 1})::int           as conv_prev_full,
       coalesce(sum(msgs) filter (where started >= $${n + 1}), 0)::int                     as msg_cur,
       coalesce(sum(msgs) filter (where started >= $${n + 2} and started < $${n + 3}), 0)::int as msg_prev,
       coalesce(sum(msgs) filter (where started >= $${n + 2} and started < $${n + 1}), 0)::int as msg_prev_full,
       count(distinct contact) filter (where started >= $${n + 1})::int                    as contacts_cur,
       count(distinct contact) filter (where started >= $${n + 2} and started < $${n + 3})::int as contacts_prev,
       count(distinct contact) filter (where started >= $${n + 2} and started < $${n + 1})::int as contacts_prev_full,
       count(distinct contact) filter (where started >= $${n + 1} and first_at >= $${n + 1})::int as new_cur,
       count(distinct contact) filter (where started >= $${n + 2} and started < $${n + 3}
                                         and first_at >= $${n + 2} and first_at < $${n + 3})::int as new_prev,
       count(distinct contact) filter (where started >= $${n + 2} and started < $${n + 1}
                                         and first_at >= $${n + 2} and first_at < $${n + 1})::int as new_prev_full,
       count(*) filter (where started >= $${n + 1} and handoff_reported)::int               as ho_rep_cur,
       count(*) filter (where started >= $${n + 1} and handoff)::int                        as ho_cur,
       count(*) filter (where started >= $${n + 2} and started < $${n + 3} and handoff_reported)::int as ho_rep_prev,
       count(*) filter (where started >= $${n + 2} and started < $${n + 3} and handoff)::int as ho_prev,
       count(*)::int as conv_window,
       coalesce(sum(msgs), 0)::int as msg_window,
       count(distinct contact)::int as contacts_window,
       count(distinct contact) filter (where first_at >= $1)::int as new_window
     from sx where true ${TOUCH}`,
    [...base, b.cur_start, b.prev_start, b.prev_point]
  );

  const channelQ = db.query(
    `${CTE}
     select channel, count(*)::int as conversations, coalesce(sum(msgs), 0)::int as messages
       from sx where true ${TOUCH} group by channel order by conversations desc`,
    base
  );

  const agentQ = db.query(
    `${CTE}
     select sx.agent_id, a.name, a.kind, c.company, count(*)::int as conversations, coalesce(sum(sx.msgs), 0)::int as messages
       from sx left join client_agents a on a.id = sx.agent_id
       join clients c on c.id = sx.client_id
      where true ${TOUCH}
      group by sx.client_id, c.company, sx.agent_id, a.name, a.kind order by conversations desc limit 12`,
    base
  );

  const heatQ = db.query(
    `${CTE}
     select extract(isodow from started at time zone $2)::int as dow,
            extract(hour from started at time zone $2)::int as hour,
            count(*)::int as n
       from sx where $3::text is not null group by 1, 2`,
    base
  );

  const clientsQ = clientId ? null : db.query(
    `${CTE}
     select c.id, c.company, c.is_internal,
            count(*)::int as conversations,
            count(*) filter (where sx.started >= $${n + 1})::int as conversations_current,
            count(distinct sx.contact)::int as contacts
       from sx join clients c on c.id = sx.client_id
      where true ${TOUCH}
      group by c.id, c.company, c.is_internal
      order by conversations desc limit 10`,
    [...base, b.cur_start]
  );

  // Who the people are, as far as their profiles say (v9.17): city, and
  // whether a name or email is known. Country comes from the number itself.
  const whoQ = db.query(
    `${CTE}
     select sx.client_id, ${CONTACT_OF('sx.session_id')} as key, count(*)::int as conversations,
            max(p.city) as city, bool_or(p.name <> '') as has_name, bool_or(p.email <> '') as has_email
       from sx left join contacts p on p.client_id = sx.client_id and p.contact_key = ${CONTACT_OF('sx.session_id')}
      where true ${TOUCH}
      group by 1, 2`,
    base
  );

  const [series, kpi, channels, agents, heat, clients, who] = await Promise.all(
    [seriesQ, kpiQ, channelQ, agentQ, heatQ, clientsQ, whoQ].map((q) => q && q.then((r) => r.rows))
  );
  const k = kpi[0];
  const frac = b.elapsed_frac;

  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const h of heat) heatmap[h.dow - 1][h.hour] = h.n;

  const containment = (rep, ho) => (rep > 0 ? round1(((rep - ho) / rep) * 100) : null);
  const contCur = containment(k.ho_rep_cur, k.ho_cur);
  const contPrev = containment(k.ho_rep_prev, k.ho_prev);

  const totalWindow = k.conv_window || 0;
  return {
    kpis: {
      conversations: metric(k.conv_cur, k.conv_prev, k.conv_prev_full, frac),
      messages: metric(k.msg_cur, k.msg_prev, k.msg_prev_full, frac),
      contacts: metric(k.contacts_cur, k.contacts_prev, k.contacts_prev_full, frac, { project: false }),
      new_contacts: metric(k.new_cur, k.new_prev, k.new_prev_full, frac),
      returning_contacts: metric(
        k.contacts_cur - k.new_cur, k.contacts_prev - k.new_prev, k.contacts_prev_full - k.new_prev_full, frac, { project: false }
      ),
      messages_per_conversation: {
        current: k.conv_cur ? round1(k.msg_cur / k.conv_cur) : null,
        previous: k.conv_prev ? round1(k.msg_prev / k.conv_prev) : null,
        delta_pct: k.conv_cur && k.conv_prev ? pct(k.msg_cur / k.conv_cur, k.msg_prev / k.conv_prev) : null,
      },
      // Only when the agent reports handoffs — see schema.sql, v9.13.
      containment: contCur == null && contPrev == null ? null : {
        current: contCur, previous: contPrev,
        delta_pct: contCur != null && contPrev != null ? round1(contCur - contPrev) : null,
        reported_conversations: k.ho_rep_cur, handed_off: k.ho_cur,
      },
    },
    window_totals: {
      conversations: totalWindow, messages: k.msg_window,
      contacts: k.contacts_window, new_contacts: k.new_window,
    },
    series: series.map((r) => ({
      bucket: r.bucket,
      conversations: r.conversations,
      messages: r.messages,
      contacts: r.contacts,
      new_contacts: r.new_contacts,
      returning_contacts: r.contacts - r.new_contacts,
    })),
    channels: channels.map((c) => ({
      channel: c.channel, conversations: c.conversations, messages: c.messages,
      share_pct: totalWindow ? round1((c.conversations / totalWindow) * 100) : 0,
    })),
    agents: agents.map((a) => ({
      agent_id: a.agent_id, kind: a.kind || null,
      // Across every customer, two agents can share a name; say whose it is.
      name: (a.name || (a.agent_id ? 'Agent' : 'Main agent')) + (clientId ? '' : ` — ${a.company}`),
      conversations: a.conversations, messages: a.messages,
      share_pct: totalWindow ? round1((a.conversations / totalWindow) * 100) : 0,
    })),
    heatmap, // [isodow-1][hour] = conversations started, over the window
    ...whereFrom(who),
    ...(clients ? { top_clients: clients } : {}),
  };
}

/** Cities and countries of the people active in the window, and how much is known about them. */
function whereFrom(who) {
  const group = (keyFn, blank) => {
    const m = new Map();
    for (const w of who) {
      const k = keyFn(w) || '';
      if (!m.has(k)) m.set(k, { name: k || blank, known: !!k, contacts: 0, conversations: 0 });
      const g = m.get(k);
      g.contacts += 1;
      g.conversations += w.conversations;
    }
    return [...m.values()]
      .map((g) => ({ ...g, share_pct: who.length ? round1((g.contacts / who.length) * 100) : 0 }))
      .sort((a, b) => (a.known === b.known ? b.contacts - a.contacts : a.known ? -1 : 1));
  };
  return {
    cities: group((w) => w.city, 'Not known yet'),
    countries: group((w) => countryOf(w.key), 'Web or unknown'),
    profile_coverage: {
      contacts: who.length,
      with_name: who.filter((w) => w.has_name).length,
      with_email: who.filter((w) => w.has_email).length,
      with_city: who.filter((w) => w.city).length,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Satisfaction                                                         */
/* ------------------------------------------------------------------ */

async function satisfactionAnalytics(clientId, grain, b, { withCompany = false } = {}) {
  const g = GRAINS[grain];
  const sc = scopeOf(clientId, 'r', 4);
  const base = [b.window_start, TZ, grain, ...sc.params];
  const n = base.length;
  const W = `${sc.sql} and r.responded_at >= $1 and $2::text is not null and $3::text is not null`;

  const AGG = (f) => `
    count(r.score) filter (where ${f})::int                          as csat_n,
    count(r.score) filter (where ${f} and r.score >= 4)::int         as csat_sat,
    avg(r.score) filter (where ${f})                                 as csat_avg,
    count(r.nps) filter (where ${f})::int                            as nps_n,
    count(r.nps) filter (where ${f} and r.nps >= 9)::int             as nps_pro,
    count(r.nps) filter (where ${f} and r.nps <= 6)::int             as nps_det,
    count(r.resolved) filter (where ${f})::int                       as res_n,
    count(r.resolved) filter (where ${f} and r.resolved)::int        as res_yes`;

  const [seriesR, kpiR, distR, commentsR] = await Promise.all([
    db.query(
      `select to_char(bk, 'YYYY-MM-DD') as bucket, ${AGG('r.id is not null')}
         from generate_series($${n + 1}::timestamp, $${n + 2}::timestamp, $${n + 3}::interval) bk
         left join csat_responses r
           on date_trunc($3, r.responded_at at time zone $2) = bk and ${W}
        group by bk order by bk`,
      [...base, b.window_local, b.cur_local, g.step]
    ),
    db.query(
      `select ${AGG(`r.responded_at >= $${n + 1}`)},
              ${AGG(`r.responded_at >= $${n + 2} and r.responded_at < $${n + 3}`).replace(/ as (\w+)/g, ' as $1_prev')},
              ${AGG('true').replace(/ as (\w+)/g, ' as $1_window')}
         from csat_responses r where ${W}`,
      [...base, b.cur_start, b.prev_start, b.prev_point]
    ),
    db.query(
      `select r.score, count(*)::int as n from csat_responses r
        where ${W} and r.score is not null group by r.score`,
      base
    ),
    db.query(
      `select r.score, r.nps, r.resolved, r.comment, r.channel, r.responded_at
              ${withCompany ? ', c.company' : ''}
         from csat_responses r ${withCompany ? 'join clients c on c.id = r.client_id' : ''}
        where ${W} and r.comment <> ''
        order by r.responded_at desc limit 8`,
      base
    ),
  ]);

  const k = kpiR.rows[0];
  const csatPct = (sat, total) => (total ? round1((sat / total) * 100) : null);
  const npsOf = (pro, det, total) => (total ? Math.round(((pro - det) / total) * 100) : null);
  const resPct = (yes, total) => (total ? round1((yes / total) * 100) : null);
  const diff = (a, b2) => (a != null && b2 != null ? round1(a - b2) : null);

  const csatCur = csatPct(k.csat_sat, k.csat_n);
  const csatPrev = csatPct(k.csat_sat_prev, k.csat_n_prev);
  const npsCur = npsOf(k.nps_pro, k.nps_det, k.nps_n);
  const npsPrev = npsOf(k.nps_pro_prev, k.nps_det_prev, k.nps_n_prev);
  const resCur = resPct(k.res_yes, k.res_n);
  const resPrev = resPct(k.res_yes_prev, k.res_n_prev);

  const dist = [1, 2, 3, 4, 5].map((s) => ({ score: s, n: 0 }));
  for (const d of distR.rows) dist[d.score - 1].n = d.n;

  const responses = k.csat_n_window + 0;
  return {
    responses_window: Math.max(k.csat_n_window, k.nps_n_window, k.res_n_window),
    kpis: {
      // Percentage of 4s and 5s — the industry's usual CSAT — with the
      // average alongside, since a 4.1 and a 4.6 both round to "satisfied".
      csat: {
        current: csatCur, previous: csatPrev, delta_pts: diff(csatCur, csatPrev),
        average: k.csat_avg != null ? Math.round(Number(k.csat_avg) * 100) / 100 : null,
        responses: k.csat_n,
      },
      nps: {
        current: npsCur, previous: npsPrev, delta_pts: diff(npsCur, npsPrev), responses: k.nps_n,
        promoters: k.nps_pro, passives: k.nps_n - k.nps_pro - k.nps_det, detractors: k.nps_det,
      },
      resolution: { current: resCur, previous: resPrev, delta_pts: diff(resCur, resPrev), responses: k.res_n },
    },
    window: {
      csat: csatPct(k.csat_sat_window, k.csat_n_window),
      csat_average: k.csat_avg_window != null ? Math.round(Number(k.csat_avg_window) * 100) / 100 : null,
      csat_responses: responses,
      nps: npsOf(k.nps_pro_window, k.nps_det_window, k.nps_n_window),
      nps_responses: k.nps_n_window,
      promoters: k.nps_pro_window,
      passives: k.nps_n_window - k.nps_pro_window - k.nps_det_window,
      detractors: k.nps_det_window,
      resolution: resPct(k.res_yes_window, k.res_n_window),
    },
    distribution: dist,
    series: seriesR.rows.map((r) => ({
      bucket: r.bucket,
      csat: csatPct(r.csat_sat, r.csat_n),
      csat_average: r.csat_avg != null ? Math.round(Number(r.csat_avg) * 100) / 100 : null,
      responses: r.csat_n,
      nps: npsOf(r.nps_pro, r.nps_det, r.nps_n),
      nps_responses: r.nps_n,
    })),
    recent_feedback: commentsR.rows.map((r) => ({
      score: r.score, nps: r.nps, resolved: r.resolved, comment: r.comment,
      channel: r.channel, responded_at: r.responded_at,
      ...(withCompany ? { company: r.company } : {}),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Plain-English insights                                               */
/* ------------------------------------------------------------------ */

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const CHANNEL_NAMES = { whatsapp: 'WhatsApp', web: 'Web chat', website: 'Website', instagram: 'Instagram', voice: 'Voice', facebook: 'Facebook', email: 'Email',
  qr: 'QR code', link: 'Survey link', kiosk: 'Kiosk', sms: 'SMS', embed: 'Website survey' };
const fmtInt = (v) => Math.round(v).toLocaleString('en-US');
const hourLabel = (h) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`;

/**
 * The handful of things worth saying out loud, in order of importance. Each
 * is a fact the numbers already contain — no guessing at causes.
 */
function buildInsights(grain, conv, sat, extra = {}) {
  const g = GRAINS[grain];
  const out = [];
  const c = conv.kpis.conversations;

  if (c.previous > 0 && c.delta_pct != null && Math.abs(c.delta_pct) >= 10) {
    out.push({
      tone: c.delta_pct > 0 ? 'up' : 'down',
      text: `Conversations are ${c.delta_pct > 0 ? 'up' : 'down'} ${Math.abs(c.delta_pct)}% on ${g.previous} at the same point (${fmtInt(c.current)} vs ${fmtInt(c.previous)}).`,
    });
  } else if (c.current > 0 && c.previous > 0) {
    out.push({ tone: 'info', text: `Conversation volume is steady against ${g.previous} at the same point (${fmtInt(c.current)} vs ${fmtInt(c.previous)}).` });
  }

  if (c.projected && c.previous_full > 0) {
    const vsFull = pct(c.projected, c.previous_full);
    out.push({
      tone: vsFull >= 0 ? 'up' : 'down',
      text: `At this pace ${g.current.toLowerCase()} ends near ${fmtInt(c.projected)} conversations — ${vsFull >= 0 ? `${vsFull}% more` : `${Math.abs(vsFull)}% fewer`} than all of ${g.previous} (${fmtInt(c.previous_full)}).`,
    });
  }

  if (extra.quota && extra.quota.quota) {
    const q = extra.quota;
    if (q.projected_month_end > q.quota) {
      out.push({ tone: 'warn', text: `On current pace this month reaches about ${fmtInt(q.projected_month_end)} conversations against ${fmtInt(q.quota)} included in your package.` });
    } else if (q.used >= q.quota * 0.8) {
      out.push({ tone: 'warn', text: `${fmtInt(q.used)} of ${fmtInt(q.quota)} included conversations used this month.` });
    }
  }

  const nc = conv.kpis.new_contacts;
  const allContacts = conv.kpis.contacts.current;
  if (allContacts > 0) {
    const share = Math.round((nc.current / allContacts) * 100);
    out.push({ tone: 'info', text: `${share}% of the people who messaged ${g.current.toLowerCase()} were first-time contacts (${fmtInt(nc.current)} new, ${fmtInt(allContacts - nc.current)} returning).` });
  }

  // Busiest slot, from the heatmap. Needs enough volume to mean anything.
  let best = { n: 0 };
  let byDay = Array(7).fill(0);
  conv.heatmap.forEach((row, d) => row.forEach((n, h) => { byDay[d] += n; if (n > best.n) best = { n, d, h }; }));
  if (conv.window_totals.conversations >= 20 && best.n > 0) {
    const topDay = byDay.indexOf(Math.max(...byDay));
    out.push({ tone: 'info', text: `Busiest time is ${DAYS[best.d]}s around ${hourLabel(best.h)}; ${DAYS[topDay]} is the busiest day overall.` });
    const offHours = conv.heatmap.reduce((s, row) => s + row.slice(0, 9).reduce((a, v) => a + v, 0) + row.slice(21).reduce((a, v) => a + v, 0), 0);
    const offShare = Math.round((offHours / conv.window_totals.conversations) * 100);
    if (offShare >= 15) {
      out.push({ tone: 'up', text: `${offShare}% of conversations started outside 9am–9pm — answered by the AI when no one would have been at a desk.` });
    }
  }

  const topChannel = conv.channels[0];
  if (topChannel && conv.channels.length > 1) {
    out.push({ tone: 'info', text: `${CHANNEL_NAMES[topChannel.channel] || topChannel.channel} carries ${topChannel.share_pct}% of conversations.` });
  }

  // A spike or a slump in the last full period, against the ones before it.
  const hist = conv.series.slice(0, -1).map((s) => s.conversations);
  if (hist.length >= 6) {
    const last = hist[hist.length - 1];
    const prior = hist.slice(0, -1).filter((v) => v > 0);
    if (prior.length >= 4) {
      const mean = prior.reduce((a, v) => a + v, 0) / prior.length;
      const sd = Math.sqrt(prior.reduce((a, v) => a + (v - mean) ** 2, 0) / prior.length);
      if (sd > 0 && Math.abs(last - mean) > 2 * sd) {
        out.push({
          tone: last > mean ? 'up' : 'warn',
          text: `${g.previous[0].toUpperCase() + g.previous.slice(1)} was unusual: ${fmtInt(last)} conversations against a typical ${fmtInt(mean)}.`,
        });
      }
    }
  }

  if (sat) {
    const cs = sat.kpis.csat;
    if (cs.responses >= 5 && cs.current != null) {
      if (cs.current < 70) out.push({ tone: 'warn', text: `Only ${cs.current}% of survey answers ${g.current.toLowerCase()} were satisfied (4 or 5 out of 5) — worth reading the comments below.` });
      else if (cs.delta_pts != null && Math.abs(cs.delta_pts) >= 5) out.push({ tone: cs.delta_pts > 0 ? 'up' : 'down', text: `Satisfaction ${cs.delta_pts > 0 ? 'rose' : 'fell'} ${Math.abs(cs.delta_pts)} points to ${cs.current}%.` });
      else out.push({ tone: 'up', text: `${cs.current}% of customers who answered the survey were satisfied (average ${cs.average} / 5).` });
    }
    const np = sat.kpis.nps;
    if (np.responses >= 5 && np.current != null && np.detractors > np.promoters) {
      out.push({ tone: 'warn', text: `More detractors than promoters ${g.current.toLowerCase()} (NPS ${np.current}).` });
    } else if (np.responses >= 10 && np.delta_pts != null && Math.abs(np.delta_pts) >= 10) {
      out.push({ tone: np.delta_pts > 0 ? 'up' : 'down', text: `NPS ${np.delta_pts > 0 ? 'rose' : 'fell'} ${Math.abs(np.delta_pts)} points against ${g.previous}, to ${np.current > 0 ? '+' : ''}${np.current}.` });
    }
  }

  return out.slice(0, 7);
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                  */
/* ------------------------------------------------------------------ */

/** Sessions this calendar month against the package allowance. */
async function quotaPace(clientId, quota) {
  if (!quota) return null;
  const { rows } = await db.query(
    `with b as (select date_trunc('month', now() at time zone $2) as m, now() at time zone $2 as n)
     select count(distinct u.session_id)::int as used,
            extract(epoch from (b.n - b.m)) / extract(epoch from ((b.m + interval '1 month') - b.m)) as frac
       from b left join usage_events u
         on u.client_id = $1 and u.occurred_at >= (b.m at time zone $2)
      group by b.n, b.m`,
    [clientId, TZ]
  );
  const used = rows[0] ? rows[0].used : 0;
  const frac = rows[0] ? Number(rows[0].frac) : 0;
  return {
    quota, used,
    used_pct: Math.round((used / quota) * 100),
    projected_month_end: frac >= 0.1 ? Math.round(used / frac) : null,
  };
}

/**
 * Everything one customer's analytics page shows. `quota` is the package
 * allowance (already resolved through effectivePackage by the caller) or null.
 */
async function clientAnalytics(clientId, { grain, quota = null } = {}) {
  grain = normaliseGrain(grain);
  const b = await periodBounds(grain);
  const [conv, sat, q, advanced] = await Promise.all([
    conversationAnalytics(clientId, grain, b),
    satisfactionAnalytics(clientId, grain, b),
    quotaPace(clientId, quota),
    pulseAdvanced(clientId, b),
  ]);
  return {
    grain,
    time_zone: TZ,
    generated_at: new Date().toISOString(),
    period: {
      current_label: GRAINS[grain].current,
      previous_label: GRAINS[grain].previous,
      window_label: GRAINS[grain].window,
      current_start: b.cur_start,
      previous_start: b.prev_start,
      compared_to: b.prev_point,
      elapsed_pct: Math.round(b.elapsed_frac * 100),
    },
    ...conv,
    advanced,
    satisfaction: sat,
    quota: q,
    insights: buildInsights(grain, conv, sat, { quota: q }),
  };
}

/* ------------------------------------------------------------------ */
/* VantriqAI's own sales: leads, wins, sources, and what prospects ask  */
/* ------------------------------------------------------------------ */

const PIPELINE_ORDER = ['lead', 'contacted', 'proposal', 'negotiation', 'active'];

// What prospects talk to our sales agent about. Keyword matching, in English
// and the Roman Urdu prospects actually write — labelled as such on screen,
// not dressed up as AI topic modelling.
const TOPICS = [
  { id: 'pricing', label: 'Pricing & packages', re: /\b(price|pricing|cost|package|plan|rates?|charges?|fees?|kitn[ae]|qeem[a]?t|paise|budget)\b/i },
  { id: 'demo', label: 'Demo or meeting', re: /\b(demo|meeting|call me|appointment|schedule|book|zoom|meet)\b/i },
  { id: 'whatsapp', label: 'WhatsApp number & setup', re: /\b(whatsapp|waba|number|verif\w*|green tick|setup|onboard\w*)\b/i },
  { id: 'integration', label: 'Integrations', re: /\b(integrat\w*|api|crm|shopify|woocommerce|website|google sheets?|zapier|erp)\b/i },
  { id: 'timeline', label: 'Timeline', re: /\b(how long|timeline|kab tak|kitne din|days|weeks?|go live|launch)\b/i },
  { id: 'support', label: 'Problems & support', re: /\b(issue|problem|not working|error|complain\w*|masla|kharab|help)\b/i },
  { id: 'language', label: 'Language (Urdu etc.)', re: /\b(urdu|roman|language|zuban|arabic|punjabi)\b/i },
];

async function salesAnalytics({ grain } = {}) {
  grain = normaliseGrain(grain);
  const g = GRAINS[grain];
  const b = await periodBounds(grain);

  const [clientsR, histR, bucketsR, convR, repsR] = await Promise.all([
    db.query(
      `select c.id, c.company, c.stage, c.source, c.est_value, c.owner_rep_id, c.created_at,
              to_char(date_trunc($1, c.created_at at time zone $2), 'YYYY-MM-DD') as bucket
         from clients c where c.is_internal = false`,
      [grain, TZ]
    ),
    db.query(
      `select h.client_id, h.from_stage, h.to_stage, h.created_at,
              to_char(date_trunc($1, h.created_at at time zone $2), 'YYYY-MM-DD') as bucket
         from client_stage_history h join clients c on c.id = h.client_id
        where c.is_internal = false order by h.created_at`,
      [grain, TZ]
    ),
    db.query(
      `select to_char(bk, 'YYYY-MM-DD') as bucket
         from generate_series($1::timestamp, $2::timestamp, $3::interval) bk order by bk`,
      [b.window_local, b.cur_local, g.step]
    ),
    db.query(
      `select m.session_id, m.external_ref, m.role, m.content, m.created_at,
              to_char(date_trunc($2, m.created_at at time zone $3), 'YYYY-MM-DD') as bucket
         from conversation_messages m
        where m.created_at >= $1
          -- A customer's own customers' conversations are theirs, not our sales.
          and not exists (select 1 from clients x where x.id = m.client_id and not x.is_internal and x.stage = 'active')
        order by m.created_at`,
      [b.window_start, grain, TZ]
    ),
    db.query(`select id, name from sales_reps`),
  ]);

  const inRange = (t, from, to) => { const x = new Date(t); return x >= new Date(from) && (!to || x < new Date(to)); };
  const cur = (t) => inRange(t, b.cur_start);
  const prev = (t) => inRange(t, b.prev_start, b.prev_point);
  const prevFull = (t) => inRange(t, b.prev_start, b.cur_start);
  const win = (t) => inRange(t, b.window_start);

  // A client added straight in as 'active' is an existing customer being
  // recorded, not a lead we won — its creation row says so.
  const createdAs = new Map();
  const reached = new Map();
  for (const h of histR.rows) {
    if (h.from_stage == null && !createdAs.has(h.client_id)) createdAs.set(h.client_id, h.to_stage);
    if (!reached.has(h.client_id)) reached.set(h.client_id, new Set());
    reached.get(h.client_id).add(h.to_stage);
  }
  const leads = clientsR.rows.filter((c) => createdAs.get(c.id) !== 'active');
  const wins = histR.rows.filter((h) => h.to_stage === 'active' && h.from_stage != null);
  const losses = histR.rows.filter((h) => h.to_stage === 'lost');

  const count = (arr, f, key = 'created_at') => arr.filter((x) => f(x[key])).length;
  const series = bucketsR.rows.map(({ bucket }) => ({
    bucket,
    new_leads: leads.filter((c) => c.bucket === bucket).length,
    won: wins.filter((h) => h.bucket === bucket).length,
    lost: losses.filter((h) => h.bucket === bucket).length,
  }));

  const winsW = wins.filter((h) => win(h.created_at));
  const lossesW = losses.filter((h) => win(h.created_at));
  const winRate = winsW.length + lossesW.length ? round1((winsW.length / (winsW.length + lossesW.length)) * 100) : null;
  const byId = new Map(clientsR.rows.map((c) => [c.id, c]));
  const daysToWin = winsW
    .map((h) => { const c = byId.get(h.client_id); return c ? (new Date(h.created_at) - new Date(c.created_at)) / 86400000 : null; })
    .filter((d) => d != null && d >= 0);
  const avgDaysToWin = daysToWin.length ? round1(daysToWin.reduce((a, v) => a + v, 0) / daysToWin.length) : null;

  // Funnel: of the leads that came in over the window, how many got at least
  // as far as each stage.
  const leadsW = leads.filter((c) => win(c.created_at));
  const funnel = PIPELINE_ORDER.map((stage, i) => ({
    stage,
    n: leadsW.filter((c) => {
      const seen = new Set(reached.get(c.id) || []);
      seen.add(c.stage);
      return [...seen].some((s) => PIPELINE_ORDER.indexOf(s) >= i);
    }).length,
  }));

  const tally = (arr, keyFn) => {
    const m = new Map();
    for (const x of arr) { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, z) => z.n - a.n);
  };
  const foldOther = (rows, keep = 6) => {
    if (rows.length <= keep + 1) return rows;
    const head = rows.slice(0, keep);
    return [...head, { name: 'Other', n: rows.slice(keep).reduce((s, r) => s + r.n, 0) }];
  };
  const wonIds = new Set(wins.map((h) => h.client_id));
  const sources = tally(leadsW, (c) => (c.source || '').trim() || 'Not recorded').map((s) => ({
    ...s,
    won: leadsW.filter((c) => ((c.source || '').trim() || 'Not recorded') === s.name && wonIds.has(c.id)).length,
  }));
  const repName = new Map(repsR.rows.map((r) => [r.id, r.name]));
  const reps = tally(leadsW, (c) => (c.owner_rep_id ? repName.get(c.owner_rep_id) || 'Former rep' : 'House'));

  const open = clientsR.rows.filter((c) => ['lead', 'contacted', 'proposal', 'negotiation'].includes(c.stage));

  // Our own sales agent's conversations with prospects.
  const sessKey = (m) => m.session_id || `${m.external_ref}:${String(m.created_at.toISOString ? m.created_at.toISOString() : m.created_at).slice(0, 10)}`;
  const sessions = new Map();
  for (const m of convR.rows) {
    const k = sessKey(m);
    if (!sessions.has(k)) sessions.set(k, { started: m.created_at, bucket: m.bucket, text: [], ref: m.external_ref });
    if (m.role === 'customer') sessions.get(k).text.push(m.content);
  }
  const sessList = [...sessions.values()];
  const topics = TOPICS.map((t) => ({
    id: t.id, label: t.label,
    conversations: sessList.filter((s) => s.text.some((x) => t.re.test(x))).length,
  })).sort((a, z) => z.conversations - a.conversations);
  const prospectSeries = bucketsR.rows.map(({ bucket }) => ({
    bucket, conversations: sessList.filter((s) => s.bucket === bucket).length,
  }));

  const kNew = metric(count(leads, cur), count(leads, prev), count(leads, prevFull), b.elapsed_frac);
  const kWon = metric(count(wins, cur), count(wins, prev), count(wins, prevFull), b.elapsed_frac);
  const kLost = metric(count(losses, cur), count(losses, prev), count(losses, prevFull), b.elapsed_frac, { project: false });

  const insights = [];
  if (kNew.previous > 0 && kNew.delta_pct != null && Math.abs(kNew.delta_pct) >= 10) {
    insights.push({ tone: kNew.delta_pct > 0 ? 'up' : 'down', text: `New leads are ${kNew.delta_pct > 0 ? 'up' : 'down'} ${Math.abs(kNew.delta_pct)}% on ${g.previous} at the same point (${kNew.current} vs ${kNew.previous}).` });
  }
  if (sources[0] && leadsW.length >= 5) {
    insights.push({ tone: 'info', text: `${sources[0].name} brought in ${Math.round((sources[0].n / leadsW.length) * 100)}% of leads over the ${g.window.toLowerCase()}.` });
    const bestConv = sources.filter((s) => s.n >= 3).map((s) => ({ ...s, rate: s.won / s.n })).sort((a, z) => z.rate - a.rate)[0];
    if (bestConv && bestConv.won > 0) insights.push({ tone: 'up', text: `${bestConv.name} converts best: ${Math.round(bestConv.rate * 100)}% of its leads became customers.` });
  }
  if (winRate != null) insights.push({ tone: winRate >= 30 ? 'up' : 'info', text: `Win rate over the ${g.window.toLowerCase()} is ${winRate}% (${winsW.length} won, ${lossesW.length} lost)${avgDaysToWin != null ? `, taking ${avgDaysToWin < 1 ? 'under a day' : `${avgDaysToWin} days`} on average from lead to customer` : ''}.` });
  const stuck = open.filter((c) => (Date.now() - new Date(c.created_at)) / 86400000 > 30 && c.stage === 'lead').length;
  if (stuck > 0) insights.push({ tone: 'warn', text: `${stuck} lead${stuck === 1 ? ' has' : 's have'} sat at "New lead" for over 30 days without being contacted.` });
  if (topics[0] && topics[0].conversations > 0) insights.push({ tone: 'info', text: `Prospects most often ask about ${topics[0].label.toLowerCase()} (${topics[0].conversations} conversation${topics[0].conversations === 1 ? '' : 's'}).` });

  return {
    grain,
    time_zone: TZ,
    generated_at: new Date().toISOString(),
    period: {
      current_label: g.current, previous_label: g.previous, window_label: g.window,
      current_start: b.cur_start, compared_to: b.prev_point, elapsed_pct: Math.round(b.elapsed_frac * 100),
    },
    kpis: {
      new_leads: kNew,
      won: kWon,
      lost: kLost,
      win_rate: winRate,
      avg_days_to_win: avgDaysToWin,
      open_deals: open.length,
      open_value: open.reduce((s, c) => s + num(c.est_value), 0),
      prospect_conversations: metric(
        sessList.filter((s) => cur(s.started)).length, sessList.filter((s) => prev(s.started)).length,
        sessList.filter((s) => prevFull(s.started)).length, b.elapsed_frac
      ),
    },
    series,
    funnel,
    sources: foldOther(sources),
    reps,
    prospect_series: prospectSeries,
    topics,
    insights,
  };
}

/** Every customer's conversations together, for the CRM's platform view. */
async function platformAnalytics({ grain } = {}) {
  grain = normaliseGrain(grain);
  const b = await periodBounds(grain);
  const [conv, sat, advanced] = await Promise.all([
    conversationAnalytics(null, grain, b),
    satisfactionAnalytics(null, grain, b, { withCompany: true }),
    pulseAdvanced(null, b),
  ]);
  return {
    grain,
    time_zone: TZ,
    generated_at: new Date().toISOString(),
    period: {
      current_label: GRAINS[grain].current, previous_label: GRAINS[grain].previous, window_label: GRAINS[grain].window,
      current_start: b.cur_start, compared_to: b.prev_point, elapsed_pct: Math.round(b.elapsed_frac * 100),
    },
    ...conv,
    advanced,
    satisfaction: sat,
    insights: buildInsights(grain, conv, sat),
  };
}

module.exports = { clientAnalytics, salesAnalytics, platformAnalytics, satisfactionAnalytics, GRAINS, TZ, normaliseGrain, periodBounds };
