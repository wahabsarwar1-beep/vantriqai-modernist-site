# Workspace intelligence — v9.30.0

The CRM Dashboard and portal Overview share a performance component, with
responsive cards, conversion funnel, lead-source doughnut, appointment outcome
trends and open-pipeline ageing. Existing CRM revenue charts, pipeline, calendar,
tables, navigation and forms use the same navy/blue visual system.

## Access and scope

- GET /api/workspace-insights inherits the CRM staff guard. scope=sales is
  Vantriq's clients/sales records plus independent leads in its internal portal.
  Linked portal bridge rows are excluded to prevent duplicate leads.
- scope=customers aggregates customer prospect workspaces, excluding internal
  Vantriq accounts and mapped Vantriq sales records. Optional client_id selects
  one business. Existing CRM staff visibility is retained.
- GET /api/portal/workspace-insights always uses the authenticated customer's
  account. scope and client_id query inputs do not override this boundary.
- days accepts 7, 30 or 90. Neither browser caches private figures on disk.
  Charts are destroyed on navigation/sign-out and late responses are discarded.

## Metric definitions

Lead cohort: created within the selected Pakistan-calendar period, including
all of today. Stages and wins reflect each lead's current status.
Funnel: all leads; currently contacted/qualified/proposal/negotiation/won;
currently proposal/negotiation/won; currently won. This is a snapshot funnel,
not an inferred historical stage-transition rate. Lost is shown separately.
Won share: currently won divided by leads in the creation cohort.
Sources: creation cohort grouped by source, with blank source treated as manual.
The seven largest sources plus Other are charted; the data table includes all.

Ageing: all currently open leads, regardless of the period selector. Age is
elapsed whole days since creation, not time in current stage: 0–7, 8–30,
31–60, 61+. Won/lost leads are excluded. Follow-ups overdue use next_action_at.

Appointments: start within the selected period. Outcomes use current status.
Completion is completed ended meetings divided by all ended non-cancelled
meetings. Ended scheduled/confirmed records remain in the denominator until
updated. Daily buckets for seven days; consecutive seven-day buckets for
30/90 days. Missing buckets are zero-filled. These charts do not invent values
for accounts without activity; absent percentage denominators display a dash.

## Verification

npm run test:workspace-insights runs real PostgreSQL aggregation and HTTP
access-guard checks plus shared UI/lifecycle checks. Existing workspace,
calendar and webhook tests remain part of the release. Browser QA exercises
both complete applications, chart rendering, filters, navigation, pipeline,
calendar, mobile overflow and JavaScript errors against local test data.
The production release verifies both live aggregation scopes without exporting
customer details or modifying records.
