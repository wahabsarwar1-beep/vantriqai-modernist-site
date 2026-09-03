/** Content for the Home page sections, lifted verbatim from the design
 *  handoff's prototype. Copy is final and client-approved — do not paraphrase.
 *
 *  Every figure here is a published third-party benchmark, cited on the line
 *  where it appears. None of them are VantriqAI client results, and the page
 *  says so in print beneath the stat band. */

export const BENCH = [
  {
    fig: "21×",
    claim: "More likely to qualify a lead when the reply lands in five minutes instead of thirty.",
    src: "MIT / InsideSales.com · Lead Response Management Study",
  },
  {
    fig: "78%",
    claim: "Of customers buy from whichever business answers first. Not the cheapest — the first.",
    src: "MIT / InsideSales.com",
  },
  {
    fig: "42 hrs",
    claim: "Average first response to a web enquiry across 2,241 audited firms. 23% never replied at all.",
    src: "Harvard Business Review, 2011",
  },
  {
    fig: "95–98%",
    claim: "Open rate on a WhatsApp business message, against 20–25% for email.",
    src: "Mobilesquared / Infobip · industry estimate",
  },
];

export const MISSED = [
  { t: "21:40", text: "Customer messages: is the black leather sofa in stock?" },
  { t: "21:41", text: "Delivered. Nobody is watching the inbox." },
  { t: "08:58", text: "Team opens WhatsApp to a night's worth of unread threads." },
  { t: "09:47", text: "First reply sent. The customer bought elsewhere at 22:10." },
];

export const ANSWERED = [
  { t: "21:40", text: "Customer messages: is the black leather sofa in stock?" },
  { t: "21:40", text: "Agent checks live stock and answers. 1.2 seconds." },
  { t: "21:42", text: "Budget, area and timing captured. Lead scored and logged." },
  { t: "21:43", text: "Visit booked for tomorrow, 18:30. Reminder scheduled." },
];

export const AGENTS = [
  { n: "01", name: "Reception", metric: "First reply in ~1.2s", body: "Greets, understands the question, and answers it — on WhatsApp, Instagram, or your site, in English or Roman Urdu." },
  { n: "02", name: "Booking", metric: "Writes to your calendar", body: "Checks real availability, books the slot, sends the reminder, and handles the reschedule when it comes." },
  { n: "03", name: "Catalogue", metric: "Answers against live stock", body: "Price, size, variant and availability from your actual inventory — and holds the item while the customer decides." },
  { n: "04", name: "Qualifier", metric: "Scored before a human reads it", body: "Asks what your sales team would ask, scores the lead, and writes it to your CRM with the transcript attached." },
  { n: "05", name: "Follow-up", metric: "Reopens the quiet threads", body: "Abandoned carts, unanswered quotes, half-finished bookings — chased once, politely, at the right hour." },
  { n: "06", name: "Escalation", metric: "Hands over with context", body: "Anything needing judgement goes to the right person with the full conversation, not a ticket number." },
  { n: "07", name: "Outreach", metric: "Approved before it sends", body: "Reactivation lists, seasonal offers and WhatsApp broadcasts — drafted for the segment worth the message, sent once you say go." },
  { n: "08", name: "Payments", metric: "Chases the unpaid invoice", body: "Sends the payment link, confirms receipt, and reminds the quiet ones on the schedule you set." },
  { n: "09", name: "Insights", metric: "One digest every Monday", body: "What customers asked, what they abandoned, which hours cost you money — written up in plain language, not a chart wall." },
  { n: "10", name: "Yours", metric: "Built in onboarding", body: "A module for the thing only your business does: your name for it, your tone, your rules, your approval before it acts." },
];

export const JSTEPS = [
  { n: "01", title: "Tell us how you work", body: "Fifteen minutes on how customers message you today: the questions that repeat, the ones that need a person, the hours nobody is watching.", fig: "15 min", figLabel: "discovery call" },
  { n: "02", title: "The agent gets built", body: "We configure the modules your workflow actually needs and test them against your real message history before a single customer sees it.", fig: "2–4 weeks", figLabel: "typical build to live" },
  { n: "03", title: "It plugs into your tools", body: "Calendar, CRM, inventory, payments, sheets. The agent acts inside the systems you already run — it does not keep a second copy of the truth.", fig: "8+", figLabel: "systems it can act in" },
  { n: "04", title: "It answers, every hour", body: "WhatsApp, Instagram, website. No queue, no office hours, no ceiling on volume when a post lands or the season peaks.", fig: "1.2 s", figLabel: "first reply, demo above" },
  { n: "05", title: "You keep the judgement calls", body: "Edge cases arrive with the transcript attached. Every escalation is reviewed monthly by a local team and folded back into the agent.", fig: "monthly", figLabel: "tuning, by people you can call" },
];

export const INTEGRATIONS = [
  { group: "Channels", items: ["WhatsApp Business API", "Instagram DM", "Facebook Messenger", "Website widget", "Email"] },
  { group: "Calendars", items: ["Google Calendar", "Outlook / Microsoft 365", "Calendly", "In-house booking"] },
  { group: "Records", items: ["HubSpot", "Salesforce", "Zoho", "Google Sheets", "Custom REST API"] },
  { group: "Commerce", items: ["Shopify", "WooCommerce", "Stripe", "Local payment gateways", "ERP exports"] },
];

/** The two rows of the band that passes behind the phone mockup. `kind`
 *  picks the tile's treatment: a big figure, a chat bubble, or a list. */
export type Tile =
  | { kind: "figure"; fig: string; label: string; chip?: string; tone?: "accent" | "ink" | "plain" }
  | { kind: "bubble"; who: string; text: string }
  | { kind: "list"; label: string; items: string[] };

export const TILES_FRONT: Tile[] = [
  { kind: "figure", fig: "1.2s", label: "average first reply", chip: "+391% reply rate", tone: "accent" },
  { kind: "bubble", who: "Agent · 0.9s", text: "Yes — in stock. Shall I hold one for you?" },
  { kind: "figure", fig: "94%", label: "handled without a human", tone: "plain" },
  { kind: "figure", fig: "$18.2K", label: "recovered this week", tone: "ink" },
  { kind: "list", label: "Connected", items: ["WhatsApp", "Instagram", "Google Calendar", "Your CRM", "Website"] },
  { kind: "figure", fig: "21×", label: "better odds at 5 minutes", tone: "plain" },
  { kind: "bubble", who: "Customer · 21:40", text: "Can I see it tomorrow evening?" },
  { kind: "figure", fig: "24/7", label: "always answering", tone: "accent" },
];

export const TILES_BACK: Tile[] = [
  { kind: "figure", fig: "3m", label: "message to booked", tone: "plain" },
  { kind: "bubble", who: "Lead scored", text: "A-grade — written to your CRM" },
  { kind: "figure", fig: "10", label: "industries live", tone: "plain" },
  { kind: "bubble", who: "Booking", text: "Tomorrow 18:30 · reminder set" },
  { kind: "figure", fig: "0", label: "missed nights", tone: "plain" },
  { kind: "figure", fig: "68%", label: "messages after hours", tone: "plain" },
  { kind: "bubble", who: "Follow-up", text: "Nudged 14 quiet leads this week" },
  { kind: "figure", fig: "EN·UR", label: "english & roman urdu", tone: "plain" },
];
