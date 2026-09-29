const db = require('../db');
const { GRAINS, TZ, normaliseGrain, periodBounds } = require('./analytics');

/**
 * Vantriq Echo's dashboard: every survey of one client (or every client)
 * together, over a calendar window — the same periods, "same point"
 * comparisons and time zone as Vantriq Pulse, so the two read alike.
 *
 * Headline figures against the previous period, trends, how people scored
 * (1–5 and 0–10), the invite funnel, results by channel, location, language,
 * survey, gender, age and city, when people answer, what the happy and the
 * unhappy write about, how fast unhappy customers get a reply, and a few
 * plain-English findings. Only counts and comments leave here — never who.
 */

const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b ? r1((a / b) * 100) : null);
const npsOf = (pro, det, n) => (n ? Math.round(((pro - det) / n) * 100) : null);
const delta = (cur, prev) => (prev > 0 ? r1(((cur - prev) / prev) * 100) : (cur > 0 ? null : 0));
const diff = (a, b) => (a != null && b != null ? r1(a - b) : null);
const CHANNEL = { link: 'Survey link', qr: 'QR code', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', kiosk: 'Kiosk', embed: 'Website', web: 'Web' };
const LANG = { en: 'English', ur: 'Urdu' };
const AGE_ORDER = ['Under 18', '18–24', '25–34', '35–44', '45–54', '55–64', '65+'];

/** Satisfaction figures for any set of answers. */
function stats(rows) {
  let cn = 0, cs = 0, sum = 0, nn = 0, pro = 0, det = 0, rn = 0, ry = 0, en = 0, esum = 0, unhappy = 0;
  for (const r of rows) {
    if (r.score != null) { cn++; sum += r.score; if (r.score >= 4) cs++; }
    if (r.nps != null) { nn++; if (r.nps >= 9) pro++; if (r.nps <= 6) det++; }
    if (r.resolved != null) { rn++; if (r.resolved) ry++; }
    if (r.ces != null) { en++; esum += r.ces; }
    if ((r.score != null && r.score <= 2) || (r.nps != null && r.nps <= 6) || r.resolved === false) unhappy++;
  }
  return {
    responses: rows.length,
    csat: pct(cs, cn), csat_average: cn ? r2(sum / cn) : null, csat_responses: cn,
    nps: npsOf(pro, det, nn), nps_responses: nn, promoters: pro, passives: nn - pro - det, detractors: det,
    resolution: pct(ry, rn), resolution_responses: rn,
    ces_average: en ? r2(esum / en) : null, ces_responses: en,
    unhappy, unhappy_pct: pct(unhappy, rows.length),
  };
}

function groupBy(rows, keyOf, nameOf = (k) => k) {
  const m = new Map();
  for (const r of rows) { const k = keyOf(r) || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].map(([k, list]) => ({ key: k, name: nameOf(k), known: !!k, ...stats(list), share: pct(list.length, rows.length) }))
    .sort((a, b) => (a.known === b.known ? b.responses - a.responses : a.known ? -1 : 1));
}

const STOP = new Set(('the and for you your with was were are but not have had has that this from they them very our out all too its just been will would could should about there their what when which who how also more much some any really than then into only other over such can did does get got one two dont didnt cant wont isnt aur hai hain tha thi ke ki ka ko se mein main nahi bhi yeh woh kya bohat bahut aap hum ap par per the ہے ہیں اور کے کی کا کو سے میں نہیں بھی یہ وہ کیا بہت آپ ہم تھا تھی').split(' '));
function themes(texts, max = 10) {
  const counts = new Map();
  for (const t of texts) {
    const seen = new Set();
    for (const raw of String(t || '').toLowerCase().match(/[\p{L}\p{M}']+/gu) || []) {
      const w = raw.replace(/^'+|'+$/g, '');
      if (w.length < (/[؀-ۿ]/.test(w) ? 2 : 3) || STOP.has(w) || seen.has(w)) continue;
      seen.add(w); counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([word, n]) => ({ word, n }));
}

async function echoDashboard({ clientId = null, grain } = {}) {
  grain = normaliseGrain(grain);
  const g = GRAINS[grain];
  const b = await periodBounds(grain);
  const [rowsR, bucketsR, invR, viewsR, surveysR, fuR] = await Promise.all([
    db.query(
      `select r.id, r.survey_id, r.score, r.nps, r.ces, r.resolved, r.comment, r.channel, r.location_name, r.language,
              r.gender, r.city, r.age_band, r.followup_status, r.followup_at, r.submitted_at, r.duration_sec,
              to_char(date_trunc($3, r.submitted_at at time zone $4), 'YYYY-MM-DD') as bucket,
              extract(isodow from r.submitted_at at time zone $4)::int as dow,
              extract(hour from r.submitted_at at time zone $4)::int as hour
         from survey_responses r
        where ($1::uuid is null or r.client_id = $1) and r.submitted_at >= $2
        order by r.submitted_at desc limit 50000`,
      [clientId, b.window_start, grain, TZ]
    ),
    db.query(`select to_char(bk, 'YYYY-MM-DD') as bucket from generate_series($1::timestamp, $2::timestamp, $3::interval) bk order by bk`,
      [b.window_local, b.cur_local, g.step]),
    db.query(
      `select to_char(date_trunc($3, i.created_at at time zone $4), 'YYYY-MM-DD') as bucket, i.created_at, i.opened_at is not null as opened,
              i.response_id is not null as answered, i.channel, i.survey_id
         from survey_invites i where ($1::uuid is null or i.client_id = $1) and i.created_at >= $2`,
      [clientId, b.window_start, grain, TZ]
    ),
    db.query(
      `select coalesce(sum(v.views), 0)::int as views,
              coalesce(sum(v.views) filter (where v.day >= ($3::timestamptz at time zone $4)::date), 0)::int as views_cur
         from survey_views v join surveys s on s.id = v.survey_id
        where ($1::uuid is null or s.client_id = $1) and v.day >= ($2::timestamptz at time zone $4)::date`,
      [clientId, b.window_start, b.cur_start, TZ]
    ),
    db.query(
      `select s.id, s.title, s.status, s.slug, s.created_at, c.company, c.surveys_enabled
         from surveys s join clients c on c.id = s.client_id where ($1::uuid is null or s.client_id = $1)`,
      [clientId]
    ),
    db.query(
      `select followup_status as st, count(*)::int as n,
              percentile_cont(0.5) within group (order by extract(epoch from (followup_at - submitted_at)) / 3600)
                filter (where followup_at is not null and followup_status in ('contacted','resolved')) as median_hours,
              count(*) filter (where followup_status = 'open' and submitted_at < now() - interval '48 hours')::int as overdue
         from survey_responses where ($1::uuid is null or client_id = $1) and followup_status <> 'none'
        group by 1`,
      [clientId]
    ),
  ]);
  const rows = rowsR.rows;
  const t = (x) => new Date(x).getTime();
  const cur = rows.filter((r) => t(r.submitted_at) >= t(b.cur_start));
  const prev = rows.filter((r) => t(r.submitted_at) >= t(b.prev_start) && t(r.submitted_at) < t(b.prev_point));
  const prevFull = rows.filter((r) => t(r.submitted_at) >= t(b.prev_start) && t(r.submitted_at) < t(b.cur_start));
  const W = stats(rows), Cur = stats(cur), Prev = stats(prev);
  const frac = b.elapsed_frac;

  const inv = invR.rows;
  const invCur = inv.filter((i) => t(i.created_at) >= t(b.cur_start));
  const invPrev = inv.filter((i) => t(i.created_at) >= t(b.prev_start) && t(i.created_at) < t(b.prev_point));
  const rate = (list) => pct(list.filter((i) => i.answered).length, list.length);

  const byBucket = new Map(bucketsR.rows.map((x) => [x.bucket, []]));
  for (const r of rows) if (byBucket.has(r.bucket)) byBucket.get(r.bucket).push(r);
  const invByBucket = new Map();
  for (const i of inv) { const e = invByBucket.get(i.bucket) || { sent: 0, answered: 0 }; e.sent++; if (i.answered) e.answered++; invByBucket.set(i.bucket, e); }
  const series = [...byBucket.entries()].map(([bucket, list]) => {
    const s = stats(list); const iv = invByBucket.get(bucket) || { sent: 0, answered: 0 };
    return { bucket, responses: s.responses, csat: s.csat, csat_average: s.csat_average, nps: s.nps, nps_responses: s.nps_responses,
      promoters: s.promoters, passives: s.passives, detractors: s.detractors, resolution: s.resolution, unhappy: s.unhappy,
      invites_sent: iv.sent, invites_answered: iv.answered };
  });

  const distribution = [1, 2, 3, 4, 5].map((v) => ({ score: v, n: rows.filter((r) => r.score === v).length }));
  const npsDistribution = Array.from({ length: 11 }, (_, v) => ({ score: v, n: rows.filter((r) => r.nps === v).length }));
  const heatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows) heatmap[r.dow - 1][r.hour] += 1;

  const surveyName = new Map(surveysR.rows.map((s) => [s.id, s]));
  const surveys = groupBy(rows, (r) => r.survey_id).map((x) => {
    const s = surveyName.get(x.key) || {};
    const mine = inv.filter((i) => i.survey_id === x.key);
    return { ...x, id: x.key, name: s.title || 'Survey', company: s.company, status: s.surveys_enabled === false ? 'paused' : s.status, slug: s.slug,
      invites_sent: mine.length, response_rate: pct(mine.filter((i) => i.answered).length, mine.length) };
  });
  for (const s of surveysR.rows) if (!surveys.some((x) => x.id === s.id)) surveys.push({ id: s.id, key: s.id, name: s.title, company: s.company, status: s.status, slug: s.slug, responses: 0, known: true });

  const fu = { open: 0, contacted: 0, resolved: 0, overdue: 0, median_hours_to_reply: null };
  for (const f of fuR.rows) { fu[f.st] = f.n; fu.overdue += f.overdue || 0; if (f.median_hours != null && f.st !== 'open') fu.median_hours_to_reply = fu.median_hours_to_reply == null ? r1(Number(f.median_hours)) : fu.median_hours_to_reply; }

  // Words that set a group apart: used by a bigger share of its comments than
  // of the other group's, so "great" in "great taste, but cold" is not a complaint.
  const distinct = (mine, other) => {
    const share = (list, w) => list.filter((t) => String(t).toLowerCase().includes(w)).length / (list.length || 1);
    return themes(mine, 20).filter((x) => share(mine, x.word) > share(other, x.word) * 1.25).slice(0, 10);
  };
  const unhappyTexts = rows.filter((r) => (r.score != null && r.score <= 2) || (r.nps != null && r.nps <= 6) || r.resolved === false).map((r) => r.comment).filter(Boolean);
  const happyTexts = rows.filter((r) => (r.score != null && r.score >= 4) || (r.nps != null && r.nps >= 9)).map((r) => r.comment).filter(Boolean);
  const views = viewsR.rows[0];
  const durations = rows.map((r) => r.duration_sec).filter((v) => v != null && v > 0 && v < 3600).sort((a, z) => a - z);

  const d = {
    grain, time_zone: TZ, generated_at: new Date().toISOString(),
    period: { current_label: g.current, previous_label: g.previous, window_label: g.window, elapsed_pct: Math.round(frac * 100) },
    kpis: {
      responses: { current: Cur.responses, previous: Prev.responses, previous_full: prevFull.length, delta_pct: delta(Cur.responses, Prev.responses),
        projected: frac >= 0.1 && frac < 1 ? Math.round(Cur.responses / frac) : null },
      csat: { current: Cur.csat, previous: Prev.csat, delta_pts: diff(Cur.csat, Prev.csat), average: Cur.csat_average, responses: Cur.csat_responses },
      nps: { current: Cur.nps, previous: Prev.nps, delta_pts: diff(Cur.nps, Prev.nps), responses: Cur.nps_responses },
      resolution: { current: Cur.resolution, previous: Prev.resolution, delta_pts: diff(Cur.resolution, Prev.resolution), responses: Cur.resolution_responses },
      ces: { current: Cur.ces_average, previous: Prev.ces_average, responses: Cur.ces_responses },
      unhappy: { current: Cur.unhappy, previous: Prev.unhappy, share: Cur.unhappy_pct },
      response_rate: { current: rate(invCur), previous: rate(invPrev), delta_pts: diff(rate(invCur), rate(invPrev)), sent: invCur.length },
      completion: { views: views.views_cur, rate: views.views_cur ? Math.min(100, pct(Cur.responses, views.views_cur)) : null },
    },
    window: { ...W, views: views.views, completion_rate: views.views ? Math.min(100, pct(W.responses, views.views)) : null,
      median_seconds: durations.length ? durations[Math.floor(durations.length / 2)] : null },
    series, distribution, nps_distribution: npsDistribution, heatmap,
    funnel: { sent: inv.length, opened: inv.filter((i) => i.opened).length, answered: inv.filter((i) => i.answered).length },
    channels: groupBy(rows, (r) => r.channel, (k) => CHANNEL[k] || k),
    locations: groupBy(rows, (r) => r.location_name, (k) => k || 'Not specified').filter((x) => x.known || rows.some((r) => r.location_name)),
    languages: groupBy(rows, (r) => r.language, (k) => LANG[k] || k),
    surveys: surveys.sort((a, z) => (z.responses || 0) - (a.responses || 0)),
    demographics: {
      gender: groupBy(rows, (r) => r.gender, (k) => k || 'Not given'),
      age: groupBy(rows, (r) => r.age_band, (k) => k || 'Not given').sort((a, z) => (AGE_ORDER.indexOf(a.name) + 1 || 99) - (AGE_ORDER.indexOf(z.name) + 1 || 99)),
      city: groupBy(rows, (r) => r.city, (k) => k || 'Not given'),
    },
    followups: fu,
    themes: { unhappy: distinct(unhappyTexts, happyTexts), happy: distinct(happyTexts, unhappyTexts) },
    recent_comments: rows.filter((r) => r.comment).slice(0, 10).map((r) => ({
      comment: r.comment, score: r.score, nps: r.nps, resolved: r.resolved, channel: CHANNEL[r.channel] || r.channel,
      survey: (surveyName.get(r.survey_id) || {}).title || '', submitted_at: r.submitted_at,
    })),
    sampled: rows.length >= 50000,
  };
  for (const k of ['gender', 'age', 'city']) if (!d.demographics[k].some((x) => x.known)) d.demographics[k] = [];
  if (!d.locations.some((x) => x.known)) d.locations = [];
  d.insights = insights(d);
  return d;
}

function insights(d) {
  const out = [];
  const k = d.kpis, p = d.period;
  if (k.csat.current != null && k.csat.previous != null && Math.abs(k.csat.delta_pts) >= 5) {
    out.push({ tone: k.csat.delta_pts > 0 ? 'up' : 'down', text: `Satisfaction is ${k.csat.delta_pts > 0 ? 'up' : 'down'} ${Math.abs(k.csat.delta_pts)} points on ${p.previous_label} at the same point (${k.csat.current}% vs ${k.csat.previous}%).` });
  }
  if (k.nps.current != null && k.nps.previous != null && Math.abs(k.nps.delta_pts) >= 10) {
    out.push({ tone: k.nps.delta_pts > 0 ? 'up' : 'down', text: `Net Promoter Score moved from ${k.nps.previous} to ${k.nps.current} against ${p.previous_label}.` });
  }
  if (d.followups.overdue) out.push({ tone: 'warn', text: `${d.followups.overdue} unhappy customer${d.followups.overdue === 1 ? ' has' : 's have'} waited more than 48 hours for a reply.` });
  // The two widest gaps between groups big enough to trust, in words.
  const PEOPLE = { Male: 'men', Female: 'women' };
  const big = (list) => list.filter((x) => x.known && x.csat != null && x.csat_responses >= 5 && x.name !== 'Prefer not to say' && x.name !== 'Other');
  const gaps = [];
  for (const [list, word, what] of [[d.locations, 'at', ''], [d.demographics.city, 'in', ''], [d.demographics.gender, 'among', 'g'], [d.demographics.age, 'among people aged', ''], [d.channels, 'through', '']]) {
    const g = big(list);
    if (g.length < 2) continue;
    const lo = g.reduce((a, x) => (x.csat < a.csat ? x : a)); const hi = g.reduce((a, x) => (x.csat > a.csat ? x : a));
    const nm = (x) => (what === 'g' ? PEOPLE[x.name] || x.name : x.name);
    if (hi.csat - lo.csat >= 10) gaps.push({ gap: hi.csat - lo.csat, tone: 'info', text: `Satisfaction is lowest ${word} ${nm(lo)} (${lo.csat}%, ${lo.csat_responses} answers) and highest ${word} ${nm(hi)} (${hi.csat}%).` });
  }
  gaps.sort((a, b) => b.gap - a.gap).slice(0, 2).forEach((x) => out.push({ tone: x.tone, text: x.text }));
  if (d.themes.unhappy[0]) out.push({ tone: 'info', text: `Unhappy customers most often mention: ${d.themes.unhappy.slice(0, 4).map((x) => `“${x.word}”`).join(', ')}.` });
  if (d.funnel.sent >= 10) out.push({ tone: 'info', text: `${pct(d.funnel.answered, d.funnel.sent)}% of the ${d.funnel.sent} personal survey links sent over the ${d.period.window_label.toLowerCase()} were answered.` });
  if (!out.length && d.window.responses) out.push({ tone: 'info', text: `${d.window.responses} answers over the ${d.period.window_label.toLowerCase()}${d.window.csat != null ? `, ${d.window.csat}% satisfied` : ''}.` });
  return out.slice(0, 6);
}

module.exports = { echoDashboard };
