export const BENCH = [
  { fig: "21×", claim: "More likely to qualify a lead when the reply lands in five minutes instead of thirty.", src: "MIT / InsideSales.com · Lead Response Management Study" },
  { fig: "78%", claim: "Of customers buy from whichever business answers first. Not the cheapest — the first.", src: "MIT / InsideSales.com" },
  { fig: "42 hrs", claim: "Average first response to a web enquiry across 2,241 audited firms. 23% never replied at all.", src: "Harvard Business Review, 2011" },
  { fig: "95–98%", claim: "Open rate on a WhatsApp business message, against 20–25% for email.", src: "Mobilesquared / Infobip · industry estimate" },
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
  { n: "01", name: "Reception", metric: "First reply in ~1.2s", body: "Greets, understands the question, and answers it — on WhatsApp, Instagram, or your site, in the language your customer used." },
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

export const BMK = [
  { claim: "Qualification odds, replying at 5 minutes instead of 30", fig: "21× higher", src: "MIT / InsideSales.com, Lead Response Management Study, 2007" },
  { claim: "Odds of making contact at all, 5 minutes versus 30", fig: "100× higher", src: "MIT / InsideSales.com, 2007" },
  { claim: "Customers who buy from the business that replies first", fig: "78%", src: "MIT / InsideSales.com, 2007" },
  { claim: "Average first response to a web enquiry (2,241 firms audited)", fig: "42 hours", src: "Harvard Business Review, 2011" },
  { claim: "Firms that never responded to the enquiry at all", fig: "23%", src: "Harvard Business Review, 2011" },
  { claim: "Qualification odds, replying within an hour versus 24 hours+", fig: "60× higher", src: "Harvard Business Review, 2011" },
  { claim: "Conversion lift when the first contact lands inside 60 seconds", fig: "+391%", src: "Velocify research" },
  { claim: "Average first reply to a customer service email (1,000 companies)", fig: "12h 10m", src: "SuperOffice, Customer Service Benchmark Report" },
  { claim: "Customers who expect to engage immediately on contact", fig: "83%", src: "Salesforce" },
  { claim: "Who define “immediately” as ten minutes or less", fig: "60%", src: "HubSpot" },
  { claim: "Customers who expect support to be available 24/7", fig: "74%", src: "Salesmate" },
  { claim: "Customers who leave after a single poor experience", fig: "62%", src: "Salesforce" },
  { claim: "WhatsApp monthly active users worldwide", fig: "3 bn+", src: "Meta, confirmed 2025" },
  { claim: "Businesses on WhatsApp Business products", fig: "200 m+", src: "Meta, 2023" },
  { claim: "Open rate on a WhatsApp business message, versus 20–25% for email", fig: "95–98%", src: "Mobilesquared / Infobip · industry estimate" },
];

/**
 * `over` is the Pakistan rate, `overUsd` the one the /global pages show.
 *
 * THE USD COLUMN IS A PLACEHOLDER. It is not a conversion of the PKR column —
 * at the interbank rate PKR 2 is under a cent, which would price the global
 * site below anyone's cost. It keeps the PKR column's shape (flat for the
 * first two tiers, then stepping up) against a $0.05 base, which sits inside
 * the usual range for per-conversation overage. Replace these six figures
 * with the real ones before the global site is promoted anywhere.
 */
export const USAGE = [
  { plan: "Starter", typical: "300–600 / mo", sessions: "1,500", perday: "50", head: "5.0×", over: "PKR 2 / session", overUsd: "US$ 0.05 / session" },
  { plan: "Growth", typical: "800–1,500 / mo", sessions: "4,000", perday: "133", head: "5.0×", over: "PKR 2 / session", overUsd: "US$ 0.05 / session" },
  { plan: "Scale", typical: "2,000–4,000 / mo", sessions: "9,000", perday: "300", head: "4.5×", over: "PKR 3 / session", overUsd: "US$ 0.08 / session" },
  { plan: "Pro", typical: "4,000–8,000 / mo", sessions: "15,000", perday: "500", head: "3.8×", over: "PKR 4 / session", overUsd: "US$ 0.10 / session" },
  { plan: "Enterprise", typical: "8,000–15,000 / mo", sessions: "25,000", perday: "833", head: "3.1×", over: "PKR 4 / session", overUsd: "US$ 0.10 / session" },
  { plan: "Enterprise+", typical: "15,000+ / mo", sessions: "40,000", perday: "1,333", head: "2.7×", over: "PKR 5 / session", overUsd: "US$ 0.13 / session" },
];

export const INCLUDED = [
  { title: "Configured to your workflow", body: "Your catalogue, your booking rules, your tone — set during onboarding, not a template with your logo on it." },
  { title: "Natural language, multilingual", body: "Customers write the way they normally write, and the agent replies in kind." },
  { title: "Monthly tuning by a local team", body: "Escalations and misses are reviewed every month, and the agent is improved — not left to drift." },
  { title: "Secure data handling", body: "Handling matched to your sensitivity, from a simple catalogue to an enterprise database." },
];

export const MARQUEE_ITEMS = ["E-commerce & Retail", "Real Estate", "Healthcare", "Education", "Hospitality", "Legal & Consulting", "Travel & Tourism", "HR & Operations", "Marketing Agencies", "Logistics"];

export const WHY = [
  { title: "Built for you, not off the shelf", body: "Every agent is configured to your workflow, catalogue, and tone — not a template with your logo on it." },
  { title: "A relationship, not a dashboard", body: "A dedicated local team manages, tunes, and improves your agent every single month." },
  { title: "Transparent pricing, built for you", body: "No confusing billing, no overseas support hours, no timezone gap when something breaks." },
  { title: "Enterprise experience, SME flexibility", body: "14+ years experience across enterprise and government collaborations, applied to businesses of every size." },
];

export const STEPS = [
  { n: "01", title: "Engage", body: "Replies instantly on WhatsApp, Instagram, or your website — any hour, any volume, no queue. Natural language, not a menu tree: customers ask the way they actually speak, and get an answer in seconds." },
  { n: "02", title: "Execute", body: "Books the appointment, shares the catalogue, checks availability, logs the lead in your CRM. Actions actually happen — the agent is connected to your calendar, inventory, and records, not just talking about them." },
  { n: "03", title: "Escalate", body: "Hands to your team the moment judgement is needed — with the full conversation attached. Nothing is lost in the handover, and your staff spend their hours on the conversations that need a person." },
];

export const COMPARISON = [
  { a: "24/7 cost", b: "Two to three shifts of salary", c: "A low monthly fee", d: "Included in your plan" },
  { a: "Understanding", b: "Full — but only on shift", c: "Menu-driven only", d: "Natural language, any hour" },
  { a: "Gets things done", b: "Manually, yes", c: "Static answers only", d: "Books, checks stock, updates CRM" },
  { a: "The unexpected", b: "Handles it — until hour eight", c: "Breaks or loops", d: "Handles new questions gracefully" },
  { a: "Consistency", b: "Varies with mood and fatigue", c: "Consistent but rigid", d: "Consistent and flexible" },
  { a: "Long run", b: "Learns, then eventually leaves", c: "Frozen until reprogrammed", d: "Tuned monthly, stays" },
];

export const HOOD = [
  { n: "01", title: "Smart AI models", body: "The reasoning behind every reply, matched to your business's complexity and data sensitivity." },
  { n: "02", title: "Reliable automation", body: "Connects to your calendar, CRM, and inventory so actions actually happen — not just chat." },
  { n: "03", title: "Secure data handling", body: "From simple catalogues to enterprise databases, including fully private on-premise options." },
  { n: "04", title: "Where customers already are", body: "WhatsApp, Instagram, Facebook — no app downloads, no new habits to teach." },
];

export const SECTORS = [
  { name: "E-commerce & Retail", kicker: "Catalogue, cart recovery", data: "Peak driver — campaign launches and sale weekends", body: "Shares products, answers sizing and stock questions, and follows up on abandoned carts before the customer buys elsewhere." },
  { name: "Real Estate", kicker: "Matching, site visits", data: "Peak driver — new listing drops and portal enquiries", body: "Qualifies budget and area, matches listings to the enquiry, and books site visits straight into an agent's calendar." },
  { name: "Healthcare", kicker: "Booking, follow-up care", data: "Peak driver — Monday mornings and post-clinic follow-ups", body: "Handles appointment booking and rescheduling, sends follow-up reminders, and escalates anything clinical to your staff." },
  { name: "Education", kicker: "Admissions, fee reminders", data: "Peak driver — admission and fee-deadline windows", body: "Answers admission queries at scale during intake season and reminds parents about fees and deadlines." },
  { name: "Hospitality", kicker: "Ordering, reservations", data: "Peak driver — the dinner rush and weekend reservations", body: "Takes orders and table reservations through the dinner rush, when no one is free to watch the phone." },
  { name: "Legal & Consulting", kicker: "Intake, document collection", data: "Peak driver — first-contact intake after ad campaigns", body: "Runs first-contact intake, collects the documents a matter needs, and books the consultation." },
  { name: "Travel & Tourism", kicker: "Itineraries, booking status", data: "Peak driver — season openings and itinerary changes", body: "Sends itineraries, answers package questions, and gives booking status without a call to the office." },
  { name: "HR & Operations", kicker: "Onboarding, leave requests", data: "Peak driver — onboarding intakes and leave cycles", body: "Walks new joiners through onboarding and handles routine leave and policy questions internally." },
  { name: "Marketing Agencies", kicker: "Comment-to-DM, scoring", data: "Peak driver — comment spikes under paid posts", body: "Turns comments into DMs, qualifies the lead, and scores it before it reaches a human on the account." },
  { name: "Logistics", kicker: "Shipment tracking", data: "Peak driver — dispatch days and delivery exceptions", body: "Answers \"where is my order\" instantly, at any volume, and flags exceptions to the team that can fix them." },
];

export const TIERS = [
  { tier: "Tier 01", name: "Starter", audience: "Small business", body: "WhatsApp only. One agent, your catalogue and FAQs, replying around the clock." },
  { tier: "Tier 02", name: "Growth", audience: "Medium corporate", body: "Everything in Starter, plus CRM sync so every lead lands in your pipeline." },
  { tier: "Tier 03 · Most chosen", name: "Scale", audience: "Multi-location business", body: "Adds your website as a channel, with location-aware routing and availability." },
  { tier: "Tier 04", name: "Pro", audience: "Established corporate", body: "Top-tier AI models across every channel your customers already use." },
  { tier: "Tier 05", name: "Enterprise", audience: "Large enterprise", body: "Adds a private on-premise deployment option for strict data residency." },
  { tier: "Tier 06", name: "Enterprise+", audience: "Highest volume, custom", body: "Custom SLA, custom integrations, and capacity for the highest message volumes." },
];

export const FAQS = [
  { n: "01", q: "Why don't you list prices?", a: "Because the setup fee depends on what the agent has to connect to. We quote a fixed setup fee and a fixed monthly plan in writing after a fifteen-minute discovery call — nothing is estimated after that." },
  { n: "02", q: "How long until it is live?", a: "Most agents are built, tested alongside your team, and live within a few weeks of scope sign-off. Complex integrations and on-premise deployments take longer, and we say so up front." },
  { n: "03", q: "Will it answer in our customers' language?", a: "Yes — customers write the way they normally write, and the agent replies in kind across the languages your business needs. Tone and vocabulary are tuned to your brand during configuration." },
  { n: "04", q: "What happens when it doesn't know?", a: "It escalates to your team with the full conversation attached, rather than guessing or looping. Recurring escalations are folded into the next monthly tuning round." },
  { n: "05", q: "Where does our data live?", a: "From simple catalogues to enterprise databases, we match handling to your sensitivity — including fully private, self-hosted deployment for strict data-residency requirements." },
  { n: "06", q: "Can we move up a tier later?", a: "Yes. Tiers are a path, not a lock-in — most clients start on the channel that matters most and add CRM, website, or extra channels as volume grows." },
  { n: "07", q: "Where do the figures on this site come from?", a: "Every benchmark is published third-party research — MIT/InsideSales.com, Harvard Business Review, SuperOffice, Salesforce, HubSpot, Meta and Mobilesquared — cited on the line where it appears. They describe the category, not our client results." },
];
