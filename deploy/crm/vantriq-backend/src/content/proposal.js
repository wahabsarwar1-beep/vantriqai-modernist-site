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

/** How the engagement runs. No calendar dates — see the header note.
 *
 *  The WhatsApp step is deliberately first and deliberately not folded
 *  into "the agent gets built": Meta's business verification is the one
 *  part of onboarding that runs on someone else's clock, and it can
 *  outpace the whole build if it is left as a footnote instead of step
 *  one. See the shared knowledge base for the same fact told to a
 *  prospect who asks directly. */
const ONBOARDING = [
  {
    title: 'Your WhatsApp number, verified',
    body:
      'If WhatsApp is one of your channels, the number and the WhatsApp Business Account have '
      + 'to be registered and verified with Meta in your own business\'s name — not ours. We '
      + 'guide you through the setup, but the paperwork and the verification are yours to '
      + 'complete, and it is usually the one step in this list that can outpace everything else.',
  },
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

/**
 * The line that goes under every price on the document.
 *
 * Short enough to sit under a table without becoming the table. It appears
 * everywhere a figure does — the package comparison, the package cards and
 * the commercials total — because "I didn't see that bit" is a conversation
 * worth never having, and repeating one line is cheaper than having it.
 */
const TAX_NOTE =
  'All rates are exclusive of taxes. All applicable Government taxes, duties and levies '
  + '(including GST and withholding tax) apply and are charged in addition, at the rates in '
  + 'force on the date of invoice.';

/**
 * Errors and omissions.
 *
 * A proposal is assembled from a catalogue and a conversation, and both can
 * carry a typo. This says a clerical mistake does not bind either side to
 * something nobody meant — which protects the customer from a wrong figure
 * as much as it protects us.
 */
const ERRORS_NOTE =
  'Errors and omissions excepted. This proposal has been prepared in good faith from the '
  + 'information available at the time of writing. Should any clerical, typographical or '
  + 'arithmetical error appear in these pages — in a figure, an allowance, a date or a '
  + 'description — it does not bind either party, and the correct particulars will be '
  + 'confirmed in writing before the work begins or the first invoice is raised. Nothing '
  + 'here is intended to mislead, and anything unclear will be clarified on request.';

/**
 * Terms and conditions, taken from the Packages page on vantriqai.com.
 *
 * ADAPTED, NOT COPIED, AND DELIBERATELY SO. The website's terms are written
 * to sit under an indicative price list, and two of their sentences would
 * contradict this document outright if pasted verbatim:
 *
 *   "any PKR or USD amount shown is illustrative and not an offer"
 *   "Nothing on this page constitutes a contract, an offer capable of
 *    acceptance ... or a commitment to supply"
 *
 * A proposal with a signature block IS an offer capable of acceptance, and
 * its figures ARE the quoted price. Carrying those two sentences over would
 * produce a document that invites a signature on the same page as a denial
 * that anything is being offered — which helps nobody and would be the
 * first thing a buyer's lawyer struck out.
 *
 * So the substance is kept, and only those two points are restated to match
 * what this document actually is. Everything else — credits, capacity,
 * third parties, liability, IP — is the site's wording.
 *
 * THREE CLAUSES BELOW ARE NOT FROM THE WEBSITE. "Your accounts and
 * platform compliance" and "Indemnity and professional advice" were added
 * because the site's terms sit under a price list with nothing to sign,
 * and never had to name who is on the hook when a client's own WhatsApp
 * account gets suspended, or when someone treats an agent's answer as
 * medical or legal advice. "General" gained one sentence on data
 * ownership for the same reason: a signed proposal is the first place a
 * client's lawyer will look for it, and it was not there.
 *
 * THIS IS DRAFTED, NOT REVIEWED. Indemnity and liability language is the
 * most consequential wording in this file — more so than anything else on
 * this page — and it has not been checked by a lawyer. Treat it as a
 * placeholder to have reviewed before it goes to a customer whose signature
 * would actually matter, exactly as previously flagged for the rest of
 * this page.
 */
const TERMS = [
  ['Usage and credits',
    'Every action performed by an agent or tool consumes AI credits. The amount is determined '
    + 'by VantriqAI after the action completes, based on its complexity and the tool used, and '
    + 'is not quoted in advance. Credits are allocated monthly, expire at the end of each '
    + 'billing period, do not roll over, and are neither refundable nor exchangeable for cash '
    + 'or service. Sessions, session counts and headroom figures describe expected capacity, '
    + 'not a guaranteed entitlement; usage beyond the included allowance is billed at the '
    + 'stated overage rate.'],
  ['Pricing and taxes',
    'The figures in this proposal are the prices quoted to you and are held until the validity '
    + 'date shown, after which they may be revised. All amounts are exclusive of taxes, duties '
    + 'and payment-processing charges, which are applied according to your billing address and '
    + 'the rates in force on the date of invoice. Beyond the validity date, VantriqAI may '
    + 'revise tier pricing, allowances, overage rates and package contents; any such change '
    + 'takes effect from the following billing period.'],
  ['Your accounts and platform compliance',
    'Where WhatsApp is one of your channels, the WhatsApp Business Account, phone number and '
    + 'Meta Business Manager must be registered, verified and owned in your own business\'s '
    + 'name, never ours. VantriqAI will guide you through that setup but cannot complete '
    + 'Meta\'s identity verification on your behalf, and its timeline is set by Meta, not by '
    + 'us. You are responsible for your own compliance with the policies of WhatsApp, Meta, '
    + 'Instagram, Facebook and any other platform the agent operates on, including obtaining '
    + 'and recording your end customers\' consent before any outbound or broadcast message is '
    + 'sent. VantriqAI is not liable for a suspension, restriction or rejection imposed by a '
    + 'platform on your account, number or content, nor for any delay or loss that results.'],
  ['Performance and third parties',
    'Response times, volumes, conversion figures and any other metrics shown are illustrative '
    + 'examples drawn from past deployments and published research. They are not warranties, '
    + 'forecasts or guarantees of results for your business. Service delivery depends on third '
    + 'parties outside our control, including messaging platforms, business solution providers, '
    + 'calendar and CRM vendors and AI model providers; their pricing, policies, availability '
    + 'or model behaviour may change, and such changes pass through to you. Unless a separate '
    + 'written agreement states otherwise, the service is provided without service-level '
    + 'guarantees and our aggregate liability is limited to the fees paid in the three months '
    + 'preceding a claim.'],
  ['Indemnity and professional advice',
    'You indemnify VantriqAI against any third-party claim, penalty or loss arising from your '
    + 'own content, data or instructions, or from your non-compliance with applicable law or a '
    + 'platform\'s policies. The agent answers using the information and instructions you '
    + 'provide and is not a substitute for licensed medical, legal, financial or other '
    + 'professional advice; it must not be relied on for an emergency or a safety-critical '
    + 'decision, and you remain responsible for reviewing its output before it is relied upon '
    + 'in such a context.'],
  ['General',
    'This proposal is an offer open for acceptance until the validity date shown. On '
    + 'acceptance, scope, fees, term and support are governed by the written agreement signed '
    + 'with VantriqAI, which prevails over anything stated here. The underlying platform, '
    + 'workflows and methodology remain VantriqAI\'s property; your business data and your '
    + 'customers\' data remain yours, and VantriqAI processes them only to deliver the service. '
    + 'Trademarks, product names and materials remain the property of VantriqAI or their '
    + 'respective owners. VantriqAI reserves all rights not expressly granted.'],
];

module.exports = {
  THE_GAP,
  TAX_NOTE,
  ERRORS_NOTE,
  TERMS,
  CHANNEL_MODULES,
  CAPABILITY_MODULES,
  INTEGRATIONS,
  ONBOARDING,
  WHY_US,
  BENCHMARKS,
  BENCHMARK_DISCLAIMER,
  defaultCoverLetter,
};
