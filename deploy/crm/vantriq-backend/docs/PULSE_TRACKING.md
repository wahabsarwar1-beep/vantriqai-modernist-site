# Pulse outcome and service tracking (9.26)

Pulse keeps usage, billing and measurements separate. Existing usage integrations keep working.
Send measurements to `POST /api/webhooks/pulse-event` on the CRM origin using the existing webhook-scoped API credential in the `x-api-key` header (stored in n8n credentials, never in message content). This endpoint does not add conversations or tokens to billing.

```json
{
  "external_ref": "YOUR_CLIENT_OR_AGENT_REF",
  "session_id": "SAME_SESSION_ID_AS_USAGE",
  "event_id": "UPSTREAM_MESSAGE_ID:first-reply",
  "occurred_at": "2026-10-03T10:00:00Z",
  "data": {
    "first_response_ms": 2400,
    "qualified_lead": true,
    "intent": "pricing",
    "status": "success"
  }
}
```

Use `client_id`, `agent_ref` or `agent_id` instead of `external_ref` when available. An explicit agent must belong to the supplied client. Use the exact same session identifier as `/api/webhooks/usage`; unmatched events cannot be attributed to a conversation.

In an n8n HTTP Request node, POST JSON to the endpoint after the measured action. Map actual values from earlier nodes; omit fields that are not measured. A workflow error handler can submit `status: "failure"` without recording billable usage. This deployment does not modify n8n workflows automatically.

Supported `data` fields:

| Field | Meaning |
| --- | --- |
| `first_response_ms` | Non-negative elapsed milliseconds from first inbound customer message to the first delivered reply. Send once per conversation; this is not model-generation latency. |
| `qualified_lead` | Boolean qualification result according to your configured business rules. A new contact alone is not a qualified lead. |
| `meeting_booked` | Boolean; true only after booking succeeds. |
| `deal_won` | Boolean; true only when the source system records the deal as won. |
| `confirmed_resolution` | Boolean; true only when resolution is explicitly confirmed. No human handoff does not establish resolution. |
| `intent` | `pricing`, `purchase`, `support`, `booking`, `complaint` or `other`; explicitly reported category, not inferred sentiment. |
| `handoff_reason` | Up to 80 characters. Reasons are counted only when usage also reports `handoff: true` for that conversation. |
| `status` | `success` or `failure` for an individual operation. Report both for representative coverage; this is not uptime. |
| `cost_pkr` | Incremental cost of this operation in PKR, not a repeated cumulative total. |
| `attributed_revenue_pkr` | Incremental attributed revenue in PKR; not a verified collection. Emit once for a sale. |
| `staff_minutes_saved` | Explicit workflow-supplied estimate; document the assumption in your workflow. |

Choose a stable `event_id` from the source event plus the operation. Retries must reuse it. An identical retry returns HTTP 200 with `duplicate: true`; initial recording returns 201; reusing an identifier with different measurements returns 409. Do not use the current time or a new random id on retries. Separate distinct operations with distinct ids. A retried n8n execution id may change, so prefer a stable upstream message, booking or deal identifier.

Charts use the selected current calendar period in Karachi time, with conversations first recorded in that period. Outcomes count distinct conversations per outcome; a sale may skip a meeting, so the chart is not a sequential drop-off funnel. Agent metrics use the conversation's first recorded agent. First-reply median and interpolated 95th percentile use only reported timings. Qualification rates use only explicitly reported qualification results. Unknown coverage stays visible.

Customer dashboards and exports receive scoped outcomes, timing, agents, intents and handoff reasons. Platform-wide operational and financial measurements are available only through the CRM platform analytics/report. No session identifiers or customer contact details are returned in the advanced analytics aggregate.

No historical timings, costs or resolutions are reconstructed. The dashboard flags data limits (50,000 current-period conversations / 100,000 events). Existing Pulse charts and report sheets remain in place.
