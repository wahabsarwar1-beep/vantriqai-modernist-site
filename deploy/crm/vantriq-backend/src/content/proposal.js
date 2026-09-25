/**
 * What a VantriqAI proposal says about VantriqAI.
 *
 * WHY THIS IS A FILE AND NOT PROSE IN THE RENDERER. The same claims are
 * made in three places a prospect can reach: this proposal, the website,
 * and the two AI agents (which read the shared knowledge base in n8n). A
 * buyer who is told one thing by the chat widget and another by the PDF
 * stops believing both. Keeping the copy in one named module at least
 * makes the CRM's half of that consistent, and makes it obvious where to
 * edit when the offer changes.
 *
 * KEEP IN STEP WITH THE KNOWLEDGE BASE. The wording below mirrors the
 * "VantriqAI - Knowledge Base (shared)" workflow. That workflow is the
 * source of truth for what the agents say; this is the source of truth
 * for what the paperwork says. When one moves, move the other.
 *
 * WHAT MUST NOT GO IN HERE.
 *   - Prices. Every figure a proposal quotes comes from the products
 *     table and the quote's own lines, so a proposal can never contradict
 *     what the CRM will actually invoice. Hard-coding a number here is
 *     how a stale price reaches a customer in writing.
 *   - Delivery dates. "Typically a few weeks after scope sign-off" is the
 *     commitment; a date in a PDF is a promise somebody has to keep.
 *   - Third-party research presented as our own results. The benchmarks
 *     below carry their source in the same object precisely so a renderer
 *     cannot print the figure without printing where it came from.
 */

/** The opening narrative. A buyer has to recognise their own problem
 *  before a list of features means anything, so the proposal leads with
 *  the night that costs them money rather than with our modules. */
const THE_GAP = {
  kicker: 'The problem',
  title: 'The enquiry that arrives after closing',
  body:
    'Most businesses lose customers in the hours nobody is watching the inbox. Not to a '
    + 'better price or a better product — to whoever replied first.',
  // Drawn as two parallel timelines. The times are illustrative of a
  // typical night, and are labelled as such on the page.
  without: {
    label: 'A normal night',
    steps: [
      ['21:40', 'Customer asks whether an item is in stock'],
      ['21:41', 'Nobody is watching the inbox'],
      ['22:10', 'They buy from a competitor who answered'],
      ['08:58', 'Your team opens a night of unread threads'],
      ['09:47', 'You reply. The sale is already gone'],
    ],
  },
  with: {
    label: 'The same night, with an agent',
    steps: [
      ['21:40', 'Answered in about a second'],
      ['21:42', 'Budget and timing captured'],
      ['21:43', 'Visit booked for tomorrow 18:30'],
      ['21:43', 'Reminder scheduled automatically'],
      ['09:00', 'Your team opens a booked appointment'],
    ],
  },
};

/** The channels an agent can answer on. Ordered as the tiers introduce
 *  them, so the package page reads in the same sequence. */
const CHANNEL_MODULES = [
  {
    name: 'WhatsApp Agent',
    availability: 'From Starter',
    body:
      'The core module. Answers, qualifies and books on the channel your customers already '
      + 'open twenty times a day — English or Roman Urdu, any hour.',
  },
  {
    name: 'Social Agent',
    availability: 'From Growth',
    body:
      'Instagram and Facebook DMs, plus comment-to-DM: a question under a post becomes a '
      + 'qualified conversation before a competitor replies.',
  },
  {
    name: 'Website Agent',
    availability: 'From Scale',
    body:
      'The embedded assistant on your own site. Same brain, same actions, nothing for the '
      + 'visitor to download.',
  },
];

/** What an agent can actually do once it is answering. */
const CAPABILITY_MODULES = [
  {
    name: 'Booking Agent',
    availability: 'Add-on',
    body:
      'Checks real availability, writes the appointment into the calendar, sends the '
      + 'reminder, handles the reschedule.',
  },
  {
    name: 'Catalogue Agent',
    availability: 'Add-on',
    body:
      'Answers stock, size, price and variant questions against live inventory, shares the '
      + 'right product, holds the item while the customer decides.',
  },
  {
    name: 'Lead Qualifier',
    availability: 'From Growth',
    body:
      'Asks the questions a salesperson would ask, scores the lead, and writes it to your '
      + 'CRM with the full transcript attached.',
  },
  {
    name: 'Escalation Desk',
    availability: 'Every plan',
    body:
      'Routes anything needing human judgement to the right person with the conversation '
      + 'attached, and folds recurring cases into the next tuning round.',
  },
  {
    name: 'Follow-up Agent',
    availability: 'Add-on',
    body:
      'Abandoned carts, unanswered quotes and half-finished bookings, reopened once and '
      + 'politely — at the hour people actually reply.',
  },
  {
    name: 'Outreach Agent',
    availability: 'From Growth',
    body:
      'Reactivation lists, seasonal offers and broadcasts drafted for the segment worth the '
      + 'message. Nothing sends until you approve it.',
  },
  {
    name: 'Payments Agent',
    availability: 'Add-on',
    body:
      'Sends the payment link inside the conversation, confirms receipt, and chases the '
      + 'unpaid invoice on your schedule.',
  },
  {
    name: 'Insights Digest',
    availability: 'Every plan',
    body:
      'What customers asked, what they abandoned, which hours cost you money. One Monday '
      + 'digest in plain language, not a wall of charts.',
  },
];

/** Where the agent acts. The point of the page is that it works inside
 *  the systems the client already runs. */
const INTEGRATIONS = [
  ['Channels', 'WhatsApp Business API, Instagram DM, Facebook Messenger, website widget, email'],
  ['Calendars', 'Google Calendar, Outlook / Microsoft 365, Calendly, in-house booking'],
  ['Records', 'HubSpot, Salesforce, Zoho, Google Sheets, custom REST API'],
  ['Commerce', 'Shopify, WooCommerce, Stripe, local payment gateways, ERP exports'],
];

/** How the engagement runs. No calendar dates — see the header note. */
const ONBOARDING = [
  {
    title: 'Tell us how you work',
    body:
      'Fifteen minutes on how customers message you today: the repeating questions, the ones '
      + 'needing a person, and the hours nobody is watching.',
  },
  {
    title: 'The agent gets built',
    body:
      'Modules configured to your workflow and tested against your real message history '
      + 'before a customer ever sees it. Typically two to four weeks from scope sign-off.',
  },
  {
    title: 'It plugs into your tools',
    body:
      'Calendar, CRM, inventory, payments, sheets. The agent acts inside the systems you '
      + 'already run rather than keeping a second copy of the truth.',
  },
  {
    title: 'It answers every hour',
    body:
      'WhatsApp, Instagram and your website. No queue, no office hours, and no ceiling when '
      + 'a post lands or the season peaks.',
  },
  {
    title: 'You keep the judgement calls',
    body:
      'Edge cases arrive with the transcript attached. Every escalation is reviewed monthly '
      + 'by a local team and folded back into the agent.',
  },
];

/** Why us, specifically, rather than a template bought overseas. */
const WHY_US = [
  ['Built and supported in Islamabad', 'Local hours, local support, and billing in PKR — no overseas support gap and no currency surprise on the invoice.'],
  ['14+ years of delivery', 'Enterprise and government collaboration experience, applied to businesses of every size.'],
  ['Tuned every month', 'What the agent could not answer becomes next month\'s improvement, reviewed by a person.'],
  ['Your data, handled to its sensitivity', 'From simple catalogues through to fully private, self-hosted deployment where nothing leaves your network.'],
];

/**
 * Published third-party research about the category.
 *
 * Each figure carries its source in the same object so the renderer
 * cannot print one without the other. These are NOT VantriqAI client
 * results and must never be captioned as though they were.
 */
const BENCHMARKS = [
  { figure: '21x', body: 'more likely to qualify a lead when the reply lands in five minutes rather than thirty', source: 'MIT / InsideSales.com' },
  { figure: '78%', body: 'of customers buy from the business that answers first — not the cheapest, the first', source: 'MIT / InsideSales.com' },
  { figure: '42 hrs', body: 'average first response to a web enquiry across 2,241 audited firms; 23% never replied at all', source: 'Harvard Business Review, 2011' },
  { figure: '95–98%', body: 'open rate on a WhatsApp business message, against 20–25% for email', source: 'Mobilesquared / Infobip estimate' },
];

const BENCHMARK_DISCLAIMER =
  'Published third-party research about the category, shown for context. These are not '
  + 'VantriqAI client results.';

/**
 * The covering letter used when the sender has not written one.
 *
 * A generated letter is worse than a written one and far better than a
 * blank first page, which is what a sender in a hurry would otherwise
 * send. Written to be true of any recipient so it never says something
 * the sender would not have said.
 */
function defaultCoverLetter({ contactName, company }) {
  const who = (contactName || '').trim();
  const greeting = who ? `Dear ${who},` : 'Dear Sir or Madam,';
  const theirs = (company || '').trim() || 'your business';
  return [
    greeting,
    '',
    `Thank you for your time discussing how ${theirs} handles customer messages today.`,
    '',
    'This proposal sets out what we would put in place: an AI agent that answers, qualifies '
    + 'and books around the clock on the channels your customers already use, in English or '
    + 'Roman Urdu. The pages that follow cover the problem as we understand it, the modules '
    + 'we would configure, how the work runs, and the commercial terms.',
    '',
    'Everything here is based on what you have told us so far. If any of it misreads your '
    + 'situation, say so and we will revise it — we would rather change the proposal now '
    + 'than the scope later.',
    '',
    'We look forward to working with you.',
  ].join('\n');
}

module.exports = {
  THE_GAP,
  CHANNEL_MODULES,
  CAPABILITY_MODULES,
  INTEGRATIONS,
  ONBOARDING,
  WHY_US,
  BENCHMARKS,
  BENCHMARK_DISCLAIMER,
  defaultCoverLetter,
};
