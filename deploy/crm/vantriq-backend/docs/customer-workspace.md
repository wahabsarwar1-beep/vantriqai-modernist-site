# Customer Leads and Calendar (9.29.0)

VantriqAI is the platform. Each paying business has a credential-gated customer
portal at portal.vantriqai.com. Its end-customer leads belong to that business,
not to VantriqAI's own sales pipeline.

## In the customer portal

- Leads: search and page through the business's prospects; record requirements,
  an owner/salesperson, sales stage, next action and follow-up time.
- Customers → open a profile → Save as lead retains the contact key so the
  lead can open the same conversation history. Browsing customers does not
  automatically qualify them as leads.
- Open a lead → Book meeting. Calendar offers month and mobile-friendly agenda
  views, channel/status filters and a private ICS export. All times use PKT.
- Meetings support Scheduled, Confirmed, Completed, Cancelled and No-show.
  Editing start/end records rescheduling. Record the outcome when updating a
  meeting; its sales stage remains independently editable.
- Appointment status and schedule use the very same calendar_events records
  the staff console reads/updates. Open pages refresh every 30 seconds; forms
  are not replaced while being edited. No customer data is stored offline.
- Ownership is a follow-up label within this business's account. It does not
  create salesperson credentials or grant another business access. Provisioning
  individual customer-team logins is not introduced by this release.

## Tenant boundaries

The portal session fixes client_id on every read, write, detail and export.
A body/query client_id cannot override it. Another business's lead/event ID
returns 404. New appointments have a composite tenant/lead foreign key.
Phones/contact keys and provider booking references are tenant-specific;
identical values in two businesses do not collide or merge them.

Workspace writes take a per-business transaction lock. Booking and reassignment
checks cover Scheduled and Confirmed meetings for the same lead or named owner.
Unrelated businesses can write independently. Vantriq's legacy sales calendar
keeps its existing shared ownership lock. Staff can see customer bookings in the
CRM calendar; Vantriq sales-rep calendars exclude customer workspace bookings.

Only the internal VantriqAI account can bridge the existing Vantriq sales leads.
Their billing activation and sales-rep provisioning remain in the staff CRM.
No external business imports those prospects.

## Onboarding each customer's agents

Register the agent against the correct client using the existing CRM Agents
module. Configure the business's trusted backend/n8n workflow with its registered
agent_ref (or agent_id). The webhook key stays on the server; never ship it to
website visitors or customer portal users. The current webhook credential is a
trusted platform integration credential, not a tenant-limited customer key.

POST /api/webhooks/lead:

```json
{
  "agent_ref": "the registered reference for THIS customer's agent",
  "contact_key": "stable website visitor or normalized WhatsApp customer number",
  "name": "Ayesha Khan",
  "phone": "03001234567",
  "channel": "website",
  "notes": "Interested in a demo"
}
```

Keep the returned lead_id. After the person explicitly confirms a meeting,
POST /api/webhooks/appointment:

```json
{
  "agent_ref": "the same registered agent reference",
  "lead_id": "the returned customer lead UUID",
  "external_id": "one stable booking id retained across retries",
  "channel": "website",
  "title": "Discovery demo",
  "starts_at": "2026-10-15T10:00:00+05:00",
  "ends_at": "2026-10-15T10:30:00+05:00",
  "kind": "demo"
}
```

WhatsApp uses channel whatsapp. Instagram and Messenger use instagram/facebook.
The server derives the tenant from the agent. A conflicting tenant_client_id is
rejected. Retried capture fills blank profile fields without resetting human
edits, ownership or stage. Booking retries return the same event; different
content under the same booking id returns 409. Do not claim a booking succeeded
until the webhook reports success. Agents without a tenant/agent identifier keep
the existing Vantriq own-sales capture behavior; existing workflows are not
silently reassigned to an arbitrary customer.

## Customer API (session required)

GET/POST /api/portal/leads; GET/PATCH /api/portal/leads/:id.
GET /api/portal/leads?q=&status=&limit=50&offset=0 returns leads,total,limit,offset.
GET /api/portal/leads/:id returns lead,appointments,history.
GET/POST /api/portal/calendar; PATCH /api/portal/calendar/:id.
GET /api/portal/calendar/export returns an authenticated ICS file.
Calendar reads require from/to offset timestamps, at most 93 days; optional
channel/status filters. PATCH accepts appointment details and an outcome.

## Release and verification

npm run test:portal-workspace; npm run test:calendar; npm run test:webhooks.
The first release commit includes release-portal-workspace.yml: isolation tests,
existing calendar/webhook checks, an upgrade dry run, the existing verified
backup/migrate/apply procedure and an exact 9.29.0 health check. It shares the
existing deploy-crm concurrency lock. Later routine code changes use Deploy CRM.

The migration is additive and repeatable. This release does not send emails,
WhatsApp messages, create live bookings or enable Google/Outlook synchronization.
