require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const { requireScope } = require('./middleware/auth');
const { requireRep } = require('./middleware/repAuth');
const productsRoutes = require('./routes/products');
const clientsRoutes = require('./routes/clients');
const invoicesRoutes = require('./routes/invoices');
const procurementRoutes = require('./routes/procurement');
const expensesRoutes = require('./routes/expenses');
const usageRoutes = require('./routes/usage');
const dashboardRoutes = require('./routes/dashboard');
const financialsRoutes = require('./routes/financials');
const settingsRoutes = require('./routes/settings');
const portalRoutes = require('./routes/portal');
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
const billingOpsRoutes = require('./routes/billingOps');

const app = express();

const corsOrigin = process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== '*'
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

// Health check — no auth, used by hosting platforms and n8n connection tests
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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
app.use('/api/reps', requireScope('admin'), repsRoutes);
app.use('/api/package-requests', requireScope('staff'), packageRequestsRoutes);
app.use('/api/expenses', requireScope('admin'), expensesRoutes);
app.use('/api/dashboard', requireScope('staff'), dashboardRoutes);
app.use('/api/quota', requireScope('staff'), quotaRoutes);
app.use('/api/financials', requireScope('admin'), financialsRoutes);
// The receipts ledger. Staff record what came in; they do not see the books.
app.use('/api/payments', requireScope('staff'), paymentsRoutes);
// P&L, income statement, balance sheet and the FBR position — admin only,
// same as the rest of the financials.
app.use('/api/accounting', requireScope('admin'), accountingRoutes);
// The whole base as a spreadsheet. Admin only: it contains everything.
app.use('/api/export', requireScope('admin'), exportRoutes);
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
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Vantriq CRM API listening on port ${port}`);
});
