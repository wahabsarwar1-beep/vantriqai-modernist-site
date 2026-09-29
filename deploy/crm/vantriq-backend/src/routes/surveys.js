const express = require('express');
const S = require('../utils/surveys');

/**
 * Surveys, for the two audiences that manage them — one router, mounted
 * twice, so a customer and the staff looking after that customer can never
 * see different versions of the same survey:
 *
 *   /api/surveys          staff: every client's surveys (?client_id= to narrow)
 *   /api/portal/surveys   a signed-in customer: their own surveys, nothing else
 *
 * Which audience a request is from is decided by who authenticated it: the
 * portal mount runs behind requirePortalSession, which sets req.portalClient;
 * the staff mount never does. A customer's every read and write is pinned to
 * that one client.
 *
 * Respondents never come through here; they use routes/publicSurveyApi.js and
 * routes/surveyPages.js, which know nothing about sessions or clients.
 */
const router = express.Router();

const isPortal = (req) => !!req.portalClient;

// Surveys are an add-on an admin switches on per client (PATCH
// /api/clients/:id/surveys). A customer without it is refused on every
// survey route, and the portal does not show the tab at all.
router.use((req, res, next) => {
  if (isPortal(req) && !req.portalClient.surveys_enabled) {
    return res.status(403).json({
      error: 'Vantriq Echo (customer-satisfaction surveys) is not switched on for your account. Ask Vantriq AI to turn it on.',
      code: 'surveys_disabled',
    });
  }
  next();
});

// Staff can read a switched-off client's surveys and answers, but not start
// anything new for them: no new survey, copy or personal links.
function mustBeOn(client) {
  if (client && client.surveys_enabled === false) {
    throw new S.SurveyError(403, `Customer-satisfaction surveys are not switched on for ${client.company}. `
      + 'An admin turns them on from the client\'s page in the CRM (Clients → the client → Customer-satisfaction surveys).');
  }
}
const clientOf = (survey) => ({ company: survey.company, surveys_enabled: survey.client_surveys_enabled });

// Who a change is recorded against, in words a person reading the record understands.
function actor(req) {
  if (isPortal(req)) return `${req.portalClient.company} (portal)`;
  if (req.user) return req.user.email;
  return 'API key';
}

// A customer only ever reaches their own surveys: anything else is "not
// found", never "forbidden", so ids cannot be probed for existence.
async function load(req) {
  const s = await S.getSurvey(req.params.id);
  if (!s || (isPortal(req) && s.client_id !== req.portalClient.id)) throw new S.SurveyError(404, 'Survey not found');
  return s;
}

function scopeId(req) {
  if (isPortal(req)) return req.portalClient.id;
  const id = req.query.client_id ? String(req.query.client_id) : null;
  if (id && !/^[0-9a-f-]{36}$/i.test(id)) throw new S.SurveyError(400, 'client_id is not a valid id.');
  return id;
}

/**
 * The Echo workbook: satisfaction, NPS, every survey and answer, who
 * answered (gender, age group, city), follow-ups and respondents — for one
 * client (the portal's own, or ?client_id= in the CRM) or every client.
 */
router.get('/report.xlsx', async (req, res) => {
  const { echoReport, sendReport } = require('../utils/analyticsReport');
  const grain = String(req.query.grain || 'month');
  let client = null;
  if (isPortal(req)) client = req.portalClient;
  else {
    const id = scopeId(req);
    if (id) {
      client = await S.getClient(id);
      if (!client) throw new S.SurveyError(404, 'Client not found');
    }
  }
  sendReport(res, await echoReport(client, { grain }));
});

/** Echo's dashboard: every survey in view together, by period — trends, scores, funnel, breakdowns, findings. */
router.get('/dashboard', async (req, res) => {
  const { echoDashboard } = require('../utils/echoDashboard');
  res.json(await echoDashboard({ clientId: scopeId(req), grain: String(req.query.grain || 'month') }));
});

/** The industry template gallery: restaurant, FMCG, telecom, healthcare and the rest. */
router.get('/templates', (req, res) => res.json(S.templateSummaries()));

/** Every survey in view, with its last 30 days of results and its public address. */
router.get('/', async (req, res) => {
  const base = S.publicBase(req);
  res.json({ base_url: base, surveys: await S.listSurveys({ clientId: scopeId(req), base }) });
});

/** Totals across every survey in view, and the unhappy customers still waiting for a reply. */
router.get('/overview', async (req, res) => {
  res.json(await S.overview({ clientId: scopeId(req) }));
});

/** A new survey from an industry template. Staff name the client; a customer's is always their own. */
router.post('/', async (req, res) => {
  const body = req.body || {};
  const clientId = isPortal(req) ? req.portalClient.id : body.client_id;
  if (!clientId) throw new S.SurveyError(400, 'Choose which client this survey is for.');
  const client = await S.getClient(clientId);
  if (!client) throw new S.SurveyError(404, 'Client not found');
  mustBeOn(client);
  const survey = await S.createSurvey({ client, template: body.template, input: body, createdBy: actor(req) });
  res.status(201).json(S.withLinks(survey, S.publicBase(req)));
});

/** The definition, its share links (link, QR, poster, kiosk, embed, per location) and its template. */
router.get('/:id', async (req, res) => {
  res.json(S.withLinks(await load(req), S.publicBase(req)));
});

/** Any change — questions, wording, languages, branding, locations, alerts, status. Validated as a whole. */
router.patch('/:id', async (req, res) => {
  const survey = await load(req);
  res.json(S.withLinks(await S.updateSurvey(survey, req.body || {}), S.publicBase(req)));
});

/** A draft copy of a survey, with a new address. */
router.post('/:id/duplicate', async (req, res) => {
  const survey = await load(req);
  mustBeOn(clientOf(survey));
  const copy = await S.duplicateSurvey(survey, actor(req));
  res.status(201).json(S.withLinks(copy, S.publicBase(req)));
});

/** Deletes the survey and every answer to it. Staff scope, so no automation key can reach it. */
router.delete('/:id', async (req, res) => {
  await S.deleteSurvey(await load(req));
  res.status(204).end();
});

/** Results for a period (grain=day|week|month|quarter|year): KPIs, trend, every question, locations, themes. */
router.get('/:id/analytics', async (req, res) => {
  res.json(await S.surveyAnalytics(await load(req), { grain: String(req.query.grain || 'month') }));
});

/** One page of responses, newest first. filter=all|unhappy|happy|followup|comments|contact, location=, q=. */
router.get('/:id/responses', async (req, res) => {
  const survey = await load(req);
  res.json(await S.responsesPage(survey, {
    limit: req.query.limit, offset: req.query.offset, filter: String(req.query.filter || 'all'),
    location: req.query.location ? String(req.query.location) : '', q: req.query.q ? String(req.query.q) : '',
  }));
});

/** Every response as an Excel workbook, one column per question, with a summary sheet. */
router.get('/:id/responses.xlsx', async (req, res) => {
  const survey = await load(req);
  const buf = await S.exportWorkbook(survey);
  const name = `${survey.slug}-responses-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(Buffer.from(buf));
});

/** Closing the loop on one response: followup_status open → contacted → resolved, and a note. */
router.patch('/:id/responses/:responseId', async (req, res) => {
  const survey = await load(req);
  const body = req.body || {};
  res.json(await S.setFollowUp(survey, req.params.responseId,
    { status: body.followup_status, note: body.followup_note }, actor(req)));
});

/** Personal one-time links (count 1–500): each is answered once and counts towards the response rate. */
router.post('/:id/invites', async (req, res) => {
  const survey = await load(req);
  mustBeOn(clientOf(survey));
  const body = req.body || {};
  const count = Number(body.count || 1);
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new S.SurveyError(400, 'Ask for between 1 and 500 links.');
  const invites = await S.createInvites(survey, { count, channel: body.channel || 'link' });
  const base = S.publicBase(req);
  res.status(201).json({
    invites: invites.map((i) => ({ token: i.token, url: `${base}/s/${survey.slug}?i=${i.token}`, created_at: i.created_at })),
  });
});

module.exports = router;
