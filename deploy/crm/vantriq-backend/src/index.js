require('dotenv').config();
// First, before any router below is built: a rejected promise in any async
// handler becomes a failed request instead of a crashed server (and a 502 for
// everyone while Docker restarts it). See the file for the whole story.
const { errorHandler, installProcessGuards } = require('./utils/asyncErrors');
installProcessGuards();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const { requireScope, requireCeo } = require('./middleware/auth');
const { requireRep } = require('./middleware/repAuth');
const productsRoutes = require('./routes/products');
const clientsRoutes = require('./routes/clients');
const invoicesRoutes = require('./routes/invoices');
const procurementRoutes = require('./routes/procurement');
const expensesRoutes = require('./routes/expenses');
const usageRoutes = require('./routes/usage');
const dashboardRoutes = require('./routes/dashboard');
const analyticsRoutes = require('./routes/analytics');
const contactsRoutes = require('./routes/contacts');
const financialsRoutes = require('./routes/financials');
const settingsRoutes = require('./routes/settings');
const portalRoutes = require('./routes/portal');
const externalApiRoutes = require('./routes/externalApi');
const { requireClientApiToken } = require('./middleware/clientApiAuth');
const repsRoutes = require('./routes/reps');
const repPortalRoutes = require('./routes/repPortal');
const packageRequestsRoutes = require('./routes/packageRequests');
const { router: authRoutes } = require('./routes/auth');
const teamRoutes = require('./routes/team');
const quotaRoutes = require('./routes/quota');
const paymentsRoutes = require('./routes/payments');
const agentsRoutes = require('./routes/agents');
const accountingRoutes = require('./routes/accounting');
const exportRoutes = require('./routes/exportBase');
const subscriptionRoutes = require('./routes/subscriptions');
const quotesRoutes = require('./routes/quotes');
const contractsRoutes = require('./routes/contracts');
const archiveRoutes = require('./routes/archive');
const billingOpsRoutes = require('./routes/billingOps');
const surveysRoutes = require('./routes/surveys');
const publicSurveyApiRoutes = require('./routes/publicSurveyApi');
const surveyPagesRoutes = require('./routes/surveyPages');
const costingRoutes = require('./routes/costing');
const pricingDocsRoutes = require('./routes/pricingDocs');
const addonsRoutes = require('./routes/addons');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
// The public survey API answers any origin: a customer may post answers from
// their own website or app. Registered BEFORE the app-wide rule below, which
// would otherwise answer a foreign origin's preflight with a refusal.
app.use('/api/public', cors({ origin: true }));
app.use(cors({ origin: corsOrigin }));
// Document uploads arrive base64-encoded in JSON, so this route needs room
// for a 10 MB file plus a third for the encoding. Everything else stays at
// 1mb — a generous default body limit is a cheap way to be knocked over.
app.use('/api/clients/:id/documents', express.json({ limit: '15mb' }));
// The CEO's business documents: a deck runs to several MB and base64 adds a
// third. A body that size is read only once the request has proven it is the
// CEO — nobody else gets to make the server parse 40 MB.
app.use('/api/pricing/documents', requireScope('admin'), requireCeo, express.json({ limit: '40mb' }));
app.use(express.json({ limit: '1mb' }));

// Health check — no auth, used by hosting platforms and n8n connection tests
// The version comes off package.json rather than a constant someone has to
// remember to bump twice. Reported here so "which build is actually live"
// is a question the box can answer, instead of one inferred from a deploy log.
const APP_VERSION = require('../package.json').version;
app.get('/api/health', (req, res) => res.json({
  ok: true, version: APP_VERSION, time: new Date().toISOString(),
}));

// Internal employee sign-in: company email + password, then a one-time code
// emailed to that address. Public by necessity — it is how people get a
// session in the first place. Mounted before the admin-scoped mounts below.
app.use('/api/auth', authRoutes);

// Customer portal: username + password login issuing a session token — see
// src/routes/portal.js and src/middleware/portalAuth.js. Mounted BEFORE the
// generic '/api' admin-scoped mount below (procurementRoutes) so that mount's
// prefix match can't swallow it and force an admin key onto customer requests.
app.use('/api/portal', portalRoutes);

// Sales rep portal: a rep's own key (from sales_reps, not api_keys) — see
// src/middleware/repAuth.js. Same mount-order reasoning as the customer
// portal above: must come before the generic '/api' admin mount.
app.use('/api/rep', requireRep, repPortalRoutes);

// A customer's own read-only token (client_api_tokens, x-client-api-key) for
// THEIR systems to pull THEIR data — generated and revoked by the customer
// themselves via POST/GET/DELETE /api/portal/api-tokens. See
// src/routes/externalApi.js and src/middleware/clientApiAuth.js. Same
// mount-order reasoning as the portals above.
app.use('/api/external', requireClientApiToken, externalApiRoutes);

// Surveys, as respondents reach them: read a survey, send answers. No sign-in
// by design — see src/routes/publicSurveyApi.js for what protects it instead.
// Before the bare '/api' admin mount, for the same reason as the portals.
app.use('/api/public', publicSurveyApiRoutes);

// Everything else under /api/* requires an admin key EXCEPT the usage webhook,
// which accepts a lower-privileged 'webhook' scoped key so n8n never
// holds credentials that can read/edit clients, invoices, or pricing.
app.use('/api/webhooks', requireScope('webhook'), usageRoutes);

// Records an automation may touch. 'automation' is the lowest scope accepted
// here, so staff sessions and the admin key still pass; a webhook key does
// not. n8n uses this to onboard a client and raise the monthly invoice
// without ever holding a credential that can read our financials.
app.use('/api/products', requireScope('automation'), productsRoutes);
app.use('/api/clients', requireScope('automation'), clientsRoutes);
app.use('/api/invoices', requireScope('automation'), invoicesRoutes);
// A client's AI agents and automations. An automation may add one — that is
// how an n8n onboarding flow registers the agent it just deployed.
app.use('/api/agents', requireScope('automation'), agentsRoutes);
// Bundles and scheduled package changes. An automation may add a bundle —
// that is how an n8n flow acts on an upsell the customer agreed to.
app.use('/api/subscriptions', requireScope('automation'), subscriptionRoutes);
// Quotes sit with the rest of the sales work, so staff can raise one.
app.use('/api/quotes', requireScope('staff'), quotesRoutes);
// Contracts carry the counterparty's legal identity, so they sit behind the
// same gate as quotes: staff who work accounts, not automation keys.
app.use('/api/contracts', requireScope('staff'), contractsRoutes);
app.use('/api/calendar', requireScope('staff'), require('./routes/calendar'));
app.use('/api/reps', requireScope('admin'), repsRoutes);
app.use('/api/package-requests', requireScope('staff'), packageRequestsRoutes);
app.use('/api/expenses', requireScope('admin'), expensesRoutes);
app.use('/api/dashboard', requireScope('staff'), dashboardRoutes);
app.use('/api/analytics', requireScope('staff'), analyticsRoutes);
// Our clients' own customers: the directory each client also sees in its portal.
app.use('/api/contacts', requireScope('staff'), contactsRoutes);
// Every client's surveys, their results and follow-ups. The same router is
// mounted for customers at /api/portal/surveys, scoped to their own.
app.use('/api/surveys', requireScope('staff'), surveysRoutes);
app.use('/api/quota', requireScope('staff'), quotaRoutes);
// Revenue against what serving it costs, and the margin by package: the
// price book applied to today's clients, so the CEO's alone (v9.21).
app.use('/api/financials', requireScope('admin'), requireCeo, financialsRoutes);
// What each package costs us to serve and what it earns: the rate card, the
// assumptions, margins, the steady state — and the business documents behind
// them. The CEO's alone (v9.21): not another admin, not any key.
app.use('/api/costing', requireScope('admin'), requireCeo, costingRoutes);
app.use('/api/pricing', requireScope('admin'), requireCeo, pricingDocsRoutes);
// The add-ons catalogue. Staff read it (the quote builder offers these as
// lines); only the CEO changes it or sees what an add-on costs us.
app.use('/api/addons', requireScope('staff'), addonsRoutes);
// The receipts ledger. Staff record what came in; they do not see the books.
app.use('/api/payments', requireScope('staff'), paymentsRoutes);
// P&L, income statement, balance sheet and the FBR position — admin only,
// same as the rest of the financials.
app.use('/api/accounting', requireScope('admin'), accountingRoutes);
// The whole base as a spreadsheet. Admin only: it contains everything.
app.use('/api/export', requireScope('admin'), exportRoutes);
// Archiving old invoices out of the working set, and deleting them once they
// have been downloaded. Admin only, and blockAutomation on the purge besides:
// this is the one endpoint that destroys financial rows.
app.use('/api/archive', requireScope('admin'), archiveRoutes);
// The things that RUN: the monthly billing run, the chase schedule, the
// automation rules and the bank statement coming back in. An automation key
// reaches these on purpose — the monthly run and the daily chase are meant to
// be fired by n8n on a schedule, not by a person remembering.
app.use('/api/billing', requireScope('automation'), billingOpsRoutes);
app.use('/api/settings', requireScope('admin'), settingsRoutes);
app.use('/api/team', requireScope('admin'), teamRoutes);

// Procurement is mounted on the bare '/api' prefix (it declares /vendors and
// /purchase-orders internally), so it MUST come last: mounted earlier its
// admin guard runs for every /api path declared below it, which silently made
// staff-scoped routes admin-only.
app.use('/api', requireScope('admin'), procurementRoutes); // /api/vendors, /api/purchase-orders

// Serve the frontend (public/index.html) as a static site from the same server,
// so the whole thing — API + UI — is one deployment.
//
// portal.vantriqai.com is the customers' address and reaches this same app, so
// its front door is the customer portal, not the staff console. Invoice emails
// and password resets send customers to that bare address; without this they
// landed on the staff sign-in. Nginx Proxy Manager passes the visitor's Host
// through, which is what req.hostname reads. Set PORTAL_HOSTS to override.
const PORTAL_HOSTS = (process.env.PORTAL_HOSTS || 'portal.vantriqai.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const isPortalHost = (req) => PORTAL_HOSTS.includes(String(req.hostname || '').toLowerCase());
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// Customers always use portal.vantriqai.com. A /portal.html link on the CRM's
// own address (crm.vantriqai.com) is sent there, so a customer never signs in
// under the staff address. Only on our own domain: local and test hosts still
// serve the file directly.
const PORTAL_URL = (process.env.PORTAL_URL || 'https://portal.vantriqai.com').replace(/\/+$/, '');
const onOurDomain = (req) => /(^|\.)vantriqai\.com$/.test(String(req.hostname || '').toLowerCase());

// The survey app, its QR codes and posters: /s/<survey address>. Ahead of the
// static files and the catch-all below, on every host.
app.use('/s', surveyPagesRoutes);

// The VantriqAI app in the Play Store opens the portal full screen, which
// Android only allows once this address vouches for the app: its package
// name and the fingerprints of the keys Google Play signs it with, set in
// CRM → Settings → The VantriqAI app. Until they are set it is an empty list,
// and the app still works — just with a browser bar at the top.
app.get('/.well-known/assetlinks.json', async (req, res) => {
  const { rows } = await db.query(`select android_package, android_sha256 from settings where id = 1`);
  const row = rows[0] || {};
  const prints = String(row.android_sha256 || '').split(/\s+/).filter(Boolean);
  res.set('Cache-Control', 'public, max-age=300').json(prints.length && row.android_package ? [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: row.android_package, sha256_cert_fingerprints: prints },
  }] : []);
});

// What the app and the survey pages do with personal data — the address the
// Play Store listing and the app itself point to.
app.get('/privacy', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));

app.get('/portal.html', (req, res, next) => {
  if (isPortalHost(req) || !onOurDomain(req)) return next();
  const q = req.originalUrl.indexOf('?');
  res.redirect(302, PORTAL_URL + '/' + (q >= 0 ? req.originalUrl.slice(q) : ''));
});
app.get(['/', '/index.html'], (req, res, next) => {
  if (!isPortalHost(req)) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'portal.html'));
});
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(PUBLIC_DIR, isPortalHost(req) ? 'portal.html' : 'index.html'));
});

// Every failure lands here, async ones included (utils/asyncErrors.js). A
// value the caller got wrong answers 4xx with a reason; anything else is 500.
app.use(errorHandler);

// Retention also runs while there are no new website events. No personal records are touched.
const purgeWebsiteActivity = () => require('./utils/siteAnalytics').purgeSiteAnalytics().catch(err => console.error('[website retention]', err.message));
purgeWebsiteActivity();
setInterval(purgeWebsiteActivity, 60 * 60 * 1000).unref();

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Vantriq CRM API listening on port ${port}`);
});
