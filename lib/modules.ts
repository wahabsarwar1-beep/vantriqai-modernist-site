import type { ChatBubble } from "@/components/HeroChatCard";
import { productSlug, products, type Product } from "@/lib/products";
import type { Region } from "@/lib/region";

/**
 * One page per platform module, keyed by the module's name in lib/products.
 *
 * The catalogue (name, tier, one-line body, mark) stays in products.tsx so
 * the menu, the Products page and these pages can never disagree about what
 * a module is called or which tier carries it; this file only adds the depth
 * a dedicated page needs.
 *
 * As everywhere on the site: no statistics and no claimed results. The
 * example conversations are illustrative and the pages say so.
 */

export type ModuleDetail = {
  headline: [string, string];
  lede: string;
  hero: { channel?: string; time: string; bubbles: ChatBubble[]; speed: string; outcome: string[] };
  steps: { title: string; body: string }[];
  capabilities: { title: string; body: string }[];
  /** Industry slugs from lib/industries, with what the module does there. */
  sectors: { slug: string; line: string }[];
  /** Other module names from lib/products. */
  pairs: string[];
  systems: string[];
  faqs: { q: string; a: string }[];
  /** A bespoke hero picture in place of the chat card, for modules that are not a conversation. */
  visual?: "pulse" | "echo" | "human";
  /** Section headings for modules the chat-flavoured defaults do not fit. */
  flowTitle?: [string, string];
  capTitle?: [string, string];
};

export type Module = Product & ModuleDetail & { slug: string };

const details = (region: Region): Record<string, ModuleDetail> => ({
  "WhatsApp Agent": {
    headline: ["Your business,", "answering on WhatsApp"],
    lede: `The core module. It replies the moment a message lands, understands what the customer actually wants, and does the work behind the answer — in ${region.languagesPhrase}, at any hour, at any volume.`,
    hero: {
      time: "22:14",
      bubbles: [
        { from: "them", text: "Do you deliver on Sundays?" },
        { from: "us", text: "We do, 11 to 6. Your area is covered — want me to book a slot?" },
      ],
      speed: "Replied in seconds",
      outcome: ["Delivery slot booked · Sun 14:00", "Order logged to your CRM"],
    },
    steps: [
      { title: "A customer messages", body: "On your WhatsApp Business number, the way they would message a friend — text, voice note or photo." },
      { title: "It understands and checks", body: "Works out what was meant, then checks your catalogue, calendar or records for the real answer." },
      { title: "It answers and acts", body: "Replies in their language, then books, holds, logs or sends the link — so the answer is also the outcome." },
      { title: "A person when needed", body: "Anything needing judgement goes to your team with the whole thread attached." },
    ],
    capabilities: [
      { title: "Natural conversation", body: "No menu trees. Customers ask in their own words and get a direct answer." },
      { title: "Every message type", body: "Text, voice notes, images and documents, answered in the same thread." },
      { title: "Your catalogue and FAQs", body: "Answers come from your content, kept current as you update it." },
      { title: "Actions, not just replies", body: "Bookings, holds, payment links and CRM entries happen inside the chat." },
      { title: "Official WhatsApp Business Platform", body: "Runs on Meta's business API with your verified number — not a personal app." },
      { title: "Clean handover", body: "One tap brings a colleague in, with the conversation and context attached." },
    ],
    sectors: [
      { slug: "ecommerce-retail", line: "Stock, sizing and orders answered in the chat." },
      { slug: "healthcare", line: "Appointments booked and reminded on the channel patients read." },
      { slug: "real-estate", line: "Every listing enquiry answered while it is warm." },
      { slug: "hospitality", line: "Orders and tables taken through the dinner rush." },
    ],
    pairs: ["Booking Agent", "Catalogue Agent", "Payments Agent"],
    systems: ["WhatsApp Business Platform", "Your catalogue or store", "Calendar", "CRM"],
    faqs: [
      { q: "Do we need a new number?", a: "No. We connect your existing business number to the WhatsApp Business Platform during onboarding, or set up a new one if you prefer to keep them separate." },
      { q: "Can our team still reply themselves?", a: "Yes. Your team can take over any conversation at any time, and the agent steps back until they hand it back." },
      { q: "What if a customer sends a voice note?", a: "The agent transcribes it and answers the question in it, in the same thread, like any other message." },
    ],
  },
  "Social Agent": {
    headline: ["Every comment,", "a conversation"],
    lede: "Instagram and Facebook DMs answered in seconds — and comment-to-DM, so a question under a post becomes a private, qualified conversation before a competitor replies.",
    hero: {
      channel: "Instagram",
      time: "13:05",
      bubbles: [
        { from: "them", text: "Price?? 😍" },
        { from: "us", text: "Just sent you the price list in DM — which colour were you thinking?" },
      ],
      speed: "Comment moved to DM",
      outcome: ["Lead qualified", "Handed to sales · hot"],
    },
    steps: [
      { title: "Someone comments or DMs", body: "A question under a post, a reply to a story, or a direct message." },
      { title: "Public reply, private detail", body: "A short public reply shows you are responsive; the detail goes to their inbox." },
      { title: "It qualifies", body: "Asks what your sales team would ask and scores the lead as it goes." },
      { title: "Into your pipeline", body: "The qualified lead lands in your CRM or with the right person, thread attached." },
    ],
    capabilities: [
      { title: "Comment-to-DM", body: "Turns a comment into a private conversation automatically, on every post." },
      { title: "Story replies", body: "Replies to story mentions and reactions like any other message." },
      { title: "Campaign aware", body: "Knows which post or ad the person came from and answers in context." },
      { title: "Lead scoring", body: "Scores intent from the conversation so hot leads get a person first." },
      { title: "Brand voice", body: "Replies in your tone — casual on Instagram, if that is how you speak." },
      { title: "One inbox with WhatsApp", body: "Same agent and same rules across Instagram, Facebook and WhatsApp." },
    ],
    sectors: [
      { slug: "marketing-agencies", line: "Every comment under a paid post turned into a lead." },
      { slug: "ecommerce-retail", line: "Price and stock questions answered where they are asked." },
      { slug: "hospitality", line: "Reservations taken straight from story replies." },
    ],
    pairs: ["Lead Qualifier", "WhatsApp Agent", "Outreach Agent"],
    systems: ["Instagram", "Facebook Messenger", "CRM", "Lead sheets"],
    faqs: [
      { q: "Does it reply publicly or privately?", a: "Both, as you configure it: a short public reply so others see you are responsive, and the detail in a private message." },
      { q: "Will it reply to negative comments?", a: "You decide. Most businesses have complaints routed to a person rather than answered by the agent." },
      { q: "Does it work on ads as well as posts?", a: "Yes, comments on boosted posts and ads are handled the same way as organic ones." },
    ],
  },
  "Website Agent": {
    headline: ["A salesperson", "on every page"],
    lede: "The assistant in the corner of your site — the same brain and the same actions as your WhatsApp agent, answering visitors while they are still deciding.",
    hero: {
      channel: "Website",
      time: "16:40",
      bubbles: [
        { from: "them", text: "Which plan would suit a 3-branch clinic?" },
        { from: "us", text: "Scale fits three branches — shall I book you a short call to confirm?" },
      ],
      speed: "Answered on the page",
      outcome: ["Call booked · Thu 11:00", "Lead written to CRM"],
    },
    steps: [
      { title: "A visitor asks", body: "From any page, in their own words — no forms, no waiting for an email." },
      { title: "It knows the page", body: "Answers with the context of what they are looking at and your full content." },
      { title: "It moves them forward", body: "Books the call, starts the quote, or captures the details your team needs." },
      { title: "It follows them home", body: "Can continue the conversation on WhatsApp so it does not end when the tab closes." },
    ],
    capabilities: [
      { title: "Page-aware answers", body: "Knows which product or service the visitor is reading about." },
      { title: "Lead capture in conversation", body: "Gathers name, need and contact naturally instead of a form." },
      { title: "Bookings on the page", body: "Offers real slots from your calendar without leaving the site." },
      { title: "Your brand, your widget", body: "Styled to your site, with your name and tone." },
      { title: "Continue on WhatsApp", body: "Hands the thread to WhatsApp so the visitor can reply later." },
      { title: "Lightweight", body: "Loads after your page is ready, so it never slows the first view." },
    ],
    sectors: [
      { slug: "education", line: "Admission questions answered during intake season." },
      { slug: "legal-consulting", line: "Intake started from the page a visitor lands on." },
      { slug: "travel-tourism", line: "Package questions answered while travellers compare." },
    ],
    pairs: ["Lead Qualifier", "Booking Agent", "WhatsApp Agent"],
    systems: ["Your website", "Calendar", "CRM", "WhatsApp"],
    faqs: [
      { q: "Is this the widget on your own site?", a: "Yes — the assistant in the corner of this page is the Website Agent, configured for VantriqAI." },
      { q: "Will it slow our site down?", a: "It loads after the page is ready and only when needed, so the first view is not held back." },
      { q: "Does it work with any website?", a: "Yes. It is added with a small snippet, whatever your site is built on." },
    ],
  },
  "Voice Agent": {
    headline: ["It answers", "the phone too"],
    lede: "A natural voice on your business line that handles the same reception and booking as the chat agent — and hands the call to a person cleanly when it needs one.",
    hero: {
      channel: "Voice",
      time: "19:05",
      bubbles: [
        { from: "them", text: "Calling — do you have anything Saturday morning?" },
        { from: "us", text: "We do. 10:30 or 11:15 — which suits?" },
      ],
      speed: "Answered on ring two",
      outcome: ["Appointment set · Sat 10:30", "Confirmation sent by message"],
    },
    steps: [
      { title: "The phone rings", body: "Busy line, after hours or overflow — you choose when the agent answers." },
      { title: "It listens and understands", body: "Natural speech, interruptions and accents, not press-one menus." },
      { title: "It books and confirms", body: "Checks availability, books, and sends a written confirmation afterwards." },
      { title: "Or it transfers", body: "Routes the call to the right person with a summary of what was said." },
    ],
    capabilities: [
      { title: "Natural voice", body: "Speaks like a receptionist, not a phone tree." },
      { title: "After-hours and overflow", body: "Answers when you are closed or every line is busy." },
      { title: "Same rules as chat", body: "Uses the same content, bookings and limits as your other channels." },
      { title: "Written follow-up", body: "Confirms bookings by message so nothing depends on memory." },
      { title: "Warm transfer", body: "Passes the caller to a person with a summary, not a cold hand-off." },
      { title: "Call notes", body: "Every call is summarised and logged against the customer." },
    ],
    sectors: [
      { slug: "healthcare", line: "Monday-morning booking calls answered on ring two." },
      { slug: "hospitality", line: "Reservations taken when nobody can reach the phone." },
      { slug: "logistics", line: "\"Where is my parcel\" calls answered at any volume." },
    ],
    pairs: ["Booking Agent", "Escalation Desk", "WhatsApp Agent"],
    systems: ["Your business phone line", "Calendar", "CRM", "SMS or WhatsApp confirmations"],
    faqs: [
      { q: "Do we keep our number?", a: "Yes. Calls to your existing number are forwarded to the agent on the conditions you choose." },
      { q: "Can callers ask for a person?", a: "Always. Asking for a person transfers the call, with a summary passed to whoever picks up." },
      { q: "Which languages does it speak?", a: "The languages your business needs, agreed during configuration and tested before go-live." },
    ],
  },
  "Booking Agent": {
    headline: ["The calendar", "that fills itself"],
    lede: "Checks real availability, writes the appointment into your calendar, sends the reminder and handles the reschedule — inside the conversation, with no back-and-forth.",
    hero: {
      time: "08:02",
      bubbles: [
        { from: "them", text: "Can I see Dr. Sana this week? Morning if possible." },
        { from: "us", text: "Thursday 10:30 is free with Dr. Sana. Shall I book it?" },
      ],
      speed: "Booked from the live calendar",
      outcome: ["Appointment booked · Thu 10:30", "Reminder set for Wednesday"],
    },
    steps: [
      { title: "A booking request", body: "From any channel — a message, a call or your website." },
      { title: "Real availability", body: "Reads the right person's calendar, with your rules for buffers and hours." },
      { title: "Booked and confirmed", body: "Written into the calendar with a confirmation to the customer." },
      { title: "Reminded, rescheduled", body: "A reminder before, and a reschedule handled in the chat if plans change." },
    ],
    capabilities: [
      { title: "Live availability", body: "Per person, per location, per service — never a request form." },
      { title: "Your booking rules", body: "Buffers, working hours, lead times and service durations respected." },
      { title: "Reminders people read", body: "On WhatsApp the day before, with one-tap confirm or reschedule." },
      { title: "Reschedules in the chat", body: "Moves the booking without a phone call or an email thread." },
      { title: "Cancellations offered on", body: "A freed slot can be offered to the next person waiting." },
      { title: "Multi-location", body: "Routes bookings to the right branch and calendar." },
    ],
    sectors: [
      { slug: "healthcare", line: "Appointments, reminders and cancellations filled." },
      { slug: "real-estate", line: "Site visits in the listing agent's calendar." },
      { slug: "legal-consulting", line: "Consultations booked once intake is complete." },
      { slug: "hospitality", line: "Tables held and confirmed without a notebook." },
    ],
    pairs: ["WhatsApp Agent", "Voice Agent", "Payments Agent"],
    systems: ["Google Calendar", "Outlook / Microsoft 365", "Calendly", "Clinic or booking systems"],
    faqs: [
      { q: "Which calendars does it work with?", a: "Google Calendar, Outlook and Calendly directly; other booking systems where they offer an API, confirmed during scoping." },
      { q: "Can it take a deposit when booking?", a: "Yes, with the Payments Agent it can send a payment link to secure the slot." },
      { q: "What if two people ask for the same slot?", a: "It reads availability at the moment of booking and holds the slot while the customer confirms, so it is not double-booked." },
    ],
  },
  "Catalogue Agent": {
    headline: ["Your whole shop,", "in the conversation"],
    lede: "Answers stock, size, price and variant questions against live inventory, shares the right product, and holds the item while the customer decides.",
    hero: {
      time: "23:41",
      bubbles: [
        { from: "them", text: "Is the linen shirt in medium? The blue one." },
        { from: "us", text: "Yes — two left in blue, medium. Want me to hold one while you check out?" },
      ],
      speed: "Answered against live stock",
      outcome: ["Item held for 30 minutes", "Checkout link sent"],
    },
    steps: [
      { title: "A product question", body: "Size, colour, price, stock or 'do you have something like this?'" },
      { title: "It checks live stock", body: "Reads your store or inventory, not a stale list." },
      { title: "It shows the product", body: "Shares the product card, alternatives if it is out, and the price." },
      { title: "It holds and hands off", body: "Holds the item and sends checkout, or passes to Payments." },
    ],
    capabilities: [
      { title: "Live inventory", body: "Never promises a size that sold an hour ago." },
      { title: "Product cards in chat", body: "Images, prices and variants shared inside the conversation." },
      { title: "Smart alternatives", body: "Suggests what is in stock when the exact item is not." },
      { title: "Holds on request", body: "Reserves an item for a window you set." },
      { title: "Back-in-stock alerts", body: "Lets customers opt in to hear when an item returns." },
      { title: "Photo search", body: "A customer can send a photo and get the closest match." },
    ],
    sectors: [
      { slug: "ecommerce-retail", line: "Stock and sizing answered before the customer leaves." },
      { slug: "hospitality", line: "Menus, prices and add-ons answered in the order." },
      { slug: "travel-tourism", line: "Packages and inclusions explained on request." },
    ],
    pairs: ["Payments Agent", "Follow-up Agent", "WhatsApp Agent"],
    systems: ["Shopify", "WooCommerce", "ERP or inventory exports", "Google Sheets"],
    faqs: [
      { q: "How current is the stock it quotes?", a: "Where your store exposes live stock, it reads it at the moment of asking. Otherwise we agree a sync interval and the agent says how current the figure is." },
      { q: "Can it handle thousands of products?", a: "Yes. It searches your catalogue rather than memorising it, so size is not a limit." },
      { q: "What if an item is out of stock?", a: "It offers the closest alternatives in stock and can sign the customer up to hear when it returns." },
    ],
  },
  "Lead Qualifier": {
    headline: ["Only ready buyers", "reach your team"],
    lede: "Asks the questions your best salesperson would ask, scores the lead as the conversation goes, and writes it into your CRM with the full transcript attached.",
    hero: {
      time: "18:24",
      bubbles: [
        { from: "them", text: region.propertyAsk },
        { from: "us", text: "Three match. Shall I send them and book a viewing?" },
      ],
      speed: "Qualified in one reply",
      outcome: ["Budget and area captured", "Lead scored · hot"],
    },
    steps: [
      { title: "A new enquiry", body: "From any channel, any hour — ads, portals, website or DMs." },
      { title: "Natural qualifying", body: "Budget, need, timeline and fit, asked in conversation, not a form." },
      { title: "Scored as it goes", body: "Against your criteria, so hot, warm and cold are decided consistently." },
      { title: "Routed with context", body: "Hot leads go to a person at once; the rest are nurtured." },
    ],
    capabilities: [
      { title: "Your questions, in order", body: "The qualifying script your team already trusts, made conversational." },
      { title: "Consistent scoring", body: "Every lead judged the same way, whoever would have picked it up." },
      { title: "Instant routing", body: "Hot leads flagged to the right person the moment they qualify." },
      { title: "CRM with transcript", body: "Every lead lands with the whole conversation attached." },
      { title: "Nurture the rest", body: "Not-ready leads stay warm with timely, approved follow-ups." },
      { title: "Source tracking", body: "Knows which ad, post or page each lead came from." },
    ],
    sectors: [
      { slug: "real-estate", line: "Budget, area and timeline captured before a call." },
      { slug: "finance-insurance", line: "Applicants pre-qualified against your rules." },
      { slug: "marketing-agencies", line: "Campaign leads scored before they reach the client." },
      { slug: "education", line: "Serious applicants separated from browsers." },
    ],
    pairs: ["Social Agent", "Follow-up Agent", "Website Agent"],
    systems: ["HubSpot", "Salesforce", "Zoho", "Google Sheets"],
    faqs: [
      { q: "Do we set the scoring rules?", a: "Yes. We turn your existing criteria into the agent's questions and scoring during onboarding, and adjust them in the monthly review." },
      { q: "What happens to leads that are not ready?", a: "They are marked as such in your CRM and can be followed up later with messages you approve." },
      { q: "Can it route to different salespeople?", a: "Yes — by area, product, language or any rule your team already uses." },
    ],
  },
  "Escalation Desk": {
    headline: ["It knows", "when to step back"],
    lede: "The handover layer in every plan. Anything needing judgement goes to the right person with the whole conversation attached — and recurring cases are folded into the next tuning round.",
    hero: {
      channel: "Instagram",
      time: "15:22",
      bubbles: [
        { from: "them", text: "I was charged twice for order #4471." },
        { from: "us", text: "I'm sorry — I can see both payments. I've passed this to our accounts team with everything attached." },
      ],
      speed: "Handed over with context",
      outcome: ["Routed to accounts · high priority", "Full thread attached"],
    },
    steps: [
      { title: "It spots the limit", body: "A complaint, a refund, a clinical question — anything your rules reserve for a person." },
      { title: "It tells the customer", body: "Honestly, and says what will happen next, rather than guessing." },
      { title: "It routes precisely", body: "To the right person or team, by topic, urgency and hours." },
      { title: "It learns the pattern", body: "Recurring escalations are reviewed monthly and folded back in." },
    ],
    capabilities: [
      { title: "Rules you set", body: "Topics, keywords and sentiment that always go to a person." },
      { title: "Full context", body: "The person gets the thread, not a ticket number." },
      { title: "Priority and routing", body: "Urgent cases first, to the right team, in working hours or not." },
      { title: "Customer kept informed", body: "Told a person is taking over, and roughly when." },
      { title: "Takeover and hand-back", body: "Your colleague replies in the same thread and hands back when done." },
      { title: "Monthly review", body: "What was escalated and why, used to tune the agent." },
    ],
    sectors: [
      { slug: "healthcare", line: "Anything clinical to staff, immediately." },
      { slug: "finance-insurance", line: "Hardship and advice questions to a licensed person." },
      { slug: "logistics", line: "Damaged or lost parcels to operations with photos." },
    ],
    pairs: ["WhatsApp Agent", "Insights Digest", "Voice Agent"],
    systems: ["Team inbox", "WhatsApp or email alerts", "Helpdesk", "CRM"],
    faqs: [
      { q: "Is this included in every plan?", a: "Yes. A clean handover to a person is part of every VantriqAI agent." },
      { q: "What if nobody is available?", a: "The customer is told when to expect a reply, and the case waits at the top of the queue for your team." },
      { q: "Can we choose what always escalates?", a: "Yes — topics, keywords and customer mood that should always reach a person are set with you during onboarding." },
    ],
  },
  "Follow-up Agent": {
    headline: ["The follow-up", "nobody forgets"],
    lede: "Abandoned carts, unanswered quotes and half-finished bookings reopened once, politely, at the hour people actually reply — and never a drip of reminders.",
    hero: {
      time: "08:15",
      bubbles: [
        { from: "us", text: "Morning! Your quote from Tuesday is still open — shall I hold the price?" },
        { from: "them", text: "Yes please, go ahead." },
      ],
      speed: "Reopened after three days",
      outcome: [region.quoteOutcome, "Deal moved to Negotiation"],
    },
    steps: [
      { title: "Something stalls", body: "A cart, a quote, a booking or a question left unanswered." },
      { title: "It waits well", body: "For the window you choose, at an hour people tend to reply." },
      { title: "It reopens once", body: "One polite message that answers the likely objection." },
      { title: "It stops on no", body: "The moment the customer declines, it stops for good." },
    ],
    capabilities: [
      { title: "Cart recovery", body: "Brings back buyers who stopped at checkout." },
      { title: "Quote chasing", body: "Reopens unanswered quotes before they go cold." },
      { title: "Unfinished bookings", body: "Completes half-made appointments with a nudge." },
      { title: "One message, not a drip", body: "Polite by design, never a sequence of reminders." },
      { title: "Respectful timing", body: "Sent within your hours and messaging rules." },
      { title: "Stops on request", body: "Opt-outs are honoured instantly and recorded." },
    ],
    sectors: [
      { slug: "ecommerce-retail", line: "Carts reopened once, politely." },
      { slug: "real-estate", line: "Buyers followed up after a viewing." },
      { slug: "education", line: "Half-finished applications completed." },
    ],
    pairs: ["Catalogue Agent", "Lead Qualifier", "Payments Agent"],
    systems: ["Store checkout", "CRM deal stages", "Quote tools", "WhatsApp templates"],
    faqs: [
      { q: "Will customers feel spammed?", a: "No — it sends one follow-up by default, within your hours, and stops the moment someone declines." },
      { q: "Does it follow WhatsApp's rules?", a: "Yes. Messages outside the customer-service window use approved templates, as the WhatsApp Business Platform requires." },
      { q: "Can we change the timing?", a: "Yes, per type of follow-up — carts, quotes and bookings can each have their own window." },
    ],
  },
  "Outreach Agent": {
    headline: ["The right message", "to the right list"],
    lede: "Reactivation lists, seasonal offers and WhatsApp broadcasts drafted for the segment worth the message — and nothing sends until you approve it.",
    hero: {
      time: "10:00",
      bubbles: [
        { from: "us", text: "Hi Sara — the winter range you asked about last year is in. Want an early look?" },
        { from: "them", text: "Oh yes please!" },
      ],
      speed: "Sent after your approval",
      outcome: ["Segment: past winter buyers", "Replies routed to Catalogue"],
    },
    steps: [
      { title: "Pick the moment", body: "A season, a launch, a quiet week, or lapsed customers." },
      { title: "It builds the segment", body: "From who bought, asked or visited — the people worth the message." },
      { title: "It drafts, you approve", body: "Nothing goes out until you have read and approved it." },
      { title: "Replies become sales", body: "Every reply is picked up by the agent and carried to a booking or order." },
    ],
    capabilities: [
      { title: "Segments that make sense", body: "Built from real behaviour, not a single blast list." },
      { title: "Drafted for you", body: "Personal, short messages written in your tone." },
      { title: "Approval first", body: "Nothing sends without your explicit go-ahead." },
      { title: "Template compliant", body: "Uses approved WhatsApp templates where the rules require." },
      { title: "Replies handled", body: "Responses flow straight into the conversation agent." },
      { title: "Opt-outs honoured", body: "Anyone who asks is removed and never messaged again." },
    ],
    sectors: [
      { slug: "hospitality", line: "Regulars invited back on quiet nights." },
      { slug: "education", line: "Fee and deadline reminders to the right families." },
      { slug: "ecommerce-retail", line: "New arrivals to the people who asked for them." },
    ],
    pairs: ["Follow-up Agent", "Catalogue Agent", "Insights Digest"],
    systems: ["WhatsApp templates", "Customer lists", "CRM segments", "Store history"],
    faqs: [
      { q: "Can it send without us checking?", a: "No. Every outreach message waits for your approval before anything is sent." },
      { q: "Is broadcasting allowed on WhatsApp?", a: "To customers who have opted in, using approved templates — both of which the agent enforces." },
      { q: "How is the audience chosen?", a: "From what customers bought, asked or booked before, so each message goes to people it is relevant to." },
    ],
  },
  "Payments Agent": {
    headline: ["Get paid", "inside the chat"],
    lede: "Sends the payment link in the conversation, confirms when it lands, and chases the unpaid invoice politely on the schedule you set.",
    hero: {
      time: "11:32",
      bubbles: [
        { from: "them", text: "OK I'll take it. How do I pay?" },
        { from: "us", text: "Here is your secure payment link — your order ships as soon as it clears." },
      ],
      speed: "Link sent in the thread",
      outcome: ["Payment received", "Order confirmed and logged"],
    },
    steps: [
      { title: "The customer is ready", body: "An order, a deposit, a consultation fee or an invoice." },
      { title: "A secure link", body: "From your payment provider, sent inside the conversation." },
      { title: "Confirmed on arrival", body: "Receipt confirmed and the order or booking released." },
      { title: "Reminders if needed", body: "Unpaid invoices chased politely on your schedule." },
    ],
    capabilities: [
      { title: "Links in the chat", body: "No switching apps or waiting for an email." },
      { title: "Deposits and fees", body: "Secure bookings and consultations up front." },
      { title: "Automatic confirmation", body: "Knows when payment lands and moves things on." },
      { title: "Polite reminders", body: "Chases what is owed without a person doing it." },
      { title: "Your provider", body: "Works with your existing gateway — no card data handled by the agent." },
      { title: "Records kept", body: "Every payment logged against the customer and order." },
    ],
    sectors: [
      { slug: "ecommerce-retail", line: "Checkout without leaving WhatsApp." },
      { slug: "legal-consulting", line: "Consultation fees collected before the meeting." },
      { slug: "finance-insurance", line: "Instalment reminders with a link to pay." },
      { slug: "travel-tourism", line: "Deposits taken when the booking is confirmed." },
    ],
    pairs: ["Catalogue Agent", "Booking Agent", "Follow-up Agent"],
    systems: ["Stripe", "Local payment gateways", "Store checkout", "Accounting exports"],
    faqs: [
      { q: "Does the agent see card details?", a: "No. Payment happens on your provider's secure page; the agent only sends the link and receives the confirmation." },
      { q: "Which providers are supported?", a: "Stripe and local gateways that offer payment links or an API — confirmed for your provider during scoping." },
      { q: "Can it chase unpaid invoices?", a: "Yes, with polite reminders on a schedule you set, and a person for anyone who says they are struggling." },
    ],
  },
  "Insights Digest": {
    headline: ["Your week,", "read in a minute"],
    lede: "What customers asked, what they abandoned and which hours cost you money — one Monday digest in plain language, not a wall of charts.",
    hero: {
      channel: "Email",
      time: "Mon 08:00",
      bubbles: [
        { from: "us", text: "This week: most asked about Sunday delivery. 14 carts stalled at shipping cost." },
        { from: "them", text: "Interesting — can we show shipping earlier?" },
      ],
      speed: "Every Monday morning",
      outcome: ["Top questions this week", "Where customers dropped off"],
    },
    steps: [
      { title: "Every conversation counts", body: "Questions, outcomes and drop-offs across every channel." },
      { title: "Patterns, not noise", body: "Grouped into what repeats and what changed this week." },
      { title: "Plain language", body: "Written as a short note you can read over coffee." },
      { title: "Things to act on", body: "Each digest ends with the changes worth making." },
    ],
    capabilities: [
      { title: "Top questions", body: "What customers asked most, and what they could not find." },
      { title: "Lost demand", body: "What people wanted that you did not have or did not answer." },
      { title: "Busy hours", body: "When messages arrive, so you can staff the rest." },
      { title: "Escalation review", body: "What went to a person and why." },
      { title: "In your inbox", body: "Every Monday by email or WhatsApp — no dashboard to log into." },
      { title: "Included everywhere", body: "Part of every plan, from Starter up." },
    ],
    sectors: [
      { slug: "marketing-agencies", line: "What each campaign's prospects actually asked." },
      { slug: "ecommerce-retail", line: "Where buyers stall before checkout." },
      { slug: "hr-operations", line: "The policy questions your staff keep asking." },
    ],
    pairs: ["Escalation Desk", "Outreach Agent", "WhatsApp Agent"],
    systems: ["Email", "WhatsApp", "CRM", "Spreadsheet export"],
    faqs: [
      { q: "Is there a dashboard?", a: "The digest comes to you, so you do not need to log in anywhere — the underlying data can be exported if you want it." },
      { q: "Who writes it?", a: "It is generated from your conversations each week and reviewed in the monthly tuning session with our team." },
      { q: "Is it included in every plan?", a: "Yes, from Starter up." },
    ],
  },
  "Vantriq Pulse": {
    visual: "pulse",
    headline: ["Every conversation,", "measured live"],
    lede: "Pulse turns the conversations your agents and your team have into a live picture of the business: leads made and closed, how long closing takes, when customers write, how satisfied they leave — and what the AI resolved without a person.",
    hero: { time: "09:00", bubbles: [], speed: "", outcome: [] },
    flowTitle: ["From conversation", "to clear numbers."],
    capTitle: ["The numbers that run the business,", "not vanity charts."],
    steps: [
      { title: "Every conversation counted", body: "Chats, calls and DMs from every channel are logged as they happen — no exports, no spreadsheets." },
      { title: "People, not sessions", body: "A customer who comes back next week is one returning contact, not two new ones, so your counts mean what they say." },
      { title: "Compared like for like", body: "This month so far against last month up to the same day — never a half month against a whole one." },
      { title: "Said in plain English", body: "The findings worth acting on are written out: your busiest slot, a spike, a slump, a slipping score." },
    ],
    capabilities: [
      { title: "Leads and closes", body: "New leads, won and lost, win rate and the time it takes to close — with the funnel and the sources that convert." },
      { title: "Timings", body: "A day-by-hour heatmap of when customers write, so staffing and follow-ups land at the right hour." },
      { title: "Satisfaction", body: "CSAT, NPS, resolution rate, score spread and the comments behind them — fed by Vantriq Echo." },
      { title: "AI containment", body: "How many conversations the agent resolved on its own, and how many it handed to a person." },
      { title: "Channels and agents", body: "Volume by channel and by agent, new versus returning contacts, and your package's pace for the month." },
      { title: "Any period, any system", body: "Day, week, month, quarter or year in your portal — and the same figures over an API for your own BI tools." },
    ],
    sectors: [
      { slug: "ecommerce-retail", line: "See which hours sell, and which leave carts unanswered." },
      { slug: "real-estate", line: "Enquiries, viewings and closes per agent, side by side." },
      { slug: "healthcare", line: "Booking volume and patient satisfaction by branch." },
      { slug: "marketing-agencies", line: "Lead sources and conversion to show every client." },
    ],
    pairs: ["Vantriq Echo", "Lead Qualifier", "Insights Digest"],
    systems: ["Your customer portal", "Analytics API", "CRM", "Your BI tools"],
    faqs: [
      { q: "Where do we see Pulse?", a: "In the Analytics tab of your customer portal. If your plan includes API access, the same figures are available to your own systems." },
      { q: "Can Pulse identify our customers?", a: "No. Customers are counted, never exposed: phone numbers and session ids stay on the server, and only the counts reach the dashboard." },
      { q: "How is Pulse different from the Insights Digest?", a: "The Digest is a short plain-language note each Monday. Pulse is the live dashboard behind it, for whenever you want to look." },
    ],
  },
  "Vantriq Echo": {
    visual: "echo",
    headline: ["Hear every customer,", "not just the loudest"],
    lede: `Echo asks customers how it went — once, at the right moment, in ${region.key === "pk" ? "English or Urdu" : "their language"} — and turns the answers into scores you can act on. Unhappy answers reach your team the same day, and every score flows straight into Pulse.`,
    hero: { time: "18:32", bubbles: [], speed: "", outcome: [] },
    flowTitle: ["From the last message", "to the next improvement."],
    capTitle: ["Surveys people actually finish,", "results you can use."],
    steps: [
      { title: "Pick or build a survey", body: "Start from a ready template for your industry, or build your own with a live preview as you go." },
      { title: "Ask at the right moment", body: "After a WhatsApp chat has ended, by QR code at the counter, or by link, SMS, email, kiosk or on your site." },
      { title: "Listen properly", body: "Follow-up questions appear only when they are relevant — ask what to improve only if the answer was unhappy." },
      { title: "Act on it", body: "Unhappy answers alert your team, and scores land in Pulse next to the conversations they came from." },
    ],
    capabilities: [
      { title: "Industry templates", body: "Nineteen bilingual templates, from clinics and restaurants to real estate and retail, ready to use or adapt." },
      { title: "Every standard measure", body: "CSAT, NPS, customer effort, ratings, grids, choices, yes/no, free text and contact details." },
      { title: "After-chat invites", body: "One polite invite once a WhatsApp conversation has ended — never mid-chat, never twice, never at night." },
      { title: "QR posters and kiosk mode", body: "Print a poster for the counter or run a tablet at reception, with results per location." },
      { title: "Alerts on unhappy answers", body: "A low score or a complaint reaches the right person the same day, so a bad visit gets a call back." },
      { title: "Straight into Pulse", body: "Scores, trends and comments sit in your analytics, with exports whenever you need the raw answers." },
    ],
    sectors: [
      { slug: "healthcare", line: "Patient feedback after every visit, by branch and by doctor." },
      { slug: "hospitality", line: "A QR code on the table, answers before the bill arrives." },
      { slug: "ecommerce-retail", line: "Delivery and product feedback after every order chat." },
      { slug: "education", line: "Parent and student satisfaction, term by term." },
    ],
    pairs: ["Vantriq Pulse", "WhatsApp Agent", "Escalation Desk"],
    systems: ["WhatsApp", "QR codes and posters", "SMS and email", "Your website"],
    faqs: [
      { q: "Will customers be asked after every message?", a: "No. The after-chat invite goes once per conversation, after it has gone quiet, within your sending hours — and not again for as long as you set." },
      { q: "Can we survey customers who never chatted?", a: "Yes. Share a link, print a QR code, run a kiosk, or embed the survey on your site. Every channel feeds the same results." },
      { q: "Is Echo available in Urdu?", a: "Yes. Every template is bilingual, and Urdu surveys read right to left as they should." },
    ],
  },
  "Human Assistant": {
    visual: "human",
    headline: ["Your team,", "with an AI at their side"],
    lede: "When a conversation needs a person, the Human Assistant makes that person faster: it summarises what has happened, shows who the customer is, drafts the reply in their language and puts the next action one tap away. Your colleague decides what is sent.",
    hero: { time: "15:47", bubbles: [], speed: "", outcome: [] },
    flowTitle: ["From handover", "to handled."],
    capTitle: ["Everything a colleague needs,", "already on the screen."],
    steps: [
      { title: "The agent hands over", body: "Anything needing judgement — a complaint, a big order, a special request — goes to the right person." },
      { title: "The briefing is ready", body: "A short summary of the conversation, the customer's history and what they are asking for, before your colleague types a word." },
      { title: "A reply is drafted", body: "In the customer's language and your tone, from your approved content. Your colleague edits, sends or ignores it." },
      { title: "The loop closes", body: "The outcome is logged to your CRM, and the case feeds the next tuning round so the agent handles it next time." },
    ],
    capabilities: [
      { title: "Instant summaries", body: "No scrolling back through forty messages to work out what the customer wants." },
      { title: "Suggested replies", body: "Drafted in English, Urdu or Roman Urdu, from your catalogue, policies and past answers." },
      { title: "One-tap actions", body: "Book the slot, send the payment link or hold the item without leaving the conversation." },
      { title: "Customer context", body: "Previous orders, bookings and conversations beside the chat, so nobody asks twice." },
      { title: "A person always decides", body: "Nothing is sent to a customer from the Human Assistant without your colleague choosing to send it." },
      { title: "Learns from your team", body: "What your people do with handed-over cases shapes the agent's next tuning round." },
    ],
    sectors: [
      { slug: "finance-insurance", line: "Complex cases handled quickly, with a person accountable." },
      { slug: "healthcare", line: "Front-desk staff briefed before they answer a patient." },
      { slug: "ecommerce-retail", line: "Returns and complaints resolved in one reply, not five." },
      { slug: "legal-consulting", line: "Intake summarised before a consultant picks it up." },
    ],
    pairs: ["Escalation Desk", "Vantriq Pulse", "Payments Agent"],
    systems: ["Your team inbox", "CRM", "Calendar", "Payment links"],
    faqs: [
      { q: "Does the Human Assistant reply to customers by itself?", a: "No. It prepares — the summary, the draft, the action — and your colleague decides what is sent." },
      { q: "How is it different from the Escalation Desk?", a: "The Escalation Desk decides when and to whom a conversation is handed over. The Human Assistant helps the person who receives it." },
      { q: "Does it work in Urdu?", a: "Yes. It summarises and drafts in English, Urdu or Roman Urdu, matching the language the customer wrote in." },
    ],
  },
  "Private Deployment": {
    headline: ["Your servers.", "Your rules."],
    lede: "The whole stack self-hosted on your infrastructure for strict data-residency requirements. The same agents — with nothing leaving your network.",
    hero: {
      channel: "On-premise",
      time: "09:10",
      bubbles: [
        { from: "them", text: "Where is our customer data stored?" },
        { from: "us", text: "On your own servers, in your data centre. Nothing leaves your network." },
      ],
      speed: "Deployed in your environment",
      outcome: ["Data residency: your infrastructure", "Access scoped by your IT team"],
    },
    steps: [
      { title: "Scope with your IT", body: "Your security, residency and access requirements, agreed in writing." },
      { title: "Deploy in your environment", body: "The full stack on your servers or private cloud." },
      { title: "Connect internally", body: "To your systems over your network, with access you grant." },
      { title: "Operate together", body: "Updates and tuning on a schedule your team controls." },
    ],
    capabilities: [
      { title: "Full data residency", body: "Conversations and records stay on your infrastructure." },
      { title: "Your access controls", body: "Your identity, network and permission policies apply." },
      { title: "Same agents", body: "Every module available, not a reduced edition." },
      { title: "Model choice", body: "Model options matched to your data-sensitivity rules." },
      { title: "Controlled updates", body: "Changes rolled out when your team approves them." },
      { title: "Audit trail", body: "Every conversation and action logged in your environment." },
    ],
    sectors: [
      { slug: "finance-insurance", line: "Customer data kept inside the bank's network." },
      { slug: "healthcare", line: "Patient records never leave the hospital's systems." },
      { slug: "legal-consulting", line: "Client confidentiality on the firm's own servers." },
    ],
    pairs: ["Custom Module", "Escalation Desk", "WhatsApp Agent"],
    systems: ["Your servers or private cloud", "Internal databases", "Identity and access", "Internal messaging"],
    faqs: [
      { q: "Which plan includes it?", a: "Private deployment is available from the Enterprise tier." },
      { q: "Does it need internet access?", a: "Only for the channels that live outside your network, such as WhatsApp; everything else can stay internal." },
      { q: "Who maintains it?", a: "We do, with your IT team, on an update schedule you control." },
    ],
  },
  "Custom Module": {
    headline: ["The thing only", "your business does"],
    lede: "Built during onboarding for the workflow no template covers — your name for it, your tone, your rules, and your sign-off before it acts.",
    hero: {
      time: "14:20",
      bubbles: [
        { from: "them", text: "Can you check if my warranty covers this?" },
        { from: "us", text: "Your warranty runs to March and covers the motor. I've opened a claim for you." },
      ],
      speed: "Your process, automated",
      outcome: ["Warranty checked in your system", "Claim opened · ref W-2231"],
    },
    steps: [
      { title: "Map the workflow", body: "The steps, rules and exceptions your team follows today." },
      { title: "Build the module", body: "Configured to your systems, language and approval points." },
      { title: "Test on real history", body: "Checked against your past conversations before anyone sees it." },
      { title: "Sign off, then live", body: "It acts only once you have approved how it behaves." },
    ],
    capabilities: [
      { title: "Any workflow", body: "Warranty checks, claims, returns, eligibility — whatever you do." },
      { title: "Your systems", body: "Connected over APIs, sheets or custom integrations." },
      { title: "Your approval points", body: "Steps that need a person stay with a person." },
      { title: "Same guardrails", body: "Approved content, handover and records, like every module." },
      { title: "Tuned monthly", body: "Adjusted as your process changes." },
      { title: "Works with the rest", body: "Uses the same channels and brain as your other modules." },
    ],
    sectors: [
      { slug: "logistics", line: "Claims and exceptions routed your way." },
      { slug: "hr-operations", line: "Your onboarding checklist, run for every joiner." },
      { slug: "finance-insurance", line: "Eligibility rules only your products have." },
    ],
    pairs: ["Private Deployment", "Escalation Desk", "Insights Digest"],
    systems: ["Custom REST APIs", "Internal tools", "Google Sheets", "Your databases"],
    faqs: [
      { q: "Which plan includes custom modules?", a: "Custom modules are available from the Scale tier." },
      { q: "How long does one take?", a: "It depends on the systems involved; we scope it on the discovery call and give you a timeline in writing." },
      { q: "Can we change it later?", a: "Yes. Changes are made in the monthly tuning rounds as your process evolves." },
    ],
  },
});

export function modules(region: Region): Module[] {
  const d = details(region);
  return products(region)
    .filter((p) => d[p.name])
    .map((p) => ({ ...p, ...d[p.name], slug: productSlug(p.name) }));
}

export const MODULE_SLUGS = (region: Region) => modules(region).map((m) => m.slug);

export function getModule(region: Region, slug: string): Module | undefined {
  return modules(region).find((m) => m.slug === slug);
}
