/**
 * The resources collection: guides now, case studies when there are real ones.
 *
 * This is the part of the site that can answer a search query rather than
 * describe a product, which is the only way a small site earns traffic for
 * terms the large ones already own.
 *
 * Two rules hold everything here:
 *
 *   1. Every figure is a published third-party benchmark, named where it
 *      appears. Facts are not copyrightable and quoting one with attribution
 *      is ordinary practice — reproducing somebody's prose or charts is not,
 *      and nothing here does.
 *   2. No invented results. A `case study` entry may only describe work
 *      actually done, with the client's written permission to name them, or
 *      anonymised if that permission does not exist. There are none yet, and
 *      an empty list is the honest state.
 */

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  /** A single benchmark, with the source it came from. */
  | { t: "stat"; fig: string; claim: string; src: string }
  | { t: "callout"; text: string };

export type Resource = {
  slug: string;
  kind: "Guide" | "Case study";
  /** The <title> segment; the root template appends the brand. */
  title: string;
  /** The h1, which is allowed to be longer and less keyword-shaped. */
  heading: string;
  description: string;
  /** ISO date. Used for Article schema and the visible byline. */
  published: string;
  updated?: string;
  /** One sentence on the index card, and the standfirst on the article. */
  summary: string;
  body: Block[];
  /** Internal links out, which is half the point of publishing at all. */
  related: { href: string; label: string; note: string }[];
};

/** Rough reading time from the body, so it cannot drift from the text. */
export function readingMinutes(resource: Resource): number {
  const words = resource.body.reduce((n, block) => {
    if (block.t === "ul" || block.t === "ol") return n + block.items.join(" ").split(/\s+/).length;
    if (block.t === "stat") return n + `${block.fig} ${block.claim}`.split(/\s+/).length;
    return n + block.text.split(/\s+/).length;
  }, 0);
  return Math.max(1, Math.round(words / 220));
}

export const RESOURCES: Resource[] = [
  {
    slug: "lead-response-time-benchmarks",
    kind: "Guide",
    title: "Lead response time: what the research actually says",
    heading: "The response gap, in the numbers",
    description:
      "Published benchmarks on how fast businesses reply to enquiries, how fast customers expect them to, and how steep the curve between the two is.",
    published: "2026-09-26",
    summary:
      "Every business knows replying quickly matters. The published research says the curve is far steeper than most people assume — and that the average business is nowhere near the top of it.",
    body: [
      {
        t: "p",
        text: "There is a large, old and fairly consistent body of research on how quickly businesses answer enquiries and what it costs them when they do not. The figures below are all third-party, and each is attributed where it appears. None of them are our client results — they describe the category, which is what makes them useful as a baseline for your own.",
      },
      { t: "h2", text: "The first five minutes do most of the work" },
      {
        t: "p",
        text: "The best-known work here is the Lead Response Management Study, run out of MIT with InsideSales.com. It looked at what happened to the odds of a sale depending purely on how long the first reply took.",
      },
      {
        t: "stat",
        fig: "21×",
        claim: "higher odds of qualifying a lead when the first reply lands at five minutes instead of thirty.",
        src: "MIT / InsideSales.com, Lead Response Management Study, 2007",
      },
      {
        t: "stat",
        fig: "100×",
        claim: "higher odds of making contact at all, comparing the same five-minute and thirty-minute marks.",
        src: "MIT / InsideSales.com, 2007",
      },
      {
        t: "p",
        text: "Read those two together and the shape becomes clear. The penalty is not linear and it is not patient. Twenty-five minutes is not a small delay — it is most of the opportunity. Harvard Business Review found the same curve extending outwards: replying within an hour rather than a day or more carried roughly sixty times the qualification odds.",
      },
      {
        t: "stat",
        fig: "78%",
        claim: "of customers buy from whichever business answers first. Not the cheapest — the first.",
        src: "MIT / InsideSales.com, 2007",
      },
      { t: "h2", text: "What businesses actually do" },
      {
        t: "p",
        text: "Against that, the measured behaviour is bleak. Harvard Business Review audited how 2,241 companies handled a web enquiry.",
      },
      {
        t: "stat",
        fig: "42 hours",
        claim: "average time to first response across those 2,241 audited firms.",
        src: "Harvard Business Review, 2011",
      },
      {
        t: "stat",
        fig: "23%",
        claim: "of those firms never responded to the enquiry at all. Not late — never.",
        src: "Harvard Business Review, 2011",
      },
      {
        t: "p",
        text: "Email is no better. SuperOffice's benchmark study of a thousand companies put the average first reply to a customer service email at over twelve hours.",
      },
      {
        t: "stat",
        fig: "12h 10m",
        claim: "average first reply to a customer service email, across 1,000 companies.",
        src: "SuperOffice, Customer Service Benchmark Report",
      },
      { t: "h2", text: "What customers expect instead" },
      {
        t: "p",
        text: "The gap is not just between fast firms and slow ones. It is between every firm and what the person messaging them assumes is normal.",
      },
      {
        t: "ul",
        items: [
          "83% of customers expect to engage immediately when they contact a business — Salesforce.",
          "60% of those define “immediately” as ten minutes or less — HubSpot.",
          "74% expect support to be available around the clock — Salesmate.",
          "62% will leave after a single poor experience — Salesforce.",
        ],
      },
      {
        t: "p",
        text: "Put the two halves together: the average business replies in about 42 hours to a customer who considers ten minutes slow, and roughly a quarter of businesses never reply at all.",
      },
      { t: "h2", text: "Why the gap exists" },
      {
        t: "p",
        text: "It is rarely negligence. The mechanics of a small or mid-sized business make it almost inevitable:",
      },
      {
        t: "ol",
        items: [
          "Enquiries do not arrive during office hours. They arrive when someone is on the sofa, browsing on their phone, at 21:40 — which is precisely when nobody is watching the inbox.",
          "Volume is spiky, not steady. A campaign, a post that travels, a seasonal peak — the day you most need to reply fast is the day you have the least capacity to.",
          "Messages arrive on four or five channels at once. WhatsApp, Instagram, the website form, email, the phone. No single person is watching all of them.",
          "The first reply is usually low-value work. It is a stock check, an opening time, a price range — questions that do not need judgement, but do need answering before the customer moves on.",
        ],
      },
      {
        t: "p",
        text: "That last point is the one worth sitting with. The research does not say you need better salespeople. It says the first response needs to happen, quickly, and most of what it contains is not a judgement call.",
      },
      { t: "h2", text: "What closing it looks like in practice" },
      {
        t: "p",
        text: "An agent that answers in seconds on the channel the customer used, checks something real — stock, availability, a price band — and either books the next step or hands over to a person with the transcript attached. The judgement calls still reach your team. The 42 hours in front of them do not.",
      },
      {
        t: "p",
        text: "If you want to see the shape of that, [how it works](/how-it-works) walks through a deployment end to end, and [the product modules](/products) list what each part actually does.",
      },
      { t: "h2", text: "A caveat worth stating plainly" },
      {
        t: "p",
        text: "Two of the strongest figures here — the MIT/InsideSales study and the Harvard Business Review audit — are from 2007 and 2011. They are old. They are also the most-cited work on the question and nothing since has overturned the shape of the curve, but you should treat them as evidence about the category rather than a guarantee about your market. The honest use of a benchmark is to measure your own numbers against it, not to adopt it as a claim.",
      },
      {
        t: "callout",
        text: "The only response-time figure that matters for your business is your own. Pull the last hundred enquiries and time the first reply to each. Most owners are surprised, and the surprise is the useful part.",
      },
    ],
    related: [
      { href: "/how-it-works", label: "How it works", note: "From discovery call to a live agent, step by step." },
      { href: "/products", label: "The modules", note: "What each part of the agent actually does." },
      { href: "/contact", label: "Send a brief", note: "Fifteen minutes on how customers message you today." },
    ],
  },

  {
    slug: "whatsapp-business-app-vs-platform",
    kind: "Guide",
    title: "WhatsApp Business app vs Platform: which do you need?",
    heading: "WhatsApp Business app, or the Platform?",
    description:
      "The free app and the WhatsApp Business Platform solve different problems. A plain comparison of what each is for, and how to tell which one your business needs.",
    published: "2026-09-26",
    summary:
      "Two products share the WhatsApp Business name and they are not versions of each other. Picking the wrong one usually means either paying for complexity you do not need, or hitting a ceiling six months in.",
    body: [
      {
        t: "p",
        text: "Meta ships two distinct things under the WhatsApp Business name. They are not tiers of one product. They are built for different situations, and the decision between them is mostly about whether a human is going to read every message.",
      },
      { t: "h2", text: "The WhatsApp Business app" },
      {
        t: "p",
        text: "A free app, installed on a phone, used by people. It adds business features on top of ordinary WhatsApp: a business profile, a product catalogue, labels for organising chats, saved quick replies, greeting and away messages, and the ability to link a handful of additional devices so more than one person can answer.",
      },
      {
        t: "p",
        text: "It is the right answer for a great many businesses. If your message volume is something a person can comfortably read, and your replies genuinely need a person's judgement, the app is enough, and anything more is overhead.",
      },
      { t: "h3", text: "Where it runs out" },
      {
        t: "ul",
        items: [
          "It has no real automation. Greeting and away messages are canned text, not answers.",
          "It cannot reach into your systems. It does not know your stock levels, your calendar, or your CRM.",
          "It is bound to devices and to people's attention. Volume that outruns the people is volume that waits.",
          "Reporting is thin — you cannot easily see what customers asked or where conversations died.",
        ],
      },
      { t: "h2", text: "The WhatsApp Business Platform" },
      {
        t: "p",
        text: "Not an app at all. It is an interface your own systems talk to, so messages can be received and sent by software. There is no inbox unless you build or buy one. You connect either through Meta's Cloud API directly, or through a solution provider that handles the plumbing and support on top of it.",
      },
      {
        t: "p",
        text: "That is what makes everything else possible: an agent that answers instantly, a booking written straight into a real calendar, a stock check against real inventory, a lead logged to your CRM with the transcript attached.",
      },
      { t: "h3", text: "Rules you should know before you commit" },
      {
        t: "ul",
        items: [
          "Business-initiated messages need pre-approved templates. You cannot freely message someone out of the blue in whatever words you like.",
          "You need opt-in. Consent to be messaged has to be collected and recorded.",
          "There is a customer service window. Once someone messages you, free-form replies are allowed for a limited period — after it closes, you are back to templates.",
          "It is paid, and Meta sets the rates. Pricing is metered by Meta, varies by country and by message category, and has been restructured more than once.",
          "A phone number used on the Platform cannot also be used in the Business app. Moving a number across is a migration, not a toggle.",
        ],
      },
      {
        t: "callout",
        text: "Meta changes Platform pricing, categories and limits regularly — including a significant restructure in recent years. Any specific rate quoted in an article, including this one, should be checked against Meta's own developer documentation before you budget from it. That is why there are no numbers in this section.",
      },
      { t: "h2", text: "How to tell which one you need" },
      {
        t: "p",
        text: "Three questions settle it for most businesses.",
      },
      {
        t: "ol",
        items: [
          "Can a person read every message within a few minutes, including evenings and weekends? If yes, the app is probably enough.",
          "Do your answers depend on data in another system — stock, availability, prices, order status? If yes, the app cannot reach it, and you need the Platform.",
          "Does missing a message at 21:40 cost you a sale? If yes, the constraint is human attention, and only the Platform removes it.",
        ],
      },
      {
        t: "p",
        text: "A fourth, quieter test: if you already pay someone to do nothing but answer repeated questions during business hours, you have already decided the volume justifies automation — you are just paying for it in salary rather than software.",
      },
      { t: "h2", text: "The part people underestimate" },
      {
        t: "p",
        text: "Getting onto the Platform is the easy half. The work is in what the agent is allowed to say, what it does when it does not know, and what happens to the conversation afterwards — whether it lands in a record a human can pick up, or evaporates. A connection to WhatsApp is not a system. It is a pipe; the value is what you put behind it.",
      },
      {
        t: "p",
        text: "[The modules](/products) describe what we put behind it, and [packages](/pricing) explains how the volume maps to a plan.",
      },
    ],
    related: [
      { href: "/products", label: "The modules", note: "Reception, booking, catalogue, qualification and the rest." },
      { href: "/pricing", label: "Packages", note: "How message volume maps to a tier." },
      { href: "/industries", label: "By industry", note: "What the same agent does in retail, property or a clinic." },
    ],
  },

  {
    slug: "choosing-an-ai-agent-checklist",
    kind: "Guide",
    title: "A buyer's checklist for AI customer agents",
    heading: "Twelve questions to ask before you buy an AI agent",
    description:
      "The questions that separate an AI agent which actually does things from a chatbot with a nicer font — and what a good answer to each one sounds like.",
    published: "2026-09-26",
    summary:
      "Most AI agent demos look identical. These are the questions that pull them apart, and the answers worth accepting.",
    body: [
      {
        t: "p",
        text: "Every demo is impressive, because every demo is the happy path. The useful questions are about the unhappy paths — what happens when the agent does not know, when the system it depends on is down, when a customer says something nobody anticipated, and when you want to leave.",
      },
      { t: "h2", text: "What it can actually do" },
      {
        t: "ol",
        items: [
          "Does it take actions, or only produce text? Booking an appointment, holding stock and logging a lead are actions. A paragraph describing how to book is not.",
          "What exactly does it connect to, and who builds those connections? Ask which of your systems — calendar, inventory, CRM, payments — will be wired up, and whether that is included or a change request.",
          "Where does it get its answers? A model answering from general knowledge will invent your return policy. Ask to see the knowledge source and how it is updated.",
          "What does it do when it does not know? The only acceptable answer is that it escalates with the conversation attached. An agent that guesses is worse than no agent.",
        ],
      },
      { t: "h2", text: "How it behaves in the wild" },
      {
        t: "ol",
        items: [
          "Can I see it fail? Ask for a live test with a deliberately awkward question. Watch what it does when cornered.",
          "Does it make claims it cannot support? Ask it something with a number in the answer and check whether the number is real.",
          "What language does it reply in, and who decided the tone? Tone should be configured to your brand during setup, not inherited from a template.",
          "Who reviews what it said last month? An agent that is never reviewed drifts. Ask whether tuning is a service or a support ticket.",
        ],
      },
      { t: "h2", text: "The commercial questions" },
      {
        t: "ol",
        items: [
          "What does a busy month cost? Ask for the overage rate and the included volume in writing, and work out your worst month, not your average one.",
          "What is the setup fee actually for? If it cannot be itemised into specific integrations and configuration, it is a number someone guessed.",
          "Who owns the conversation data? It is your customer relationship. You should be able to export it.",
          "What happens if we leave? Ask how you get your data out and what happens to your WhatsApp number. A number that cannot come with you is a lock-in you did not agree to.",
        ],
      },
      { t: "h2", text: "A note on the demo itself" },
      {
        t: "p",
        text: "Insist on testing with your own questions, not the ones prepared for you. Bring the five questions your team is asked most often and the two that always end in an argument. Ten minutes of that tells you more than an hour of slides.",
      },
      {
        t: "callout",
        text: "If a vendor will not let you test with your own material before you sign, that is the answer to the question you were asking.",
      },
      { t: "h2", text: "And one for us" },
      {
        t: "p",
        text: "Every question above is one we are happy to be asked. If you want to run the list against us, [send a brief](/contact) or message us on WhatsApp and put the agent through it directly — it is on this page, in the corner.",
      },
    ],
    related: [
      { href: "/products", label: "The modules", note: "What each part does, and which tier it starts at." },
      { href: "/how-it-works", label: "How it works", note: "Discovery, build, integration, go-live, monthly tuning." },
      { href: "/pricing", label: "Packages", note: "Included volume and the overage rate, per tier." },
    ],
  },
];

export const getResource = (slug: string) => RESOURCES.find((r) => r.slug === slug);
