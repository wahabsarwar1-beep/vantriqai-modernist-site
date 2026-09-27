const express = require('express');
const S = require('../utils/surveys');
const { clientIp } = require('../utils/clientIp');

/**
 * The survey API a respondent's phone talks to — mounted at /api/public, with
 * no sign-in, by design: anybody holding the link may answer.
 *
 * What protects the CRM instead: only a survey's own public fields leave
 * (never the client, the alert list or any response), every answer is
 * validated against the definition on the server, a retry is recognised
 * rather than counted twice, a hidden honeypot field catches the dumbest
 * bots, and each device is rate-limited per survey.
 *
 * The survey page itself, its QR codes and posters are routes/surveyPages.js.
 */
const router = express.Router();

/** A fixed-window counter per key, in memory — one app instance, so memory is the right place. */
function rateLimit({ windowMs, max, key }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let e = hits.get(k);
    if (!e || now - e.start > windowMs) { e = { start: now, n: 0 }; hits.set(k, e); }
    e.n += 1;
    if (e.n > max) {
      res.set('Retry-After', String(Math.ceil((e.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Too many answers from this device just now. Please try again in a few minutes.' });
    }
    next();
  };
}

// A kiosk tablet at a counter sends every customer's answers from one
// address, so the per-survey allowance is generous; the per-device one caps a
// script hopping between surveys.
const PER_SURVEY = Number(process.env.SURVEY_RATE_LIMIT || 30);
const TEN_MINUTES = 10 * 60 * 1000;
const limitSurvey = rateLimit({ windowMs: TEN_MINUTES, max: PER_SURVEY, key: (req) => `${clientIp(req)}|${String(req.params.slug || '').toLowerCase()}` });
const limitDevice = rateLimit({ windowMs: TEN_MINUTES, max: PER_SURVEY * 4, key: (req) => clientIp(req) });

/** The survey as a respondent sees it — its public fields only. Drafts only with ?preview=1. */
router.get('/surveys/:slug', async (req, res) => {
  const survey = await S.getSurveyBySlug(req.params.slug);
  if (!survey || (survey.status === 'draft' && req.query.preview !== '1')) {
    return res.status(404).json({ error: 'Survey not found' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ survey: S.publicSurvey(survey) });
});

/**
 * One completed survey. Body: { answers: { <question id>: <answer> },
 * submission_id, language, location, channel, invite, duration_ms }. 201 for
 * a new response, 200 with duplicate:true for a retry, 400 with a
 * per-question `details` list when an answer does not fit its question.
 */
router.post('/surveys/:slug/responses', limitDevice, limitSurvey, async (req, res) => {
  const body = req.body || {};
  const survey = await S.getSurveyBySlug(req.params.slug);
  if (!survey) return res.status(404).json({ error: 'Survey not found' });

  // The honeypot: a field no person can see or fill. A bot that fills every
  // input is told it succeeded, and nothing is stored.
  if (body.website) return res.status(201).json({ ok: true });

  let invite = null;
  if (body.invite) {
    invite = await S.findInvite(survey, body.invite);
    if (invite && invite.response_id) {
      return res.status(409).json({ error: 'This link has already been used to answer. Thank you!', already_answered: true });
    }
    // An unknown token (a link cut short in a forwarded message) still has
    // its answers recorded — just not tied to a conversation.
  }

  const { response, duplicate } = await S.recordResponse(survey, body, { invite });
  if (!duplicate && response.followup_status === 'open') {
    S.notifyUnhappy(survey, response).catch((err) => console.error('Survey alert email failed', err));
  }
  res.status(duplicate ? 200 : 201).json({
    ok: true,
    id: response.id,
    duplicate,
    followup: response.followup_status === 'open',
    review_url: S.isPromoter(response) && survey.review_url ? survey.review_url : null,
  });
});

module.exports = router;
