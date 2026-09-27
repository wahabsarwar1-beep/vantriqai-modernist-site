/**
 * Surveys — the engine behind the survey app, the portal's Surveys tab, the
 * CRM's Surveys view and the survey endpoints of the external API.
 *
 * One module so there is exactly one answer to "is this a valid survey?",
 * "is this a valid answer?", "which questions did this respondent see?" and
 * "what is this survey's satisfaction score?" — whoever is asking.
 *
 * The rules that shape it:
 *
 *   - A definition is validated on EVERY write, from any caller. The builder
 *     is a convenience; the server is the authority. Anything a respondent
 *     sees was checked here first.
 *   - Branching ("ask what to improve only if they would not recommend us")
 *     is evaluated on the server too, from the answers themselves. An answer
 *     to a question the respondent should not have seen is dropped, and a
 *     required question is only required if it was shown.
 *   - The headline figures — CSAT, NPS, effort, resolved — are lifted out of
 *     the answers into columns, and mirrored into csat_responses, so the
 *     Analytics dashboards that already exist count survey answers with no
 *     second copy of the satisfaction maths.
 *   - Nothing that identifies a respondent leaves the CRM unless they typed
 *     it into a contact question themselves. A conversation's session id —
 *     built from their phone number — never reaches the portal or the API.
 */
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const qrcode = require('qrcode-generator');
const db = require('../db');
const { templateByKey, templateSummaries } = require('./surveyTemplates');
const { GRAINS, TZ, normaliseGrain, periodBounds } = require('./analytics');
const { sendMail, mailConfigured } = require('./mailer');

/* ------------------------------------------------------------------ */
/* Errors and small helpers                                             */
/* ------------------------------------------------------------------ */

/** A failure the caller caused, with a message fit to show them. */
class SurveyError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.expose = true; // utils/asyncErrors.js shows `message` for exposed 4xx errors
    if (details) this.details = details;
  }
}
const bad = (msg, details) => new SurveyError(400, msg, details);

const LANGUAGES = {
  en: { name: 'English', dir: 'ltr' },
  ur: { name: 'اردو', dir: 'rtl' },
};
const TYPES = ['csat', 'nps', 'ces', 'rating', 'rating_grid', 'single', 'multi', 'yesno', 'text', 'contact'];
const RANGE = { csat: [1, 5], rating: [1, 5], nps: [0, 10], ces: [1, 7] };
const CONTACT_FIELDS = ['name', 'company', 'phone', 'email'];
const STATUSES = ['draft', 'live', 'paused', 'closed'];
const CHANNELS = ['link', 'qr', 'whatsapp', 'sms', 'email', 'kiosk', 'embed', 'web'];
const CHANNEL_NAMES = {
  link: 'Survey link', qr: 'QR code', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email',
  kiosk: 'Kiosk', embed: 'Website', web: 'Web',
};
const OTHER = '__other';
const MAX_QUESTIONS = 40;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,62}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9(][0-9 ()-]{5,19}$/;
const CSAT_WORDS = ['Very dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very satisfied'];

const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
const pctOf = (part, whole) => (whole ? round1((part / whole) * 100) : null);
const npsOf = (pro, det, total) => (total ? Math.round(((pro - det) / total) * 100) : null);

/** A string from anywhere, stripped of control characters and cut to size. */
function cleanStr(v, max) {
  return String(v == null ? '' : v)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

/** Text in one or more languages: { en: '…', ur: '…' }. A bare string is the default language's. */
function localized(v, langs, max) {
  const out = {};
  if (typeof v === 'string') {
    const s = cleanStr(v, max);
    if (s) out[langs[0]] = s;
    return out;
  }
  if (v && typeof v === 'object') {
    for (const l of Object.keys(LANGUAGES)) {
      const s = cleanStr(v[l], max);
      if (s) out[l] = s;
    }
  }
  return out;
}
const hasText = (o) => Object.keys(o).length > 0;
/** The text for a language, falling back to English, then to anything. */
const pickText = (o, lang = 'en') => (o && (o[lang] || o.en || Object.values(o)[0])) || '';

function toId(v) {
  return String(v == null ? '' : v).toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}
function uniqueId(base, seen) {
  let id = base || 'x';
  let n = 2;
  while (seen.has(id)) id = `${base.slice(0, 36)}_${n++}`;
  seen.add(id);
  return id;
}
const randomId = (prefix) => `${prefix}_${crypto.randomBytes(4).toString('hex').slice(0, 6)}`;

/* ------------------------------------------------------------------ */
/* Definitions: questions, branching, the survey itself                 */
/* ------------------------------------------------------------------ */

function normalizeItems(list, { max, what, ctx, qLabel }) {
  if (!Array.isArray(list) || !list.length) throw bad(`${qLabel} needs at least one ${what}.`);
  if (list.length > max) throw bad(`${qLabel} can have at most ${max} ${what}s.`);
  const seen = new Set([OTHER]);
  return list.map((it, i) => {
    const raw = typeof it === 'string' ? { label: it } : (it || {});
    const label = localized(raw.label, ctx.langs, 160);
    if (!hasText(label)) throw bad(`${qLabel}: ${what} ${i + 1} has no text.`);
    return { id: uniqueId(toId(raw.id) || toId(label.en) || `${what}_${i + 1}`, seen), label };
  });
}

/**
 * A branching rule, checked against the questions BEFORE this one. A rule
 * that points at a later or a deleted question is dropped rather than
 * failing the save: deleting a question in the builder must not make the
 * survey unsaveable, and a rule with nothing to test can only ever hide.
 */
function normalizeCondition(c, byId) {
  if (!c || typeof c !== 'object') return null;
  const src = byId.get(String(c.q || ''));
  if (!src) return null;
  const op = String(c.op || '');
  if (op === 'answered') return { q: src.id, op };
  if (RANGE[src.type]) {
    const [lo, hi] = RANGE[src.type];
    const v = Number(c.v);
    if (!['lte', 'gte', 'eq'].includes(op) || !Number.isInteger(v) || v < lo || v > hi) return null;
    return { q: src.id, op, v };
  }
  if (src.type === 'yesno') {
    return op === 'eq' && typeof c.v === 'boolean' ? { q: src.id, op, v: c.v } : null;
  }
  if (src.type === 'single') {
    const ids = new Set(src.options.map((o) => o.id));
    if (src.allow_other) ids.add(OTHER);
    if ((op === 'eq' || op === 'neq') && ids.has(String(c.v))) return { q: src.id, op, v: String(c.v) };
    if (op === 'in' && Array.isArray(c.v)) {
      const v = [...new Set(c.v.map(String))].filter((x) => ids.has(x));
      return v.length ? { q: src.id, op, v } : null;
    }
    return null;
  }
  if (src.type === 'multi') {
    const ids = new Set(src.options.map((o) => o.id));
    return op === 'includes' && ids.has(String(c.v)) ? { q: src.id, op, v: String(c.v) } : null;
  }
  return null;
}

/** Whether a question with this rule is shown, given the answers so far. Mirrored in the survey app. */
function conditionMet(c, answers) {
  if (!c) return true;
  const a = answers[c.q];
  if (c.op === 'answered') return a !== undefined;
  if (a === undefined) return false;
  const isObj = a !== null && typeof a === 'object';
  switch (c.op) {
    case 'lte': return typeof a === 'number' && a <= c.v;
    case 'gte': return typeof a === 'number' && a >= c.v;
    case 'eq': return isObj ? a.choice === c.v : a === c.v;
    case 'neq': return isObj ? a.choice !== c.v : a !== c.v;
    case 'in': return isObj && Array.isArray(c.v) && c.v.includes(a.choice);
    case 'includes': return isObj && Array.isArray(a.choices) && a.choices.includes(c.v);
    default: return false;
  }
}

function normalizeQuestion(raw, i, ctx) {
  const n = i + 1;
  const label = `Question ${n}`;
  if (!raw || typeof raw !== 'object') throw bad(`${label} is not valid.`);
  const type = String(raw.type || '');
  if (!TYPES.includes(type)) throw bad(`${label} has an unknown type "${cleanStr(type, 30)}".`);
  const title = localized(raw.title, ctx.langs, 300);
  if (!hasText(title)) throw bad(`${label} needs its question text.`);

  // A new question gets a random id, never "q3": answers already stored under
  // a deleted question's id must not be read as answers to its replacement.
  const q = { id: uniqueId(toId(raw.id) || randomId('q'), ctx.ids), type, title, required: raw.required === true };
  const help = localized(raw.help, ctx.langs, 300);
  if (hasText(help)) q.help = help;

  if (type === 'csat') q.style = raw.style === 'stars' ? 'stars' : 'emoji';
  if (type === 'rating_grid') q.rows = normalizeItems(raw.rows, { max: 12, what: 'row', ctx, qLabel: label });
  if (type === 'single' || type === 'multi') {
    q.options = normalizeItems(raw.options, { max: 20, what: 'option', ctx, qLabel: label });
    if (raw.allow_other === true) q.allow_other = true;
  }
  if (type === 'yesno' && raw.metric === 'resolved') q.metric = 'resolved';
  if (type === 'text') q.multiline = raw.multiline !== false;
  if (type === 'contact') {
    const f = Array.isArray(raw.fields) ? CONTACT_FIELDS.filter((x) => raw.fields.includes(x)) : [];
    q.fields = f.length ? f : ['name', 'phone'];
  }
  const cond = normalizeCondition(raw.show_if, ctx.byId);
  if (cond) q.show_if = cond;
  ctx.byId.set(q.id, q);
  return q;
}

function normalizeQuestions(list, ctx) {
  if (!Array.isArray(list) || !list.length) throw bad('A survey needs at least one question.');
  if (list.length > MAX_QUESTIONS) throw bad(`A survey can have at most ${MAX_QUESTIONS} questions.`);
  return list.map((q, i) => normalizeQuestion(q, i, ctx));
}

function normalizeLanguages(v) {
  const list = Array.isArray(v) ? [...new Set(v.map(String))].filter((l) => LANGUAGES[l]) : [];
  return list.length ? list : ['en'];
}

function normalizeLocations(list) {
  if (list == null || list === '') return [];
  if (!Array.isArray(list)) throw bad('Locations must be a list.');
  if (list.length > 200) throw bad('A survey can have at most 200 locations.');
  const seen = new Set();
  return list.map((it, i) => {
    const raw = typeof it === 'string' ? { name: it } : (it || {});
    const name = cleanStr(raw.name, 120);
    if (!name) throw bad(`Location ${i + 1} needs a name.`);
    return { id: uniqueId(toId(raw.id) || toId(name) || `location_${i + 1}`, seen), name };
  });
}

function normalizeContent(v, langs) {
  const src = v && typeof v === 'object' ? v : {};
  const out = {};
  const intro = localized(src.intro, langs, 600);
  if (hasText(intro)) out.intro = intro;
  const thanks = localized(src.thanks, langs, 600);
  if (hasText(thanks)) out.thanks = thanks;
  if (src.skip_intro === true) out.skip_intro = true;
  return out;
}

function httpsUrl(v, field) {
  const s = cleanStr(v, 500);
  if (!s) return '';
  let u;
  try { u = new URL(s); } catch { throw bad(`${field} is not a valid web address.`); }
  if (u.protocol !== 'https:') throw bad(`${field} must be an https:// address.`);
  return u.toString();
}

function emailList(v) {
  const list = String(v == null ? '' : v).split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  for (const e of list) if (!EMAIL_RE.test(e)) throw bad(`"${cleanStr(e, 80)}" is not an email address.`);
  if (list.length > 10) throw bad('Up to 10 alert addresses.');
  return [...new Set(list.map((e) => e.toLowerCase()))].join(', ');
}

const EDITABLE = ['title', 'status', 'industry', 'languages', 'default_language', 'display_name', 'brand_color',
  'logo_url', 'content', 'questions', 'locations', 'review_url', 'alert_emails', 'closes_at', 'response_limit'];

/**
 * The whole definition, validated. `base` is the survey as it stands (or the
 * template, for a new one); `input` is whatever the caller wants changed.
 */
function normalizeSurvey(input, base) {
  const src = { ...base };
  for (const k of EDITABLE) if (input && Object.prototype.hasOwnProperty.call(input, k)) src[k] = input[k];

  const languages = normalizeLanguages(src.languages);
  const defaultLanguage = languages.includes(src.default_language) ? src.default_language : languages[0];
  const ctx = { langs: [defaultLanguage, ...languages.filter((l) => l !== defaultLanguage)], ids: new Set(), byId: new Map() };

  const title = cleanStr(src.title, 160);
  if (!title) throw bad('Give the survey a name.');
  if (!STATUSES.includes(src.status)) throw bad(`Status must be one of ${STATUSES.join(', ')}.`);
  const brand = String(src.brand_color || '#2f56d9').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(brand)) throw bad('Brand colour must be a hex colour such as #2f56d9.');

  let closesAt = null;
  if (src.closes_at) {
    const d = new Date(src.closes_at);
    if (Number.isNaN(d.getTime())) throw bad('The closing date is not a valid date.');
    closesAt = d.toISOString();
  }
  let limit = null;
  if (src.response_limit !== undefined && src.response_limit !== null && src.response_limit !== '') {
    limit = Number(src.response_limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000000) throw bad('The response limit must be a whole number above zero.');
  }

  return {
    title,
    status: src.status,
    industry: templateByKey(src.industry) ? src.industry : 'general',
    languages,
    default_language: defaultLanguage,
    display_name: cleanStr(src.display_name, 120),
    brand_color: brand.toLowerCase(),
    logo_url: httpsUrl(src.logo_url, 'The logo address'),
    content: normalizeContent(src.content, ctx.langs),
    questions: normalizeQuestions(src.questions, ctx),
    locations: normalizeLocations(src.locations),
    review_url: httpsUrl(src.review_url, 'The review link'),
    alert_emails: emailList(src.alert_emails),
    closes_at: closesAt,
    response_limit: limit,
  };
}

/* ------------------------------------------------------------------ */
/* Reading and writing surveys                                          */
/* ------------------------------------------------------------------ */

function slugBase(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '');
}

/** A new public address: the business's name and a random tail nobody can guess. */
async function uniqueSlug(name) {
  const base = slugBase(name);
  for (let i = 0; i < 8; i++) {
    const tail = crypto.randomBytes(3).toString('hex').slice(0, 5);
    const slug = base.length >= 2 ? `${base}-${tail}` : `survey-${tail}`;
    const { rows } = await db.query(`select 1 from surveys where slug = $1`, [slug]);
    if (!rows[0]) return slug;
  }
  return `survey-${crypto.randomBytes(6).toString('hex')}`;
}

async function getSurvey(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const { rows } = await db.query(
    `select s.*, c.company, c.email as client_email, c.surveys_enabled as client_surveys_enabled
       from surveys s join clients c on c.id = s.client_id where s.id = $1`, [id]);
  return rows[0] || null;
}

async function getSurveyBySlug(slug) {
  const s = String(slug || '').toLowerCase();
  if (!SLUG_RE.test(s)) return null;
  const { rows } = await db.query(
    `select s.*, c.company, c.email as client_email, c.surveys_enabled as client_surveys_enabled
       from surveys s join clients c on c.id = s.client_id where s.slug = $1`, [s]);
  return rows[0] || null;
}

/**
 * Surveys on or off for one client — the admin's switch (PATCH
 * /api/clients/:id/surveys). Off pauses every survey the client has for
 * respondents and refuses their portal, API and after-chat invites; the
 * surveys and every answer already given are kept, so switching back on
 * picks up where it left off. Returns the client's new state, or null.
 */
async function setSurveysEnabled(clientId, enabled, by = '') {
  if (!/^[0-9a-f-]{36}$/i.test(String(clientId || ''))) return null;
  const { rows } = await db.query(
    `update clients
        set surveys_enabled = $2,
            surveys_enabled_at = case when $2 and not surveys_enabled then now() else surveys_enabled_at end,
            surveys_enabled_by = case when $2 and not surveys_enabled then $3 else surveys_enabled_by end
      where id = $1
      returning id, company, surveys_enabled, surveys_enabled_at, surveys_enabled_by,
                (select count(*)::int from surveys where client_id = $1) as surveys,
                (select count(*)::int from surveys where client_id = $1 and status = 'live') as live_surveys`,
    [clientId, !!enabled, cleanStr(by, 200)]
  );
  return rows[0] || null;
}

async function getClient(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
  const { rows } = await db.query(`select id, company, name, email, surveys_enabled from clients where id = $1`, [id]);
  return rows[0] || null;
}

/** A new survey from a template, for one client. */
async function createSurvey({ client, template, input = {}, createdBy = '' }) {
  const tpl = templateByKey(template || 'general');
  if (!tpl) throw bad(`There is no "${cleanStr(template, 40)}" template.`);
  const def = normalizeSurvey(input, {
    title: `${tpl.name} survey`,
    status: 'live',
    industry: tpl.key,
    // Both languages by default: most respondents here read Urdu more easily,
    // and the one who does not taps English. A survey can drop either.
    languages: ['en', 'ur'],
    default_language: 'en',
    display_name: client.company,
    brand_color: '#2f56d9',
    logo_url: '',
    content: tpl.content,
    questions: tpl.questions,
    locations: [],
    review_url: '',
    alert_emails: client.email && EMAIL_RE.test(client.email) ? client.email : '',
    closes_at: null,
    response_limit: null,
  });
  const slug = input.slug ? checkSlug(input.slug) : await uniqueSlug(def.display_name || client.company);
  try {
    const { rows } = await db.query(
      `insert into surveys (client_id, slug, title, industry, status, languages, default_language, display_name,
         brand_color, logo_url, content, questions, locations, review_url, alert_emails, closes_at, response_limit, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) returning id`,
      [client.id, slug, def.title, def.industry, def.status, def.languages, def.default_language, def.display_name,
        def.brand_color, def.logo_url, JSON.stringify(def.content), JSON.stringify(def.questions),
        JSON.stringify(def.locations), def.review_url, def.alert_emails, def.closes_at, def.response_limit,
        cleanStr(createdBy, 200)]
    );
    return getSurvey(rows[0].id);
  } catch (err) {
    if (err.code === '23505') throw new SurveyError(409, 'That survey address is already taken. Choose another.');
    throw err;
  }
}

function checkSlug(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!SLUG_RE.test(s)) {
    throw bad('The survey address can use lower-case letters, numbers and hyphens (3 to 63 characters).');
  }
  return s;
}

async function updateSurvey(survey, input = {}) {
  const def = normalizeSurvey(input, survey);
  const slug = input.slug !== undefined && input.slug !== survey.slug ? checkSlug(input.slug) : survey.slug;
  try {
    await db.query(
      `update surveys set slug=$2, title=$3, industry=$4, status=$5, languages=$6, default_language=$7, display_name=$8,
         brand_color=$9, logo_url=$10, content=$11, questions=$12, locations=$13, review_url=$14, alert_emails=$15,
         closes_at=$16, response_limit=$17
       where id=$1`,
      [survey.id, slug, def.title, def.industry, def.status, def.languages, def.default_language, def.display_name,
        def.brand_color, def.logo_url, JSON.stringify(def.content), JSON.stringify(def.questions),
        JSON.stringify(def.locations), def.review_url, def.alert_emails, def.closes_at, def.response_limit]
    );
  } catch (err) {
    if (err.code === '23505') throw new SurveyError(409, 'That survey address is already taken. Choose another.');
    throw err;
  }
  return getSurvey(survey.id);
}

async function duplicateSurvey(survey, createdBy = '') {
  // A new address, never the original's: `slug` left out so one is made.
  const copy = { ...survey, slug: undefined, title: `${survey.title} (copy)`.slice(0, 160), status: 'draft' };
  const client = { id: survey.client_id, company: survey.company, email: survey.client_email };
  return createSurvey({ client, template: survey.industry, input: copy, createdBy });
}

async function deleteSurvey(survey) {
  // Responses, invites and views go with it (on delete cascade), and so do
  // the csat_responses rows they wrote — the dashboards then stop counting a
  // survey that no longer exists, rather than keeping orphaned scores.
  await db.query(`delete from surveys where id = $1`, [survey.id]);
}

/**
 * VantriqAI's own surveys, made by npm run seed-internal on the internal
 * account like any customer's:
 *
 *   vantriqai-feedback  "Customer feedback" — a live survey to open on a
 *                       phone the moment an install is up, answer, and watch
 *                       arrive in the CRM.
 *   vantriqai-chat      "After a WhatsApp chat" — three taps, the one the
 *                       WhatsApp agent's after-chat flow in n8n sends
 *                       (defaultSurveyFor prefers an after-chat survey).
 *
 * Each is made ONCE. Its settings column records that it was, and is claimed
 * before the survey is made, so pausing, renaming or deleting it afterwards
 * is final: no later deploy brings it back. An account that already has a
 * survey of that kind gets none. If making one fails, its claim is undone
 * and the next run tries again.
 */
const OWN_SURVEY_SLUG = 'vantriqai-feedback';
const OWN_CHAT_SURVEY_SLUG = 'vantriqai-chat';

const OWN_SURVEYS = [
  {
    flag: 'own_survey_at', slug: OWN_SURVEY_SLUG, template: 'professional', title: 'Customer feedback',
    // An account already using surveys has chosen its own.
    has: `select count(*)::int as n from surveys where client_id = $1`,
    hasReason: 'the account already has surveys',
  },
  {
    flag: 'own_chat_survey_at', slug: OWN_CHAT_SURVEY_SLUG, template: 'support_chat', title: 'After a WhatsApp chat',
    has: `select count(*)::int as n from surveys where client_id = $1 and industry = 'support_chat'`,
    hasReason: 'the account already has an after-chat survey',
  },
];

async function ensureOwnSurvey(client, spec = OWN_SURVEYS[0]) {
  // Surveys are an add-on even for our own account: none are made, and the
  // one-time claim is not spent, until it has them switched on.
  if (client.surveys_enabled === false) return { created: false, reason: 'surveys are not switched on for this account' };
  // spec.flag is one of the fixed column names above, never input.
  const { rows: claim } = await db.query(
    `update settings set ${spec.flag} = now() where id = 1 and ${spec.flag} is null
     returning internal_invoice_email`
  );
  if (!claim[0]) return { created: false, reason: 'made once already' };
  try {
    const { rows: has } = await db.query(spec.has, [client.id]);
    if (has[0].n) return { created: false, reason: spec.hasReason };
    const base = publicBase(null);
    const survey = await createSurvey({
      client,
      template: spec.template,
      input: {
        // The memorable address if it is free, a made-up one if not.
        slug: (await getSurveyBySlug(spec.slug)) ? undefined : spec.slug,
        title: spec.title,
        status: 'live',
        // Unhappy answers go to the mailbox our own invoices go to — the one
        // the company is sure to read — not the account's placeholder address.
        alert_emails: claim[0].internal_invoice_email || client.email || '',
        logo_url: base.startsWith('https://') ? `${base}/brand/mark.svg` : '',
      },
      createdBy: 'seed-internal',
    });
    return { created: true, survey, url: `${base}/s/${survey.slug}` };
  } catch (err) {
    await db.query(`update settings set ${spec.flag} = null where id = 1`).catch(() => {});
    throw err;
  }
}

/** Both of VantriqAI's own surveys, in order; one failing never stops the other. */
async function ensureOwnSurveys(client) {
  const out = [];
  for (const spec of OWN_SURVEYS) {
    try {
      out.push({ slug: spec.slug, ...(await ensureOwnSurvey(client, spec)) });
    } catch (err) {
      out.push({ slug: spec.slug, created: false, error: err.message });
    }
  }
  return out;
}

const isClosed = (s) => s.status === 'closed' || (s.closes_at && new Date(s.closes_at) < new Date());

/** Roughly how long a survey takes, for "takes about a minute". */
function estimateMinutes(questions) {
  const secs = (questions || []).reduce((t, q) => t + ({
    csat: 5, nps: 6, ces: 5, rating: 5, yesno: 4, single: 6, multi: 9, text: 25, contact: 20,
  }[q.type] || (q.type === 'rating_grid' ? 4 * (q.rows || []).length : 6)), 0);
  return Math.max(1, Math.round(secs / 60));
}

/** What a respondent's browser receives: the survey, and nothing internal. */
function publicSurvey(s) {
  return {
    slug: s.slug,
    // Surveys switched off for the client pause every survey they have.
    status: s.client_surveys_enabled === false && s.status === 'live' ? 'paused' : s.status,
    closed: !!isClosed(s),
    industry: s.industry,
    display_name: s.display_name || s.company || '',
    brand_color: s.brand_color,
    logo_url: s.logo_url,
    languages: s.languages,
    default_language: s.default_language,
    content: s.content || {},
    questions: s.questions || [],
    locations: s.locations || [],
    review_url: s.review_url,
    estimated_minutes: estimateMinutes(s.questions),
  };
}

/* ------------------------------------------------------------------ */
/* Links: the public address, QR codes, the invite message              */
/* ------------------------------------------------------------------ */

/**
 * Where respondents are sent: the public portal address — customer-facing,
 * and the same whether the link was made in the CRM, the portal or by n8n.
 * SURVEY_BASE_URL (or PORTAL_URL) overrides it.
 *
 * Never the Host a request happened to arrive on, in production: n8n on the
 * VPS calls this app by its container name, http://crm_app:8080, and an
 * invite link built from that would reach nobody. Only a local run (no
 * NODE_ENV=production, an ordinary host such as 127.0.0.1) links to itself,
 * so a developer's QR codes open their own copy.
 */
function publicBase(req) {
  const configured = process.env.SURVEY_BASE_URL || process.env.PORTAL_URL;
  if (configured) return configured.replace(/\/+$/, '');
  const PORTAL = 'https://portal.vantriqai.com';
  const host = String((req && req.headers && req.headers.host) || '').toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  const containerName = !!hostname && !hostname.includes('.') && hostname !== 'localhost';
  if (process.env.NODE_ENV === 'production' || !host || containerName || /(^|\.)vantriqai\.com$/.test(hostname)) return PORTAL;
  const proto = String((req.headers['x-forwarded-proto'] || '')).split(',')[0].trim()
    || (req.socket && req.socket.encrypted ? 'https' : 'http');
  return `${proto}://${host}`;
}

function linksFor(survey, base) {
  const url = `${base}/s/${survey.slug}`;
  const loc = (l) => `loc=${encodeURIComponent(l.id)}`;
  return {
    url,
    qr_url: `${url}?ch=qr`,
    qr_svg: `${url}/qr.svg`,
    poster: `${url}/poster`,
    kiosk: `${url}?kiosk=1`,
    preview: `${url}?preview=1`,
    embed: `<iframe src="${url}?ch=embed" title="${escapeHtml(survey.display_name || 'Feedback')}" style="width:100%;height:680px;border:0;border-radius:16px;" loading="lazy"></iframe>`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(inviteMessage(survey, `${url}?ch=whatsapp`).en)}`,
    locations: (survey.locations || []).map((l) => ({
      id: l.id,
      name: l.name,
      url: `${url}?${loc(l)}`,
      qr_url: `${url}?ch=qr&${loc(l)}`,
      qr_svg: `${url}/qr.svg?${loc(l)}`,
      poster: `${url}/poster?${loc(l)}`,
      kiosk: `${url}?kiosk=1&${loc(l)}`,
    })),
  };
}

/** A survey as the builder needs it: the definition, its links, and what can be chosen. */
function withLinks(survey, base) {
  return {
    ...survey,
    links: linksFor(survey, base),
    estimated_minutes: estimateMinutes(survey.questions),
    template: (templateSummaries().find((t) => t.key === survey.industry) || null),
  };
}

/** The text to send with a personal link, ready for WhatsApp, in both languages. */
function inviteMessage(survey, url, { chat = false } = {}) {
  const name = survey.display_name || survey.company || 'us';
  // After a conversation the customer may not have bought anything yet, so
  // it thanks them for the chat rather than for "choosing" the business.
  if (chat) {
    return {
      en: `Thanks for chatting with ${name}! How did we do? It takes less than a minute: ${url}`,
      ur: `${name} سے بات کرنے کا شکریہ! ہماری کارکردگی کیسی رہی؟ اس میں ایک منٹ سے بھی کم وقت لگتا ہے: ${url}`,
    };
  }
  return {
    en: `Thank you for choosing ${name}! Could you tell us how we did? It takes under a minute: ${url}`,
    ur: `${name} کا انتخاب کرنے کا شکریہ! کیا آپ ہمیں بتائیں گے کہ ہماری کارکردگی کیسی رہی؟ اس میں ایک منٹ سے بھی کم وقت لگتا ہے: ${url}`,
  };
}

// ---------------------------------------------------------------------
// After a chat: is it time to ask?
// ---------------------------------------------------------------------

/**
 * The customer a conversation belongs to. n8n names a WhatsApp session
 * `<customer number>-<yyyy-MM-dd>` (one per day — n8n/README.md), so a
 * conversation that runs past midnight is two sessions of one customer.
 * Everything that asks "has this customer…" goes by this, not by the session.
 */
const SESSION_DATE = /-\d{4}-\d{2}-\d{2}$/;
function customerKey(sessionId) {
  return String(sessionId || '').trim().replace(SESSION_DATE, '');
}
// A session of that customer: the key itself, or the key and a date.
const OF_CUSTOMER = (col, keyParam) => `(${col} = ${keyParam} or (length(${col}) = length(${keyParam}) + 11
  and left(${col}, length(${keyParam}) + 1) = ${keyParam} || '-' and ${col} ~ '-[0-9]{4}-[0-9]{2}-[0-9]{2}$'))`;

const DEFAULT_TZ = process.env.SURVEY_TIMEZONE || 'Asia/Karachi';

/**
 * The rules n8n sends with an after-chat invite. All optional — and without
 * quiet_minutes there are none: the webhook asks at once, as it always has.
 *
 *   quiet_minutes   the customer has not written for this long        (required)
 *   min_messages    at least this many answered messages in the last
 *                   day — a lone "hi" is not a conversation           (default 1)
 *   within_hours    their last message is no older than this: WhatsApp
 *                   lets a business write freely for 24 hours after it (default 23)
 *   once_per_days   not if this customer was asked in the last N days (default 0)
 *   send_from,      sending hours, local time, so nobody is woken at
 *   send_until      3 a.m. — outside them the answer is "night", with
 *                   the time to ask again                              (default: any hour)
 *   timezone        for the sending hours                         (default Asia/Karachi)
 */
function chatRules(body = {}) {
  const given = (v) => v !== undefined && v !== null && v !== '';
  if (!given(body.quiet_minutes)) return null;
  const int = (v, name, min, max, dflt) => {
    if (!given(v)) return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number from ${min} to ${max}.`);
    return n;
  };
  const rules = {
    quiet_minutes: int(body.quiet_minutes, 'quiet_minutes', 1, 1380),
    min_messages: int(body.min_messages, 'min_messages', 1, 1000, 1),
    within_hours: int(body.within_hours, 'within_hours', 1, 720, 23),
    once_per_days: int(body.once_per_days, 'once_per_days', 0, 365, 0),
    send_from: int(body.send_from, 'send_from', 0, 23, null),
    send_until: int(body.send_until, 'send_until', 0, 23, null),
    timezone: given(body.timezone) ? String(body.timezone).trim() : DEFAULT_TZ,
  };
  if ((rules.send_from === null) !== (rules.send_until === null)) throw bad('send_from and send_until go together.');
  if (rules.send_from !== null && rules.send_from === rules.send_until) throw bad('send_from and send_until cannot be the same hour.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: rules.timezone });
  } catch {
    throw bad(`"${cleanStr(rules.timezone, 60)}" is not a time zone (for example Asia/Karachi).`);
  }
  return rules;
}

/** The wall clock in a time zone, as numbers. */
function zonedParts(date, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date)) p[x.type] = Number(x.value);
  return p;
}

/** The next moment after `now` that the clock in `tz` reads hour:00. */
function nextLocalHour(now, hour, tz) {
  // A wall-clock time in tz, as an instant: take off the zone's offset.
  const instant = (wall) => {
    const p = zonedParts(new Date(wall), tz);
    return wall - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wall);
  };
  const p = zonedParts(now, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, hour, 0, 0);
  let t = instant(wall);
  if (t <= now.getTime()) t = instant(wall + 86400000);
  return new Date(t);
}

function inSendingHours(now, rules) {
  if (rules.send_from === null) return true;
  const h = zonedParts(now, rules.timezone).hour;
  const { send_from: from, send_until: until } = rules;
  return from < until ? h >= from && h < until : h >= from || h < until;
}

const agoText = (ms) => {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
};

/** Every rule, against what is on record. Read-only; runs inside chatInvite's lock. */
async function chatVerdict(q, { clientId, sessionId, rules, now }) {
  const key = customerKey(sessionId);
  // Every reply the agent sent is a usage event: that is the conversation.
  const { rows: [act] } = await q.query(
    `select max(occurred_at) as last_at,
            coalesce(sum(messages_count) filter (where occurred_at > $3::timestamptz - make_interval(hours => $4)), 0)::int as messages
       from usage_events
      where client_id = $1 and ${OF_CUSTOMER('session_id', '$2')}
        and occurred_at > $3::timestamptz - make_interval(hours => $5)`,
    [clientId, key, now.toISOString(), rules.within_hours, rules.within_hours + 24]
  );
  const lastAt = act.last_at ? new Date(act.last_at) : null;
  const base = { due: false, last_message_at: lastAt ? lastAt.toISOString() : null, messages: act.messages };
  const say = (code, reason, extra = {}) => ({ ...base, code, reason, ...extra });

  if (!lastAt) return say('no_conversation', 'There is no recent conversation with this customer on record.');
  const quiet = now.getTime() - lastAt.getTime();
  if (quiet > rules.within_hours * 3600000) {
    return say('window_closed', `The customer last wrote ${agoText(quiet)} ago — too long ago to message them.`);
  }

  // Asked already — about this conversation (whenever), or this customer
  // lately: never twice within the window, nor within once_per_days.
  const { rows: [prev] } = await q.query(
    `select session_id, created_at from survey_invites
      where client_id = $1 and ${OF_CUSTOMER('session_id', '$2')}
        and (session_id = $3 or created_at > $4::timestamptz - make_interval(hours => $5))
      order by (session_id = $3) desc, created_at desc limit 1`,
    [clientId, key, sessionId, now.toISOString(), Math.max(rules.within_hours, rules.once_per_days * 24)]
  );
  if (prev) {
    if (prev.session_id === sessionId) return say('already_asked', 'This conversation has already been asked about.');
    return say('asked_recently', `This customer was asked ${agoText(now.getTime() - new Date(prev.created_at).getTime())} ago.`);
  }

  if (quiet < rules.quiet_minutes * 60000) {
    return say('still_talking', `The customer wrote ${agoText(quiet)} ago — the conversation may still be going.`);
  }
  if (act.messages < rules.min_messages) {
    return say('too_short', `${act.messages} message${act.messages === 1 ? '' : 's'} — fewer than the ${rules.min_messages} that make a conversation worth asking about.`);
  }
  if (!inSendingHours(now, rules)) {
    const retry = nextLocalHour(now, rules.send_from, rules.timezone);
    if (retry.getTime() >= lastAt.getTime() + rules.within_hours * 3600000) {
      return say('window_closed', 'Outside sending hours, and the WhatsApp window closes before they begin again.');
    }
    const hh = (h) => String(h).padStart(2, '0');
    return say('night', `Outside sending hours (${hh(rules.send_from)}:00–${hh(rules.send_until)}:00 ${rules.timezone}).`,
      { retry_at: retry.toISOString() });
  }
  return { ...base, due: true, code: 'due', reason: 'The conversation has ended.' };
}

/**
 * Asked by n8n about an hour after each reply its WhatsApp agent sends: has
 * this conversation ended, and should the customer be asked about it now?
 *
 * WhatsApp has no "conversation closed" event — the customer just stops
 * writing — but every reply the agent sends is already on record here. So
 * n8n waits, then asks, and the answer is yes exactly once per conversation:
 * the customer has gone quiet, said enough for it to be a conversation, is
 * still inside WhatsApp's 24-hour window, is inside sending hours, and has not
 * been asked already. The customer's number stays with n8n, which has it
 * anyway; nothing here sends it anywhere.
 *
 * Returns the verdict ({ due, code, reason, … }) and, when due and not a dry
 * run, the invite it made.
 */
async function chatInvite({ survey, clientId, sessionId, channel = 'whatsapp', rules, dryRun = false, now = new Date() }) {
  const conn = await db.pool.connect();
  try {
    await conn.query('begin');
    // Two waits for one customer ending in the same minute — two quick
    // messages — must not both hear yes: one decision per customer at a time.
    await conn.query('select pg_advisory_xact_lock(hashtext($1))', [`survey-chat|${clientId}|${customerKey(sessionId)}`]);
    const verdict = await chatVerdict(conn, { clientId, sessionId, rules, now });
    if (!verdict.due || dryRun) {
      await conn.query('rollback');
      return verdict;
    }
    const { rows } = await conn.query(
      `insert into survey_invites (survey_id, client_id, token, session_id, channel) values ($1,$2,$3,$4,$5) returning *`,
      [survey.id, survey.client_id, crypto.randomBytes(12).toString('base64url'), cleanStr(sessionId, 200),
        CHANNELS.includes(channel) ? channel : 'whatsapp']
    );
    await conn.query('commit');
    return { ...verdict, invite: rows[0] };
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** A QR code as SVG. One path, dark modules merged into runs, so it stays small and prints sharp. */
function qrSvg(text, { size = 320, color = '#16151a', background = '#ffffff', margin = 2 } = {}) {
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount();
  const dim = n + margin * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!qr.isDark(r, c)) { c++; continue; }
      let run = 1;
      while (c + run < n && qr.isDark(r, c + run)) run++;
      d += `M${c + margin} ${r + margin}h${run}v1h-${run}z`;
      c += run;
    }
  }
  const safe = (v, dflt) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : dflt);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code">`
    + `<rect width="${dim}" height="${dim}" fill="${safe(background, '#ffffff')}"/><path d="${d}" fill="${safe(color, '#16151a')}"/></svg>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ */
/* Answers                                                               */
/* ------------------------------------------------------------------ */

function inRange(raw, lo, hi) {
  const v = Number(raw);
  if (!Number.isInteger(v) || v < lo || v > hi) return { error: `Choose a number from ${lo} to ${hi}.` };
  return { value: v };
}

/** One answer, checked against its question. { value } | { empty } | { error }. */
function normalizeAnswer(q, raw) {
  if (raw === undefined || raw === null || raw === '') return { empty: true };
  switch (q.type) {
    case 'csat': case 'rating': case 'nps': case 'ces':
      return inRange(raw, RANGE[q.type][0], RANGE[q.type][1]);
    case 'rating_grid': {
      if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Expected a rating for each row.' };
      const out = {};
      for (const row of q.rows) {
        const v = raw[row.id];
        if (v === undefined || v === null || v === '') continue;
        const r = inRange(v, 1, 5);
        if (r.error) return r;
        out[row.id] = r.value;
      }
      return Object.keys(out).length ? { value: out } : { empty: true };
    }
    case 'single': {
      const obj = typeof raw === 'object' ? raw : { choice: raw };
      const choice = String(obj.choice == null ? '' : obj.choice);
      if (!choice) return { empty: true };
      if (choice === OTHER) {
        if (!q.allow_other) return { error: 'That is not one of the options.' };
        const other = cleanStr(obj.other, 200);
        return other ? { value: { choice, other } } : { error: 'Tell us what your answer is.' };
      }
      if (!q.options.some((o) => o.id === choice)) return { error: 'That is not one of the options.' };
      return { value: { choice } };
    }
    case 'multi': {
      const obj = Array.isArray(raw) ? { choices: raw } : (typeof raw === 'object' ? raw : { choices: [raw] });
      const ids = new Set(q.options.map((o) => o.id));
      if (q.allow_other) ids.add(OTHER);
      const list = Array.isArray(obj.choices) ? [...new Set(obj.choices.map(String))] : [];
      if (list.some((x) => !ids.has(x))) return { error: 'That is not one of the options.' };
      if (!list.length) return { empty: true };
      const out = { choices: list };
      if (list.includes(OTHER)) {
        const other = cleanStr(obj.other, 200);
        if (!other) return { error: 'Tell us what your answer is.' };
        out.other = other;
      }
      return { value: out };
    }
    case 'yesno':
      if (raw === true || raw === 'yes' || raw === 'true') return { value: true };
      if (raw === false || raw === 'no' || raw === 'false') return { value: false };
      return { error: 'Expected yes or no.' };
    case 'text': {
      const s = cleanStr(raw, 2000);
      return s ? { value: s } : { empty: true };
    }
    case 'contact': {
      if (typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Expected contact details.' };
      const out = {};
      for (const f of q.fields) {
        const s = cleanStr(raw[f], f === 'email' ? 200 : 120);
        if (s) out[f] = s;
      }
      if (out.email && !EMAIL_RE.test(out.email)) return { error: 'That email address does not look right.' };
      if (out.phone && !PHONE_RE.test(out.phone)) return { error: 'That phone number does not look right.' };
      if (!Object.keys(out).length) return { empty: true };
      out.consent = raw.consent === true;
      return { value: out };
    }
    default:
      return { empty: true };
  }
}

/**
 * Every answer checked, in question order, with branching applied as it
 * goes: a question is only asked — and only required — when its rule holds
 * on the answers before it. Whatever was sent for a hidden question is dropped.
 */
function normalizeAnswers(questions, raw) {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const answers = {};
  const errors = [];
  for (const q of questions) {
    if (q.show_if && !conditionMet(q.show_if, answers)) continue;
    const r = normalizeAnswer(q, src[q.id]);
    if (r.error) { errors.push({ question: q.id, error: r.error }); continue; }
    if (r.empty) {
      if (q.required) errors.push({ question: q.id, error: 'This question needs an answer.' });
      continue;
    }
    answers[q.id] = r.value;
  }
  return { answers, errors };
}

/** The headline figures, lifted out of the answers. The first question of each kind is the headline. */
function metricsOf(questions, answers) {
  const m = { score: null, nps: null, ces: null, resolved: null, comment: '', contact: null };
  const texts = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined) continue;
    if (q.type === 'csat' && m.score == null) m.score = a;
    else if (q.type === 'nps' && m.nps == null) m.nps = a;
    else if (q.type === 'ces' && m.ces == null) m.ces = a;
    else if (q.type === 'yesno' && q.metric === 'resolved' && m.resolved == null) m.resolved = a;
    else if (q.type === 'text') texts.push(a);
    else if (q.type === 'contact' && !m.contact) m.contact = a;
  }
  m.comment = texts.join('\n\n').slice(0, 2000);
  return m;
}

/** Unhappy enough that somebody should get back to them. */
const needsFollowUp = (m) => (m.score != null && m.score <= 2) || (m.nps != null && m.nps <= 6) || m.resolved === false;
const isPromoter = (r) => (r.nps != null ? r.nps >= 9 : r.score === 5);

/** An answer in words, for exports and alert emails. */
function answerText(q, a, lang = 'en') {
  const t = (o) => pickText(o, lang);
  const opt = (id) => {
    if (id === OTHER) return 'Other';
    const o = (q.options || []).find((x) => x.id === id);
    return o ? t(o.label) : id;
  };
  try {
    switch (q.type) {
      case 'csat': return `${a} / 5 — ${CSAT_WORDS[a - 1] || ''}`.trim();
      case 'rating': return `${a} / 5`;
      case 'nps': return `${a} / 10`;
      case 'ces': return `${a} / 7`;
      case 'rating_grid': return (q.rows || []).filter((r) => a[r.id] != null).map((r) => `${t(r.label)}: ${a[r.id]}/5`).join('; ');
      case 'single': return a.choice === OTHER ? `Other: ${a.other}` : opt(a.choice);
      case 'multi': return a.choices.map((c) => (c === OTHER ? `Other: ${a.other}` : opt(c))).join(', ');
      case 'yesno': return a ? 'Yes' : 'No';
      case 'text': return String(a);
      case 'contact': return ['name', 'company', 'phone', 'email'].filter((f) => a[f]).map((f) => a[f]).join(' · ')
        + (a.consent ? ' (happy to be contacted)' : '');
      default: return typeof a === 'object' ? JSON.stringify(a) : String(a);
    }
  } catch {
    // The question changed shape after this answer was given.
    return typeof a === 'object' ? JSON.stringify(a) : String(a);
  }
}

function readableAnswers(survey, answers, lang = 'en') {
  return (survey.questions || [])
    .filter((q) => answers && answers[q.id] !== undefined)
    .map((q) => ({ question_id: q.id, type: q.type, question: pickText(q.title, lang).replace(/\{business\}/g, survey.display_name || survey.company || ''), answer: answerText(q, answers[q.id], lang) }));
}

/* ------------------------------------------------------------------ */
/* Recording a response                                                 */
/* ------------------------------------------------------------------ */

/**
 * One completed survey, stored — and, if it carries a headline figure,
 * mirrored into csat_responses in the same transaction, so the dashboards
 * and the survey's own results can never disagree about whether it counted.
 *
 * A retry with the same submission_id returns the first response instead of
 * storing a second: phones on a patchy connection resend.
 */
async function recordResponse(survey, body = {}, { invite = null } = {}) {
  if (survey.status === 'draft') throw new SurveyError(409, 'This survey is not open yet.');
  if (survey.status === 'paused' || survey.client_surveys_enabled === false) {
    throw new SurveyError(409, 'This survey is paused just now. Please try again later.');
  }
  if (isClosed(survey)) throw new SurveyError(410, 'This survey has closed. Thank you for your interest.');

  const { answers, errors } = normalizeAnswers(survey.questions || [], body.answers);
  if (errors.length) throw bad('Some answers need another look.', errors);
  if (!Object.keys(answers).length) throw bad('Answer at least one question before sending.');

  const m = metricsOf(survey.questions, answers);
  const loc = (survey.locations || []).find((l) => l.id === String(body.location || '')) || null;
  const channel = invite ? invite.channel : (CHANNELS.includes(body.channel) ? body.channel : 'link');
  const language = (survey.languages || []).includes(body.language) ? body.language : survey.default_language;
  const submissionId = /^[A-Za-z0-9_-]{8,64}$/.test(String(body.submission_id || '')) ? String(body.submission_id) : null;
  const ms = Number(body.duration_ms);
  const duration = Number.isFinite(ms) && ms >= 0 ? Math.min(86400, Math.round(ms / 1000)) : null;
  const contact = m.contact || {};

  const conn = await db.pool.connect();
  try {
    await conn.query('begin');
    if (survey.response_limit) {
      const { rows } = await conn.query(`select count(*)::int as n from survey_responses where survey_id = $1`, [survey.id]);
      if (rows[0].n >= survey.response_limit) throw new SurveyError(410, 'This survey has all the answers it needs. Thank you!');
    }
    const { rows } = await conn.query(
      `insert into survey_responses (survey_id, client_id, submission_id, answers, score, nps, ces, resolved, comment,
         location_id, location_name, channel, language, contact_name, contact_phone, contact_email, contact_consent,
         duration_sec, followup_status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       on conflict (survey_id, submission_id) where submission_id is not null do nothing
       returning *`,
      [survey.id, survey.client_id, submissionId, JSON.stringify(answers), m.score, m.nps, m.ces, m.resolved, m.comment,
        loc ? loc.id : '', loc ? loc.name : '', channel, language,
        contact.name || '', contact.phone || '', contact.email || '', contact.consent === true,
        duration, needsFollowUp(m) ? 'open' : 'none']
    );
    if (!rows[0]) {
      await conn.query('rollback');
      const { rows: prev } = await db.query(
        `select * from survey_responses where survey_id = $1 and submission_id = $2`, [survey.id, submissionId]);
      return { response: prev[0], duplicate: true };
    }
    const response = rows[0];

    if (m.score != null || m.nps != null || m.resolved != null) {
      await conn.query(
        `insert into csat_responses (client_id, session_id, channel, score, nps, resolved, comment, source,
           external_id, responded_at, survey_response_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [survey.client_id, invite ? invite.session_id : '', channel, m.score, m.nps, m.resolved, m.comment,
          `survey:${survey.slug}`.slice(0, 120), `survey:${response.id}`, response.submitted_at, response.id]
      );
    }
    if (invite) {
      const { rowCount } = await conn.query(
        `update survey_invites set responded_at = now(), response_id = $1, opened_at = coalesce(opened_at, now())
          where id = $2 and response_id is null`,
        [response.id, invite.id]
      );
      if (!rowCount) throw new SurveyError(409, 'This link has already been used to answer. Thank you!');
    }
    await conn.query('commit');
    return { response, duplicate: false };
  } catch (err) {
    await conn.query('rollback').catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Tells the survey's alert list, the moment it arrives, that a customer was
 * unhappy — with what they said and how to reach them. Best-effort: a mail
 * outage must never cost the response that was just stored.
 */
async function notifyUnhappy(survey, response) {
  if (!mailConfigured()) return false;
  const to = String(survey.alert_emails || '').split(/[,;\s]+/).filter(Boolean);
  if (!to.length) return false;
  const name = survey.display_name || survey.company || 'your business';
  const bits = [];
  if (response.score != null) bits.push(`satisfaction ${response.score}/5`);
  if (response.nps != null) bits.push(`likely to recommend ${response.nps}/10`);
  if (response.resolved === false) bits.push('problem not resolved');
  const where = response.location_name ? ` at ${response.location_name}` : '';
  const subject = `Unhappy customer${where} — ${bits.join(', ')}`;
  const lines = readableAnswers(survey, response.answers);
  const who = [response.contact_name, response.contact_phone, response.contact_email].filter(Boolean).join(' · ');
  const reach = who
    ? `${who}${response.contact_consent ? ' — asked to be contacted' : ''}`
    : 'They did not leave contact details.';
  const portal = (process.env.PORTAL_URL || 'https://portal.vantriqai.com').replace(/\/+$/, '');
  const text = [
    `A customer${where} just gave ${name} a low score in "${survey.title}".`,
    '',
    ...lines.map((l) => `${l.question}\n  ${l.answer}`),
    '',
    `Contact: ${reach}`,
    '',
    `Open the survey's follow-ups: ${portal}/#surveys`,
  ].join('\n');
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;color:#16151a;">
      <p style="font-size:15px;">A customer${escapeHtml(where)} just gave <b>${escapeHtml(name)}</b> a low score in <b>${escapeHtml(survey.title)}</b>.</p>
      <table style="border-collapse:collapse;width:100%;font-size:13.5px;">
        ${lines.map((l) => `<tr><td style="padding:8px 10px;border-bottom:1px solid #eee;color:#6b645b;vertical-align:top;width:45%;">${escapeHtml(l.question)}</td><td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:600;">${escapeHtml(l.answer)}</td></tr>`).join('')}
      </table>
      <p style="font-size:13.5px;margin-top:16px;"><b>Contact:</b> ${escapeHtml(reach)}</p>
      <p style="margin:20px 0;"><a href="${escapeHtml(portal)}/#surveys" style="background:#2f56d9;color:#fff;padding:11px 18px;border-radius:999px;text-decoration:none;font-weight:600;">Open follow-ups</a></p>
      <p style="font-size:12px;color:#8d857a;">Sent by VantriqAI because this address is on the survey's alert list.</p>
    </div>`;
  await Promise.all(to.map((addr) => sendMail({ to: addr, subject, text, html })));
  return true;
}

/* ------------------------------------------------------------------ */
/* Invites and views                                                    */
/* ------------------------------------------------------------------ */

async function createInvites(survey, { count = 1, sessionId = '', channel = 'whatsapp' } = {}) {
  const n = Math.min(500, Math.max(1, Number(count) || 1));
  const ch = CHANNELS.includes(channel) ? channel : 'whatsapp';
  const out = [];
  for (let i = 0; i < n; i++) {
    const token = crypto.randomBytes(12).toString('base64url');
    const { rows } = await db.query(
      `insert into survey_invites (survey_id, client_id, token, session_id, channel) values ($1,$2,$3,$4,$5) returning *`,
      [survey.id, survey.client_id, token, cleanStr(sessionId, 200), ch]
    );
    out.push(rows[0]);
  }
  return out;
}

async function findInvite(survey, token) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(String(token || ''))) return null;
  const { rows } = await db.query(`select * from survey_invites where token = $1 and survey_id = $2`, [token, survey.id]);
  return rows[0] || null;
}

async function markInviteOpened(invite) {
  if (invite.opened_at) return;
  await db.query(`update survey_invites set opened_at = now() where id = $1 and opened_at is null`, [invite.id]);
}

/** The survey a client's automation should send after a conversation. */
async function defaultSurveyFor(clientId) {
  const { rows } = await db.query(
    `select s.*, c.company, c.email as client_email, c.surveys_enabled as client_surveys_enabled
       from surveys s join clients c on c.id = s.client_id
      where s.client_id = $1 and c.surveys_enabled and s.status = 'live' and (s.closes_at is null or s.closes_at > now())
      order by (s.industry = 'support_chat') desc, s.updated_at desc limit 1`,
    [clientId]
  );
  return rows[0] || null;
}

// One view per device per survey per day, so a respondent paging back and
// forth, or a page refreshed, is not ten opens.
const seenViews = new Map();
async function countView(survey, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${survey.id}|${ip}`;
  if (seenViews.get(key) === day) return;
  if (seenViews.size > 100000) seenViews.clear();
  seenViews.set(key, day);
  await db.query(
    `insert into survey_views (survey_id, day, views) values ($1, (now() at time zone $2)::date, 1)
     on conflict (survey_id, day) do update set views = survey_views.views + 1`,
    [survey.id, TZ]
  );
}

/* ------------------------------------------------------------------ */
/* Lists, responses and follow-ups                                      */
/* ------------------------------------------------------------------ */

const SUMMARY_SQL = `
  select s.id, s.client_id, s.slug, s.title, s.industry, s.status, s.languages, s.display_name, s.brand_color,
         s.locations, s.closes_at, s.created_at, s.updated_at, c.company, c.surveys_enabled as client_surveys_enabled,
         jsonb_array_length(s.questions)::int as question_count,
         coalesce(st.responses, 0)::int as responses,
         coalesce(st.responses_30d, 0)::int as responses_30d,
         st.last_response_at,
         coalesce(st.csat_n, 0)::int as csat_n, coalesce(st.csat_sat, 0)::int as csat_sat, st.csat_avg,
         coalesce(st.nps_n, 0)::int as nps_n, coalesce(st.nps_pro, 0)::int as nps_pro, coalesce(st.nps_det, 0)::int as nps_det,
         coalesce(st.open_followups, 0)::int as open_followups
    from surveys s
    join clients c on c.id = s.client_id
    left join lateral (
      select count(*) as responses,
             count(*) filter (where r.submitted_at >= now() - interval '30 days') as responses_30d,
             max(r.submitted_at) as last_response_at,
             count(r.score) filter (where r.submitted_at >= now() - interval '30 days') as csat_n,
             count(r.score) filter (where r.submitted_at >= now() - interval '30 days' and r.score >= 4) as csat_sat,
             avg(r.score) filter (where r.submitted_at >= now() - interval '30 days') as csat_avg,
             count(r.nps) filter (where r.submitted_at >= now() - interval '30 days') as nps_n,
             count(r.nps) filter (where r.submitted_at >= now() - interval '30 days' and r.nps >= 9) as nps_pro,
             count(r.nps) filter (where r.submitted_at >= now() - interval '30 days' and r.nps <= 6) as nps_det,
             count(*) filter (where r.followup_status in ('open','contacted')) as open_followups
        from survey_responses r where r.survey_id = s.id
    ) st on true`;

function summaryOf(r, base) {
  return {
    id: r.id, client_id: r.client_id, company: r.company, slug: r.slug, title: r.title, industry: r.industry,
    status: r.status, closed: !!isClosed(r), client_surveys_enabled: r.client_surveys_enabled !== false,
    languages: r.languages, display_name: r.display_name,
    brand_color: r.brand_color, location_count: (r.locations || []).length, question_count: r.question_count,
    created_at: r.created_at, updated_at: r.updated_at,
    responses: r.responses, responses_30d: r.responses_30d, last_response_at: r.last_response_at,
    csat_30d: pctOf(r.csat_sat, r.csat_n), csat_average_30d: r.csat_avg != null ? round2(Number(r.csat_avg)) : null,
    nps_30d: npsOf(r.nps_pro, r.nps_det, r.nps_n), open_followups: r.open_followups,
    ...(base ? { url: `${base}/s/${r.slug}` } : {}),
  };
}

async function listSurveys({ clientId = null, base = '' } = {}) {
  const { rows } = await db.query(
    `${SUMMARY_SQL} where ($1::uuid is null or s.client_id = $1) order by s.created_at desc`, [clientId || null]);
  return rows.map((r) => summaryOf(r, base));
}

/** The numbers above the list: the last 30 days across every survey in view, and who is waiting for a reply. */
async function overview({ clientId = null } = {}) {
  const [tot, follow] = await Promise.all([
    db.query(
      `select count(distinct s.id)::int as surveys,
              count(distinct s.id) filter (where s.status = 'live')::int as live,
              count(r.id) filter (where r.submitted_at >= now() - interval '30 days')::int as responses_30d,
              count(r.id) filter (where r.submitted_at >= now() - interval '60 days' and r.submitted_at < now() - interval '30 days')::int as responses_prev_30d,
              count(r.score) filter (where r.submitted_at >= now() - interval '30 days')::int as csat_n,
              count(r.score) filter (where r.submitted_at >= now() - interval '30 days' and r.score >= 4)::int as csat_sat,
              count(r.nps) filter (where r.submitted_at >= now() - interval '30 days')::int as nps_n,
              count(r.nps) filter (where r.submitted_at >= now() - interval '30 days' and r.nps >= 9)::int as nps_pro,
              count(r.nps) filter (where r.submitted_at >= now() - interval '30 days' and r.nps <= 6)::int as nps_det,
              count(r.id) filter (where r.followup_status = 'open')::int as open,
              count(r.id) filter (where r.followup_status = 'contacted')::int as contacted
         from surveys s left join survey_responses r on r.survey_id = s.id
        where ($1::uuid is null or s.client_id = $1)`,
      [clientId || null]
    ),
    db.query(
      `select r.id, r.survey_id, s.title as survey_title, s.slug, c.company, r.score, r.nps, r.resolved, r.comment,
              r.location_name, r.contact_name, r.contact_phone, r.contact_email, r.contact_consent,
              r.followup_status, r.submitted_at
         from survey_responses r join surveys s on s.id = r.survey_id join clients c on c.id = r.client_id
        where r.followup_status in ('open','contacted') and ($1::uuid is null or r.client_id = $1)
        order by (r.followup_status = 'open') desc, r.submitted_at desc limit 20`,
      [clientId || null]
    ),
  ]);
  const t = tot.rows[0];
  return {
    surveys: t.surveys, live: t.live,
    responses_30d: t.responses_30d, responses_prev_30d: t.responses_prev_30d,
    csat_30d: pctOf(t.csat_sat, t.csat_n), csat_responses_30d: t.csat_n,
    nps_30d: npsOf(t.nps_pro, t.nps_det, t.nps_n), nps_responses_30d: t.nps_n,
    followups: { open: t.open, contacted: t.contacted },
    followup_queue: follow.rows,
  };
}

function formatResponse(survey, r) {
  return {
    id: r.id,
    submitted_at: r.submitted_at,
    score: r.score, nps: r.nps, ces: r.ces, resolved: r.resolved,
    comment: r.comment,
    location: r.location_id ? { id: r.location_id, name: r.location_name } : null,
    channel: r.channel, channel_name: CHANNEL_NAMES[r.channel] || r.channel,
    language: r.language,
    duration_sec: r.duration_sec,
    contact: (r.contact_name || r.contact_phone || r.contact_email)
      ? { name: r.contact_name, phone: r.contact_phone, email: r.contact_email, consent: r.contact_consent } : null,
    followup: { status: r.followup_status, note: r.followup_note, by: r.followup_by, at: r.followup_at },
    answers: r.answers,
    readable: readableAnswers(survey, r.answers),
  };
}

const FILTERS = {
  all: 'true',
  unhappy: '(r.score <= 2 or r.nps <= 6 or r.resolved = false)',
  happy: '(r.score >= 4 or r.nps >= 9)',
  followup: `r.followup_status in ('open','contacted')`,
  comments: `r.comment <> ''`,
  contact: `(r.contact_phone <> '' or r.contact_email <> '')`,
};

async function responsesPage(survey, { limit = 25, offset = 0, filter = 'all', location = '', q = '', since = null } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 25));
  const off = Math.max(0, Number(offset) || 0);
  const where = [`r.survey_id = $1`, FILTERS[filter] || FILTERS.all];
  const params = [survey.id];
  if (location) { params.push(String(location)); where.push(`r.location_id = $${params.length}`); }
  if (q) {
    params.push(`%${String(q).replace(/[\\%_]/g, (c) => `\\${c}`).slice(0, 100)}%`);
    where.push(`(r.comment ilike $${params.length} or r.contact_name ilike $${params.length} or r.answers::text ilike $${params.length})`);
  }
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw bad('since is not a valid date.');
    params.push(d.toISOString());
    where.push(`r.submitted_at > $${params.length}`);
  }
  const sql = where.join(' and ');
  const [{ rows }, { rows: cnt }] = await Promise.all([
    db.query(`select r.* from survey_responses r where ${sql} order by r.submitted_at desc limit ${lim} offset ${off}`, params),
    db.query(`select count(*)::int as n from survey_responses r where ${sql}`, params),
  ]);
  return { total: cnt[0].n, limit: lim, offset: off, items: rows.map((r) => formatResponse(survey, r)) };
}

const FOLLOWUP = ['none', 'open', 'contacted', 'resolved'];
async function setFollowUp(survey, responseId, { status, note }, actor) {
  if (!/^[0-9a-f-]{36}$/i.test(String(responseId || ''))) throw new SurveyError(404, 'Response not found');
  if (status !== undefined && !FOLLOWUP.includes(status)) throw bad(`Follow-up status must be one of ${FOLLOWUP.join(', ')}.`);
  const { rows } = await db.query(
    `update survey_responses
        set followup_status = coalesce($3, followup_status),
            followup_note = coalesce($4, followup_note),
            followup_by = $5, followup_at = now()
      where id = $1 and survey_id = $2 returning *`,
    [responseId, survey.id, status === undefined ? null : status, note === undefined ? null : cleanStr(note, 2000), cleanStr(actor, 200)]
  );
  if (!rows[0]) throw new SurveyError(404, 'Response not found');
  return formatResponse(survey, rows[0]);
}

/* ------------------------------------------------------------------ */
/* Analytics                                                             */
/* ------------------------------------------------------------------ */

// Words that say nothing about WHAT people mean: grammar, and the praise and
// complaint words themselves ("good", "bad"), which the scores already carry.
// English, Roman Urdu as people type it, and Urdu script.
const STOP = new Set(`
the and for was were are but not you your our with very too had have has this that they them their there from just get got
all any can could would should will its also more much some been being what when where which who why how than then into out
about over only really good great nice bad excellent best well like liked love loved thanks thank please everything nothing
one did didnt dont doesnt isnt wasnt was its im ive its it's i'm i've don't didn't can't cant won't wont it i me my we us
so if or as at by on in of to a an is be do am no yes okay ok fine overall experience time
didn doesn wasn isn couldn wouldn shouldn haven hasn aren weren
hai hain tha thi the ka ki ke ko se mein main mai me aur bhi nahi nahin nhi bohat bohot bahut bht bhot acha achha accha
achi achhi bura buri kya koi kuch yeh ye woh wo jo tou to par pe hum ap aap apka apki apke hamara hamari sab bas zyada
kam hota hoti hote kar karo kiya gaya gayi raha rahi rahe wala wali wale ho hy hn ha sy ky thy hua hui
ہے ہیں تھا تھی تھے کا کی کے کو سے میں اور بھی نہیں بہت اچھا اچھی برا بری کیا کوئی کچھ یہ وہ جو تو پر ہم آپ سب بس
زیادہ کم ہوتا ہوتی ہوتے کر گیا گئی رہا رہی رہے والا والی والے ہو ایک لیے ساتھ اس ان جب تک بعد پہلے اپنے اپنی کہ ہی نے
`.split(/\s+/).filter(Boolean));

/** The words people use most, counted once per answer. Plain frequency — labelled as such, not "AI". */
function themesOf(texts, max = 8) {
  const counts = new Map();
  for (const t of texts) {
    const seen = new Set();
    for (const raw of String(t || '').toLowerCase().match(/[\p{L}\p{M}']+/gu) || []) {
      const w = raw.replace(/^'+|'+$/g, '');
      const urdu = /[؀-ۿ]/.test(w);
      if (w.length < (urdu ? 2 : 3) || STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      counts.set(w, (counts.get(w) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max)
    .map(([word, n]) => ({ word, n }));
}

function questionStats(survey, rows) {
  return (survey.questions || []).map((q) => {
    const vals = rows.map((r) => r.answers && r.answers[q.id]).filter((v) => v !== undefined && v !== null);
    const base = { id: q.id, type: q.type, title: q.title, answered: 0 };
    if (RANGE[q.type]) {
      const [lo, hi] = RANGE[q.type];
      const nums = vals.filter((v) => Number.isInteger(v) && v >= lo && v <= hi);
      const distribution = [];
      for (let v = lo; v <= hi; v++) distribution.push({ value: v, n: 0 });
      nums.forEach((v) => { distribution[v - lo].n += 1; });
      const out = { ...base, answered: nums.length, distribution, average: nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null };
      if (q.type === 'nps') {
        const pro = nums.filter((v) => v >= 9).length;
        const det = nums.filter((v) => v <= 6).length;
        Object.assign(out, { promoters: pro, passives: nums.length - pro - det, detractors: det, nps: npsOf(pro, det, nums.length) });
      }
      if (q.type === 'csat' || q.type === 'rating') out.satisfied_pct = pctOf(nums.filter((v) => v >= 4).length, nums.length);
      return out;
    }
    if (q.type === 'rating_grid') {
      const objs = vals.filter((v) => typeof v === 'object' && !Array.isArray(v));
      return {
        ...base,
        answered: objs.length,
        rows: (q.rows || []).map((row) => {
          const nums = objs.map((o) => o[row.id]).filter((v) => Number.isInteger(v) && v >= 1 && v <= 5);
          const distribution = [1, 2, 3, 4, 5].map((v) => ({ value: v, n: nums.filter((x) => x === v).length }));
          return { id: row.id, label: row.label, answered: nums.length, distribution,
            average: nums.length ? round2(nums.reduce((a, b) => a + b, 0) / nums.length) : null };
        }),
      };
    }
    if (q.type === 'single' || q.type === 'multi') {
      const objs = vals.filter((v) => typeof v === 'object');
      const picks = objs.map((v) => (q.type === 'single' ? [v.choice] : (Array.isArray(v.choices) ? v.choices : [])));
      const options = (q.options || []).map((o) => {
        const n = picks.filter((p) => p.includes(o.id)).length;
        return { id: o.id, label: o.label, n, pct: pctOf(n, objs.length) };
      });
      const otherN = picks.filter((p) => p.includes(OTHER)).length;
      if (q.allow_other || otherN) options.push({ id: OTHER, label: { en: 'Other', ur: 'دیگر' }, n: otherN, pct: pctOf(otherN, objs.length) });
      return { ...base, answered: objs.length, options,
        other_samples: objs.filter((v) => v.other).slice(0, 5).map((v) => v.other) };
    }
    if (q.type === 'yesno') {
      const yes = vals.filter((v) => v === true).length;
      const no = vals.filter((v) => v === false).length;
      return { ...base, answered: yes + no, yes, no, yes_pct: pctOf(yes, yes + no) };
    }
    if (q.type === 'text') {
      const withText = rows.filter((r) => r.answers && typeof r.answers[q.id] === 'string');
      return { ...base, answered: withText.length,
        samples: withText.slice(0, 6).map((r) => ({ text: r.answers[q.id], score: r.score, nps: r.nps, submitted_at: r.submitted_at })),
        themes: themesOf(withText.map((r) => r.answers[q.id])) };
    }
    if (q.type === 'contact') {
      const objs = vals.filter((v) => typeof v === 'object');
      return { ...base, answered: objs.length, consented: objs.filter((v) => v.consent).length };
    }
    return base;
  });
}

function surveyInsights({ period, kpis, window, questions, locations, followups, themes }) {
  const out = [];
  const cur = period.current_label.toLowerCase();
  const k = kpis;
  if (k.csat.current != null) {
    if (k.csat.delta_pts != null && Math.abs(k.csat.delta_pts) >= 3) {
      out.push({ tone: k.csat.delta_pts > 0 ? 'up' : 'down',
        text: `${k.csat.current}% of customers were satisfied ${cur}, ${k.csat.delta_pts > 0 ? 'up' : 'down'} ${Math.abs(k.csat.delta_pts)} points on ${period.previous_label} at the same point.` });
    } else {
      out.push({ tone: 'info', text: `${k.csat.current}% of customers were satisfied ${cur} (${k.csat.responses} answer${k.csat.responses === 1 ? '' : 's'}).` });
    }
  }
  if (window.nps != null && window.nps_responses >= 5) {
    out.push({ tone: window.nps >= 30 ? 'up' : window.nps < 0 ? 'down' : 'info',
      text: `Net Promoter Score is ${window.nps > 0 ? '+' : ''}${window.nps} over the ${period.window_label.toLowerCase()} — ${window.promoters} promoter${window.promoters === 1 ? '' : 's'} against ${window.detractors} detractor${window.detractors === 1 ? '' : 's'}.` });
  }
  const g = questions.find((q) => q.type === 'rating_grid' && q.rows.some((r) => r.answered >= 3));
  if (g) {
    const rated = g.rows.filter((r) => r.answered >= 3).sort((a, b) => a.average - b.average);
    if (rated.length >= 2 && rated[rated.length - 1].average - rated[0].average >= 0.3) {
      out.push({ tone: 'warn', text: `Weakest rated: ${pickText(rated[0].label)} (${rated[0].average} / 5). Strongest: ${pickText(rated[rated.length - 1].label)} (${rated[rated.length - 1].average} / 5).` });
    }
  }
  const locs = locations.filter((l) => l.csat != null && l.csat_n >= 5);
  if (locs.length >= 2) {
    const sorted = locs.slice().sort((a, b) => a.csat - b.csat);
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    if (hi.csat - lo.csat >= 10) {
      out.push({ tone: 'warn', text: `${lo.name} trails at ${lo.csat}% satisfied, against ${hi.csat}% at ${hi.name}.` });
    }
  }
  if (themes.unhappy.length) {
    out.push({ tone: 'info', text: `Unhappy customers most often mention: ${themes.unhappy.slice(0, 4).map((t) => `“${t.word}”`).join(', ')}.` });
  }
  if (followups.open > 0) {
    out.push({ tone: 'warn', text: `${followups.open} unhappy customer${followups.open === 1 ? ' is' : 's are'} waiting for somebody to get back to them.` });
  }
  if (window.views >= 20 && window.completion_rate != null && window.completion_rate < 35) {
    out.push({ tone: 'warn', text: `Only ${window.completion_rate}% of the people who opened the survey finished it. A shorter survey usually fixes that.` });
  }
  return out.slice(0, 7);
}

/**
 * Everything the survey's results page shows, for one grain. Periods and
 * like-for-like comparisons work exactly as the Analytics dashboards do —
 * this month so far against last month up to the same point.
 */
async function surveyAnalytics(survey, { grain } = {}) {
  grain = normaliseGrain(grain);
  const g = GRAINS[grain];
  const b = await periodBounds(grain);

  const AGG = (f) => `
    count(r.id) filter (where ${f})::int as responses,
    count(r.score) filter (where ${f})::int as csat_n,
    count(r.score) filter (where ${f} and r.score >= 4)::int as csat_sat,
    avg(r.score) filter (where ${f}) as csat_avg,
    count(r.nps) filter (where ${f})::int as nps_n,
    count(r.nps) filter (where ${f} and r.nps >= 9)::int as nps_pro,
    count(r.nps) filter (where ${f} and r.nps <= 6)::int as nps_det,
    count(r.ces) filter (where ${f})::int as ces_n,
    avg(r.ces) filter (where ${f}) as ces_avg,
    count(r.resolved) filter (where ${f})::int as res_n,
    count(r.resolved) filter (where ${f} and r.resolved)::int as res_yes`;
  const suffix = (sql, s) => sql.replace(/ as (\w+)/g, ` as $1_${s}`);

  const [seriesR, kpiR, viewsR, invitesR, rowsR, followR] = await Promise.all([
    db.query(
      `select to_char(bk, 'YYYY-MM-DD') as bucket, ${AGG('r.id is not null')}
         from generate_series($3::timestamp, $4::timestamp, $5::interval) bk
         left join survey_responses r
           on r.survey_id = $1 and r.submitted_at >= $2
          and date_trunc($6, r.submitted_at at time zone $7) = bk
        group by bk order by bk`,
      [survey.id, b.window_start, b.window_local, b.cur_local, g.step, grain, TZ]
    ),
    db.query(
      `select ${suffix(AGG('r.submitted_at >= $2'), 'cur')},
              ${suffix(AGG('r.submitted_at >= $3 and r.submitted_at < $4'), 'prev')},
              ${suffix(AGG('true'), 'win')}
         from survey_responses r where r.survey_id = $1 and r.submitted_at >= $5`,
      [survey.id, b.cur_start, b.prev_start, b.prev_point, b.window_start]
    ),
    db.query(
      `select coalesce(sum(views) filter (where day >= ($2::timestamptz at time zone $4)::date), 0)::int as cur,
              coalesce(sum(views), 0)::int as win
         from survey_views where survey_id = $1 and day >= ($3::timestamptz at time zone $4)::date`,
      [survey.id, b.cur_start, b.window_start, TZ]
    ),
    db.query(
      `select count(*)::int as sent, count(opened_at)::int as opened, count(response_id)::int as answered
         from survey_invites where survey_id = $1 and created_at >= $2`,
      [survey.id, b.window_start]
    ),
    db.query(
      `select answers, score, nps, ces, resolved, comment, location_id, location_name, channel, submitted_at
         from survey_responses where survey_id = $1 and submitted_at >= $2
        order by submitted_at desc limit 20000`,
      [survey.id, b.window_start]
    ),
    db.query(
      `select followup_status as s, count(*)::int as n from survey_responses
        where survey_id = $1 and followup_status <> 'none' group by 1`,
      [survey.id]
    ),
  ]);

  const k = kpiR.rows[0];
  const diff = (a, c) => (a != null && c != null ? round1(a - c) : null);
  const delta = (cur, prev) => (prev > 0 ? round1(((cur - prev) / prev) * 100) : (cur > 0 ? null : 0));
  const csatCur = pctOf(k.csat_sat_cur, k.csat_n_cur);
  const csatPrev = pctOf(k.csat_sat_prev, k.csat_n_prev);
  const npsCur = npsOf(k.nps_pro_cur, k.nps_det_cur, k.nps_n_cur);
  const npsPrev = npsOf(k.nps_pro_prev, k.nps_det_prev, k.nps_n_prev);
  const resCur = pctOf(k.res_yes_cur, k.res_n_cur);
  const resPrev = pctOf(k.res_yes_prev, k.res_n_prev);
  const views = viewsR.rows[0];
  const inv = invitesR.rows[0];
  const rows = rowsR.rows;

  const period = {
    current_label: GRAINS[grain].current,
    previous_label: GRAINS[grain].previous,
    window_label: GRAINS[grain].window,
    current_start: b.cur_start,
    previous_start: b.prev_start,
    compared_to: b.prev_point,
    elapsed_pct: Math.round(b.elapsed_frac * 100),
  };
  const kpis = {
    responses: { current: k.responses_cur, previous: k.responses_prev, delta_pct: delta(k.responses_cur, k.responses_prev) },
    csat: { current: csatCur, previous: csatPrev, delta_pts: diff(csatCur, csatPrev),
      average: k.csat_avg_cur != null ? round2(Number(k.csat_avg_cur)) : null, responses: k.csat_n_cur },
    nps: { current: npsCur, previous: npsPrev, delta_pts: diff(npsCur, npsPrev), responses: k.nps_n_cur },
    ces: { average: k.ces_avg_cur != null ? round2(Number(k.ces_avg_cur)) : null, responses: k.ces_n_cur,
      previous_average: k.ces_avg_prev != null ? round2(Number(k.ces_avg_prev)) : null },
    resolution: { current: resCur, previous: resPrev, delta_pts: diff(resCur, resPrev), responses: k.res_n_cur },
    completion: { views: views.cur, responses: k.responses_cur, rate: views.cur ? Math.min(100, pctOf(k.responses_cur, views.cur)) : null },
  };
  const window = {
    responses: k.responses_win,
    views: views.win,
    completion_rate: views.win ? Math.min(100, pctOf(k.responses_win, views.win)) : null,
    csat: pctOf(k.csat_sat_win, k.csat_n_win), csat_average: k.csat_avg_win != null ? round2(Number(k.csat_avg_win)) : null,
    csat_responses: k.csat_n_win,
    nps: npsOf(k.nps_pro_win, k.nps_det_win, k.nps_n_win), nps_responses: k.nps_n_win,
    promoters: k.nps_pro_win, passives: k.nps_n_win - k.nps_pro_win - k.nps_det_win, detractors: k.nps_det_win,
    ces_average: k.ces_avg_win != null ? round2(Number(k.ces_avg_win)) : null,
    resolution: pctOf(k.res_yes_win, k.res_n_win),
  };

  // Where, and through what, the answers came in — over the window.
  const locName = new Map((survey.locations || []).map((l) => [l.id, l.name]));
  const byLoc = new Map();
  const byChannel = new Map();
  for (const r of rows) {
    const key = r.location_id || '';
    if (!byLoc.has(key)) byLoc.set(key, { id: key, name: key ? (locName.get(key) || r.location_name || key) : 'Not specified', responses: 0, csat_n: 0, csat_sat: 0, csat_sum: 0, nps_n: 0, pro: 0, det: 0 });
    const l = byLoc.get(key);
    l.responses += 1;
    if (r.score != null) { l.csat_n += 1; l.csat_sum += r.score; if (r.score >= 4) l.csat_sat += 1; }
    if (r.nps != null) { l.nps_n += 1; if (r.nps >= 9) l.pro += 1; if (r.nps <= 6) l.det += 1; }
    byChannel.set(r.channel, (byChannel.get(r.channel) || 0) + 1);
  }
  const locations = [...byLoc.values()]
    .filter((l) => l.id || (survey.locations || []).length)
    .map((l) => ({ id: l.id, name: l.name, responses: l.responses, csat: pctOf(l.csat_sat, l.csat_n), csat_n: l.csat_n,
      csat_average: l.csat_n ? round2(l.csat_sum / l.csat_n) : null, nps: npsOf(l.pro, l.det, l.nps_n), nps_n: l.nps_n }))
    .sort((a, b2) => b2.responses - a.responses);
  const channels = [...byChannel.entries()].map(([channel, n]) => ({ channel, name: CHANNEL_NAMES[channel] || channel, responses: n }))
    .sort((a, b2) => b2.responses - a.responses);

  const followups = { open: 0, contacted: 0, resolved: 0 };
  for (const f of followR.rows) followups[f.s] = f.n;

  const texts = (pred) => rows.filter(pred).map((r) => r.comment).filter(Boolean);
  const themes = {
    // The same line as a follow-up: a 3 of 5 is neutral, not unhappy.
    unhappy: themesOf(texts((r) => (r.score != null && r.score <= 2) || (r.nps != null && r.nps <= 6) || r.resolved === false)),
    happy: themesOf(texts((r) => (r.score != null && r.score >= 4) || (r.nps != null && r.nps >= 9))),
  };
  const questions = questionStats(survey, rows);

  return {
    grain,
    time_zone: TZ,
    generated_at: new Date().toISOString(),
    period,
    survey: { id: survey.id, slug: survey.slug, title: survey.title, display_name: survey.display_name, status: survey.status },
    kpis,
    window,
    series: seriesR.rows.map((r) => ({
      bucket: r.bucket, responses: r.responses,
      csat: pctOf(r.csat_sat, r.csat_n), csat_average: r.csat_avg != null ? round2(Number(r.csat_avg)) : null,
      nps: npsOf(r.nps_pro, r.nps_det, r.nps_n),
    })),
    questions,
    locations,
    channels,
    invites: { sent: inv.sent, opened: inv.opened, answered: inv.answered, response_rate: pctOf(inv.answered, inv.sent) },
    followups,
    themes,
    insights: surveyInsights({ period, kpis, window, questions, locations, followups, themes }),
    sampled: rows.length >= 20000,
  };
}

/* ------------------------------------------------------------------ */
/* Export                                                                */
/* ------------------------------------------------------------------ */

/** Every response as a spreadsheet: one row per response, one column per question (per row, for grids). */
async function exportWorkbook(survey) {
  const { rows } = await db.query(
    `select * from survey_responses where survey_id = $1 order by submitted_at desc limit 100000`, [survey.id]);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VantriqAI';
  wb.created = new Date();
  const ws = wb.addWorksheet('Responses', { views: [{ state: 'frozen', ySplit: 1 }] });

  const cols = [
    { header: 'Submitted', key: 'submitted', width: 20 },
    { header: 'Location', key: 'location', width: 18 },
    { header: 'Channel', key: 'channel', width: 12 },
    { header: 'Language', key: 'language', width: 10 },
    { header: 'CSAT (1–5)', key: 'score', width: 11 },
    { header: 'NPS (0–10)', key: 'nps', width: 11 },
    { header: 'Effort (1–7)', key: 'ces', width: 11 },
    { header: 'Resolved', key: 'resolved', width: 10 },
  ];
  const qcols = [];
  for (const q of survey.questions || []) {
    const title = pickText(q.title).replace(/\{business\}/g, survey.display_name || '');
    if (q.type === 'rating_grid') {
      for (const r of q.rows) qcols.push({ key: `${q.id}.${r.id}`, header: `${title} — ${pickText(r.label)}`, get: (a) => (a && a[q.id] ? a[q.id][r.id] : undefined) });
    } else if (q.type === 'contact') {
      for (const f of q.fields) qcols.push({ key: `${q.id}.${f}`, header: `Contact — ${f}`, get: (a) => (a && a[q.id] ? a[q.id][f] : undefined) });
      qcols.push({ key: `${q.id}.consent`, header: 'Contact — happy to be contacted', get: (a) => (a && a[q.id] ? (a[q.id].consent ? 'Yes' : 'No') : undefined) });
    } else {
      qcols.push({ key: q.id, header: title, get: (a) => (a && a[q.id] !== undefined ? answerText(q, a[q.id]) : undefined) });
    }
  }
  qcols.forEach((c) => cols.push({ header: c.header, key: c.key, width: Math.min(45, Math.max(14, c.header.length * 0.9)) }));
  cols.push({ header: 'Follow-up', key: 'followup', width: 12 }, { header: 'Follow-up note', key: 'note', width: 30 });
  ws.columns = cols;

  for (const r of rows) {
    const row = {
      submitted: new Date(r.submitted_at),
      location: r.location_name || '',
      channel: CHANNEL_NAMES[r.channel] || r.channel,
      language: (LANGUAGES[r.language] || {}).name || r.language,
      score: r.score, nps: r.nps, ces: r.ces,
      resolved: r.resolved == null ? '' : (r.resolved ? 'Yes' : 'No'),
      followup: r.followup_status === 'none' ? '' : r.followup_status,
      note: r.followup_note || '',
    };
    for (const c of qcols) {
      const v = c.get(r.answers);
      // Written as plain values — exceljs stores a string as text, never as a
      // formula, so an answer beginning "=" cannot run in the reader's Excel.
      if (v !== undefined) row[c.key] = v;
    }
    ws.addRow(row);
  }
  ws.getColumn('submitted').numFmt = 'dd mmm yyyy hh:mm';
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 32;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };

  const sum = wb.addWorksheet('Summary');
  const s = await surveyAnalytics(survey, { grain: 'year' });
  sum.columns = [{ header: 'Measure', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 22 }];
  [
    ['Survey', survey.title],
    ['Business', survey.display_name || survey.company],
    ['Public address', `/s/${survey.slug}`],
    ['Responses (all time)', rows.length],
    [`Satisfied, ${s.period.window_label.toLowerCase()}`, s.window.csat == null ? '—' : `${s.window.csat}%`],
    ['Average satisfaction (1–5)', s.window.csat_average == null ? '—' : s.window.csat_average],
    ['Net Promoter Score', s.window.nps == null ? '—' : s.window.nps],
    ['Average effort (1–7)', s.window.ces_average == null ? '—' : s.window.ces_average],
    ['Resolved', s.window.resolution == null ? '—' : `${s.window.resolution}%`],
    ['Exported', new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'],
  ].forEach(([k2, v]) => sum.addRow({ k: k2, v }));
  sum.getRow(1).font = { bold: true };

  return wb.xlsx.writeBuffer();
}

module.exports = {
  SurveyError, LANGUAGES, TYPES, CHANNELS, CHANNEL_NAMES, SLUG_RE,
  templateSummaries,
  normalizeSurvey, normalizeAnswers, conditionMet, metricsOf, needsFollowUp, isPromoter, themesOf, answerText,
  getSurvey, getSurveyBySlug, getClient, setSurveysEnabled, createSurvey, updateSurvey, duplicateSurvey, deleteSurvey,
  OWN_SURVEY_SLUG, OWN_CHAT_SURVEY_SLUG, ensureOwnSurvey, ensureOwnSurveys,
  isClosed, publicSurvey, publicBase, linksFor, withLinks, inviteMessage, qrSvg, escapeHtml, estimateMinutes,
  customerKey, chatRules, chatVerdict, chatInvite, nextLocalHour, inSendingHours,
  recordResponse, notifyUnhappy, createInvites, findInvite, markInviteOpened, defaultSurveyFor, countView,
  listSurveys, overview, responsesPage, setFollowUp, surveyAnalytics, exportWorkbook, readableAnswers,
};
