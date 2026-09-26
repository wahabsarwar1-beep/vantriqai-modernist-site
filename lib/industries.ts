import type { ChatBubble } from "@/components/HeroChatCard";
import { SECTORS } from "@/lib/content";
import type { Region } from "@/lib/region";

/**
 * One landing page per sector, in one place.
 *
 * The page, the Industries index, the menu and the sitemap all read this, so a
 * sector cannot exist in the menu without a page behind it. `name` must match
 * an entry in SECTORS — the index cards still take their one-line summary
 * from there.
 *
 * Nothing here is a statistic. The pages describe what the agent does in the
 * sector, the way a customer would see it; a figure only appears where it is
 * attributed, and none are needed to say what a booking looks like.
 */

export type JourneyStage = {
  /** The tab label: where in the customer's journey this is. */
  label: string;
  title: string;
  body: string;
  points: string[];
  chat: { them: string; us: string; done: string };
};

export type Industry = {
  slug: string;
  name: string;
  /** Two-colour signature: a sets the accents, b the second bloom. */
  theme: { a: string; b: string };
  /** The h1, as two lines. The first carries the sector colour. */
  headline: [string, string];
  lede: string;
  hero: { channel?: string; time: string; bubbles: ChatBubble[]; speed: string; outcome: string[] };
  /** What goes wrong today, before the agent. */
  pains: { title: string; body: string }[];
  stages: JourneyStage[];
  /** Product names from lib/products — the modules this sector leans on. */
  modules: string[];
  /** Kinds of system the agent connects to, not vendor names we have not integrated. */
  systems: string[];
  faqs: { q: string; a: string }[];
  seoTitle: string;
  seoDescription: string;
};

export const industries = (region: Region): Industry[] => {
  /* The illustrative lines that name a Pakistani city, unit or currency, with
     their neutral equivalent for the global tree. */
  const pk = region.key === "pk";
  const local = (home: string, abroad: string) => (pk ? home : abroad);

  return [

  {
    slug: "ecommerce-retail",
    name: "E-commerce & Retail",
    theme: { a: "#d9573b", b: "#f2b544" },
    headline: ["Sell in the chat,", "not after it"],
    lede: "Product questions, sizing, stock and the cart someone left at midnight — answered in the conversation where the customer asked, so the sale does not leave to find a quicker reply.",
    hero: {
      time: "23:41",
      bubbles: [
        { from: "them", text: "Is the linen shirt in medium? The blue one." },
        { from: "us", text: "Yes — two left in blue, medium. Want me to hold one while you check out?" },
      ],
      speed: "Answered against live stock",
      outcome: ["Item held for 30 minutes", "Checkout link sent"],
    },
    pains: [
      { title: "Questions arrive after hours", body: "The browsing peak is evenings and weekends — exactly when nobody is watching the inbox." },
      { title: "Carts go cold in silence", body: "A customer with one unanswered question does not wait. They buy the same thing somewhere that answered." },
      { title: "\"Where is my order\" eats the day", body: "Your team spends its hours reading tracking pages aloud instead of selling." },
    ],
    stages: [
      {
        label: "Discover",
        title: "Answers the question that decides the sale",
        body: "Size, colour, fabric, stock, delivery time — answered from your live catalogue, with the right product image in the reply.",
        points: ["Reads live inventory, not a stale FAQ", "Suggests the variant that is actually in stock", "Shares product cards inside WhatsApp"],
        chat: { them: "Does this run small?", us: "A little — most people go one size up. Medium is in stock in both colours.", done: "Product card shared" },
      },
      {
        label: "Buy",
        title: "Holds the item and closes the order",
        body: "Holds stock while the customer decides, sends the checkout or payment link, and confirms the order in the same thread.",
        points: ["Holds items for a window you set", "Payment link inside the chat", "Order confirmation written back to your store"],
        chat: { them: "OK I'll take it.", us: "Done — here is your payment link. It is held for you for 30 minutes.", done: "Payment link sent · item held" },
      },
      {
        label: "Recover",
        title: "Reopens the cart once, politely",
        body: "Abandoned carts and unanswered questions get one follow-up at the hour people actually reply — not a drip of reminders.",
        points: ["One follow-up, never a sequence", "Answers the objection that stalled it", "Stops the moment they say no"],
        chat: { them: "Forgot about this, is it still there?", us: "Still here, still in medium. Want the link again?", done: "Cart recovered" },
      },
      {
        label: "After sale",
        title: "Tracking, returns and exchanges without a call",
        body: "Order status from your courier, exchange and return requests logged, and anything unusual handed to your team.",
        points: ["Live order status on request", "Return and exchange requests logged", "Exceptions escalated with the thread"],
        chat: { them: "Where is my order?", us: "Out for delivery today — the courier's window is 2 to 6 pm.", done: "Status sent from courier" },
      },
    ],
    modules: ["WhatsApp Agent", "Catalogue Agent", "Follow-up Agent", "Payments Agent", "Social Agent"],
    systems: ["Online store & inventory", "Courier tracking", "Payment gateway", "CRM or customer sheet"],
    faqs: [
      { q: "Can it answer from our real stock?", a: "Yes. The Catalogue Agent reads your live inventory, so it will not promise a size you sold an hour ago. Where a store cannot expose stock, we agree a sync interval and say so in the reply." },
      { q: "Will it spam customers who left a cart?", a: "No. It sends one follow-up, at a time you choose, and stops the moment the customer declines. Broadcasts only go out after you approve them." },
      { q: "What about returns and complaints?", a: "Routine returns and exchanges are logged in your system. Anything involving a refund decision or an unhappy customer goes to your team with the whole conversation attached." },
    ],
    seoTitle: "AI Agents for E-commerce & Retail",
    seoDescription: "AI agents that answer sizing and stock questions, hold items, send payment links and recover carts on WhatsApp, Instagram and your website.",
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    theme: { a: "#2f56d9", b: "#4fb3a0" },
    headline: ["Every enquiry,", "qualified by morning"],
    lede: "Portal leads and listing enquiries answered the minute they arrive — budget and area captured, matching listings shared, and the site visit in an agent's calendar before a competitor calls back.",
    hero: {
      time: "18:24",
      bubbles: [
        { from: "them", text: region.propertyAsk },
        { from: "us", text: "Three match. Shall I send them and book a viewing?" },
      ],
      speed: "Qualified in one reply",
      outcome: ["Budget and area captured", "Viewing booked · Sat, 17:00"],
    },
    pains: [
      { title: "Leads arrive in bursts", body: "A new listing or a portal push brings fifty enquiries in an evening, and the first to reply wins them." },
      { title: "Most enquiries are not ready", body: "Agents spend their day on calls that turn out to have no budget, no timeline or the wrong area." },
      { title: "Viewings slip through the gaps", body: "Back-and-forth over times drags on until the buyer has seen three other places." },
    ],
    stages: [
      {
        label: "Enquire",
        title: "Replies to every lead while it is warm",
        body: "Portal, Instagram, WhatsApp and website enquiries answered in seconds, day or night, in the buyer's own words.",
        points: ["One agent across every lead source", "Answers questions about the listing", "No enquiry waits for office hours"],
        chat: { them: "Is the corner plot still available?", us: `It is. It's ${local("10 marla", "a 500 sq yd plot")}, facing the park — shall I send the floor plan?`, done: "Listing details shared" },
      },
      {
        label: "Qualify",
        title: "Asks what your best agent would ask",
        body: "Budget, area, timeline, finance and purpose — captured conversationally and scored before a person picks it up.",
        points: ["Budget, area and timeline captured", "Lead scored against your criteria", "Written into your CRM with the thread"],
        chat: { them: "Just looking for now, maybe next year.", us: "Understood — I'll send new listings in your area as they come up.", done: "Lead scored · nurture list" },
      },
      {
        label: "Visit",
        title: "Books the viewing into the right calendar",
        body: "Offers real slots from the listing agent's calendar, confirms, reminds, and handles the reschedule when it comes.",
        points: ["Real availability, not a request form", "Reminder the day before", "Reschedules without a phone call"],
        chat: { them: "Can we do Saturday evening?", us: "Saturday at 5 pm works — booked with Ali. I'll send the location pin.", done: "Viewing booked · reminder set" },
      },
      {
        label: "Follow up",
        title: "Keeps the buyer after the visit",
        body: "Asks how the viewing went, answers the questions it raised, and flags serious buyers to the agent immediately.",
        points: ["Post-visit follow-up", "Documents and payment plans shared", "Hot buyers flagged in real time"],
        chat: { them: "We liked it. What's the payment plan?", us: "Here it is. Shall I set up a call with Ali to discuss an offer?", done: "Flagged to agent as hot" },
      },
    ],
    modules: ["WhatsApp Agent", "Lead Qualifier", "Booking Agent", "Social Agent", "Follow-up Agent"],
    systems: ["Listings database", "Agent calendars", "CRM", "Portal lead inboxes"],
    faqs: [
      { q: "Can it handle leads from property portals?", a: "Where the portal forwards enquiries by email, WhatsApp or webhook, the agent picks them up and replies on the buyer's channel. We confirm which of your sources can be connected during scoping." },
      { q: "Does it replace our agents?", a: "No. It does the first reply, the qualifying and the scheduling, so your agents spend their time on viewings and negotiations with buyers who are ready." },
      { q: "How does it know which listings match?", a: "It reads the listings you maintain — a database, a sheet or your CRM — and matches on the budget, area and size the buyer gave." },
    ],
    seoTitle: "AI Agents for Real Estate",
    seoDescription: "AI agents that answer property enquiries instantly, qualify budget and area, match listings and book site visits into your agents' calendars.",
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    theme: { a: "#15907f", b: "#5fb6e0" },
    headline: ["Appointments booked,", "front desk freed"],
    lede: "Booking, rescheduling, reminders and the questions patients ask before they come in — handled on WhatsApp, with anything clinical handed straight to your staff.",
    hero: {
      time: "08:02",
      bubbles: [
        { from: "them", text: "Can I see Dr. Sana this week? Morning if possible." },
        { from: "us", text: "Thursday 10:30 is free with Dr. Sana. Shall I book it?" },
      ],
      speed: "Booked from the live calendar",
      outcome: ["Appointment booked · Thu 10:30", "Reminder set for Wednesday"],
    },
    pains: [
      { title: "Monday morning floods the lines", body: "The phone rings out while reception checks patients in, and callers give up." },
      { title: "No-shows leave gaps", body: "A slot forgotten is a slot another patient could have had." },
      { title: "The same questions, all day", body: "Timings, fees, parking and preparation instructions — asked hundreds of times a week." },
    ],
    stages: [
      {
        label: "Before",
        title: "Answers the questions before the visit",
        body: "Timings, doctors, fees, services and preparation instructions, answered from what your clinic has approved.",
        points: ["Only answers from approved content", "Directs to the right doctor or service", "Never gives clinical advice"],
        chat: { them: "Do I need to fast before the blood test?", us: "Yes — 10 to 12 hours, water is fine. Would you like a morning slot?", done: "Prep instructions sent" },
      },
      {
        label: "Book",
        title: "Books, reschedules and fills cancellations",
        body: "Reads real availability, books into your calendar or clinic system, and offers a freed slot to the next patient.",
        points: ["Live availability per doctor", "Reschedules in the chat", "Cancellations offered on"],
        chat: { them: "I can't make Thursday any more.", us: "No problem — Friday at 11:00 or Monday at 9:30?", done: "Moved to Fri 11:00" },
      },
      {
        label: "Remind",
        title: "Cuts no-shows with a message people read",
        body: "A reminder on WhatsApp the day before, with one-tap confirm or reschedule, instead of a call nobody answers.",
        points: ["Reminder at the hour you choose", "Confirm or reschedule in one reply", "Unconfirmed slots flagged to reception"],
        chat: { them: "Confirm", us: "Thank you — see you tomorrow at 10:30. Parking is at the rear.", done: "Attendance confirmed" },
      },
      {
        label: "After",
        title: "Follow-up care, and a person when it matters",
        body: "Post-visit follow-ups and report-ready notices — and anything that sounds clinical goes to your staff immediately.",
        points: ["Follow-up reminders on schedule", "Report-ready notifications", "Clinical questions escalated at once"],
        chat: { them: "The pain has got worse since yesterday.", us: "I'm passing this to the nurse now — she'll message you within minutes.", done: "Escalated to clinical staff" },
      },
    ],
    modules: ["WhatsApp Agent", "Booking Agent", "Voice Agent", "Escalation Desk", "Private Deployment"],
    systems: ["Appointment calendar or clinic system", "Patient records (read-only where agreed)", "SMS or email reminders", "Staff escalation inbox"],
    faqs: [
      { q: "Will it give medical advice?", a: "No. It answers administrative questions from content your clinic approves, and anything clinical — symptoms, results, medication — is escalated to your staff with the conversation attached." },
      { q: "Where is patient data kept?", a: "We match data handling to your requirements, and for strict residency rules the whole stack can be deployed privately on your own infrastructure." },
      { q: "Can it work with our clinic software?", a: "Where your system has an API or a calendar we can connect to, the agent books directly. Where it does not, we agree a workflow — often a shared calendar — during scoping." },
    ],
    seoTitle: "AI Agents for Healthcare & Clinics",
    seoDescription: "AI agents that book, reschedule and remind patients on WhatsApp, answer front-desk questions, and escalate anything clinical to your staff.",
  },
  {
    slug: "education",
    name: "Education",
    theme: { a: "#6a4fd1", b: "#f2b544" },
    headline: ["Admission season,", "answered at scale"],
    lede: "Parents and students ask the same forty questions every intake. The agent answers all of them, collects the applications, and reminds families about deadlines and fees.",
    hero: {
      time: "21:15",
      bubbles: [
        { from: "them", text: "When is the last date for Grade 6 admissions?" },
        { from: "us", text: "The 30th. The entry test is on the 5th — shall I book a slot for your child?" },
      ],
      speed: "Answered during peak intake",
      outcome: ["Test slot booked", "Application form sent"],
    },
    pains: [
      { title: "Intake floods the office", body: "A few weeks a year bring more enquiries than the admissions team can answer." },
      { title: "Deadlines get missed", body: "Families forget fee dates and document deadlines, and the office spends its time chasing." },
      { title: "Answers vary by who picks up", body: "Different staff give different answers about the same policy." },
    ],
    stages: [
      {
        label: "Enquire",
        title: "Every admission question, any hour",
        body: "Programmes, eligibility, fees, transport and timings, answered consistently from your prospectus.",
        points: ["One consistent answer per policy", "Available when parents are — evenings", "Hands off unusual cases"],
        chat: { them: "Is there a sibling discount?", us: "Yes, 10% on tuition for the second child. Want the fee schedule?", done: "Fee schedule shared" },
      },
      {
        label: "Apply",
        title: "Collects the application in the chat",
        body: "Gathers student details and documents, books entry tests or campus visits, and logs every applicant.",
        points: ["Details and documents collected", "Test and visit slots booked", "Applicants logged in your system"],
        chat: { them: "Here is the birth certificate.", us: "Received. Last thing — the previous school report, when you have it.", done: "Document logged" },
      },
      {
        label: "Enrol",
        title: "Reminders families actually read",
        body: "Fee deadlines, document reminders and orientation details sent on WhatsApp instead of a letter home.",
        points: ["Fee and deadline reminders", "Payment link in the message", "Unpaid accounts flagged"],
        chat: { them: "Can I pay online?", us: "Yes — here is the link. It's due by the 10th.", done: "Payment link sent" },
      },
    ],
    modules: ["WhatsApp Agent", "Website Agent", "Booking Agent", "Payments Agent", "Outreach Agent"],
    systems: ["Admissions records or sheet", "Fee system", "Test and visit calendar", "Parent contact lists"],
    faqs: [
      { q: "Can it handle the intake spike?", a: "Yes — volume is the point. It answers every enquiry at once, whether that is ten a day or several hundred in the last week before a deadline." },
      { q: "Can we send reminders to all parents?", a: "Yes, through the Outreach Agent. Messages are drafted for the right group and nothing is sent until you approve it." },
      { q: "Does it work for universities and academies too?", a: "Yes. Schools, colleges, universities, tuition academies and training institutes all run the same enquire-apply-enrol loop." },
    ],
    seoTitle: "AI Agents for Schools & Education",
    seoDescription: "AI agents that answer admission questions, collect applications, book entry tests and send fee reminders to parents on WhatsApp.",
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    theme: { a: "#c9433d", b: "#f09a50" },
    headline: ["Take the order", "through the rush"],
    lede: "Orders, reservations and menu questions handled on WhatsApp through the dinner rush, when nobody on the floor has a hand free for the phone.",
    hero: {
      time: "20:37",
      bubbles: [
        { from: "them", text: "Table for four tonight at 9?" },
        { from: "us", text: "9:15 is our first free table for four. Shall I hold it under your name?" },
      ],
      speed: "Reserved during the rush",
      outcome: ["Table held · 21:15, four guests", "Confirmation sent"],
    },
    pains: [
      { title: "The phone rings at the worst time", body: "Peak service is exactly when nobody can answer, and a missed call is a missed order." },
      { title: "Orders come in garbled", body: "Voice notes and half-typed messages get misread, and the wrong dish goes out." },
      { title: "Reservations live in someone's head", body: "Double bookings and no-shows follow from a notebook and a busy host." },
    ],
    stages: [
      {
        label: "Order",
        title: "Takes the order, item by item",
        body: "Menu questions answered, the order confirmed back line by line, and sent straight to your kitchen or POS.",
        points: ["Order read back before it is placed", "Menu, prices and add-ons from your list", "Sent to the kitchen or POS"],
        chat: { them: local("2 chicken karahi, 4 naan, 1 raita", "2 butter chicken, 4 naan, 1 raita"), us: `2 ${local("karahi", "butter chicken")}, 4 naan, 1 raita — delivery to the same address as last time?`, done: "Order sent to kitchen" },
      },
      {
        label: "Reserve",
        title: "Books tables without a notebook",
        body: "Checks availability, holds the table, confirms, and sends a reminder — with the reschedule handled in the chat.",
        points: ["Real table availability", "Confirmation and reminder", "Special requests noted"],
        chat: { them: "It's a birthday, can you do anything?", us: "Noted — we'll have a candle ready on the dessert.", done: "Note added to booking" },
      },
      {
        label: "Return",
        title: "Brings regulars back",
        body: "Feedback after the meal, and offers to past customers on the quiet nights — only after you approve them.",
        points: ["Feedback asked once", "Complaints go to the manager", "Offers approved before sending"],
        chat: { them: "Food was cold this time.", us: "I'm sorry. I've passed this to the manager, who will message you tonight.", done: "Escalated to manager" },
      },
    ],
    modules: ["WhatsApp Agent", "Booking Agent", "Catalogue Agent", "Voice Agent", "Outreach Agent"],
    systems: ["Menu and prices", "Kitchen or POS", "Reservation book", "Delivery riders"],
    faqs: [
      { q: "Can it take orders in the way customers actually write?", a: "Yes. It understands shorthand and mixed-language orders, and reads the order back before placing it so mistakes are caught in the chat, not at the table." },
      { q: "Does it work for hotels as well as restaurants?", a: "Yes — room enquiries, bookings, check-in details and guest requests follow the same pattern." },
      { q: "Can it answer the phone too?", a: "With the Voice Agent, it answers calls with the same menu and booking rules as the chat." },
    ],
    seoTitle: "AI Agents for Restaurants & Hospitality",
    seoDescription: "AI agents that take orders and table reservations on WhatsApp through the dinner rush, and bring regulars back on quiet nights.",
  },
  {
    slug: "legal-consulting",
    name: "Legal & Consulting",
    theme: { a: "#34497a", b: "#b28a52" },
    headline: ["Intake done", "before the first call"],
    lede: "First-contact intake run properly — the matter understood, the documents collected, conflicts flagged and the consultation booked — so your first hour is spent advising, not asking.",
    hero: {
      time: "10:12",
      bubbles: [
        { from: "them", text: "I need help with a tenancy dispute." },
        { from: "us", text: "I can set that up. A few short questions first, then I'll book you with a partner." },
      ],
      speed: "Intake started in seconds",
      outcome: ["Matter type logged", "Consultation booked · Tue 15:00"],
    },
    pains: [
      { title: "Billable time spent on intake", body: "Partners take first calls that could have been a form." },
      { title: "Documents arrive in pieces", body: "The consultation starts without the papers it needed." },
      { title: "Ad leads go cold", body: "Campaign enquiries arrive on the weekend and nobody replies until Monday." },
    ],
    stages: [
      {
        label: "Intake",
        title: "Understands the matter first",
        body: "Asks the questions your intake form would, in conversation, and routes the matter to the right practice area.",
        points: ["Your intake questions, in order", "Routed by practice area", "Out-of-scope matters declined politely"],
        chat: { them: "It's about a contract with a supplier.", us: "Understood. Was the contract signed in writing, and roughly what value?", done: "Routed to commercial" },
      },
      {
        label: "Documents",
        title: "Collects the papers before the meeting",
        body: "Asks for exactly the documents the matter needs and logs each one as it arrives.",
        points: ["Checklist per matter type", "Files logged against the client", "Missing items chased once"],
        chat: { them: "Attached the agreement.", us: "Got it. The invoices you mentioned would help too, if you have them.", done: "Document filed" },
      },
      {
        label: "Consult",
        title: "Books the consultation and takes the fee",
        body: "Offers real slots, collects a consultation fee where you charge one, and sends the meeting details.",
        points: ["Calendar booking", "Fee collected in advance", "Reminder and meeting link"],
        chat: { them: "Tuesday afternoon is good.", us: "Booked for 3 pm Tuesday. Here is the fee link to confirm.", done: "Fee paid · booking confirmed" },
      },
    ],
    modules: ["WhatsApp Agent", "Lead Qualifier", "Booking Agent", "Payments Agent", "Private Deployment"],
    systems: ["Practice management or CRM", "Partner calendars", "Document storage", "Payment links"],
    faqs: [
      { q: "Will it give legal advice?", a: "No. It gathers facts and documents and books the consultation. Advice comes from your people." },
      { q: "How is confidential information handled?", a: "Data handling is agreed with you during scoping, and private deployment on your own infrastructure is available for firms that need it." },
      { q: "Does it suit consultancies, not just law firms?", a: "Yes. Accountants, advisers and consultancies run the same intake-documents-consultation sequence." },
    ],
    seoTitle: "AI Agents for Law Firms & Consultancies",
    seoDescription: "AI agents that run client intake, collect documents and book paid consultations for law firms and consultancies — before the first call.",
  },
  {
    slug: "travel-tourism",
    name: "Travel & Tourism",
    theme: { a: "#1d7fc4", b: "#f0bd3e" },
    headline: ["Every traveller,", "answered on the go"],
    lede: "Package questions, quotes, itineraries and booking status — answered on WhatsApp for travellers who are planning at midnight or already at the airport.",
    hero: {
      time: "06:48",
      bubbles: [
        { from: "them", text: "What time is our pickup tomorrow?" },
        { from: "us", text: "7:30 am from your hotel lobby. Your driver's number is in the itinerary I've just re-sent." },
      ],
      speed: "Answered from the booking",
      outcome: ["Itinerary re-sent", "Pickup confirmed"],
    },
    pains: [
      { title: "Travellers ask at all hours", body: "Time zones and early flights mean questions arrive when the office is closed." },
      { title: "Quotes take days", body: "By the time a package is priced, the traveller has booked elsewhere." },
      { title: "Status calls clog the lines", body: "\"Is my booking confirmed?\" is the most asked question you have." },
    ],
    stages: [
      {
        label: "Plan",
        title: "Answers package questions instantly",
        body: "Destinations, inclusions, dates and visa basics answered from your packages, with a quote request captured on the spot.",
        points: ["Packages and inclusions explained", "Dates and group size captured", "Quote request logged"],
        chat: { them: `Is the 5-day ${local("Hunza", "Bali")} trip all-inclusive?`, us: "Hotels, transport and breakfast are included. How many travelling, and which dates?", done: "Quote request logged" },
      },
      {
        label: "Book",
        title: "Confirms and collects the deposit",
        body: "Sends the confirmed itinerary and the payment link, and writes the booking back to your system.",
        points: ["Itinerary sent in the chat", "Deposit link", "Booking recorded"],
        chat: { them: "We'll go ahead for 4 people.", us: "Wonderful. Here's the itinerary and the deposit link.", done: "Deposit link sent" },
      },
      {
        label: "Travel",
        title: "Looks after them while they are away",
        body: "Pickup times, hotel details and changes answered on the trip — and real problems sent to your duty team at once.",
        points: ["Itinerary on request", "Change notifications", "Emergencies escalated immediately"],
        chat: { them: "Our flight is delayed 3 hours.", us: "Thanks for letting us know — I've told the driver and alerted our duty team.", done: "Duty team alerted" },
      },
    ],
    modules: ["WhatsApp Agent", "Catalogue Agent", "Payments Agent", "Escalation Desk", "Outreach Agent"],
    systems: ["Package catalogue", "Booking system or sheet", "Payment links", "Duty-team escalation"],
    faqs: [
      { q: "Can it quote a custom trip?", a: "It collects everything a quote needs and prices standard packages directly. Custom itineraries go to your team with the requirements already gathered." },
      { q: "What happens in an emergency?", a: "Anything urgent — delays, lost documents, a problem at a hotel — is escalated to your duty contact immediately, with the traveller's booking attached." },
      { q: "Can it message travellers about changes?", a: "Yes. Schedule changes and reminders go out on WhatsApp, which travellers read while on the move." },
    ],
    seoTitle: "AI Agents for Travel & Tourism",
    seoDescription: "AI agents that answer package questions, send itineraries, take deposits and look after travellers on WhatsApp, day and night.",
  },
  {
    slug: "hr-operations",
    name: "HR & Operations",
    theme: { a: "#4d6cf0", b: "#7fcaa8" },
    headline: ["The help desk", "your team deserves"],
    lede: "Onboarding, leave, payroll dates and policy questions answered for your own staff on the channel they already use — so HR spends its week on people, not repeats.",
    hero: {
      time: "09:20",
      bubbles: [
        { from: "them", text: "How many leave days do I have left?" },
        { from: "us", text: "You have 9 annual days left this year. Want me to request some?" },
      ],
      speed: "Answered from the HR record",
      outcome: ["Balance read from HR system", "Leave request drafted"],
    },
    pains: [
      { title: "The same questions every week", body: "Leave balances, payslip dates and policy details, asked one message at a time." },
      { title: "Onboarding is a checklist nobody owns", body: "New joiners chase documents and access for their first two weeks." },
      { title: "Requests get lost in chats", body: "Leave and expense requests sit in personal inboxes with no record." },
    ],
    stages: [
      {
        label: "Onboard",
        title: "Walks new joiners through week one",
        body: "Documents collected, policies explained, first-day details sent, and each step logged.",
        points: ["Document checklist per role", "First-day information", "Progress visible to HR"],
        chat: { them: "What do I need to bring on Monday?", us: `Your ${local("CNIC", "ID")}, bank details and two photos. Reception at 9 — ask for Hina.`, done: "Checklist sent" },
      },
      {
        label: "Everyday",
        title: "Policy and payroll answers on demand",
        body: "Leave balances, holiday calendars, payslip dates and policy questions answered from your records.",
        points: ["Answers from your handbook", "Balances from the HR system", "Sensitive cases to HR directly"],
        chat: { them: "When is salary this month?", us: "The 28th, as it falls on a weekday.", done: "Answered from payroll calendar" },
      },
      {
        label: "Requests",
        title: "Leave and requests, recorded",
        body: "Leave, expenses and IT requests captured, routed to the approver, and the outcome sent back.",
        points: ["Routed to the right approver", "Status on request", "Every request on record"],
        chat: { them: "Can I take Friday off?", us: "Request sent to your manager. I'll message you when it's approved.", done: "Sent for approval" },
      },
    ],
    modules: ["WhatsApp Agent", "Escalation Desk", "Insights Digest", "Custom Module", "Private Deployment"],
    systems: ["HR system or employee records", "Payroll calendar", "Approval workflow", "Policy handbook"],
    faqs: [
      { q: "Is this for customers or staff?", a: "Staff. The same agent that serves customers can be pointed inward, answering your team from your own policies and records." },
      { q: "Can it see salary information?", a: "Only what you agree it can. We recommend it answers policy and dates, with individual pay questions routed to HR." },
      { q: "What about sensitive issues?", a: "Grievances, health and anything personal go straight to a named person in HR — the agent does not attempt to handle them." },
    ],
    seoTitle: "AI Agents for HR & Internal Operations",
    seoDescription: "An internal AI help desk on WhatsApp: onboarding, leave balances, payroll dates and policy questions answered for your own staff.",
  },
  {
    slug: "marketing-agencies",
    name: "Marketing Agencies",
    theme: { a: "#c43b8b", b: "#7a5bd6" },
    headline: ["Turn every comment", "into a lead"],
    lede: "Comments under paid posts become DMs, DMs become qualified leads, and every lead lands scored in your client's pipeline — so the ad spend you manage shows up as sales.",
    hero: {
      time: "13:05",
      channel: "Instagram",
      bubbles: [
        { from: "them", text: "Price?? 👀" },
        { from: "us", text: "Sent you a DM with the price list — which size were you thinking?" },
      ],
      speed: "Comment moved to DM",
      outcome: ["Lead qualified", "Scored hot · sent to client CRM"],
    },
    pains: [
      { title: "Comments go unanswered", body: "\"Price?\" under a boosted post is a lead, and most of them never get a reply." },
      { title: "Clients blame the ads", body: "Leads die in the client's inbox, and the campaign takes the blame." },
      { title: "Reporting stops at clicks", body: "You can show reach, but not which conversations turned into customers." },
    ],
    stages: [
      {
        label: "Capture",
        title: "Comment-to-DM on every post",
        body: "A question under a post gets a public reply and a DM in seconds, while the prospect is still scrolling.",
        points: ["Public reply plus private DM", "Works on Instagram and Facebook", "Runs on every campaign at once"],
        chat: { them: `How much for delivery to ${local("Lahore", "Chicago")}?`, us: `Free over ${local("Rs 3,000", "$40")} — sent you the details in DM!`, done: "DM opened" },
      },
      {
        label: "Qualify",
        title: "Qualifies and scores before handover",
        body: "Asks the client's qualifying questions and scores each lead, so sales calls the right people first.",
        points: ["Client-specific questions", "Lead scoring", "Hot leads flagged instantly"],
        chat: { them: "For my office, around 20 people.", us: "Great — I'll have the team send a bulk quote today.", done: "Scored hot" },
      },
      {
        label: "Report",
        title: "Shows what the campaign produced",
        body: "A plain weekly digest of conversations, qualified leads and what people asked — per client, per campaign.",
        points: ["Per-campaign lead counts", "What prospects asked", "Unanswered demand spotted"],
        chat: { them: "Is the blue one back in stock?", us: "Not yet — shall I tell you when it is?", done: "Logged as demand signal" },
      },
    ],
    modules: ["Social Agent", "Lead Qualifier", "Insights Digest", "WhatsApp Agent", "Outreach Agent"],
    systems: ["Instagram and Facebook pages", "Client CRMs", "Lead sheets", "Reporting dashboards"],
    faqs: [
      { q: "Can we run it across multiple clients?", a: "Yes. Each client gets its own configuration — tone, questions, scoring and destination — under one agency relationship." },
      { q: "Can it be white-labelled?", a: "Talk to us about your setup. The agent speaks in each client's brand voice, and agency arrangements are scoped case by case." },
      { q: "Does it reply publicly or privately?", a: "Both, as you configure it: a short public reply so others see the brand is responsive, and the detail in a private message." },
    ],
    seoTitle: "AI Agents for Marketing Agencies",
    seoDescription: "Comment-to-DM automation, lead qualification and scoring for agencies — turn engagement on your clients' paid posts into qualified leads.",
  },
  {
    slug: "logistics",
    name: "Logistics",
    theme: { a: "#23895a", b: "#e0854f" },
    headline: ["\"Where is my order\",", "answered instantly"],
    lede: "Tracking questions answered from your system at any volume, delivery exceptions flagged to the team that can fix them, and rebooking handled in the chat.",
    hero: {
      time: "15:52",
      bubbles: [
        { from: "them", text: `Tracking ${local("LHR", "DXB")}-20931, when will it arrive?` },
        { from: "us", text: `It's at the ${local("Lahore", "Dubai")} hub and out for delivery tomorrow between 10 am and 2 pm.` },
      ],
      speed: "Answered from tracking",
      outcome: ["Status read live", "Delivery window sent"],
    },
    pains: [
      { title: "Tracking calls swamp support", body: "Most of your inbound volume is a question your system already knows the answer to." },
      { title: "Failed deliveries cost twice", body: "A missed delivery means another trip, and nobody told the customer to be home." },
      { title: "Exceptions surface too late", body: "Damaged or stuck parcels are found when the customer complains." },
    ],
    stages: [
      {
        label: "Track",
        title: "Live status for every consignment",
        body: "Status, location and delivery window read from your system the moment a customer asks, in any volume.",
        points: ["Reads your tracking system", "Handles dispatch-day peaks", "Answers in the customer's language"],
        chat: { them: `Has my parcel left ${local("Karachi", "Rotterdam")}?`, us: `Yes, it left this morning and reaches ${local("Islamabad", "Berlin")} tomorrow.`, done: "Status sent" },
      },
      {
        label: "Deliver",
        title: "Confirms before the rider sets off",
        body: "Delivery-day confirmation, address corrections and rescheduling handled before a wasted trip.",
        points: ["Address confirmed in the chat", "Reschedule without a call", "Rider updated automatically"],
        chat: { them: "I won't be home tomorrow.", us: "No problem — Thursday or Friday? I'll update the rider.", done: "Rescheduled to Thursday" },
      },
      {
        label: "Exceptions",
        title: "Problems to the right team, fast",
        body: "Damage, delays and disputes logged with photos and the consignment attached, and routed to operations.",
        points: ["Photos and details captured", "Routed by exception type", "Customer kept updated"],
        chat: { them: "The box arrived damaged.", us: "I'm sorry — could you send a photo? I'll open a claim now.", done: "Claim opened · ops notified" },
      },
    ],
    modules: ["WhatsApp Agent", "Voice Agent", "Escalation Desk", "Insights Digest", "Custom Module"],
    systems: ["Tracking or TMS", "Rider or dispatch app", "Claims process", "Customer notifications"],
    faqs: [
      { q: "Can it handle our volume on dispatch days?", a: "Yes. It answers every tracking query at once, whether that is a hundred a day or thousands on a peak." },
      { q: "Does it need our tracking system to have an API?", a: "An API is the cleanest route. Where there isn't one, we agree another source during scoping and are clear about how fresh the data will be." },
      { q: "Can it notify customers proactively?", a: "Yes — delivery-day confirmations and delay notices go out on WhatsApp, which is read far more reliably than SMS or email." },
    ],
    seoTitle: "AI Agents for Logistics & Couriers",
    seoDescription: "AI agents that answer tracking queries at any volume, confirm deliveries, reschedule and route exceptions to your operations team.",
  },
    {
      slug: "finance-insurance",
      name: "Banking, Finance & Insurance",
      theme: { a: "#1b5e8f", b: "#3cb39a" },
      headline: ["Financial service,", "in a message"],
      lede: "Eligibility questions, applications, instalment reminders and policy servicing handled on the channel customers already trust — with every conversation on record and anything needing judgement passed to a person, context attached.",
      hero: {
        time: "19:06",
        bubbles: [
          { from: "them", text: "Am I eligible for a car loan? I'm salaried." },
          { from: "us", text: "Most likely — a few quick questions and I'll show you an estimated instalment." },
        ],
        speed: "Pre-qualified in the chat",
        outcome: ["Eligibility checked against your rules", "Application started · officer assigned"],
      },
      pains: [
        { title: "Simple questions take a branch visit", body: "Rates, eligibility, documents and balances — questions with a known answer that still need a call or a queue." },
        { title: "Applications stall halfway", body: "A form abandoned at the documents step is a customer who went to another lender." },
        { title: "Reminders arrive too late", body: "A missed instalment turns into a collections case that a polite nudge a few days earlier would have avoided." },
      ],
      stages: [
        {
          label: "Explore",
          title: "Answers product questions, accurately",
          body: "Rates, fees, eligibility rules and required documents answered only from content your compliance team has approved.",
          points: ["Approved content only — no improvising", "Instalment estimates from your formula", "Clear disclaimers where you require them"],
          chat: { them: "What documents do I need for a personal loan?", us: "Your ID, the last three salary slips and six months of bank statements.", done: "Checklist sent" },
        },
        {
          label: "Apply",
          title: "Onboards and pre-qualifies in the chat",
          body: "Collects applicant details and documents, runs your pre-qualification rules, and hands a complete file to an officer.",
          points: ["Details and documents collected", "Pre-qualified against your criteria", "Complete file handed to an officer"],
          chat: { them: "Sent my salary slips.", us: "Received all three. Your application is complete — an officer will call you tomorrow.", done: "File complete · officer assigned" },
        },
        {
          label: "Service",
          title: "Policy and account servicing, any hour",
          body: "Policy details, renewal dates, claim status and account requests, with identity checked before anything personal is shared.",
          points: ["Identity verified before personal data", "Claim and request status", "Renewals prompted before they lapse"],
          chat: { them: "What's the status of my claim?", us: "Once you confirm your date of birth — thank you. It's approved and pays out on Friday.", done: "Verified · status shared" },
        },
        {
          label: "Collect",
          title: "Reminders that keep accounts current",
          body: "A courteous reminder before the due date, a payment link in the message, and a person for anyone who is struggling.",
          points: ["Reminder before the due date", "Payment link in the chat", "Hardship cases to a person at once"],
          chat: { them: "I can't pay the full amount this month.", us: "Thank you for telling us. I'm connecting you with an officer who can discuss options.", done: "Escalated with account context" },
        },
      ],
      modules: ["WhatsApp Agent", "Lead Qualifier", "Payments Agent", "Escalation Desk", "Private Deployment"],
      systems: ["Core banking or policy system", "Loan origination or CRM", "Payment gateway", "Compliance-approved content"],
      faqs: [
        { q: "Will it give financial advice?", a: "No. It answers from content your compliance team approves, calculates what your formulas allow, and hands anything advisory to a licensed person." },
        { q: "How is customer data protected?", a: "Identity is verified before any personal information is shared, data handling is agreed with you in writing, and the whole stack can be deployed privately on your own infrastructure for strict residency rules." },
        { q: "Is every conversation recorded?", a: "Yes. Every conversation is kept with its outcome, so you have a complete record of what was said and when." },
      ],
      seoTitle: "AI Agents for Banking, Finance & Insurance",
      seoDescription: "AI agents for lenders, banks and insurers: eligibility questions, loan and policy onboarding, servicing and payment reminders on WhatsApp — with a person for judgement calls.",
    },
  ];
};

export const INDUSTRY_SLUGS = SECTORS.map((s) => sectorSlug(s.name));

/** The page slug for a sector name, so the index cards can link without a lookup table. */
export function sectorSlug(name: string): string {
  const slugs: Record<string, string> = {
    "E-commerce & Retail": "ecommerce-retail",
    "Real Estate": "real-estate",
    Healthcare: "healthcare",
    Education: "education",
    Hospitality: "hospitality",
    "Legal & Consulting": "legal-consulting",
    "Travel & Tourism": "travel-tourism",
    "HR & Operations": "hr-operations",
    "Marketing Agencies": "marketing-agencies",
    Logistics: "logistics",
    "Banking, Finance & Insurance": "finance-insurance",
  };
  return slugs[name];
}

export function getIndustry(region: Region, slug: string): Industry | undefined {
  return industries(region).find((i) => i.slug === slug);
}
