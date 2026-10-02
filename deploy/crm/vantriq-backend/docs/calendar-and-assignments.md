# CRM calendar and lead assignments (v9.23)

## In the CRM

- Calendar → New appointment: choose a lead, title, start/end in Pakistan time, type and location/meeting link. Change status to completed, cancelled or no-show; keep the record.
- Month and agenda views; filter by rep, unassigned or agent channel. Export the selected month to an `.ics` file for importing into a calendar app. This is an export, not Google/Outlook synchronization.
- Pipeline → open a lead → Assign / history: choose an active sales rep and enter a reason. Assign, reassign or return to Unassigned. The lead card and details show its owner; the details and history show assignment time, actor and reason.
- Sales Reps already provisions reps and issues their portal login. Each rep's existing portal now includes the calendar for leads they currently own, including website and WhatsApp leads assigned by an administrator.
- Assignment is manual in this release. Nothing randomly distributes existing leads. Existing rep-created leads keep their owner; their historical assignment time is not invented.
- Booking checks block overlaps for the same lead or the same rep. Reassignment is refused if a future scheduled appointment would conflict with the receiving rep. Cancel or reschedule first.
- All bookings follow current lead ownership. Reassigning revokes the previous rep's access to the lead and its calendar. Past bookings also follow the lead.

## Website and WhatsApp agent connection

The existing `POST /api/webhooks/lead` continues to capture leads using the webhook-scoped credential. After the customer explicitly agrees to a date/time, call `POST /api/webhooks/appointment` with that same credential. Never put the credential in a browser widget: calls must come from the backend/n8n.

```json
{
  "external_ref": "same prospect reference used for lead capture",
  "external_id": "stable booking reference retained across retries",
  "channel": "website",
  "title": "Discovery demo",
  "starts_at": "2026-10-05T10:00:00+05:00",
  "ends_at": "2026-10-05T10:30:00+05:00",
  "kind": "demo",
  "location": "Phone call",
  "notes": "Interested in WhatsApp automation"
}
```

For WhatsApp set `channel` to `whatsapp`. `client_id` from the lead response can replace `external_ref`. The reference is the prospect's reference, not the number identifying Vantriq's own agent.

- 201: saved. 200: identical retry, existing booking returned.
- 404: prospect not captured. Retry lead capture first.
- 409: occupied slot or reused booking reference with different details. Offer a different slot; do not tell the customer a booking succeeded.
- 400: missing/invalid inputs. Both timestamps need a UTC offset; duration must be positive and no longer than 24 hours.
- An agent can create an appointment, but cannot assign reps, browse calendars or update appointments with its webhook credential.

Import `n8n/vantriq-calendar-booking.json` as a subworkflow. Select your existing webhook Custom Auth credential on **Save CRM appointment**. Call it from each agent's confirmed-booking branch, mapping the fields above. The workflow receives input, saves the booking and returns `ok` plus the HTTP status; confirm to the customer only when `ok` is true. Retain one external_id per booking intent across retries; never derive it anew from an execution ID.

Importing this file alone does not edit the running website/WhatsApp agents. Those workflows still need the confirmed-booking branch connected and credentials selected. Calendar data does not automatically create meetings from every captured lead.

## API

- Staff/admin: `GET /api/calendar?from=<offset timestamp>&to=<offset timestamp>[&rep_id=<uuid|unassigned>][&channel=<manual|website|whatsapp>]` (at most 93 days).
- Staff/admin: `POST /api/calendar`; `PATCH /api/calendar/:id` for appointment details/status. `GET /api/calendar/export` with the same range/filter for authenticated ICS export.
- Admin only: `PATCH /api/clients/:id/assignment` with `{ "rep_id": "uuid or null", "reason": "Required reason" }`; `GET /api/clients/:id/assignment-history`.
- Rep credential: `GET /api/rep/calendar` and `/api/rep/calendar/export` with a date range. Supplying another rep's ID cannot override the authenticated rep.

## Deployment and verification

Run `npm ci`, `npm run test:calendar`, `npm run test:webhooks` in `deploy/crm/vantriq-backend`. Calendar tests use an isolated PostgreSQL engine (PGlite), not production data.

Deploy the reviewed branch through the existing **Deploy CRM** workflow (dry-run before apply). The existing upgrade procedure backs up and migrates; the migration is additive and repeatable. Confirm health reports 9.23.0 and verify Calendar, assignment/history and a rep's calendar. Test one explicitly designated test booking through each live agent after connecting its subworkflow.
